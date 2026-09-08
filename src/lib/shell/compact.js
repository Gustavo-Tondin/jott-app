// Is the window too small for the shell's three columns? The SIZE question
// only — it decides the LAYOUT (drawer, bottom sheets); what machine this is
// rides on `data-platform`. Width AND screen height, for a phone on its side.
// The breakpoint is defined ONCE, here, and no stylesheet repeats 768: the
// answer travels down as a prop into `.shell--compact` and friends.

/// Below this the shell is compact. In px on purpose: a breakpoint asks about
/// the screen, not the reader's type size. 768 is the project's first breakpoint.
export const COMPACT_MAX_WIDTH = 767;

/// A SCREEN no taller than this is compact however wide: a phone lying down is
/// 360–430 CSS px tall, a tablet 768, and 540 sits between (second breakpoint).
export const COMPACT_MAX_HEIGHT = 540;

export const COMPACT_QUERY = `(max-width: ${COMPACT_MAX_WIDTH}px)`;

/// The SCREEN's height, never the viewport's: the keyboard shrinks every
/// height a page can measure, and a `(max-height)` query would flip the shell
/// mid-sentence on a landscape tablet. Unknown (jsdom) is NOT short: the full
/// shell works at every size, only cramped. The Home's head reads this too.
export function isShortScreen(view = globalThis) {
  const height = view?.screen?.height;
  return typeof height === "number" && height > 0 && height <= COMPACT_MAX_HEIGHT;
}
const shortScreen = isShortScreen;

/// Watches the size and calls back with true/false, starting now. Returns the
/// unsubscribe. No `matchMedia` (jsdom, an old webview): false once — the full
/// shell works at every size; the drawer at 1200px would be a broken app.
export function watchCompact(onChange, view = globalThis) {
  if (typeof view?.matchMedia !== "function") {
    onChange(false);
    return () => {};
  }
  const query = view.matchMedia(COMPACT_QUERY);
  const answer = () => onChange(query.matches || shortScreen(view));
  answer();

  // Rotating a phone changes `screen.height` without the width query
  // changing, so `resize`/`orientationchange` re-answer the same question.
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
