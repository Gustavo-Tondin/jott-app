package dev.gustavotondin.jott

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

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
 * the IME inset from the window and writes it to `--theme-keyboard` on the
 * document root, in CSS pixels; the composer and the bottom sheets keep clear
 * of it (styles/tokens.css).
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

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView

    // On the DECOR view, not the WebView: the WebView is not necessarily in
    // the hierarchy when this runs, and the decor view is the one the window
    // always dispatches to.
    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
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
        "--theme-keyboard:${px(ime)};" +
          "--android-inset-top:${px(bars.top)};" +
          "--android-inset-right:${px(bars.right)};" +
          "--android-inset-bottom:${px(bars.bottom)};" +
          "--android-inset-left:${px(bars.left)}"
      publish()

      // DELEGATED, never just returned. Setting a listener REPLACES the view's
      // own `onApplyWindowInsets`, and the WebView's own is what feeds
      // Chromium's `env(safe-area-inset-*)` — returning `insets` here left
      // every one of them at 0 and put the top bar under the status bar
      // (measured: the status-bar inset went from 43px to 0 the moment this
      // listener was added).
      ViewCompat.onApplyWindowInsets(view, insets)
    }
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
        "return true})()",
    ) { landed ->
      if (landed != "true" && tries > 0) {
        view.postDelayed({ publish(tries - 1) }, RETRY_MS)
      }
    }
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    // Coming back from elsewhere: the bars may have changed while away, and
    // the page may have been reloaded under us. Both are cheap to redo.
    if (hasFocus) {
      publish()
      webView?.let { ViewCompat.requestApplyInsets(it) }
    }
  }

  private companion object {
    /// ~8 seconds of trying, which is well past a cold start on a slow
    /// emulator and still bounded.
    const val RETRIES = 20
    const val RETRY_MS = 400L
  }
}
