package dev.gustavotondin.jott

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

/**
 * Done, Later, Tomorrow or a swipe, answered without opening the app: the rule
 * is the core's ([ReminderCore]); an open app's watcher sees the write. `goAsync`
 * gives about ten seconds, which one notebook open and one list write fit in.
 */
class ReminderActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val answer = intent.getStringExtra("answer") ?: return
    val item = runCatching { JSONObject(intent.getStringExtra("item") ?: return) }.getOrNull() ?: return
    val app = context.applicationContext
    val pending = goAsync()
    Thread {
      try {
        act(app, item, answer)
      } catch (e: Throwable) {
        Log.e(ReminderAlarms.TAG, "reminders: $answer failed", e)
      } finally {
        pending.finish()
      }
    }.start()
  }

  private fun act(context: Context, item: JSONObject, answer: String) {
    val key = item.getInt("key")
    if (answer != "dismiss") NotificationManagerCompat.from(context).cancel(key)
    val request = JSONObject()
      .put("root", item.optString("root"))
      .put("device", item.optString("device").ifEmpty { null })
      .put("list", item.optString("list"))
      .put("id", item.optString("id"))
      .put("at", item.optString("moment"))
      .put("action", answer)
    val reply = JSONObject(ReminderCore.act(request.toString()) ?: "{}")
    if (!reply.isNull("error")) {
      Log.w(ReminderAlarms.TAG, "reminders: $answer refused: ${reply.optString("error")}")
      return
    }
    Log.i(ReminderAlarms.TAG, "reminders: $answer on ${item.optString("moment")}")
    if (!reply.isNull("moved")) {
      val moved = JSONObject(item.toString())
        .put("at", reply.getLong("movedMillis"))
        .put("moment", reply.getString("moved"))
      ReminderAlarms.put(context, moved)
    }
  }

  companion object {
    fun intent(context: Context, item: JSONObject, answer: String): PendingIntent {
      val key = item.getInt("key")
      val intent = Intent(context, ReminderActionReceiver::class.java)
        .setAction("dev.gustavotondin.jott.REMINDER_${answer.uppercase()}")
        .setData(Uri.parse("jott-reminder://$key/$answer"))
        .putExtra("answer", answer)
        .putExtra("item", item.toString())
      return PendingIntent.getBroadcast(
        context,
        key,
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    }
  }
}

/** The core, in Rust (`src-tauri/src/reminder_actions.rs`): JSON in, JSON out. */
object ReminderCore {
  init {
    System.loadLibrary("jott_lib")
  }

  @JvmStatic
  external fun act(request: String): String?
}
