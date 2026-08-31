// Is the window too small to hold the shell's three columns side by side?
//
// This is the SIZE question, and it is the whole of it. Its answer decides
// the LAYOUT — sidebar as a drawer, right panel as a bottom sheet, tabs as a
// floating sheet — and nothing else. What kind of machine this is rides on
// `data-platform` instead (shell/platform.js): a desktop window dragged narrow
// gets this layout and keeps every device affordance, and the two never mix.
//
// IT ASKS ABOUT HEIGHT TOO, and only because of a phone lying on its side.
// The emulator's 1080×2340 at 480dpi is 360×780 CSS px standing up and
// 780×360 lying down — and 780 is past the width breakpoint, so a rotated
// phone was handed the full desktop shell: a permanent sidebar and a docked
// right panel beside a canvas 360px tall, with the drawer's swipe gone and
// the bottom sheets turned back into columns (user report on device,
// 2026-08-31, "tela virada no celular está bugada"). The width alone cannot
// tell that window apart from a small laptop, and the height alone can:
// nothing that is 360px tall has room for three columns of chrome.
//
// THE BREAKPOINT IS DEFINED ONCE, HERE, AND THE CSS NEVER REPEATS IT.
// The obvious arrangement — an `@media` in the stylesheets and a matchMedia
// here — states the same number in two places that no test can hold together,
// and the day one moves the app renders a drawer beside a full-width sidebar.
// So JS asks the question ONCE — it has to anyway: the compact shell moves the
// back/forward arrows out of the page header and into the top bar, which is
// markup, not paint — and the answer travels down as a prop, landing in the
// classes the components already carry (`.shell--compact`, `.tabs--compact`,
// `.page-header--compact`). No stylesheet states 768, so there is no second
// copy of it to drift.

/// Below this the shell is compact. In px, deliberately: a media query asks
/// about the screen, not about the reader's type size — the app's own lengths
/// are all in rem and must stay that way, but a breakpoint in rem would move
/// when someone raises their font, collapsing a desktop window that never got
/// narrower. 768 is the first of the project's three breakpoints.
export const COMPACT_MAX_WIDTH = 767;

/// And a SCREEN no taller than this is compact however wide it is — the phone
/// on its side. 540 is the project's second breakpoint, and it sits in the gap
/// that matters: a phone lying down is 360–430 CSS px tall and a tablet lying
/// down is 768, so the tablet keeps the full shell and the phone never gets
/// it.
export const COMPACT_MAX_HEIGHT = 540;

export const COMPACT_QUERY = `(max-width: ${COMPACT_MAX_WIDTH}px)`;

/// THE HEIGHT IS THE SCREEN'S, NEVER THE VIEWPORT'S, and that is the same
/// lesson `shell/keyboard.js` had to learn on device: the keyboard shrinks
/// every height a page can measure, and the screen is the one it cannot move.
/// A `(max-height: 540px)` media query would have read TRUE the moment a
/// tablet in landscape (1024×768) opened its keyboard — 768 less a keyboard is
/// about 440 — and thrown the whole shell into the drawer layout mid-sentence,
/// then back out again on the way down. `screen.height` rotates with the
/// device and does nothing else.
///
/// Unknown is NOT short: an engine with no `screen` (jsdom) keeps the full
/// shell, which is the layout that works at every size, only cramped.
function shortScreen(view) {
  const height = view?.screen?.height;
  return typeof height === "number" && height > 0 && height <= COMPACT_MAX_HEIGHT;
}

/// Watches the size and calls back with true/false, starting with the value
/// as it is right now. Returns the unsubscribe.
///
/// Guards a missing `matchMedia` (jsdom without it, an old webview) by
/// answering false once: the full shell is the layout that works at every
/// size, only cramped — the drawer at 1200px would be a broken app.
export function watchCompact(onChange, view = globalThis) {
  if (typeof view?.matchMedia !== "function") {
    onChange(false);
    return () => {};
  }
  const query = view.matchMedia(COMPACT_QUERY);
  const answer = () => onChange(query.matches || shortScreen(view));
  answer();

  // Rotating a phone changes `screen.height` without changing whether the
  // width query matches (780px wide is past the breakpoint either way), so
  // the media query alone would never fire. `resize` is the event every
  // engine agrees on; `orientationchange` is there because some WebViews send
  // it first and the two together only ever re-answer the same question.
  const stopTurns = [];
  if (typeof view.addEventListener === "function") {
    for (const name of ["resize", "orientationchange"]) {
      view.addEventListener(name, answer);
      stopTurns.push(() => view.removeEventListener(name, answer));
    }
  }
  const stop = () => {
    for (const off of stopTurns) off();
  };

  // addListener is the pre-2019 spelling, still the only one some webviews
  // expose on MediaQueryList.
  if (query.addEventListener) {
    query.addEventListener("change", answer);
    return () => (query.removeEventListener("change", answer), stop());
  }
  query.addListener(answer);
  return () => (query.removeListener(answer), stop());
}
