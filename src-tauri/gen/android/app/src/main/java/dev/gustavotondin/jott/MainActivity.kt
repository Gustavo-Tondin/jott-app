package dev.gustavotondin.jott

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.provider.DocumentsContract
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject
import java.io.File

/**
 * Tells the page what the system is covering: the keyboard, and the bars.
 *
 * WHY THIS EXISTS AT ALL — the web platform has three answers to "is the
 * keyboard up?", and in an Android WebView all three are silent. Measured
 * against this app on API 36 (2026-08-18):
 *
 *   - `interactive-widget=resizes-content` in the viewport meta: no effect.
 *     That flag is honoured by Chrome the browser; inside a WebView the
 *     window's soft-input behaviour belongs to the Android window, not the
 *     page.
 *   - `visualViewport.height` and `innerHeight`: both stay at the full 780,
 *     with the keyboard covering the bottom third of it. Nothing resizes.
 *   - `navigator.virtualKeyboard` / `env(keyboard-inset-height)`: the API is
 *     PRESENT (Chrome 133) and reports 0 with `overlaysContent = true` and a
 *     focused field. Present and inert.
 *
 * So the page cannot find out on its own, and Android has to say. This reads
 * the IME inset from the window and writes it to `--android-ime` on the
 * document root, in CSS pixels.
 *
 * WHAT IT IS NOT is the distance anything moves. Chrome M139 taught the
 * Android WebView to resize the page under the keyboard by itself, so on a
 * new WebView the page is already clear of it and an app that lifts by this
 * inset lifts twice. The three measurements above were taken on WebView 133,
 * before that landed, and they are kept because the same APK still meets both
 * WebViews. What the layout reads is `--app-keyboard`, which the page
 * derives by comparing this inset against its own initial containing block and
 * the height of the SCREEN — never against this window, which `adjustResize`
 * shrinks for the keyboard, and which therefore cannot say how much room there
 * was before it (shell/keyboard.js). The composer, the strip and the bottom
 * sheets keep clear of THAT (styles/tokens.css).
 *
 * It also publishes the system bars as `--android-inset-*`, for a smaller
 * reason with the same shape: `env(safe-area-inset-top)` reports the status
 * bar correctly here, while `env(safe-area-inset-bottom)` reports 0 with the
 * gesture handle plainly on screen. Rather than trust one edge and not
 * another, all four come from the window and the CSS takes whichever of the
 * two answers is larger.
 */
