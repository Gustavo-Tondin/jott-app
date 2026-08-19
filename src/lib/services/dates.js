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
