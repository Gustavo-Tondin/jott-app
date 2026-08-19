// Every command the app can be ASKED to run, in one list.
//
// Before this file the same knowledge was written three times and agreed by
// luck: `shortcuts.js` held a switch of key→meaning, the menus held their own
// arrays of label→function, and nothing held the pair. Adding the settings
// screen would have made a fourth copy — and an editable table (the point of
// that screen) cannot be built on a switch statement at all, because a chord
// only becomes known at runtime.
//
// So a command is declared here ONCE — what it is called, where it can be
// asked for, and which chord asks for it by default — and the doing lives
// where the doing belongs:
//
//   * the shell (App.svelte) maps ids to what a notebook can do,
//   * the editor (Editor.svelte) maps ids to CodeMirror commands,
//   * the settings screen draws this list,
//   * a button in the formatting panel names an id, so hovering it can show
//     the chord that is bound to it RIGHT NOW rather than one written into
//     the button and left to rot.
//
// This file knows no notebook and no DOM. That is what keeps it testable and
// what stops it from becoming a second shell.

import { S } from "./strings.js";
import { isBindable, normalize } from "./keys.js";

/// Where a command can be asked for. A scope is not a category — it decides
/// which chords may collide: two commands may share a chord only if they can
/// never both answer.
///
///   `global`  anywhere in the app
///   `tasks`   while a task list has focus and no text field does
///   `editor`  while the cursor is in a note
export const SCOPES = ["global", "tasks", "editor"];

/// The commands, in the order the settings screen draws them.
///
/// `keys` is the DEFAULT chord — what the app ships as. A user's own binding
/// overrides it and lives in the notebook's config; nothing here is read from
/// disk, so this list is the same on every machine.
export const COMMANDS = [
  // ---- global ----------------------------------------------------------
  { id: "task.new", scope: "global", keys: "Mod+T", label: () => S.cmdNewTask },
  { id: "note.new", scope: "global", keys: "Mod+N", label: () => S.cmdNewNote },
  { id: "search.notebook", scope: "global", keys: "Mod+F", label: () => S.cmdSearch },
  // The second door to search, and the reason it exists: Mod+F belongs to the
  // note while the cursor is in one, so without this there is no chord that
  // reaches the whole notebook from inside a document (§7.2 of the proposal).
  {
    id: "search.notebook.global",
    scope: "global",
    keys: "Mod+Shift+F",
    label: () => S.cmdSearchEverywhere,
  },
  { id: "app.settings", scope: "global", keys: "Mod+,", label: () => S.cmdSettings },
  { id: "app.fullscreen", scope: "global", keys: "F11", label: () => S.cmdFullscreen },
  { id: "app.sidebar", scope: "global", keys: "Mod+\\", label: () => S.cmdToggleSidebar },
  { id: "page.rename", scope: "global", keys: "F2", label: () => S.cmdRename },
  { id: "app.zoomIn", scope: "global", keys: "Mod+=", label: () => S.cmdZoomIn },
  { id: "app.zoomOut", scope: "global", keys: "Mod+-", label: () => S.cmdZoomOut },
  { id: "app.zoomReset", scope: "global", keys: "Mod+0", label: () => S.cmdZoomReset },

  // ---- tabs ------------------------------------------------------------
  { id: "tab.new", scope: "global", keys: "Mod+Shift+T", label: () => S.cmdNewTab },
  { id: "tab.close", scope: "global", keys: "Mod+W", label: () => S.cmdCloseTab },
  { id: "tab.next", scope: "global", keys: "Mod+Tab", label: () => S.cmdNextTab },
  {
    id: "tab.previous",
    scope: "global",
    keys: "Mod+Shift+Tab",
    label: () => S.cmdPreviousTab,
  },
  { id: "tab.last", scope: "global", keys: "Mod+9", label: () => S.cmdLastTab },
  { id: "nav.back", scope: "global", keys: "Mod+Alt+ArrowLeft", label: () => S.cmdBack },
  {
    id: "nav.forward",
    scope: "global",
    keys: "Mod+Alt+ArrowRight",
    label: () => S.cmdForward,
  },
  // Mod+1…Mod+8. Declared one by one rather than as a range: the settings
  // screen draws a row per command, and a row that stands for eight chords
  // could not be rebound.
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `tab.go${i + 1}`,
    scope: "global",
    keys: `Mod+${i + 1}`,
    label: () => S.cmdGoToTab(i + 1),
  })),

  // ---- tasks -----------------------------------------------------------
  // These answer only while a task list has focus, which is why Space and the
  // arrows can be theirs: in a text field the same keys are someone typing,
  // and the shell never asks this scope there.
  { id: "task.up", scope: "tasks", keys: "ArrowUp", label: () => S.cmdTaskUp },
  { id: "task.down", scope: "tasks", keys: "ArrowDown", label: () => S.cmdTaskDown },
  { id: "task.open", scope: "tasks", keys: "Enter", label: () => S.cmdTaskOpen },
  { id: "task.complete", scope: "tasks", keys: "Space", label: () => S.cmdTaskComplete },
  { id: "task.moveUp", scope: "tasks", keys: "Alt+ArrowUp", label: () => S.cmdTaskMoveUp },
  {
    id: "task.moveDown",
    scope: "tasks",
    keys: "Alt+ArrowDown",
    label: () => S.cmdTaskMoveDown,
  },
  { id: "task.delete", scope: "tasks", keys: "Delete", label: () => S.cmdTaskDelete },
  { id: "task.duplicate", scope: "tasks", keys: "Mod+D", label: () => S.cmdTaskDuplicate },

  // ---- the note editor -------------------------------------------------
  // `icon` marks the ones the formatting panel draws, in this order. A command
  // without an icon is reachable by key and by the settings screen only —
  // the panel is a shortlist of what one reaches for while writing, not a
  // mirror of the list.
  //
  // `group` is what that panel puts a rule between (user call, 2026-08-18):
  // marking a WORD, naming a LINE, and shaping a BLOCK are three different
  // gestures, and eighteen glyphs in a row read as one undifferentiated wall.
  // It lives here rather than in the panel because it says what a command IS,
  // not how it is drawn — the same reason `scope` is here.
  { id: "md.bold", scope: "editor", group: "mark", keys: "Mod+B", icon: "bold", label: () => S.cmdBold },
  {
    id: "md.italic",
    scope: "editor",
    group: "mark",
    keys: "Mod+I",
    icon: "italic",
    label: () => S.cmdItalic,
  },
  {
    id: "md.strike",
    scope: "editor",
    group: "mark",
    keys: "Mod+Shift+X",
    icon: "strike",
    label: () => S.cmdStrike,
  },
  {
    id: "md.code",
    scope: "editor",
    group: "mark",
    keys: "Mod+E",
    icon: "code",
    label: () => S.cmdInlineCode,
  },
  { id: "md.link", scope: "editor", group: "mark", keys: "Mod+K", icon: "link", label: () => S.cmdLink },
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `md.h${i + 1}`,
    scope: "editor",
    group: "heading",
    keys: `Mod+Alt+${i + 1}`,
    icon: `h${i + 1}`,
    label: () => S.cmdHeading(i + 1),
  })),
  {
    id: "md.paragraph",
    scope: "editor",
    keys: "Mod+Alt+0",
    label: () => S.cmdParagraph,
  },
  {
    id: "md.bullet",
    scope: "editor",
    group: "block",
    keys: "Mod+Shift+8",
    icon: "bullet",
    label: () => S.cmdBulletList,
  },
  {
    id: "md.ordered",
    scope: "editor",
    group: "block",
    keys: "Mod+Shift+7",
    icon: "ordered",
    label: () => S.cmdOrderedList,
  },
  { id: "md.task", scope: "editor", group: "block", keys: "Mod+L", icon: "task", label: () => S.cmdTaskList },
  {
    id: "md.quote",
    scope: "editor",
    group: "block",
    keys: "Mod+Shift+.",
    icon: "quote",
    label: () => S.cmdQuote,
  },
  { id: "md.rule", scope: "editor", group: "block", keys: null, icon: "rule", label: () => S.cmdRule },
  { id: "note.replace", scope: "editor", keys: "Mod+H", label: () => S.cmdReplace },
];

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

