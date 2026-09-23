package dev.gustavotondin.jott

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.graphics.drawable.toBitmap
import org.json.JSONArray
import org.json.JSONObject

/**
 * The phone's reminders as alarms of our own: the page decides what rings
 * (`services/androidReminders.js`), this keeps the set, rings it and sets it
 * again after a reboot. An item is `{key, at (epoch ms), kind, title, body,
 * list, id, moment, root, device, buttons?}`. See documentation/architecture.md
 */
object ReminderAlarms {
  const val TAG = "jott"
  const val RING = "dev.gustavotondin.jott.RING"
  const val OPEN = "dev.gustavotondin.jott.OPEN_REMINDER"
  private const val STORE = "jott-reminders"
  private const val ITEMS = "items"
  private const val LABELS = "channels"
  private const val CHANNEL_REMINDERS = "reminders"
  private const val CHANNEL_SUMMARY = "summary"
  private const val PLUGIN_STORE = "NOTIFICATION_STORE"
  private const val PLUGIN_PUBLISHER = "app.tauri.notification.TimedNotificationPublisher"

  /** Replaces every scheduled alarm with `payload`'s `items`. */
  fun schedule(context: Context, payload: String) {
    val json = JSONObject(payload)
    val items = json.optJSONArray(ITEMS) ?: JSONArray()
    retirePluginAlarms(context)
    stored(context).forEach { cancel(context, it.getInt("key")) }
    prefs(context).edit()
      .putString(ITEMS, items.toString())
      .putString(LABELS, (json.optJSONObject(LABELS) ?: JSONObject()).toString())
      .apply()
    stored(context).forEach { arm(context, it) }
    Log.i(TAG, "reminders: ${items.length()} alarm(s) scheduled")
  }

  /** One item more, or one item moved: what Later and Tomorrow leave behind. */
  fun put(context: Context, item: JSONObject) {
    val key = item.getInt("key")
    val kept = stored(context).filter { it.getInt("key") != key } + item
    save(context, kept)
    arm(context, item)
  }

  /** Sets every stored alarm again — after a reboot, all of them are gone. */
  fun rearm(context: Context) {
    retirePluginAlarms(context)
    val items = stored(context)
    items.forEach { arm(context, it) }
    Log.i(TAG, "reminders: ${items.size} alarm(s) set again")
  }

  /** An alarm fired: the notification goes up, and the item is spent. */
  fun fire(context: Context, key: Int) {
    val items = stored(context)
    val item = items.firstOrNull { it.getInt("key") == key } ?: return
    save(context, items.filter { it.getInt("key") != key })
    post(context, item)
  }

  /**
   * Cancels and empties what an older build scheduled through the plugin: its
   * restore receiver throws on that store at boot and update, killing the
   * process. See docs/platform-gotchas.md#android
   */
  private fun retirePluginAlarms(context: Context) {
    val store = context.getSharedPreferences(PLUGIN_STORE, Context.MODE_PRIVATE)
    val ids = store.all.keys.mapNotNull { it.toIntOrNull() }
    if (ids.isEmpty()) return
    val publisher = runCatching { Class.forName(PLUGIN_PUBLISHER) }.getOrNull()
    val alarms = context.getSystemService(AlarmManager::class.java)
    if (publisher != null && alarms != null) {
      val flags = PendingIntent.FLAG_NO_CREATE or
        (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
      for (id in ids) {
        PendingIntent.getBroadcast(context, id, Intent(context, publisher), flags)?.let { alarms.cancel(it) }
      }
    }
    store.edit().clear().commit()
    Log.i(TAG, "reminders: ${ids.size} alarm(s) of the notification plugin retired")
  }

  private fun prefs(context: Context) = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)

  private fun stored(context: Context): List<JSONObject> {
    val text = prefs(context).getString(ITEMS, null) ?: return emptyList()
    val array = runCatching { JSONArray(text) }.getOrNull() ?: return emptyList()
    return (0 until array.length()).mapNotNull { array.optJSONObject(it) }
  }

  private fun save(context: Context, items: List<JSONObject>) {
    prefs(context).edit().putString(ITEMS, JSONArray(items).toString()).apply()
  }

