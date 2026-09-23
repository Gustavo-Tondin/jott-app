package dev.gustavotondin.jott

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import android.webkit.WebView
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.net.HttpURLConnection
import java.net.URL

/**
 * The APK replacing itself, the phone's half of the AppImage's in-place update.
 * The download streams straight into a PackageInstaller session; Android
 * refuses an APK signed with another key or carrying a lower versionCode, so
 * that check is the system's. On Android 12+ no confirmation is asked.
 */
object SelfUpdate {
  private const val STORE = "jott-update"
  private const val CHANNEL = "updates"

  /** Where failures are told; the page listens for `android-update`. */
  @Volatile var page: WeakReference<WebView>? = null

  /**
   * Runs off the UI thread. `labels` is `{channel, title}` in the app's
   * language, kept for the "updated — tap to open" notice the NEW version
   * posts on [Intent.ACTION_MY_PACKAGE_REPLACED].
   */
  fun install(context: Context, url: String, labels: String) {
    val installer = context.packageManager.packageInstaller
    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
      setAppPackageName(context.packageName)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
      }
    }
    val id = installer.createSession(params)
    try {
      installer.openSession(id).use { session ->
        val http = URL(url).openConnection() as HttpURLConnection
        http.connectTimeout = 10_000
        http.readTimeout = 30_000
        if (http.responseCode != HttpURLConnection.HTTP_OK) error("HTTP ${http.responseCode}")
        http.inputStream.use { input ->
          session.openWrite("jott.apk", 0, http.contentLengthLong).use { out ->
            input.copyTo(out)
            session.fsync(out)
          }
        }
        context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().putString("labels", labels).apply()
        val mutable = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        val done = PendingIntent.getBroadcast(
          context, id, Intent(context, SelfUpdateReceiver::class.java),
          PendingIntent.FLAG_UPDATE_CURRENT or mutable,
        )
        session.commit(done.intentSender)
      }
    } catch (e: Exception) {
      Log.e(ReminderAlarms.TAG, "update: not installed", e)
      runCatching { installer.abandonSession(id) }
      tell("failed", e.message ?: e.javaClass.simpleName)
    }
  }

  /** `status` is `cancelled` or `failed`; success never reaches a page, the process is replaced. */
  fun tell(status: String, message: String?) {
    val view = page?.get() ?: return
    val detail = JSONObject().put("status", status).put("message", message ?: "").toString()
    view.post {
      view.evaluateJavascript(
        "document.dispatchEvent(new CustomEvent('android-update',{detail:JSON.parse(${JSONObject.quote(detail)})}))",
        null,
      )
    }
  }

  /** On the new version's first breath: the notice, only when the update was ours. */
  fun announce(context: Context) {
    val store = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
    val labels = store.getString("labels", null)?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return
    store.edit().remove("labels").apply()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(
        NotificationChannel(CHANNEL, labels.optString("channel", "Updates"), NotificationManager.IMPORTANCE_LOW),
      )
    }
    val open = PendingIntent.getActivity(
      context, 0,
      Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val notice = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_jott)
      .setContentTitle(labels.optString("title"))
      .setContentIntent(open)
      .setAutoCancel(true)
      .build()
    runCatching { NotificationManagerCompat.from(context).notify(CHANNEL.hashCode(), notice) }
  }
}

/** The session's answer: the system's confirmation when it wants one, or the failure for the page. */
class SelfUpdateReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
    when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
      PackageInstaller.STATUS_SUCCESS -> {}
      PackageInstaller.STATUS_PENDING_USER_ACTION -> {
        @Suppress("DEPRECATION")
        val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
        context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      PackageInstaller.STATUS_FAILURE_ABORTED -> SelfUpdate.tell("cancelled", message)
      else -> SelfUpdate.tell("failed", message)
    }
  }
}
