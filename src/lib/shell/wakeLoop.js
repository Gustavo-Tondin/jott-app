// The wake-up loop the reminders and the day summary share: clear the timer,
// ask what came due, fire it, ask how long until the next, sleep. The caller
// says WHAT is due and WHEN the next is; this owns the timer and its guards.

/// `due(now)` answers what should fire now (falsy or an empty list: nothing);
/// `fire(due, now)` fires it; `waitAfter(now)` the milliseconds until the next
/// pass; `onError` gets what `fire` throws — the next pass is armed anyway.
/// Returns `{rearm, stop}`: `rearm` after what `due` reads changed, `stop`
/// when the window goes.
export function wakeLoop({ due, fire, waitAfter, onError }) {
  let timer = null;
  let stopped = false;
  // One pass at a time: a rearm while `fire` is still awaiting would read the
  // old state and fire the same thing again. It is noted and the pass runs
  // again once this one is through.
  let running = false;
  let dirty = false;

  const arm = async () => {
    if (running) {
      dirty = true;
      return;
    }
    running = true;
    if (timer) clearTimeout(timer);
    timer = null;
    if (stopped) return;
    const now = new Date();
    const found = due(now);
    if (found && (!Array.isArray(found) || found.length)) {
      try {
        await fire(found, now);
      } catch (e) {
        onError?.(e);
      }
      if (stopped) return;
    }
    running = false;
    if (dirty) {
      dirty = false;
      return arm();
    }
    timer = setTimeout(arm, waitAfter(now));
  };

  arm();
  return {
    rearm: () => {
      arm();
    },
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
