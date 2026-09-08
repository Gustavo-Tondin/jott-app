// What kind of machine the app runs on, from the bridge (`commands::platform`).
// `data-platform` is the AFFORDANCE question (android or desktop: window
// buttons, drag edges, hover); `data-os` the one thing that differs between
// desktops (the window corner, styles/tokens.css). Width decides the LAYOUT,
// not this. An empty or failed answer must keep the window buttons on screen.

/// The app ships as a desktop app; Android is the exception a build declares.
export const DEFAULT_PLATFORM = "desktop";

/// The ones this build can actually dress.
const KNOWN = ["desktop", "android"];

/// The systems whose window corner the app copies. Anything else gets NO
/// attribute, and the CSS default (the corner this app is developed on) stands.
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
