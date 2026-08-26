// The vocabulary of a task's fields — what the two places that EDIT a task
// (the composer row and the inspector panel) must agree on.
//
// They did not. Priority was a list of four options in the composer and four
// hand-written `<option>`s in the inspector, with the values typed as strings
// on one side and numbers on the other; the repeat units were the same four
// lines twice; and `repeatText` was implemented twice, with the same comment
// above both copies explaining the same rule. A field offered in two shapes is
// a field that will eventually mean two things.

import { S } from "./strings.js";

/// The four priorities, in the order both controls draw them. `value` is what
/// the FILE stores: 1 is the loudest, and 0 (or "") is none — the core reads
/// `!1`/`!2`/`!3` and writes nothing at all for none.
///
/// Kept as strings so a `<select>` and a menu can both carry them without one
/// of the two having to remember to convert; `composeTask` and the inspector
/// both send `Number(...) || null` on the way to the bridge.
///
/// The number and the glyph run OPPOSITE ways, on purpose: `!1` in the file
/// is the HIGHEST (1 = first), and the card draws it as `!!!` — three marks
/// for the one that matters most (`"!".repeat(4 - n)`, components/TaskRow).
/// The colour goes with the level, not the digit: high is danger, medium is
/// warning, low is success — status colours, fixed, never one of the eight.
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
  p1: "var(--theme-danger)",
  p2: "var(--theme-warning)",
  p3: "var(--theme-success)",
};

/// How often a task repeats. The empty unit is "it does not".
export const REPEAT_UNITS = [
  { value: "", label: () => S.noRepeat },
  { value: "day", label: () => S.repeatDays },
  { value: "week", label: () => S.repeatWeeks },
  { value: "month", label: () => S.repeatMonths },
];

/// How high the "every N" selector counts.
///
/// A COUNT, NOT A TYPED NUMBER (user call, 2026-08-18): the field asks for one
/// of a few small numbers, and a number input answers it with a keyboard on a
/// phone and a pair of spinners nobody can hit on a desktop. Thirty is where
/// the units take over — past "every 30 days" the honest answer is a month.
export const REPEAT_MAX = 30;

/// The counts to offer, with `current` folded in wherever it belongs.
///
/// Folding it in is what keeps the selector from LYING about a task it did not
/// write: a file may carry `repeat:45d`, typed by hand or written by an older
/// build, and a list that cannot say 45 would show the field blank and quietly
/// save a different task the next time it is touched.
export function repeatCounts(current) {
  const counts = Array.from({ length: REPEAT_MAX }, (_, i) => i + 1);
  const n = Number(current);
  if (!Number.isInteger(n) || n < 1 || counts.includes(n)) return counts;
  return [...counts, n].sort((a, b) => a - b);
}

/// The `repeat:` value the core parses, or null when there is no repetition.
///
/// Built rather than typed: the core silently DROPS a `repeat:` it cannot
/// parse, so an invalid one must never be possible to express. Takes anything
/// carrying `repeatEvery` + `repeatUnit` — the composer's intent and the
/// inspector's draft are the same two fields under two names.
export function repeatText(fields) {
  if (!fields?.repeatUnit) return null;
  const every = Math.max(1, Number(fields.repeatEvery) || 1);
  return every === 1
    ? `every-${fields.repeatUnit}`
    : `every-${every}-${fields.repeatUnit}s`;
}

/// A tag name the metadata line can carry.
///
/// A tag with a space in it would break that line on the next read: the loose
/// word stops it from being all-tokens, and the whole thing turns into a
/// description. Cheaper to fix the tag than to lose the fields. The leading
/// `#` goes too — it is how a tag is WRITTEN, not part of its name.
export function cleanTagName(raw) {
  return (raw ?? "").trim().replace(/^#+/, "").replace(/\s+/g, "-");
}
