// Rings the notebook's reminders while a window is open — visible or hidden
// in the tray. Sibling of `turn.js`: the core says WHEN (the sorted list from
// `reminders`), this schedules the wake-up and rings what came due, and the
// machine remembers up to where it rang so a relaunch neither repeats a
// reminder nor swallows the ones missed while the app was closed.
//
// On Android the same list is handed to the system's alarm service instead
// (services/androidReminders.js) — a timer in a WebView the OS may kill is
// not a reminder.

import { dueNow, MAX_WAIT, nextAfter, toAt, waitUntil } from "../services/reminders.js";

/// `list()` answers the CURRENT reminders (they change with every edit, so
/// they are asked, not passed); `until()` the moment already rung up to;
/// `ring(due, now)` shows them and remembers `now`; `onError` gets what
/// `ring` throws. Returns `{rearm, stop}`: `rearm` after the list changed,
/// `stop` when the window goes.
export function scheduleReminders({ list, until, ring, onError }) {
  let timer = null;
  let stopped = false;

  const arm = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (stopped) return;
    const now = new Date();
    const reminders = list() ?? [];
    const due = dueNow(reminders, { now, until: until() });
    if (due.length) {
      try {
        await ring(due, toAt(now));
      } catch (e) {
        onError?.(e);
      }
      if (stopped) return;
    }
    // Wake at the next one — or in an hour regardless, so a clock jump or a
    // long sleep never leaves a reminder unrung until something else moves.
    const next = nextAfter(reminders, now);
    const wait = next ? waitUntil(next.at, now) : MAX_WAIT;
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
