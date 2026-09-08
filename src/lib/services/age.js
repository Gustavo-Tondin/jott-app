// How old something is, as a card draws it. The AGE ITSELF comes stamped
// from the core (`core/age.rs`), which holds the "seen" index and the
// thresholds; decided here is the drawing: how many days is still a number,
// when it becomes a date, and which band takes a colour. A task ages from
// `created`, a note from the last time it was opened.

import { formatDate } from "./dates.js";
import { S } from "./strings.js";

/// Past this many days the number stops meaning anything — "97d" is arithmetic
/// the reader has to do — and the stamp becomes the date itself (spec 3.6b).
export const ABSOLUTE_AFTER = 60;

/// The stamp for one card: `{ text, band, title }`, or `null`. `since` is
/// the ISO day the number counts from (a task's `created`, a note's last
/// "seen") and what shows once it goes absolute. No age from the core (a
/// hand-written file): nothing at all — an invented age is worse than none.
export function ageStamp(age, { since, dateFormat = "mm/dd/yyyy", title = null } = {}) {
  if (!age || typeof age.days !== "number") return null;
  const absolute = age.days > ABSOLUTE_AFTER && !!since;
  return {
    text: absolute ? formatDate(since, dateFormat) : S.ageDays(age.days),
    band: age.band ?? null,
    // The other half of the stamp, always spelled out: the number is short
    // because the card is, and the date behind it is one hover away.
    title: title ? title(formatDate(since, dateFormat)) : null,
  };
}

/// The day a note's age counts from: when it was last opened, or the day it
/// was written when nobody ever has. The bridge sends the stamp as a local
/// date and time (`2026-08-25T18:40:00`); only the day is drawn.
export function noteSince(entry) {
  return entry?.seen ? entry.seen.slice(0, 10) : (entry?.created ?? null);
}
