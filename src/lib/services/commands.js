// Every command the app can be ASKED to run, declared ONCE: its name, where
// it can be asked for, and its default chord. The doing lives elsewhere (the
// shell, the editor, the settings screen, the panel's buttons — which read
// the chord bound RIGHT NOW). This file knows no notebook and no DOM.

import { S } from "./strings.js";
import { isBindable, normalize } from "./keys.js";

/// Where a command can be asked for — `global` anywhere, `tasks` while a
/// task list has focus and no text field does, `editor` while the cursor is
/// in a note. A scope decides which chords may collide: two commands share
/// one only if they can never both answer.
export const SCOPES = ["global", "tasks", "editor"];

/// The commands, in the order the settings screen draws them. `keys` is the
/// DEFAULT chord; a user's binding lives in the notebook's config, and
/// nothing here is read from disk.
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
  // Mod+O is the app's "open": on the desktop it opens a WINDOW of its own.
  // `twin` says the clash of the app's undo with the editor's is the point:
  // the editor claims the press first; what reaches the shell is the same
  // gesture aimed at the app. Inside a field the press is the field's.
  {
    id: "app.undo",
    scope: "global",
    keys: "Mod+Z",
    twin: "edit.undo",
    label: () => S.cmdUndoAction,
  },
  {
    id: "app.redo",
    scope: "global",
    keys: "Mod+Shift+Z",
    twin: "edit.redo",
    label: () => S.cmdRedoAction,
  },
  { id: "app.notebooks", scope: "global", keys: "Mod+O", label: () => S.cmdNotebooks },
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
  // `icon` marks the ones the formatting panel draws, in this order. `group`
  // is what the panel puts a rule between: what a command IS, like `scope`.
  // ---- marking a WORD ----
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
    id: "md.underline",
    scope: "editor",
    group: "mark",
    keys: "Mod+U",
    icon: "underline",
    label: () => S.cmdUnderline,
  },

  // ---- shaping a BLOCK ----
  // Tab and Shift+Tab are declared HERE and nowhere else, so rebinding them
  // in Settings reaches the editor like every other chord.
  {
    id: "md.indent",
    scope: "editor",
    group: "block",
    keys: "Tab",
    icon: "indent",
    label: () => S.cmdIndent,
  },
  {
    id: "md.outdent",
    scope: "editor",
    group: "block",
    keys: "Shift+Tab",
    icon: "outdent",
    label: () => S.cmdOutdent,
  },
  {
    id: "md.code",
    scope: "editor",
    group: "block",
    keys: "Mod+E",
    icon: "code",
    label: () => S.cmdInlineCode,
  },
  {
    id: "md.quote",
    scope: "editor",
    group: "block",
    keys: "Mod+Shift+.",
    icon: "quote",
    label: () => S.cmdQuote,
  },
  { id: "md.rule", scope: "editor", group: "block", keys: null, icon: "rule", label: () => S.cmdRule },

  // ---- naming a LINE ----
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

  // ---- lists ----
  {
    id: "md.bullet",
    scope: "editor",
    group: "list",
    keys: "Mod+Shift+8",
    icon: "bullet",
    label: () => S.cmdBulletList,
  },
  {
    id: "md.ordered",
    scope: "editor",
    group: "list",
    keys: "Mod+Shift+7",
    icon: "ordered",
    label: () => S.cmdOrderedList,
  },
  { id: "md.task", scope: "editor", group: "list", keys: "Mod+L", icon: "task", label: () => S.cmdTaskList },

  // ---- putting something INTO the note ----
  { id: "md.link", scope: "editor", group: "insert", keys: "Mod+K", icon: "link", label: () => S.cmdLink },
  {
    id: "md.reference",
    scope: "editor",
    group: "insert",
    keys: "Mod+Shift+K",
    icon: "reference",
    label: () => S.cmdReference,
  },
  // The one editor command the EDITOR does not run: it asks the shell for a
  // file, and the shell writes the answer at the cursor (App.svelte). It is
  // declared here all the same, because what a person means by the paperclip
  // is one thing whichever half of the app carries it out.
  {
    id: "md.attach",
    scope: "editor",
    group: "insert",
    keys: null,
    icon: "attach",
    label: () => S.cmdAttach,
  },

  // ---- a TABLE ----
  // Five of the six only mean something inside a table, and the panel greys
  // them outside one. No chord by default.
  { id: "table.insert", scope: "editor", group: "table", keys: null, icon: "table", label: () => S.cmdTableInsert },
  {
    id: "table.addColumn",
    scope: "editor",
    group: "table",
    keys: null,
    icon: "table-add-column",
    label: () => S.cmdTableAddColumn,
  },
  {
    id: "table.addRow",
    scope: "editor",
    group: "table",
    keys: null,
    icon: "table-add-row",
    label: () => S.cmdTableAddRow,
  },
  {
    id: "table.deleteColumn",
    scope: "editor",
    group: "table",
    keys: null,
    icon: "table-column",
    label: () => S.cmdTableDeleteColumn,
  },
  {
    id: "table.deleteRow",
    scope: "editor",
    group: "table",
    keys: null,
    icon: "table-row",
    label: () => S.cmdTableDeleteRow,
  },
  { id: "table.delete", scope: "editor", group: "table", keys: null, icon: "trash", label: () => S.cmdTableDelete },

  // ---- undoing ----
  {
    id: "edit.undo",
    scope: "editor",
    group: "history",
    keys: "Mod+Z",
    icon: "undo",
    label: () => S.cmdUndo,
  },
  {
    id: "edit.redo",
    scope: "editor",
    group: "history",
    keys: "Mod+Shift+Z",
    icon: "redo",
    label: () => S.cmdRedo,
  },
  { id: "note.replace", scope: "editor", keys: "Mod+H", label: () => S.cmdReplace },
];

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

export function commandById(id) {
  return BY_ID.get(id) ?? null;
}

export function commandsIn(scope) {
  return COMMANDS.filter((c) => c.scope === scope);
}

/// The chord bound to every command: the defaults with the user's own laid
/// over. `custom` is the notebook's config — untrusted: an unknown command id
/// is ignored (a newer build's binding must not crash an older one), an
/// unbindable chord is ignored, and an explicit `null` UNBINDS.
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
/// it at the same time. `global` is heard everywhere, so it clashes with
/// `editor`; `tasks` and `editor` never both answer. A declared `twin` is
/// exempt: the same gesture in two places, meant to share the chord.
export function conflictOf(id, chord, bound) {
  const chords = normalize(chord);
  if (!chords) return null;
  const mine = BY_ID.get(id);
  if (!mine) return null;
  for (const command of COMMANDS) {
    if (command.id === id) continue;
    if (bound.get(command.id) !== chords) continue;
    if (command.twin === id || mine.twin === command.id) continue;
    if (command.scope === mine.scope) return command;
    if (command.scope === "global" || mine.scope === "global") return command;
  }
  return null;
}
