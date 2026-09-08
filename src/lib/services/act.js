// The one shape every screen uses to change the notebook: do it, reload
// what is on screen, tell the shell — and route a failure to the error
// banner instead of an unhandled rejection.

/// Builds a screen's `act(fn, after)`. `load` re-reads what the screen shows
/// (disk is the truth); `onChanged` lets the shell refresh; `onError` gets
/// what throws. `after` runs AFTER the reload with what `fn` answered, never
/// when `fn` threw. Pass the shell's callbacks WRAPPED — built once, a prop freezes.
export function makeAct({ load, onChanged, onError } = {}) {
  return async function act(fn, after) {
    try {
      const result = await fn();
      await load?.();
      onChanged?.();
      return await after?.(result);
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

/// Builds the pair every screen holds — `load` and the `act` that reloads
/// through it — from one description. Pass the shell's callbacks WRAPPED, as
/// with `makeAct`; the `$effect` that calls `load` when the key changes stays
/// in the screen.
export function makeScreen({ read, apply, onChanged, onError }) {
  const load = makeLoad({ read, apply, onError });
  return { load, act: makeAct({ load, onChanged, onError }) };
}
