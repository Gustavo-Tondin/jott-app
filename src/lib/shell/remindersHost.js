// The shell's side of what rings: the reminders tasks asked for, and the
// day summary. The core lists what should ring; on desktop
// `shell/reminders.js` and `shell/daySummary.js` keep the timers (the window
// may be hidden in the tray, the timers run on) and the bridge shows the
// system's notification; on Android both are handed to the system's alarm
// service instead. Either way the machine remembers what it already showed,
// so a relaunch neither repeats nor swallows.
import { listen } from "@tauri-apps/api/event";
import { api } from "../services/api.js";
import { notice, toAt } from "../services/reminders.js";
import { nextSummaryAt, summaryNotice } from "../services/daySummary.js";
import { toIso } from "../services/dates.js";
import { onAndroidReminderTap, syncAndroidReminders } from "../services/androidReminders.js";
import { scheduleReminders } from "./reminders.js";
import { scheduleDaySummary } from "./daySummary.js";
import { S } from "../services/strings.js";

/// - `open()` — whether a notebook is open; `enabled()` — the Reminders
///   function's switch; `mobile()` — answered by the bridge after mount.
/// - `summary()` — `{on, time}`, the notebook's day-summary setting.
/// - `openTask(list, id)` — a clicked notification names its task; the list
///   opens and the panel with it, exactly as a search hit does.
/// - `fail` — the shell's error.
export function makeRemindersHost({ open, enabled, mobile, summary, openTask, fail }) {
  let reminders = [];
  /// `undefined` until asked; `null` when this machine never rang this
  /// notebook — and then "now" becomes the mark, so nothing old rings.
  let remindedUntil = undefined;
  /// The same for the summary, a DAY rather than a moment: `null` means this
  /// machine never announced this notebook, and the first one is made.
  let summarizedOn = undefined;
  let loop = null;
  let summaryLoop = null;
  // Installed on the first refresh rather than up front: `mobile` is answered
  // by the bridge after mount, and at mount it still says desktop.
  let androidTapInstalled = false;

  const summaryOf = () => summary?.() ?? { on: false, time: "" };

  /// Marks a reminder as dealt with in the NOTEBOOK, so the next device to
  /// sync keeps quiet about it. Showing it is what counts: no desktop
  /// notification system reports a dismissal, and `remindedUntil` has always
  /// treated the bell as the mark — this one simply travels with the files.
  /// A task with no id cannot be named on the other device.
  async function ack(reminder) {
    if (!reminder?.id || !reminder.at) return;
    await api.ackReminder(reminder.list, reminder.id, reminder.at);
  }

  async function ring(due, now) {
    for (const reminder of due) {
      const { title, body } = notice(reminder, S);
      await api.notifyReminder(title, body, { list: reminder.list, id: reminder.id ?? null });
      await ack(reminder);
    }
    remindedUntil = now;
    await api.rememberRemindedUntil(now);
  }

  /// What the summary of `day` says (`null` = today), or null when the day
  /// holds nothing — asked at announcement time on desktop, and at sync time
  /// on Android, for the day the alarm will land on.
  async function currentSummary(day = null) {
    return summaryNotice(await api.dayTasks(day), S);
  }

  async function announce(now) {
    const said = await currentSummary();
    // An empty list is not worth a notification, but the day still counts as
    // announced: it must not fire again the moment a task is added.
    if (said) {
      // No task to open: the empty target only brings the window back.
      await api.notifyReminder(said.title, said.body, { list: "", id: null });
    }
    summarizedOn = toIso(now);
    await api.rememberDaySummarizedOn(summarizedOn);
  }

  async function refresh() {
    const { on: summaryOn, time: summaryTime } = summaryOf();
    if (!open() || (!enabled() && !summaryOn)) {
      reminders = [];
      loop?.stop();
      loop = null;
      summaryLoop?.stop();
      summaryLoop = null;
      if (mobile() && open()) await syncAndroidReminders([], { strings: S }).catch(() => {});
      return;
    }
    reminders = enabled() ? ((await api.reminders()) ?? []) : [];
    if (remindedUntil === undefined) {
      remindedUntil = (await api.remindedUntil()) ?? null;
      if (remindedUntil === null) {
        remindedUntil = toAt(new Date());
        await api.rememberRemindedUntil(remindedUntil);
      }
    }
    if (summarizedOn === undefined) summarizedOn = (await api.daySummarizedOn()) ?? null;

    if (mobile()) {
      if (!androidTapInstalled) {
        androidTapInstalled = true;
        // The tap is the only dismissal Android reports back, and the alarm
        // carries the moment so the ack needs no lookup.
        onAndroidReminderTap(async (target) => {
          await ack(target).catch(fail);
          openTask(target.list, target.id);
        }).catch(() => {});
      }
      // A `pending()` that throws (the store of an older build) is worth a
      // line in the log and not a notice: the sync goes on without it.
      const summaryAt = summaryOn ? nextSummaryAt({ time: summaryTime }) : null;
      await syncAndroidReminders(reminders, {
        strings: S,
        summary: summaryAt ? { at: summaryAt, notice: await currentSummary(toIso(summaryAt)) } : null,
        onError: (error) => console.warn("reminders: pending() failed", error),
      }).catch(fail);
      return;
    }

    if (!enabled()) {
      loop?.stop();
      loop = null;
    } else if (loop) loop.rearm();
    else
      loop = scheduleReminders({
        list: () => reminders,
        until: () => remindedUntil,
        ring,
        onError: fail,
      });

    if (!summaryOn) {
      summaryLoop?.stop();
      summaryLoop = null;
    } else if (summaryLoop) summaryLoop.rearm();
    else
      summaryLoop = scheduleDaySummary({
        time: () => summaryOf().time,
        shownOn: () => summarizedOn,
        announce,
        onError: fail,
      });
  }

  listen("reminder://open", (event) => {
    const target = event.payload ?? {};
    if (target.list) openTask(target.list, target.id || null);
  });

  return { refresh };
}
