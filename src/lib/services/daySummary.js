// The day summary: one notification at the start of the day, saying what the
// day holds. It replaces ringing every dated task — a task rings only if it
// asked (`remind:`), the day is announced once. On desktop the process
// announces it (`src-tauri/src/ringer.rs`); this is the phone's half — when its
// alarm lands and what it says. Nothing here reads a clock of its own.

import { toIso } from "./dates.js";

/// How many task titles the notification lists before it stops naming them.
/// A system notification is a few lines tall; past this the count says it.
export const NAMED = 5;

/// `HH:MM` on `day` as a local `Date`.
export function summaryAt(day, time = "08:00") {
  const [y, m, d] = String(day).split("-").map(Number);
  const [hh, mm] = String(time).split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
}

/// The next moment a summary falls on: today's hour while it is still ahead
/// (and, given `shownOn`, not announced yet), else tomorrow's. The DAY of
/// that moment is the day the summary is about — Android reads it at sync
/// time, so an alarm landing tomorrow must carry tomorrow's tasks.
export function nextSummaryAt({ now = new Date(), time = "08:00", shownOn = null } = {}) {
  const today = toIso(now);
  let next = summaryAt(today, time);
  if (next <= now || shownOn === today) {
    next = new Date(next);
    next.setDate(next.getDate() + 1);
  }
  return next;
}

/// The hour of the first reminder on the day of `at` still ahead of it
/// (`HH:MM`), or null. `reminders` is sorted soonest first, as the core
/// hands it.
export function firstReminderOn(reminders, at) {
  const day = toIso(at);
  const from = `${day}T${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  const first = (reminders ?? []).find((r) => r.at.startsWith(day) && r.at.slice(0, 16) >= from);
  return first ? first.at.slice(11, 16) : null;
}

/// What the notification says about `tasks` — the day's open tasks, as
/// `day_tasks` hands them ({task: {text, done}}). `null` when there is
/// nothing to announce: a day with no task is not worth a notification.
/// `planned`: the count was read before the day began (a phone's alarm set
/// the evening before), so it is the plan, not what the day will roll into.
/// `firstReminder` (`HH:MM`) adds the day's first bell as a last line.
export function summaryNotice(tasks, strings, { planned = false, firstReminder = null } = {}) {
  const open = (tasks ?? [])
    .map((row) => row?.task ?? row)
    .filter((task) => task && !task.done);
  if (open.length === 0) return null;
  const named = open.slice(0, NAMED).map((task) => `• ${task.text}`);
  if (open.length > named.length) named.push(strings.dayNoticeMore(open.length - named.length));
  if (firstReminder) named.push(strings.dayNoticeFirstReminder(firstReminder));
  return {
    title: planned ? strings.dayNoticePlanned(open.length) : strings.dayNoticeTitle(open.length),
    body: named.join("\n"),
  };
}
