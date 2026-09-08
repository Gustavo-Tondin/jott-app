// The shell's side of reminders. The core lists what should ring; on
// desktop `shell/reminders.js` keeps the timer (the window may be hidden in
// the tray, the timer runs on) and the bridge shows the system's
// notification; on Android the list is handed to the system's alarm service
// instead. Either way the machine remembers up to where it rang, so a
// relaunch neither repeats nor swallows.
import { listen } from "@tauri-apps/api/event";
import { api } from "../services/api.js";
import { notice, toAt } from "../services/reminders.js";
import { onAndroidReminderTap, syncAndroidReminders } from "../services/androidReminders.js";
import { scheduleReminders } from "./reminders.js";
import { S } from "../services/strings.js";

/// - `open()` — whether a notebook is open; `enabled()` — the Reminders
///   function's switch; `mobile()` — answered by the bridge after mount.
/// - `openTask(list, id)` — a clicked notification names its task; the list
///   opens and the panel with it, exactly as a search hit does.
/// - `fail` — the shell's error.
export function makeRemindersHost({ open, enabled, mobile, openTask, fail }) {
  let reminders = [];
  /// `undefined` until asked; `null` when this machine never rang this
  /// notebook — and then "now" becomes the mark, so nothing old rings.
  let remindedUntil = undefined;
  let loop = null;
  // Installed on the first refresh rather than up front: `mobile` is answered
  // by the bridge after mount, and at mount it still says desktop.
  let androidTapInstalled = false;

  async function ring(due, now) {
    for (const reminder of due) {
      const { title, body } = notice(reminder, S);
      await api.notifyReminder(title, body, { list: reminder.list, id: reminder.id ?? null });
    }
    remindedUntil = now;
    await api.rememberRemindedUntil(now);
  }

  async function refresh() {
    if (!open() || !enabled()) {
      reminders = [];
      loop?.stop();
      loop = null;
      if (mobile() && open()) await syncAndroidReminders([], { strings: S }).catch(() => {});
      return;
    }
    reminders = (await api.reminders()) ?? [];
    if (remindedUntil === undefined) {
      remindedUntil = (await api.remindedUntil()) ?? null;
      if (remindedUntil === null) {
        remindedUntil = toAt(new Date());
        await api.rememberRemindedUntil(remindedUntil);
      }
    }
    if (mobile()) {
      if (!androidTapInstalled) {
        androidTapInstalled = true;
        onAndroidReminderTap((target) => openTask(target.list, target.id)).catch(() => {});
      }
      // A `pending()` that throws (the store of an older build) is worth a
      // line in the log and not a notice: the sync goes on without it.
      await syncAndroidReminders(reminders, {
        strings: S,
        onError: (error) => console.warn("reminders: pending() failed", error),
      }).catch(fail);
      return;
    }
    if (loop) loop.rearm();
    else
      loop = scheduleReminders({
        list: () => reminders,
        until: () => remindedUntil,
        ring,
        onError: fail,
      });
  }

  listen("reminder://open", (event) => {
    const target = event.payload ?? {};
    if (target.list) openTask(target.list, target.id || null);
  });

  return { refresh };
}
