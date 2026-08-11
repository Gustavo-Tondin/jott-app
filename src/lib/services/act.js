// The one shape every screen and widget uses to change the notebook: do it,
// reload what is on screen, tell the shell — and route a failure to the error
// banner instead of an unhandled rejection.
//
// It was written six times over (ListView, PeriodView, HomeView, TagsView and
// both widgets), each copy slightly its own. Princípio 7: the behaviour that
// shows up everywhere is a capability, not a snippet to paste.

/// Builds the `act(fn)` of a screen.
///
/// `load` re-reads what the screen shows (the disk is the source of truth, so
/// nothing is patched in memory); `onChanged` lets the shell refresh the
/// counts and the sidebar; `onError` gets anything that throws. All three are
/// optional — a screen that only reads still gets the error routing.
///
/// Pass the shell's callbacks WRAPPED (`onError: (e) => onError?.(e)`), never
/// the prop itself: `act` is built once, so handing it the prop would freeze
/// the value it had at first render — the reason Svelte warns about
/// `state_referenced_locally` here.
export function makeAct({ load, onChanged, onError } = {}) {
  return async function act(fn) {
    try {
      await fn();
      await load?.();
      onChanged?.();
    } catch (e) {
      onError?.(e);
      return undefined;
    }
  };
}

/// Builds the `load()` of a screen: reads through `read`, hands the result to
/// `apply`, and reports a failure the same way `act` does.
export function makeLoad({ read, apply, onError }) {
  return async function load() {
    try {
      apply(await read());
    } catch (e) {
      onError?.(e);
    }
  };
}
