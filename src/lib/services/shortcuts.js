// What a key press means — a lookup, not a switch. The creation gestures
// answer from ANY screen; the shell asks this service what a press meant.
// It reads an event and answers a command id, nothing else — testable without
// a window. The table of chords is `commands.js` (one list for settings, the
// panel and this file); the rule about WHICH presses the app may claim is here.

import { derived, writable } from "svelte/store";

import { chordOf } from "./keys.js";
import { bindings, keymapFor, SCOPES } from "./commands.js";

/// Keys a bare press of which belongs to the app rather than to whoever is
/// typing. Everything else without a modifier is a character going into a
/// field, and stealing it would break the field.
const BARE = new Set(["F11", "Escape", "F2"]);

/// A keyboard: the chord→command maps of the moment, ready to be asked.
/// Built from `bound` ONCE — a key press is the wrong place to rebuild a
/// table; the shell derives a new keyboard from the bindings on a rebinding.
export function keyboard(bound) {
  const maps = new Map(SCOPES.map((scope) => [scope, keymapFor(scope, bound)]));

  /// The command a key press asks for, or null. `scope` says what has focus:
  /// `global` is the shell, `tasks` a focused task list (the editor answers
  /// inside CodeMirror, from the same registry — a press here was not claimed there).
  return function commandFor(event, scope = "global") {
    // Something nearer the keyboard already answered (the editor, a dialog,
    // the date picker). Acting again would fire the gesture twice.
    if (!event || event.defaultPrevented) return null;
    // Ctrl AND Meta together belongs to the desktop, never to us.
    if (event.ctrlKey && event.metaKey) return null;

    const chord = chordOf(event);
    if (!chord) return null;

    // Which presses the app may claim at all. A modified chord is always
    // fair game; a bare one only where it cannot be someone typing — the
    // named keys below anywhere, and a task list's own keys while no field
    // inside it has the cursor.
    const modified = event.ctrlKey || event.metaKey || event.altKey;
    if (!modified && !BARE.has(chord) && !(scope === "tasks" && !typing(event)))
      return null;

    return maps.get(scope)?.get(chord) ?? null;
  };
}

/// Is this press going into something that accepts text? A task list's own
/// keys (Space, the arrows) must never fire while a field inside it has the
/// cursor — renaming a task inline is typing, not commanding.
export function typing(event) {
  const el = event?.target;
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest(
    "input, textarea, select, [contenteditable=''], [contenteditable='true'], .cm-editor",
  );
}

// ---- the keyboard everything reads ----------------------------------------
// A store rather than a prop (as `dialog.js`): a task list is four levels
// below the shell, and the note editor is not in the same subtree. The shell
// writes `userBindings` from the open notebook's config; everything that
// answers a key reads `ask`.

/// The user's own bindings, as the notebook's config holds them. Written by
/// the shell when a notebook opens or a binding changes; `{}` means "the
/// defaults", which is also what an app with no notebook open uses.
export const userBindings = writable({});

/// Which chord asks for which command, right now.
export const bound = derived(userBindings, (custom) => bindings(custom));

/// Ask what a press means: `$ask(event, "tasks")`. Rebuilt only when a
/// binding changes, never per press.
export const ask = derived(bound, (map) => keyboard(map));
