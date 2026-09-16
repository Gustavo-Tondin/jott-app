// The day rolls over while the app is open too, not only when the notebook
// is reopened. The core says WHEN (`nextDailyTurn` in the day clock); this
// schedules the wake-up, and reschedules it from whatever clock the wake-up
// brought back.

import { boundedWait } from "../services/wait.js";

/// How long until the turn, held within the two bounds.
export function waitUntilTurn(clock, now = Date.now()) {
  const next = new Date(clock.nextDailyTurn).getTime();
  return boundedWait(next - now);
}

/// Keeps waking up at each turn. `clock()` answers the CURRENT day clock
/// (it changes after every tick, which is why it is asked rather than
/// passed); `tick` does the rollover; `onError` gets what `tick` throws. A
/// failed tick is still followed by the next wait — the screen stays stale
/// for an hour at most, never for good. Returns `stop()`, which cancels the
/// pending wake-up and every one after it.
export function scheduleTurns({ clock, tick, onError }) {
  let timer = null;
  let stopped = false;
  const arm = () => {
    const current = clock();
    if (stopped || !current) return;
    timer = setTimeout(async () => {
      try {
        await tick();
      } catch (e) {
        onError?.(e);
      }
      arm();
    }, waitUntilTurn(current));
  };
  arm();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
