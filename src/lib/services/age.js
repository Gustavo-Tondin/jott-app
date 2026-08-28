// How old something is, as a card draws it (spec 3.6, M7 + M8).
//
// The AGE ITSELF is never worked out here — it comes stamped from the core
// (`core/age.rs`, by way of `notebook::age`), because the rule behind it
// reads a "seen" index this side of the app has never held and thresholds
// that belong to the notebook. What is decided here is the *drawing*: how
// many days is still a number, when it becomes a date, and which of the
// three bands is loud enough to take a colour.
//
// Two shapes, one function: a task ages from `created` and a note from the
// last time it was opened, and the only difference on screen is which date
// the stamp falls back to once the number stops being useful.

import { formatDate } from "./dates.js";
import { S } from "./strings.js";

/// Past this many days the number stops meaning anything — "97d" is arithmetic
/// the reader has to do — and the stamp becomes the date itself (spec 3.6b).
export const ABSOLUTE_AFTER = 60;

/// The stamp for one card: `{ text, band, title }`, or `null` when there is
/// nothing to say.
///
/// `since` is the ISO day the number counts from — a task's `created`, a
/// note's last "seen" — and is what the stamp shows once it goes absolute.
/// A card whose age the core could not work out (a file written by hand,
/// with no date in it) draws nothing at all: an invented age is worse than
/// no age.
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
