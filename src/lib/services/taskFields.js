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
export const PRIORITIES = [
  { value: "", label: () => S.priorityNone },
  { value: "3", label: () => S.priorityLow },
  { value: "2", label: () => S.priorityMedium },
  { value: "1", label: () => S.priorityHigh },
];

/// How often a task repeats. The empty unit is "it does not".
export const REPEAT_UNITS = [
  { value: "", label: () => S.noRepeat },
  { value: "day", label: () => S.repeatDays },
  { value: "week", label: () => S.repeatWeeks },
  { value: "month", label: () => S.repeatMonths },
];

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
