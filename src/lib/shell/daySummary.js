// Announces the day summary while a window is open — visible or hidden in
// the tray. Sibling of `reminders.js`: the pure half says whether it is due
// and how long until the next one (services/daySummary.js), this schedules
// the wake-up, and the machine remembers the day it announced so a relaunch
// neither repeats it nor swallows it.
//
// On Android the summary is handed to the system's alarm service with the
// rest (services/androidReminders.js) — a timer in a WebView the OS may kill
// announces nothing.

import { MAX_WAIT, summaryDue, waitUntilSummary } from "../services/daySummary.js";

/// `time()` answers the notebook's `HH:MM` (it changes in Settings, so it is
/// asked, not passed); `shownOn()` the day already announced; `announce(day)`
/// shows it and remembers the day; `onError` gets what `announce` throws.
/// Returns `{rearm, stop}` — `rearm` after the setting or the day changed,
/// `stop` when the window goes.
export function scheduleDaySummary({ time, shownOn, announce, onError }) {
  let timer = null;
  let stopped = false;

  const arm = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (stopped) return;
    const now = new Date();
    // No hour is no summary: an empty one would read as midnight and
    // announce the moment the loop is armed.
    const at = time();
    if (at && summaryDue({ now, time: at, shownOn: shownOn() })) {
      try {
        await announce(now);
      } catch (e) {
        onError?.(e);
      }
      if (stopped) return;
    }
    // Wake at the next one — or in an hour regardless, so a clock jump or a
    // long sleep never leaves the day unannounced.
    const wait = at
      ? waitUntilSummary({ now: new Date(), time: at, shownOn: shownOn() })
      : MAX_WAIT;
    timer = setTimeout(arm, wait);
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