class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  /// The last insets seen, so they can be re-published once there is a
  /// document to publish them to (see [publish]).
  private var pending: String? = null
  /// The two grounds the page last reported behind the system bars — the
  /// status bar's and the navigation bar's — or null while it has not said
  /// (see [paintBars]).
  private var darkBars: Pair<Boolean, Boolean>? = null
  /// The height of the keyboard the last time it was reported, so that its
  /// GOING AWAY can be told apart from it merely being absent. Only the edge
  /// is worth an event (see the listener).
  private var keyboard: Int = 0
  /// The system's folder chooser, armed for [Storage.pickFolder].
  ///
  /// Registered here and not where it is used: a launcher has to exist before
  /// the activity is STARTED, or the framework throws — registering one on
  /// demand is the standard way to get `LifecycleOwners must call register
  /// before they are STARTED`.
  private lateinit var folderPicker: ActivityResultLauncher<Uri?>

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    folderPicker =
      registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        // Cancelled is not the same as "could not be used": the page falls
        // back to its own browser for the second and does nothing for the
        // first, so the two travel separately.
        val answer = JSONObject()
        answer.put("cancelled", uri == null)
        answer.put("path", uri?.let { realPath(it) })
        webView?.evaluateJavascript(
          "document.dispatchEvent(new CustomEvent('android-folder-picked'," +
            "{detail:JSON.parse(${JSONObject.quote(answer.toString())})}))",
          null,
        )
      }
  }

  /**
   * The folder a `content://` tree URI stands for, or null when it stands for
   * one this app cannot reach as a path.
   *
   * WHY CONVERT AT ALL — the core speaks `std::fs`, and the Storage Access
   * Framework answers with a URI that `std::fs` cannot open. That is why the
   * app grew its own folder browser in the first place. But the browser is not
   * what anyone expects to see when an app asks where to put its files, and
   * the app ALREADY holds all-files access, which is what makes the conversion
   * sound: with that permission the path the URI names is a path this process
   * can genuinely open, and the picker becomes what it should have been all
   * along — a chooser, not a way in.
   *
   * The tree id is `volume:relative/path`. `primary` is the built-in shared
   * storage; anything else is a removable volume, which lives under /storage
   * by its id. A volume this does not resolve to a real, writable directory
   * answers null rather than a guess, and the page opens its own browser.
   */
  private fun realPath(uri: Uri): String? {
    val id = runCatching { DocumentsContract.getTreeDocumentId(uri) }.getOrNull() ?: return null
    val parts = id.split(":", limit = 2)
    if (parts.size != 2) return null
    val (volume, relative) = parts
    val base =
      if (volume.equals("primary", ignoreCase = true)) {
        Environment.getExternalStorageDirectory().absolutePath
      } else {
        "/storage/$volume"
      }
    val folder = if (relative.isEmpty()) File(base) else File(base, relative)
    // Proven, not assumed: a path that cannot be listed and written is one the
    // notebook cannot live at, and finding that out HERE is what lets the page
    // offer the browser instead of failing on open.
    return if (folder.isDirectory && folder.canRead() && folder.canWrite()) {
      folder.absolutePath
    } else {
      null
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    webView.addJavascriptInterface(Storage(), "JottAndroid")
    takeBackNavigation()

    // On the DECOR view, not the WebView: the WebView is not necessarily in
    // the hierarchy when this runs, and the decor view is the one the window
    // always dispatches to.
    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
      settle(insets.getInsets(WindowInsetsCompat.Type.ime()).bottom)
      report(view, insets)

      // DELEGATED, never just returned. Setting a listener REPLACES the view's
      // own `onApplyWindowInsets`, and the WebView's own is what feeds
      // Chromium's `env(safe-area-inset-*)` — returning `insets` here left
      // every one of them at 0 and put the top bar under the status bar
      // (measured: the status-bar inset went from 43px to 0 the moment this
      // listener was added).
      ViewCompat.onApplyWindowInsets(view, insets)
    }

    // The keyboard SLIDES, and the page has to slide with it.
    //
    // The listener above answers once, with the inset the keyboard will have
    // when it finishes arriving — so the strip jumped to the top of a keyboard
    // that was still on its way up and hung there over nothing for the length
    // of the animation. That is the whole of "the panel is loose on screen"
    // (user report on device, 2026-08-20): it was never in the wrong PLACE, it
    // got there before the keyboard did.
    //
    // `onProgress` runs per frame with the insets as they are at that frame,
    // which is the same source the final answer comes from — so the page is
    // told the truth ~15 times instead of once, and nothing has to guess a
    // duration or copy the system's easing curve.
    //
    // CONTINUE_ON_SUBTREE, not STOP: STOP would hold the whole dispatch back
    // from the subtree until the animation ended, and the WebView's own inset
    // handling — the thing that feeds `env(safe-area-inset-*)` and, since
    // Chrome M139, resizes the page under the keyboard — is in that subtree.
    ViewCompat.setWindowInsetsAnimationCallback(
      window.decorView,
      object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
        override fun onProgress(
          insets: WindowInsetsCompat,
          running: MutableList<WindowInsetsAnimationCompat>,
        ): WindowInsetsCompat {
          val moving = running.any { it.typeMask and WindowInsetsCompat.Type.ime() != 0 }
          if (moving) report(window.decorView, insets)
          return insets
        }
      },
    )
  }

  /**
   * Announces the keyboard GOING AWAY, and remembers where it settled.
   *
   * Nothing in the page can notice that on its own (see the class comment),
   * and something has to: dismissing the keyboard with the back gesture left
   * the note still focused, caret blinking on a line nobody was typing into,
   * with the formatting strip floating above a keyboard that was no longer
   * there (user report on device, 2026-08-20). Only the EDGE is announced —
   * the inset pass runs for every bar change, and "still zero" is not news.
   *
   * ONLY THE SETTLED INSET REACHES HERE, never an animation frame, and that
   * is not a detail: a keyboard on its way UP passes through zero on its
   * first frames, so asking a frame whether the keyboard is gone answered
   * yes 150ms after every tap. The page blurred the field, the keyboard it
   * had just asked for was dismissed, and no text field in the app could be
   * focused by touch at all (measured on the emulator, 2026-08-20). It is
   * the exact loop Chrome's WebView documentation warns about, arrived at
   * from the other end.
   */
  private fun settle(ime: Int) {
    if (keyboard > 0 && ime == 0) {
      webView?.evaluateJavascript(
        "document.dispatchEvent(new CustomEvent('android-keyboard-hidden'))",
        null,
      )
    }
    keyboard = ime
  }

  /**
   * Tells the page what the system is covering right now.
   *
   * Called from two places on purpose: the inset listener, which is the
   * settled answer, and every frame of the keyboard's own animation.
   */
  private fun report(view: View, insets: WindowInsetsCompat) {
    // The page thinks in CSS pixels; insets arrive in physical ones.
    val density = view.resources.displayMetrics.density
    val px = { v: Int -> "${v / density}px" }

    val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
    // The bars the app draws under, gesture handle and cutout included. NOT
    // the IME: it is asked for separately because it comes and goes for a
    // different reason and the page answers it differently.
    val bars = insets.getInsets(
      WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
    )
    pending =
      "--android-ime:${px(ime)};" +
        "--android-inset-top:${px(bars.top)};" +
        "--android-inset-right:${px(bars.right)};" +
        "--android-inset-bottom:${px(bars.bottom)};" +
        "--android-inset-left:${px(bars.left)}"
    publish()
  }

  /**
   * Makes the system's back gesture mean what the app's back arrow means.
   *
   * Tauri turns [WryActivity]'s own handling off (`handleBackNavigation =
   * false`), and with nothing in its place a back gesture went straight to
   * finishing the activity — so the gesture every Android user reaches for
   * first CLOSED THE APP, from anywhere, instead of stepping back through the
   * tab's history the way the arrows in the title bar do (user report on
   * device, 2026-08-20).
   *
   * The page is the one that knows: whether a sheet is open, whether the
   * drawer is out, whether this tab has anywhere to go back to. So it is asked
   * — `window.__jottBack()` answers whether it took the press — and only when
   * it says no does the press become the system's again, by the same
   * disable/re-enable dance [WryActivity] uses for its own.
   *
   * `evaluateJavascript` answers on the UI thread but LATER, which is why this
   * cannot simply return a boolean: by the time the answer arrives the
   * dispatcher has finished with the press, and re-dispatching is the only way
   * to hand it back. A page that has not installed the hook (or that throws)
   * answers `false`, so back keeps closing the app rather than becoming dead.
   */
  private fun takeBackNavigation() {
    val callback = object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val view = webView
        if (view == null) {
          giveBack(this)
          return
        }
        view.evaluateJavascript(
          "(function(){try{return !!(window.__jottBack&&window.__jottBack())}" +
            "catch(e){return false}})()",
        ) { handled ->
          if (handled != "true") giveBack(this)
        }
      }
    }
    onBackPressedDispatcher.addCallback(this, callback)
  }

  /// Lets this one press through to whoever would have had it — which, with
  /// nothing else registered, is the activity finishing.
  private fun giveBack(callback: OnBackPressedCallback) {
    callback.isEnabled = false
    onBackPressedDispatcher.onBackPressed()
    callback.isEnabled = true
  }

  /**
   * Writes the last insets onto the document root, retrying until there IS a
   * document root.
   *
   * The first inset passes happen before Tauri's page is loaded, and the
   * writes are lost. Rather than guess a delay, the injected script REPORTS
   * whether it landed and this retries while it has not, giving up after
   * [RETRIES]. Once the page is up the listener keeps the values fresh on its
   * own, which is what carries the keyboard.
   *
   * What it reports on is `#app`, THE APP'S OWN ROOT, not `documentElement`:
   * the blank document a WebView starts on has a `documentElement` too, so the
   * first write always "succeeded", the retries stopped, and the real page
   * then loaded over the top of it and wiped them (measured — the properties
   * were still unset ten seconds in).
   */
  private fun publish(tries: Int = RETRIES) {
    val style = pending ?: return
    val view = webView ?: return
    view.evaluateJavascript(
      "(function(){if(!document.getElementById('app'))return false;" +
        "var e=document.documentElement;" +
        "var d='$style'.split(';');" +
        "for(var i=0;i<d.length;i++){var p=d[i].split(':');e.style.setProperty(p[0],p[1]);}" +
        // Said out loud, because a custom property landing on the root is not
        // an event: nothing in the page can observe a style being set from
        // here, and the page is the one that turns this inset into the
        // distance the layout owes (shell/keyboard.js).
        "document.dispatchEvent(new CustomEvent('android-insets'));" +
        "return true})()",
    ) { landed ->
      if (landed != "true" && tries > 0) {
        view.postDelayed({ publish(tries - 1) }, RETRY_MS)
      }
    }
  }

  /**
   * Draws each system bar's icons for the darkness of the ground under it, and
   * remembers the pair. The two are asked separately because the app's own
   * mode paints the top of the screen and the bottom in different colours.
   *
   * `enableEdgeToEdge` decides this once, from the PHONE's dark mode, and the
   * app's mode is a setting of its own: a light app under a dark phone got
   * white icons on its white bar and the clock disappeared. The page measures
   * the ground it paints and says (shell/systemBars.js). Remembered because
   * coming back to the app is not a page event.
   */
  private fun paintBars(dark: Boolean, darkNav: Boolean) {
    darkBars = dark to darkNav
    val bars = WindowCompat.getInsetsController(window, window.decorView)
    bars.isAppearanceLightStatusBars = !dark
    bars.isAppearanceLightNavigationBars = !darkNav
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    // Coming back from elsewhere: the bars may have changed while away, and
    // the page may have been reloaded under us. Both are cheap to redo.
    if (hasFocus) {
      publish()
      darkBars?.let { paintBars(it.first, it.second) }
      webView?.let { ViewCompat.requestApplyInsets(it) }
      // Coming back from the system Settings screen is how the file permission
      // is granted, and nothing else tells the page that it changed.
      webView?.evaluateJavascript(
        "document.dispatchEvent(new CustomEvent('android-storage-changed'))",
        null,
      )
    }
  }


  /**
   * What the page cannot ask on its own: whether this app may read and write
   * the user's own folders, and the request to be allowed to.
   *
   * WHY A JAVASCRIPT INTERFACE AND NOT A TAURI COMMAND — the answer lives in
   * the Activity (it is the Activity that starts the Settings screen and that
   * receives the permission result), and the Rust side would have to reach
   * back here through JNI to get it. This class is the mirror image of
   * [publish], which already talks the other way down the same WebView; a
   * second mechanism for the same conversation would be the thing to explain,
   * not this one.
   *
   * The WebView loads nothing but the app's own bundle, so this is not exposed
   * to any page from the web.
   */
  private inner class Storage {
    /**
     * True when the app can open any folder the user points it at.
     *
     * On Android 11+ that is MANAGE_EXTERNAL_STORAGE, which is not a runtime
     * permission at all — it is a toggle on a Settings screen, so it is asked
     * about rather than requested. Before 11 it is the old write permission.
     */
    @JavascriptInterface
    fun granted(): Boolean =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Environment.isExternalStorageManager()
      } else {
        ContextCompat.checkSelfPermission(
          this@MainActivity,
          Manifest.permission.WRITE_EXTERNAL_STORAGE,
        ) == PackageManager.PERMISSION_GRANTED
      }

    /**
     * Which ground each system bar is over — the status bar's at the top of
     * the page, the navigation bar's at the bottom — true where it is dark, so
     * that bar's icons are drawn light. See [paintBars] for why the page is
     * the one that knows. `runOnUiThread` because a JavascriptInterface method
     * runs on the WebView's own thread and the window is the UI thread's.
     */
    @JavascriptInterface
    fun systemBars(dark: Boolean, darkNav: Boolean) {
      runOnUiThread { paintBars(dark, darkNav) }
    }

    /**
     * Asks for it. Answers nothing: the user leaves the app to decide, and
     * [onWindowFocusChanged] is what tells the page to look again.
     *
     * `runOnUiThread` because a JavascriptInterface method runs on the
     * WebView's own thread, and starting an activity is the UI thread's.
     */
    /**
     * Opens the SYSTEM's folder chooser — the screen a phone user expects when
     * an app asks where to keep its files.
     *
     * Answers nothing: the chosen folder comes back through
     * `android-folder-picked` on the document, the same shape as every other
     * message this class sends. `runOnUiThread` because a JavascriptInterface
     * method runs on the WebView's thread and launching is the UI thread's.
     */
    @JavascriptInterface
    fun pickFolder() {
      runOnUiThread { runCatching { folderPicker.launch(null) } }
    }

    @JavascriptInterface
    fun request() {
      runOnUiThread {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          // The per-app screen, with a fallback to the whole list: a few OEM
          // builds ship without the per-app one, and an ActivityNotFound there
          // would leave the button doing nothing at all.
          val perApp = Intent(
            Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
            Uri.fromParts("package", packageName, null),
          )
          val anyApp = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
          runCatching { startActivity(perApp) }
            .recoverCatching { startActivity(anyApp) }
        } else {
          ActivityCompat.requestPermissions(
            this@MainActivity,
            arrayOf(
              Manifest.permission.READ_EXTERNAL_STORAGE,
              Manifest.permission.WRITE_EXTERNAL_STORAGE,
            ),
            STORAGE_REQUEST,
          )
        }
      }
    }
  }

  private companion object {
    /// ~8 seconds of trying, which is well past a cold start on a slow
    /// emulator and still bounded.
    const val RETRIES = 20
    const val RETRY_MS = 400L

    /// Only used before Android 11, where storage is a runtime permission.
    const val STORAGE_REQUEST = 4201
  }
}
