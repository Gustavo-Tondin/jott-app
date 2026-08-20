// What kind of machine the app is running on, normalised.
//
// The bridge answers `"android"`, `"windows"`, `"macos"` or `"linux"`
// (commands::platform), and it is read TWICE, for two different questions:
//
//   data-platform  the affordance question — android, or desktop. Every
//                  desktop answer folds into one, because a window button is a
//                  window button on all three.
//   data-os        the one thing that differs BETWEEN desktops: the corner the
//                  system draws on its windows, which an undecorated window
//                  has to draw for itself (styles/tokens.css).
//
// THIS IS NOT THE SAME QUESTION AS WIDTH, and keeping the two apart is the
// whole point of the file:
//
//   width     decides the LAYOUT      — a drawer instead of a column, a bottom
//                                       sheet instead of a side panel. A narrow
//                                       desktop window has the same problem a
//                                       phone has, and gets the same answer.
//                                       Pure CSS; nothing here is involved.
//   platform  decides the AFFORDANCES — window buttons, draggable edges, the
//                                       strips the system bars own, whether a
//                                       pointer can hover. A desktop window
//                                       dragged narrow keeps every one of
//                                       these; a phone never has them.
//
// It normalises for the same reason windowButtons.js does: this value gates
// the only buttons that close an undecorated window, so an empty or failed
// response must land on the answer that keeps them — never on the one that
// takes them away.

/// The app ships as a desktop app; Android is the exception a build declares.
export const DEFAULT_PLATFORM = "desktop";

/// The ones this build can actually dress.
const KNOWN = ["desktop", "android"];

/// The systems whose window corner the app knows how to copy. Anything else —
/// a BSD, a build older than this vocabulary answering `"desktop"`, a command
/// that failed — gets NO attribute, and the CSS default stands. That default
/// is the corner this app is developed and clicked on, so the unknown case
/// lands on the answer that has been looked at rather than on a guess.
const KNOWN_OSES = ["linux", "windows", "macos", "android"];

/// The value for `data-platform`. Anything unrecognised — a newer build's name,
/// an empty string, a command that failed — is desktop, because that is the
/// answer that leaves the window's own controls on screen.
export function platformAttribute(answer) {
  return KNOWN.includes(answer) ? answer : DEFAULT_PLATFORM;
}

/// The value for `data-os`, or an empty string when the answer is not one this
/// build has a corner for — the caller removes the attribute then.
export function osAttribute(answer) {
  return KNOWN_OSES.includes(answer) ? answer : "";
}

/// True where the OS draws the system bars and owns the window's frame, so the
/// app must not draw its own. The one question components ask.
export function isMobile(answer) {
  return platformAttribute(answer) === "android";
}
