// The one place the Tauri bridge is faked (2026-08-21).
//
// No test file installs a mock of its own: `vite.config.js` aliases the three
// `@tauri-apps/api/*` modules onto this file whenever VITEST is set, so a test
// gets the bridge already stubbed and cannot invent a fifth shape of it. Four
// incompatible shapes used to live in the tree — a hoisted `vi.fn`, a closure
// one, an inert one, and a partial stub of `services/api.js` one level up —
// and each new test copied whichever one it landed beside.
//
// The stub answers at the level the app really speaks: `invoke(command, args)`.
// Faking `services/api.js` instead hides the mapping from a method to a command
// name and to an argument shape, which is precisely the half of the bridge that
// breaks — and it breaks silently, because a stubbed method cannot disagree
// with a command that was renamed in Rust.

import { vi } from "vitest";

/// Command name → answer, as `bridge()` was last told. A function is called
/// with the command's arguments; anything else IS the answer.
let answers = {};
/// What a command nobody named answers. `null` is the honest default: a screen
/// that asks something the test did not set up should look empty, not crash.
let fallback = null;

export const invoke = vi.fn((command, args) => {
  const answer = command in answers ? answers[command] : fallback;
  if (typeof answer !== "function") return Promise.resolve(answer);
  // The real bridge always answers with a promise, so an answer that throws
  // becomes a REJECTION rather than an exception at the caller's call site —
  // otherwise a test for "the command failed" would exercise a path the app
  // never takes.
  try {
    return Promise.resolve(answer(args, command));
  } catch (error) {
    return Promise.reject(error);
  }
});

/// An answer that makes a command fail: an older build where it was never
/// compiled in, a read-only home, a machine with no network.
export const fails = (message) => () => Promise.reject(new Error(message));

/// Answers each command with whatever `responses` says.
///
/// Call it as many times per test as needed — the last call wins, and a second
/// one replaces the table rather than adding to it, so a test can put the
/// bridge into a new state mid-way without the old answers leaking in.
export function bridge(responses = {}, { fallback: otherwise } = {}) {
  answers = responses;
  if (otherwise !== undefined) fallback = otherwise;
  return invoke;
}

/// Forgets the answers AND the calls, keeping the implementation — which is
/// why this exists instead of `invoke.mockReset()`, that would throw the
/// dispatcher away and leave `invoke` returning undefined.
export function resetBridge() {
  answers = {};
  fallback = null;
  invoke.mockClear();
  listen.mockClear();
  for (const handle of Object.values(currentWindow)) handle.mockClear();
}

/// The commands asked for, in order — the assertion for a RULE about the order
/// of calls (an id fetched only when something needs it, a period joined after
/// the task exists) rather than about one call's arguments.
export function commandsCalled() {
  return invoke.mock.calls.map(([command]) => command);
}

/// The arguments of every call to one command.
export function callsTo(command) {
  return invoke.mock.calls.filter(([name]) => name === command).map(([, args]) => args);
}

// --- @tauri-apps/api/core -------------------------------------------------

/// What an `<img>` loads a notebook file from (services/assets.js). There is no
/// asset protocol in jsdom; the path is what matters here.
export function convertFileSrc(path) {
  return `asset://localhost/${encodeURIComponent(path)}`;
}

// --- @tauri-apps/api/event ------------------------------------------------

/// The file watcher's door into the app. Resolves to an unlisten function,
/// because the shell calls the answer on teardown.
export const listen = vi.fn(() => Promise.resolve(() => {}));

// --- @tauri-apps/api/window -----------------------------------------------

/// The frameless window's handle. jsdom has no window to minimize, maximize or
/// close, and the state getters answer false: screens are tested with the
/// window in its framed (non-flush) state.
export const currentWindow = {
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn(() => Promise.resolve(false)),
  isFullscreen: vi.fn(() => Promise.resolve(false)),
  setFullscreen: vi.fn(() => Promise.resolve()),
  onResized: vi.fn(() => Promise.resolve(() => {})),
};

export function getCurrentWindow() {
  return currentWindow;
}
