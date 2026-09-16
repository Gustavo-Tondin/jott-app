// The day summary: one notification at the start of the day, saying what the
// day holds. It replaces ringing every dated task — a task rings only if it
// asked (`remind:`), the day is announced once. This module is the pure half:
// when it is due, what it says, and when the next one is. Scheduling is
// `shell/daySummary.js`; nothing here reads a clock of its own.

import { toIso } from "./dates.js";
import { boundedWait } from "./wait.js";

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

/// How long until the next summary, held within the two bounds.
export function waitUntilSummary(opts = {}) {
  const now = opts.now ?? new Date();
  return boundedWait(nextSummaryAt({ ...opts, now }).getTime() - now.getTime());
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
