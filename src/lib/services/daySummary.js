// The day summary: one notification at the start of the day, saying what the
// day holds. It replaces ringing every dated task — a task rings only if it
// asked (`remind:`), the day is announced once. This module is the pure half:
// when it is due, what it says, and when the next one is. Scheduling is
// `shell/daySummary.js`; nothing here reads a clock of its own.

import { clamp } from "./num.js";
import { toIso } from "./dates.js";

/// The same two bounds as the reminder timer's (services/reminders.js): a
/// moment already past still waits a beat, and a long sleep must not leave
/// the summary unannounced for a day.
export const MIN_WAIT = 1000;
export const MAX_WAIT = 60 * 60 * 1000;

/// How many task titles the notification lists before it stops naming them.
/// A system notification is a few lines tall; past this the count says it.
export const NAMED = 5;

/// `HH:MM` on `day` as a local `Date`.
export function summaryAt(day, time = "08:00") {
  const [y, m, d] = String(day).split("-").map(Number);
  const [hh, mm] = String(time).split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
}

/// Whether today's summary should be announced NOW: the hour has come and
/// this machine has not announced today yet (`shownOn`, an ISO day, or null
/// for never). A launch after the hour still gets today's — the summary is
/// about a day, not about a moment that can be missed.
export function summaryDue({ now = new Date(), time = "08:00", shownOn = null } = {}) {
  const today = toIso(now);
  if (shownOn === today) return false;
  return now >= summaryAt(today, time);
}

/// How long until the next summary — today's if its hour is still ahead and
/// it has not been shown, else tomorrow's — held within the two bounds.
export function waitUntilSummary({ now = new Date(), time = "08:00", shownOn = null } = {}) {
  const today = toIso(now);
  let next = summaryAt(today, time);
  if (next <= now || shownOn === today) {
    next = new Date(next);
    next.setDate(next.getDate() + 1);
  }
  return clamp(next.getTime() - now.getTime(), MIN_WAIT, MAX_WAIT);
}

/// What the notification says about `tasks` — the day's open tasks, as
/// `day_tasks` hands them ({task: {text, done}}). `null` when there is
/// nothing to announce: a day with no task is not worth a notification.
export function summaryNotice(tasks, strings) {
  const open = (tasks ?? [])
    .map((row) => row?.task ?? row)
    .filter((task) => task && !task.done);
  if (open.length === 0) return null;
  const named = open.slice(0, NAMED).map((task) => `• ${task.text}`);
  if (open.length > named.length) named.push(strings.dayNoticeMore(open.length - named.length));
  return {
    title: strings.dayNoticeTitle(open.length),
    body: named.join("\n"),
  };
}
