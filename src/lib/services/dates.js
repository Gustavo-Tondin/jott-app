// Showing a date.
//
// The file always stores ISO — that is the format decision, and it does not
// change. This is only how the date is *drawn*, following the notebook's
// `dateDisplayFormat`. Kept in one place so every screen shows the same date
// the same way.
//
// Every shape uses `/` (user call, 2026-08-06): a picker mixing `-` and `/`
// read as two unrelated settings rather than one choice of order.

/// Formats an ISO date (`2026-07-25`) in the notebook's chosen shape.
///
/// An unknown pattern falls back to the default rather than showing the date
/// wrong — the core validates the same way, so this is belt and braces. The
/// hyphen spellings an older notebook may carry are still understood.
export function formatDate(iso, pattern = "mm/dd/yyyy") {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;

  switch (pattern) {
    case "yyyy/mm/dd":
    case "yyyy-mm-dd":
      return `${y}/${m}/${d}`;
    case "dd/mm/yyyy":
    case "dd-mm-yyyy":
      return `${d}/${m}/${y}`;
    default:
      return `${m}/${d}/${y}`;
  }
}

/// A `Date` as the ISO day the files speak (`2026-08-19`). Local fields, not
/// `toISOString()` — that one answers in UTC and is a day off every evening
/// west of Greenwich.
export function toIso(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/// Day and month only, in the notebook's order — for a span, where the year is
/// the same on both ends and repeating it says nothing (user call, 2026-08-06).
export function formatDayMonth(iso, pattern = "mm/dd/yyyy") {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  if (!m || !d) return iso;
  // Day-first only when the chosen order puts it first; the other two shapes
  // both lead with the month.
  return pattern === "dd/mm/yyyy" || pattern === "dd-mm-yyyy"
    ? `${d}/${m}`
    : `${m}/${d}`;
}

/// How long ago a stamp was, as PARTS rather than as a sentence: `{ unit,
/// count }`, where unit is `now` / `minute` / `hour` / `day` / `month` /
/// `year`.
///
/// Parts, because every string the user reads lives in `services/strings.js`
/// (spec 4.4) — this decides which unit answers, `S.ago` decides how it is
/// spelled, and i18n later changes only the second half.
///
/// `now` is a parameter so the answer can be tested without waiting for a
/// clock; every caller in the app leaves it out.
///
/// Anything unreadable — an empty stamp, a string that is not a date — answers
/// `null`, and the caller shows nothing. A card that said "just now" about a
/// notebook nobody has opened would be worse than a card that says nothing.
export function timeSince(iso, now = new Date()) {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;

  // A clock that went backwards (a stamp from the future — a synced file, a
  // machine whose time was wrong when it was written) reads as this instant
  // rather than as a negative age.
  const seconds = Math.max(0, (now.getTime() - then.getTime()) / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return { unit: "now", count: 0 };
  if (minutes < 60) return { unit: "minute", count: minutes };

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "hour", count: hours };

  const days = Math.floor(hours / 24);
  if (days < 30) return { unit: "day", count: days };

  // Months and years are approximated from days on purpose. The question the
  // card answers is "recently, or a while back?", and past a month the
  // calendar's own irregularity is below the resolution of that question.
  const months = Math.floor(days / 30);
  if (months < 12) return { unit: "month", count: months };
  return { unit: "year", count: Math.floor(days / 365) };
}
