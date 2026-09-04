// When a new day starts — the hour a person means, and the offset the file
// keeps.
//
// The notebook stores the turn of the day as an OFFSET from midnight
// (`rollover.daily.at`, `-02:00` … `+23:59`; core `clock::TurnOffset`). It is
// the right thing to store — one number, no ambiguity — and the wrong thing
// to ask: Gustavo himself typed `21:00` meaning "the day turns at nine in
// the evening" and got a day that began at nine the NEXT evening
// (2026-09-04). Nobody thinks in signed offsets.
//
// What people think is a clock time, and it reads one of two ways with no
// third: an EVENING hour means "tomorrow starts tonight" (the planner who
// sets up the next day before bed), a SMALL hour means "today runs past
// midnight" (the night owl). So the screen asks for a time, and these two
// functions translate: from noon on, the time is the evening before
// (negative offset); before noon, it is after midnight (positive).

/// `-02:00` → `22:00`, `+02:00` → `02:00`, `00:00` → `00:00`. An offset past
/// noon — only reachable by hand, and never what anyone meant — is shown as
/// the time it names, and `turnHint` says what it does.
export function turnTimeOf(offset) {
  const parsed = parseOffset(offset);
  if (parsed === null) return "00:00";
  const minutes = ((parsed % 1440) + 1440) % 1440;
  return clock(minutes);
}

/// `22:00` → `-02:00`, `02:00` → `+02:00`, `00:00` → `00:00`. What the file
/// gets when the time is chosen.
export function offsetOf(time) {
  const minutes = parseClock(time);
  if (minutes === null) return "00:00";
  if (minutes === 0) return "00:00";
  if (minutes >= 720) return `-${clock(1440 - minutes)}`;
  return `+${clock(minutes)}`;
}

/// What the stored offset DOES, in a sentence: `"evening"` (tomorrow starts
/// tonight at T), `"night"` (today runs until T, after midnight),
/// `"midnight"`, or `"late"` for an offset past noon set by hand — the one
/// that made the app say yesterday until the evening.
export function turnMeaning(offset) {
  const parsed = parseOffset(offset);
  if (!parsed) return "midnight";
  if (parsed < 0) return "evening";
  return parsed >= 720 ? "late" : "night";
}

function parseOffset(text) {
  const m = /^([+-]?)(\d{1,2}):(\d{2})$/.exec((text ?? "").trim());
  if (!m) return null;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -minutes : minutes;
}

function parseClock(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((text ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const clock = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
