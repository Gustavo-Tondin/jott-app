// What a key press means — now a lookup, not a switch.
//
// The app is a capture tool: reaching for the mouse to write down the thing
// you just thought of is the whole cost it exists to remove. So the creation
// gestures answer from ANY screen, and the shell asks this service what a
// press meant instead of growing a chain of ifs.
//
// It reads an event and answers a command id — it decides nothing else. That
// keeps it testable without a window, and keeps the doing in the shell, which
// is the only place that knows what a notebook is.
//
// What changed on 2026-08-18: the table of chords moved to `commands.js`, so
// that the settings screen, the formatting panel and this file all read one
// list. The rule about WHICH presses the app may claim stayed here, because it
// is about events, not about commands.

import { derived, writable } from "svelte/store";

import { chordOf } from "./keys.js";
import { bindings, keymapFor, SCOPES } from "./commands.js";

/// Keys a bare press of which belongs to the app rather than to whoever is
/// typing. Everything else without a modifier is a character going into a
/// field, and stealing it would break the field.
const BARE = new Set(["F11", "Escape", "F2"]);

/// A keyboard: the chord→command maps of the moment, ready to be asked.
///
/// Built from `bound` ONCE, because a key press is the wrong place to rebuild
/// a table — and rebuilding it there was the bug this shape prevents. The
/// shell derives one of these from the bindings, so a rebinding makes a new
/// keyboard and nothing has to be invalidated by hand.
export function keyboard(bound) {
  const maps = new Map(SCOPES.map((scope) => [scope, keymapFor(scope, bound)]));

  /// The command a key press asks for, or null when it asks for nothing.
  ///
  /// `scope` says what has focus: `global` is the shell, `tasks` a focused
  /// task list. (The editor answers inside CodeMirror, whose keymap is built
  /// from the same registry — a press that reaches here was not claimed
  /// there.)
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
//
// A store rather than a prop, following what `dialog.js` already established:
// something every component may need to reach is published once, not threaded
// down through the tree. It matters more here than there — a task list is four
// levels below the shell, and the note editor is not even in the same subtree.
//
// The shell writes `userBindings` from the open notebook's config; everything
// that answers a key reads `ask`.

/// The user's own bindings, as the notebook's config holds them. Written by
/// the shell when a notebook opens or a binding changes; `{}` means "the
/// defaults", which is also what an app with no notebook open uses.
export const userBindings = writable({});

/// Which chord asks for which command, right now.
export const bound = derived(userBindings, (custom) => bindings(custom));

/// Ask what a press means: `$ask(event, "tasks")`. Rebuilt only when a
/// binding changes, never per press.
export const ask = derived(bound, (map) => keyboard(map));
