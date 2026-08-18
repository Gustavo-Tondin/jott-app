// Is the window too narrow to hold the shell's three columns side by side?
//
// This is the WIDTH question, and it is the whole of it. Its answer decides
// the LAYOUT — sidebar as a drawer, right panel as a bottom sheet, tabs as a
// floating sheet — and nothing else. What kind of machine this is rides on
// `data-platform` instead (shell/platform.js): a desktop window dragged narrow
// gets this layout and keeps every device affordance, and the two never mix.
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

export const COMPACT_QUERY = `(max-width: ${COMPACT_MAX_WIDTH}px)`;

/// Watches the width and calls back with true/false, starting with the value
/// as it is right now. Returns the unsubscribe.
///
/// Guards a missing `matchMedia` (jsdom without it, an old webview) by
/// answering false once: the full shell is the layout that works at every
/// width, only cramped — the drawer at 1200px would be a broken app.
export function watchCompact(onChange, view = globalThis) {
  if (typeof view?.matchMedia !== "function") {
    onChange(false);
    return () => {};
  }
  const query = view.matchMedia(COMPACT_QUERY);
  const answer = () => onChange(query.matches);
  answer();
  // addListener is the pre-2019 spelling, still the only one some webviews
  // expose on MediaQueryList.
  if (query.addEventListener) {
    query.addEventListener("change", answer);
    return () => query.removeEventListener("change", answer);
  }
  query.addListener(answer);
  return () => query.removeListener(answer);
}