export function commandById(id) {
  return BY_ID.get(id) ?? null;
}

export function commandsIn(scope) {
  return COMMANDS.filter((c) => c.scope === scope);
}

/// The chord bound to every command: the defaults, with the user's own
/// bindings laid over them.
///
/// `custom` is whatever the notebook's config holds — untrusted by
/// construction, since a file can be hand-edited. An entry naming a command
/// this build does not have is ignored (a newer build's binding must not
/// crash an older one); an unbindable chord is ignored (it would swallow
/// typing); and an explicit `null` UNBINDS, which is the only way to say "I
/// want this command to have no key".
export function bindings(custom = {}) {
  const out = new Map();
  for (const command of COMMANDS) {
    if (command.keys) out.set(command.id, normalize(command.keys));
  }
  for (const [id, chord] of Object.entries(custom ?? {})) {
    if (!BY_ID.has(id)) continue;
    if (chord === null || chord === "") {
      out.delete(id);
      continue;
    }
    const chords = normalize(chord);
    if (!chords || !isBindable(chords)) continue;
    out.set(id, chords);
  }
  return out;
}

/// The reverse lookup the shell needs: which command a chord asks for, in a
/// given scope. Built once per binding change, not per key press.
export function keymapFor(scope, bound) {
  const map = new Map();
  for (const command of COMMANDS) {
    if (command.scope !== scope) continue;
    const chord = bound.get(command.id);
    if (chord) map.set(chord, command.id);
  }
  return map;
}

/// Which OTHER command already answers to `chord` in a scope that could hear
/// it at the same time — what the settings screen shows before letting a
/// binding be saved.
///
/// Scopes are not independent: `global` is heard everywhere, so a global
/// command clashes with an editor one, while two commands in `tasks` and
/// `editor` never both answer (a task list and a text cursor are not focused
/// at once).
export function conflictOf(id, chord, bound) {
  const chords = normalize(chord);
  if (!chords) return null;
  const mine = BY_ID.get(id);
  if (!mine) return null;
  for (const command of COMMANDS) {
    if (command.id === id) continue;
    if (bound.get(command.id) !== chords) continue;
    if (command.scope === mine.scope) return command;
    if (command.scope === "global" || mine.scope === "global") return command;
  }
  return null;
}
