// Reminders on the front. The core decides WHAT rings and hands a sorted
// list of `{list, id, position, text, at, auto}`; this module knows the
// shape of `at` (`2026-07-25T09:00`, local, minute precision — sortable as a
// string, so comparisons below are string comparisons), the presets, and
// which are due. Scheduling is `shell/reminders.js`; no timer or bridge here.

import { clamp } from "./num.js";
import { formatDate, toIso } from "./dates.js";

/// The shortest and longest waits the timer accepts — same reasons as the
/// turn scheduler's (shell/turn.js): a moment already past still waits a
/// beat, and a long sleep must not leave a reminder unrung for a day.
export const MIN_WAIT = 1000;
export const MAX_WAIT = 60 * 60 * 1000;

const two = (n) => String(n).padStart(2, "0");

/// A `Date` → `yyyy-mm-ddTHH:MM`, local, seconds dropped.
export function toAt(date) {
  return `${toIso(date)}T${two(date.getHours())}:${two(date.getMinutes())}`;
}

/// `yyyy-mm-ddTHH:MM[:SS]` → a local `Date`. The bridge serialises the task's
/// own field with seconds (`2026-07-25T09:00:00`); both shapes read.
export function parseAt(at) {
  const [day, time = "00:00"] = String(at).split("T");
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

/// The canonical minute form of whatever the bridge sent (`""` stays `""`).
export function normalizeAt(at) {
  return at ? toAt(parseAt(at)) : "";
}

/// `{date: "yyyy-mm-dd", time: "HH:MM"}` — the two controls of the picker.
export function splitAt(at) {
  const [date = "", time = ""] = normalizeAt(at).split("T");
  return { date, time };
}

export function joinAt(date, time) {
  return date && time ? `${date}T${time}` : "";
}

/// How a reminder reads on a card or in the field: the date the way the
/// notebook draws dates, then the time.
export function formatAt(at, dateFormat = "mm/dd/yyyy") {
  const { date, time } = splitAt(at);
  return date ? `${formatDate(date, dateFormat)} ${time}` : "";
}

/// The next Monday strictly after `date`.
function nextMonday(date) {
  const out = new Date(date);
  const ahead = (8 - out.getDay()) % 7 || 7;
  out.setDate(out.getDate() + ahead);
  return out;
}

function atTime(date, time) {
  const [hh, mm] = time.split(":").map(Number);
  const out = new Date(date);
  out.setHours(hh || 0, mm || 0, 0, 0);
  return out;
}

/// The presets the inspector offers, each resolved to a moment: laterToday
/// (three hours from now, on the hour), tomorrow and nextWeek (next Monday)
/// at `time` (the notebook's `HH:MM`), onDue (the due day at `time`, dated
/// tasks only). Only moments still ahead: a preset that rings at once is a trap.
export function presets({ now = new Date(), due = "", time = "09:00" } = {}) {
  const out = [];
  const later = new Date(now);
  later.setHours(later.getHours() + 3, 0, 0, 0);
  if (later.getDate() === now.getDate()) out.push({ id: "laterToday", at: toAt(later) });

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  out.push({ id: "tomorrow", at: toAt(atTime(tomorrow, time)) });
  out.push({ id: "nextWeek", at: toAt(atTime(nextMonday(now), time)) });

  if (due) {
    const at = toAt(atTime(parseAt(due), time));
    if (at > toAt(now)) out.push({ id: "onDue", at });
  }
  return out;
}

/// The reminders that should ring NOW: at or before `now` and after `until`,
/// the moment up to which this machine already rang (null = never, and then
/// nothing from the past rings — a first launch is not an avalanche).
export function dueNow(reminders, { now = new Date(), until = null } = {}) {
  const limit = toAt(now);
  return reminders.filter((r) => r.at <= limit && until !== null && r.at > until);
}

/// The first reminder still ahead of `now`, or null.
export function nextAfter(reminders, now = new Date()) {
  const limit = toAt(now);
  return reminders.find((r) => r.at > limit) ?? null;
}

/// How long until `at`, held within the two bounds.
export function waitUntil(at, now = new Date()) {
  return clamp(parseAt(at).getTime() - now.getTime(), MIN_WAIT, MAX_WAIT);
}

/// What the notification says: the task, and — when the reminder is the
/// automatic one for a dated task — that it is about the date.
export function notice(reminder, strings) {
  return {
    title: reminder.auto ? strings.reminderDueTitle : strings.reminderTitle,
    body: reminder.text,
  };
}
