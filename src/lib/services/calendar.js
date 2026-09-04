// The Home's calendar strip and the day it names (2026-09-04).
//
// The Home became the screen of TIME: a week of days across the top, today
// selected, and the page below reading whichever day is chosen — today's
// tasks and notes, a day ahead's plan, a day gone by's record. What is here
// is the arithmetic the strip needs and nothing the screen draws: which
// seven days a week holds, what a day is against today, what the head says.
//
// Every date is the ISO day the files speak (`2026-09-04`), and every
// answer is derived from a string the caller already has — nothing here
// reads the clock, so "today" is always the notebook's (`clock.today`),
// never the machine's.

import { S } from "./strings.js";
import { toIso } from "./dates.js";

/// `iso` as a local `Date` at noon — noon, so a DST change at midnight
/// cannot slide the day.
function dateOf(iso) {
  const [y, m, d] = (iso ?? "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12);
}

/// `iso` shifted by `days` (negative goes back).
export function addDays(iso, days) {
  const date = dateOf(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + days);
  return toIso(date);
}

/// The seven days of the week `iso` falls in, in order, starting on
/// `startsOn` (`"monday"` or `"sunday"`, the notebook's `weekStartsOn`).
export function weekOf(iso, startsOn = "monday") {
  const date = dateOf(iso);
  if (!date) return [];
  const first = startsOn === "sunday" ? 0 : 1;
  const back = (date.getDay() - first + 7) % 7;
  const start = addDays(iso, -back);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/// The two-letter weekday of an ISO day (`S.weekdaysShort`, Sunday first).
export function weekdayShort(iso) {
  const date = dateOf(iso);
  return date ? S.weekdaysShort[date.getDay()] : "";
}

/// One letter, as the strip writes it over each day (the wireframe's
/// "S M T W T F S").
export function weekdayLetter(iso) {
  return weekdayShort(iso).slice(0, 1);
}

/// The weekday's full name.
export function weekdayName(iso) {
  const date = dateOf(iso);
  return date ? S.weekdays[date.getDay()] : "";
}

/// The month's name, as the head writes it beside the strip: "September".
export function monthOf(iso) {
  const date = dateOf(iso);
  return date ? S.months[date.getMonth()] : "";
}

/// The day of the month, as the strip writes it under the weekday: `3`.
export function dayOfMonth(iso) {
  const date = dateOf(iso);
  return date ? String(date.getDate()) : "";
}

/// What a day is against today: `"past"`, `"today"` or `"ahead"`. The
/// three readings of the Home — and the core's own `Day`, which decides
/// which file (or the log) answers for it.
export function dayKind(iso, today) {
  if (!iso || !today || iso === today) return "today";
  return iso < today ? "past" : "ahead";
}

/// The head's greeting for the hour of the day — morning until noon,
/// afternoon until six, evening after. `hour` is the machine's, since this
/// is about the person reading, not the notebook.
export function greetingFor(hour) {
  if (hour < 12) return S.goodMorning;
  if (hour < 18) return S.goodAfternoon;
  return S.goodEvening;
}

/// The head's one line about a day. `done` and `total` count the day's
/// tasks (open + completed) for today and a day ahead; for a day gone by
/// the caller passes the log's three counts — completed, created, notes —
/// and the line says all three (user call, 2026-09-04).
export function summaryOf({ kind, done = 0, total = 0, created = 0, notes = 0 }) {
  if (kind === "past") return S.daySummary({ done, created, notes });
  if (kind === "ahead") return S.tasksPlanned(total);
  return S.tasksDone(done, total);
}
