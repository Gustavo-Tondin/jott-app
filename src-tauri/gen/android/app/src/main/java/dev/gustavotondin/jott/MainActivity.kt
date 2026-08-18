package dev.gustavotondin.jott

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Tells the page how tall the on-screen keyboard is.
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
 * document root, in CSS pixels; the stylesheets keep the composer, the bottom
 * sheets and the note editor clear of it (styles/tokens.css).
 *
 * Kept here rather than in a Tauri plugin because it is four lines of platform
 * glue with no state and no API surface — and because `onWebViewCreate` is the
 * hook the generated activity already offers for exactly this.
 */
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)

    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      // The page thinks in CSS pixels; the inset arrives in physical ones.
      val css = ime / view.resources.displayMetrics.density
      webView.evaluateJavascript(
        "document.documentElement.style.setProperty('--theme-keyboard','${css}px')",
        null,
      )
      // Passed on untouched: the app is edge-to-edge and reads the other
      // insets through `env(safe-area-inset-*)`, so consuming them here would
      // take the status bar's strip away from the CSS that already handles it.
      insets
    }
  }
}
