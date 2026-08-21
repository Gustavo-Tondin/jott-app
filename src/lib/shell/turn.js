// The day and the week roll over while the app is open too, not only when the
// notebook is reopened. The core says WHEN (`nextDailyTurn`/`nextWeeklyTurn`
// in the period clock); this schedules the wake-up, and reschedules it from
// whatever clock the wake-up brought back.

import { clamp } from "../services/num.js";

/// The shortest wait the timer accepts: a turn already in the past still
/// waits a beat, so a clock that keeps answering "now" cannot spin.
export const MIN_WAIT = 1000;
/// And the longest. Cap the wait: a long sleep or a clock jump would otherwise
/// leave the screen showing yesterday until something else refreshed it.
export const MAX_WAIT = 60 * 60 * 1000;

/// How long until the earlier of the two turns, held within the two bounds.
export function waitUntilTurn(clock, now = Date.now()) {
  const next = Math.min(
    new Date(clock.nextDailyTurn).getTime(),
    new Date(clock.nextWeeklyTurn).getTime(),
  );
  return clamp(next - now, MIN_WAIT, MAX_WAIT);
}

/// Keeps waking up at each turn. `clock()` answers the CURRENT period clock
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
