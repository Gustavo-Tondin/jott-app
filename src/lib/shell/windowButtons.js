// The window buttons the desktop asked for, made drawable.
//
// The bridge answers with a `{left, right}` of button names, but that answer
// travels through `invoke`: in a plain browser, in the tests, or whenever the
// command cannot run, what comes back is not a layout at all. The title bar is
// the ONLY way to move, maximize or close a frameless window, so it never
// renders straight from that answer — anything that is not a layout falls back
// to the standard set instead of taking the whole bar down with it.

/// What the app draws when the desktop has nothing to say.
export const DEFAULT_BUTTONS = Object.freeze({
  left: [],
  right: ["minimize", "maximize", "close"],
});

/// The buttons this build knows how to draw. A name outside it is skipped
/// rather than guessed at — same rule the Rust side applies.
const KNOWN = ["minimize", "maximize", "close"];

const side = (names) =>
  Array.isArray(names) ? names.filter((name) => KNOWN.includes(name)) : [];

/// A drawable `{left, right}` from whatever the bridge answered. A layout that
/// names no button on either side is not a layout — it would leave the user
/// with no way to close the window — so it falls back too.
export function buttonLayout(answer) {
  const left = side(answer?.left);
  const right = side(answer?.right);
  // Copied side by side: spreading the default would hand its own arrays out,
  // and the caller holds this in reactive state.
  if (left.length === 0 && right.length === 0) {
    return { left: [...DEFAULT_BUTTONS.left], right: [...DEFAULT_BUTTONS.right] };
  }
  return { left, right };
}