  private fun alarmIntent(context: Context, key: Int): PendingIntent {
    val intent = Intent(context, ReminderAlarmReceiver::class.java)
      .setAction(RING)
      .setData(Uri.parse("jott-reminder://$key"))
      .putExtra("key", key)
    return PendingIntent.getBroadcast(context, key, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun cancel(context: Context, key: Int) {
    context.getSystemService(AlarmManager::class.java)?.cancel(alarmIntent(context, key))
  }

  /**
   * Exact where allowed, inexact where the exact-alarm permission was taken
   * away rather than not at all. A moment already past fires at once.
   */
  private fun arm(context: Context, item: JSONObject) {
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val at = item.getLong("at")
    val pending = alarmIntent(context, item.getInt("key"))
    val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()
    if (exact) {
      alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
    } else {
      alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
    }
  }

  private fun channels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val labels = runCatching { JSONObject(prefs(context).getString(LABELS, "{}") ?: "{}") }.getOrDefault(JSONObject())
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_REMINDERS, labels.optString("reminders", "Reminders"), NotificationManager.IMPORTANCE_DEFAULT),
    )
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_SUMMARY, labels.optString("summary", "Day summary"), NotificationManager.IMPORTANCE_LOW),
    )
  }

  private fun post(context: Context, item: JSONObject) {
    val notifications = NotificationManagerCompat.from(context)
    if (!notifications.areNotificationsEnabled()) {
      Log.w(TAG, "reminders: notifications are off, ${item.optString("moment")} not shown")
      return
    }
    channels(context)
    val key = item.getInt("key")
    val summary = item.optString("kind") == "summary"
    val body = item.optString("body")
    val builder = NotificationCompat.Builder(context, if (summary) CHANNEL_SUMMARY else CHANNEL_REMINDERS)
      .setSmallIcon(R.drawable.ic_stat_jott)
      .setContentTitle(item.optString("title"))
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setCategory(if (summary) NotificationCompat.CATEGORY_STATUS else NotificationCompat.CATEGORY_REMINDER)
      .setAutoCancel(true)
      .setContentIntent(openIntent(context, item))
    runCatching { context.packageManager.getApplicationIcon(context.packageName).toBitmap() }
      .getOrNull()
      ?.let { builder.setLargeIcon(it) }

    val buttons = item.optJSONObject("buttons")
    if (!summary && item.optString("id").isNotEmpty()) {
      builder.setDeleteIntent(ReminderActionReceiver.intent(context, item, "dismiss"))
      if (buttons != null) {
        for (name in listOf("done", "later", "tomorrow")) {
          builder.addAction(0, buttons.optString(name, name), ReminderActionReceiver.intent(context, item, name))
        }
      }
    }
    try {
      notifications.notify(key, builder.build())
      Log.i(TAG, "reminders: shown ${item.optString("kind")} ${item.optString("moment")}")
    } catch (e: SecurityException) {
      Log.w(TAG, "reminders: not allowed to notify", e)
    }
  }

  /** The body's tap: the app opens on the task ([MainActivity.deliverReminder]). */
  private fun openIntent(context: Context, item: JSONObject): PendingIntent {
    val intent = Intent(context, MainActivity::class.java)
      .setAction(OPEN)
      .setData(Uri.parse("jott-reminder://${item.getInt("key")}/open"))
      .putExtra("list", item.optString("list"))
      .putExtra("id", item.optString("id"))
      .putExtra("at", item.optString("moment"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      context,
      item.getInt("key"),
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }
}

/**
 * Fires a stored alarm, and sets them all again after a reboot, an update, or
 * the exact-alarm permission being granted (the inexact ones become exact).
 */
class ReminderAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ReminderAlarms.RING -> ReminderAlarms.fire(context, intent.getIntExtra("key", 0))
      Intent.ACTION_MY_PACKAGE_REPLACED -> {
        ReminderAlarms.rearm(context)
        SelfUpdate.announce(context)
      }
      Intent.ACTION_BOOT_COMPLETED,
      AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED,
      -> ReminderAlarms.rearm(context)
    }
  }
}
