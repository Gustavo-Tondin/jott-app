// The vocabulary of a task's fields — what the two places that EDIT a task
// (the composer row and the inspector panel) must agree on. A field offered
// in two shapes is a field that will eventually mean two things.

import { S } from "./strings.js";

/// The four priorities, in the order both controls draw them. `value` is what
/// the FILE stores, as strings so a `<select>` and a menu both carry them
/// (`Number(...) || null` on the way to the bridge): `!1` is the HIGHEST and
/// the card draws it as `!!!` (`"!".repeat(4 - n)`); "" is none, written as
/// nothing. Colour goes with the level: high danger, medium warning, low success.
export const PRIORITIES = [
  { value: "", label: () => S.priorityNone },
  { value: "3", label: () => S.priorityLow },
  { value: "2", label: () => S.priorityMedium },
  { value: "1", label: () => S.priorityHigh },
];

/// The class suffix a priority paints with — `"p1"` (high, danger) …
/// `"p3"` (low, success), `""` for none — the same on the card, in the
/// composer and in the inspector, so the colour of a level is decided once.
export function priorityClass(value) {
  const n = Number(value);
  return n >= 1 && n <= 3 ? `p${n}` : "";
}

/// The CSS value each level's swatch is painted with in a menu — the same
/// three status roles the card reads. Keyed by `priorityClass`.
export const PRIORITY_SWATCH = {
  p1: "var(--app-danger)",
  p2: "var(--app-warning)",
  p3: "var(--app-success)",
};

/// How often a task repeats. The empty unit is "it does not"; `free` is the
/// one with no period — it comes back the moment it is ticked, undated, and
/// only one of it is ever open (`core/src/recurrence.rs`).
export const REPEAT_UNITS = [
  { value: "", label: () => S.noRepeat },
  { value: "free", label: () => S.repeatFreely },
  { value: "day", label: () => S.repeatDays },
  { value: "week", label: () => S.repeatWeeks },
  { value: "month", label: () => S.repeatMonths },
];

/// Whether a unit is counted ("every 3 weeks"). `free` is not: there is no
/// period to multiply, so both pickers drop the counter and the word "every".
export function repeatCounted(unit) {
  return !!unit && unit !== "free";
}

/// How high the "every N" selector counts. A COUNT, NOT A TYPED NUMBER (a
/// number input is a keyboard on a phone and spinners on a desktop); past
/// "every 30 days" the honest answer is a month.
export const REPEAT_MAX = 30;

/// The counts to offer, with `current` folded in wherever it belongs, so the
/// selector never LIES about a task it did not write: a file may carry
/// `repeat:45d`, and a list that cannot say 45 would save a different task.
export function repeatCounts(current) {
  const counts = Array.from({ length: REPEAT_MAX }, (_, i) => i + 1);
  const n = Number(current);
  if (!Number.isInteger(n) || n < 1 || counts.includes(n)) return counts;
  return [...counts, n].sort((a, b) => a - b);
}

/// The `repeat:` value the core parses, or null when there is no repetition.
/// Built rather than typed: the core silently DROPS a `repeat:` it cannot
/// parse. Takes anything carrying `repeatEvery` + `repeatUnit`.
export function repeatText(fields) {
  if (!fields?.repeatUnit) return null;
  if (!repeatCounted(fields.repeatUnit)) return "freely";
  const every = Math.max(1, Number(fields.repeatEvery) || 1);
  return every === 1
    ? `every-${fields.repeatUnit}`
    : `every-${every}-${fields.repeatUnit}s`;
}

/// A tag name the metadata line can carry. A tag with a space would break
/// that line on the next read (no longer all-tokens, it turns into a
/// description). The leading `#` goes too — how a tag is WRITTEN, not its name.
export function cleanTagName(raw) {
  return (raw ?? "").trim().replace(/^#+/, "").replace(/\s+/g, "-");
}
