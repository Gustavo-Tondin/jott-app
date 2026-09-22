// Reminders on the front. The core decides WHAT rings and hands a sorted
// list of `{list, id, position, place, text, due, at}`; this module knows the
// shape of `at` (`2026-07-25T09:00`, local, minute precision — sortable as a
// string, so comparisons below are string comparisons) and the presets. What
// is due and when is the process's on desktop (`src-tauri/src/ringer.rs`).

import { formatDate, toIso } from "./dates.js";
import { spaceLabel } from "./paths.js";

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

/// Tomorrow at `time` — where a reminder with nothing chosen yet starts.
export function tomorrowAt(time = "09:00", now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toAt(atTime(tomorrow, time));
}

/// The presets the inspector offers, each resolved to a moment and in a
/// `group`: from NOW — laterToday (three hours on, on the hour), tomorrow and
/// nextWeek (next Monday) at `time` (the notebook's `HH:MM`) — and from the
/// DUE date, dated tasks only — dayBefore and onDue, at `time`. Only moments
/// still ahead: a preset that rings at once is a trap.
export function presets({ now = new Date(), due = "", time = "09:00" } = {}) {
  const out = [];
  const later = new Date(now);
  later.setHours(later.getHours() + 3, 0, 0, 0);
  if (later.getDate() === now.getDate()) out.push({ id: "laterToday", at: toAt(later), group: "now" });

  out.push({ id: "tomorrow", at: tomorrowAt(time, now), group: "now" });
  out.push({ id: "nextWeek", at: toAt(atTime(nextMonday(now), time)), group: "now" });

  if (due) {
    const dueAt = atTime(parseAt(due), time);
    const eve = new Date(dueAt);
    eve.setDate(eve.getDate() - 1);
    const ahead = toAt(now);
    if (toAt(eve) > ahead) out.push({ id: "dayBefore", at: toAt(eve), group: "due" });
    if (toAt(dueAt) > ahead) out.push({ id: "onDue", at: toAt(dueAt), group: "due" });
  }
  return out;
}

/// What the notification says: the task leads, and the body says where it
/// lives and, when it has one, its date. The desktop's twin is in
/// `src-tauri/src/ringer.rs`.
export function notice(reminder, strings, dateFormat = "mm/dd/yyyy") {
  const place = spaceLabel(reminder.place ?? "", reminder.list);
  const due = reminder.due ? strings.reminderDue(formatDate(reminder.due, dateFormat)) : "";
  return { title: reminder.text, body: [place, due].filter(Boolean).join(" · ") };
}
