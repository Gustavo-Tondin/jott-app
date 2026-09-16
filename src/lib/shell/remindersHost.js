// The shell's side of what rings: the reminders tasks asked for, and the
// day summary. On desktop the PROCESS rings (`src-tauri/src/ringer.rs`, one
// thread per notebook, so two windows ring once and a window hidden in the
// tray rings all the same): the window only nudges it when something it
// reads changed. On Android both are handed to the system's alarm service.
import { listen } from "@tauri-apps/api/event";
import { api } from "../services/api.js";
import { firstReminderOn, nextSummaryAt, summaryNotice } from "../services/daySummary.js";
import { toIso } from "../services/dates.js";
import { onAndroidReminderTap, syncAndroidReminders } from "../services/androidReminders.js";
import { S } from "../services/strings.js";

/// - `open()` — whether a notebook is open; `enabled()` — the Reminders
///   function's switch; `mobile()` — answered by the bridge after mount.
/// - `summary()` — `{on, time}`, the notebook's day-summary setting.
/// - `dateFormat()` — how the notebook draws dates, for the phone's texts.
/// - `openTask(list, id)` — a clicked notification names its task; the list
///   opens and the panel with it, exactly as a search hit does.
/// - `fail` — the shell's error.
export function makeRemindersHost({ open, enabled, mobile, summary, dateFormat, openTask, fail }) {
  // Installed on the first refresh rather than up front: `mobile` is answered
  // by the bridge after mount, and at mount it still says desktop.
  let androidTapInstalled = false;

  const summaryOf = () => summary?.() ?? { on: false, time: "" };

  /// Marks a reminder as dealt with in the NOTEBOOK, so the next device to
  /// sync keeps quiet about it. A task with no id cannot be named on the
  /// other device.
  async function ack(reminder) {
    if (!reminder?.id || !reminder.at) return;
    await api.ackReminder(reminder.list, reminder.id, reminder.at);
  }

  async function syncAndroid() {
    const { on: summaryOn, time: summaryTime } = summaryOf();
    if (!enabled() && !summaryOn) {
      await syncAndroidReminders([], { strings: S }).catch(() => {});
      return;
    }
    const reminders = enabled() ? ((await api.reminders()) ?? []) : [];
    if (!androidTapInstalled) {
      androidTapInstalled = true;
      // The tap is the only dismissal Android reports back, and the alarm
      // carries the moment so the ack needs no lookup.
      onAndroidReminderTap(async (target) => {
        await ack(target).catch(fail);
        openTask(target.list, target.id);
      }).catch(() => {});
    }
    // The summary is about the day the alarm lands on, read at sync time —
    // a day not begun yet is counted as planned.
    const now = new Date();
    const summaryAt = summaryOn ? nextSummaryAt({ now, time: summaryTime }) : null;
    const notice = summaryAt
      ? summaryNotice(await api.dayTasks(toIso(summaryAt)), S, {
          planned: toIso(summaryAt) !== toIso(now),
          firstReminder: firstReminderOn(reminders, summaryAt),
        })
      : null;
    // A `pending()` that throws (the store of an older build) is worth a
    // line in the log and not a notice: the sync goes on without it.
    await syncAndroidReminders(reminders, {
      now,
      strings: S,
      dateFormat: dateFormat?.(),
      summary: summaryAt ? { at: summaryAt, notice } : null,
      onError: (error) => console.warn("reminders: pending() failed", error),
    }).catch(fail);
  }

  async function refresh() {
    if (!open()) return;
    if (mobile()) return syncAndroid();
    await api.nudgeReminders(enabled()).catch(fail);
  }

  listen("reminder://open", (event) => {
    const target = event.payload ?? {};
    if (target.list) openTask(target.list, target.id || null);
  });
  // What the process could not show (no notification daemon, say) is said
  // once inside the app.
  listen("reminder://unshown", (event) => {
    const texts = event.payload ?? [];
    if (texts.length) fail(S.reminderNotShown(texts));
  });

  return { refresh };
}
