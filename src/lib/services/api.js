// Every call into Rust goes through here.
//
// One place to see the whole surface, and one place to fix when a command
// changes. Nothing in this file decides anything — it just names the bridge.

import { invoke } from "@tauri-apps/api/core";

export const api = {
  // notebook
  // Everything the shell needs after any change, in one round trip —
  // info (with the layout names), clock, counts and conflicts.
  notebookSnapshot: () => invoke("notebook_snapshot"),
  lastNotebook: () => invoke("last_notebook"),
  pickFolder: () => invoke("pick_notebook_folder"),
  // Non-null only where the user cannot pick a folder (Android): the app's own
  // container, which is the notebook there. Desktop answers null and asks.
  defaultFolder: () => invoke("default_notebook_folder"),
  openNotebook: (path) => invoke("open_notebook", { path }),
  currentNotebook: () => invoke("current_notebook"),
  // Every field is optional: the core keeps what it is not told about, so a
  // screen can send one key without holding the rest.
  notebookSettings: () => invoke("notebook_settings"),
  setNotebookSettings: (settings) => invoke("set_notebook_settings", { settings }),
  screenToRestore: () => invoke("screen_to_restore"),
  // Which window buttons the desktop wants, and on which side. The window is
  // frameless, so the app draws them and has to follow the system's layout.
  windowButtonLayout: () => invoke("window_button_layout"),
  // `"android"` or `"desktop"` — what the DEVICE is, which is not the same
  // question as how wide the window is. Width decides the layout (the CSS
  // answers that alone); this decides the affordances: window buttons, resize
  // edges, safe areas, hover.
  platform: () => invoke("platform"),
  rememberScreen: (screen) => invoke("remember_screen", { screen }),

  // search
  // Two answers (tasks, notes) plus whether anything was left out. `limit` is
  // the core's own when the caller has no opinion. `scope` is a space's path
  // — the whole notebook when it is null (2026-08-17).
  search: (query, limit = null, scope = null) =>
    invoke("search", { query, limit, scope }),

  // The notebook is plain folders, and this is the door to them: `path` is a
  // root-relative address (a space, a list, a note), empty for the root. What
  // opens is always the FOLDER around it, never the document.
  openInFileManager: (path = null) => invoke("open_in_file_manager", { path }),

  // How wide the sidebar was dragged. A machine preference (the monitor
  // decides, not the notebook), so it lives beside the last notebook.
  sidebarWidth: () => invoke("sidebar_width"),
  rememberSidebarWidth: (width) => invoke("remember_sidebar_width", { width }),
  // The right panel keeps its own; the inspector and the suggestions share it,
  // because they share the panel.
  panelWidth: () => invoke("panel_width"),
  rememberPanelWidth: (width) => invoke("remember_panel_width", { width }),
  // How far the interface is zoomed, as a multiplier of the base 16px. Also a
  // machine preference: it answers to a monitor and a pair of eyes. The NOTE's
  // own font size is the opposite case and lives in the notebook.
  zoom: () => invoke("zoom"),
  rememberZoom: (zoom) => invoke("remember_zoom", { zoom }),

  // lists
  listNames: () => invoke("list_names"),
  listCounts: () => invoke("list_counts"),
  listConflicts: () => invoke("list_conflicts"),
  listTasks: (list) => invoke("list_tasks", { list }),
  // `folder` is a space folder ("Tasks"); the UI takes it from
  // layout.tasksFolder until it is space-aware.
  createList: (folder, name) => invoke("create_list", { folder, name }),
  renameList: (from, to) => invoke("rename_list", { from, to }),
  deleteList: (name) => invoke("delete_list", { name }),

  // tasks
  createTask: (list, text) => invoke("create_task", { list, text }),
  editTaskText: (list, id, text) => invoke("edit_task_text", { list, id, text }),
  // Every field at once. Absent means "leave alone", null means "clear" —
  // see `TaskFields` in commands.rs.
  setTaskFields: (list, id, fields) =>
    invoke("set_task_fields", { list, id, fields }),
  // Pinned tasks sit at the top of their list (the card's bookmark).
  setTaskPinned: (list, id, pinned) =>
    invoke("set_task_pinned", { list, id, pinned }),
  moveTaskTo: (list, from, to) => invoke("move_task_to", { list, from, to }),
  // Move a task to another list (keeps its id). `from`/`to` are list paths.
  moveTask: (from, id, to) => invoke("move_task", { from, id, to }),
  duplicateTask: (list, id) => invoke("duplicate_task", { list, id }),
  // Manual order (dragging in the sidebar). Namespace: "spaces" or
  // "lists:<folder>". Names is the ordered list of item names.
  setOrder: (namespace, names) => invoke("set_order", { namespace, names }),

  // Space management.
  // A space has a single function, chosen at creation: `tasks` / `notes`.
  createSpace: (name, kind) => invoke("create_space", { name, kind }),
  renameSpace: (folder, name) => invoke("rename_space", { folder, name }),
  setSpaceAppearance: (folder, color, icon) =>
    invoke("set_space_appearance", { folder, color, icon }),
  deleteSpace: (folder) => invoke("delete_space", { folder }),
  // A space's ordering preference lives in its own .space.json —
  // `space` is the folder name (the identity).
  setSpaceSort: (space, sort) =>
    invoke("set_space_sort", { space, sort }),
  setSpaceOrder: (space, order) =>
    invoke("set_space_order", { space, order }),

  // Switching a part of the app on or off (App Functions, 2026-08-06).
  setFeature: (key, on) => invoke("set_feature", { key, on }),

  // A command's chord. `chord: null` unbinds it; neither string is judged by
  // the core (2026-08-18). A binding travels with the notebook: a chord
  // answers to a pair of hands, and those move between machines.
  setShortcut: (id, chord) => invoke("set_shortcut", { id, chord }),
  resetShortcuts: () => invoke("reset_shortcuts"),

  // How the sidebar arranges spaces: "name", or "" for the dragged order.
  spacesSort: () => invoke("spaces_sort"),
  setSpacesSort: (sort) => invoke("set_spaces_sort", { sort }),

  // Groups (reestruturação 2026-07-30): a folder that holds spaces.
  groups: () => invoke("groups"),
  // A group is made at the root, or inside another group (they nest).
  createGroup: (name, group = null) => invoke("create_group", { name, group }),
  renameGroup: (folder, name) => invoke("rename_group", { folder, name }),
  setGroupAppearance: (folder, color, icon) =>
    invoke("set_group_appearance", { folder, color, icon }),
  deleteGroup: (folder) => invoke("delete_group", { folder }),
  moveSpace: (name, intoGroup) =>
    invoke("move_space", { name, intoGroup }),
  // Moves a group — with everything under it — into another, or back out.
  moveGroup: (name, intoGroup) => invoke("move_group", { name, intoGroup }),
  createSpaceIn: (name, kind, group) =>
    invoke("create_space_in", { name, kind, group }),

  // Trash (internal, `.jott/trash/`) — restore or let it expire.
  trashEntries: () => invoke("trash_entries"),
  restoreFromTrash: (id) => invoke("restore_from_trash", { id }),
  deleteTask: (list, id) => invoke("delete_task", { list, id }),

  // Tags catalogue (name + colour).
  tags: () => invoke("tags"),
  setTag: (name, color) => invoke("set_tag", { name, color }),
  removeTag: (name) => invoke("remove_tag", { name }),

  // Completed tasks aggregated across every space, for the Completed tab.
  completedTasks: () => invoke("completed_tasks"),
  ensureTaskId: (list, position) => invoke("ensure_task_id", { list, position }),
  completeTask: (list, id) => invoke("complete_task", { list, id }),
  // `list` is the Completed list the task sits in — one per space.
  uncompleteTask: (list, id) => invoke("uncomplete_task", { list, id }),

  // notes
  // `folder` is a notes space's address ("Notes"); `path` is relative to it
  // ("Inbox/ideia.md") — the space owns its subtree.
  listNotes: (folder, query) => invoke("list_notes", { folder, query }),
  // `{ path, color, pinned }` per folder — the colour and the pin live in the
  // space's `.space.json`, since a folder of notes is a plain directory
  // (2026-08-19).
  noteFolders: (folder) => invoke("note_folders", { folder }),
  setNoteFolderColor: (folder, path, color) =>
    invoke("set_note_folder_color", { folder, path, color }),
  setNoteFolderPinned: (folder, path, pinned) =>
    invoke("set_note_folder_pinned", { folder, path, pinned }),
  notesCreatedToday: (folder) => invoke("notes_created_today", { folder }),
  quickCaptureNote: (folder, inFolder, text) =>
    invoke("quick_capture_note", { folder, inFolder, text }),
  readNote: (folder, path) => invoke("read_note", { folder, path }),
  writeNote: (folder, path, body) => invoke("write_note", { folder, path, body }),
  createNote: (folder, inFolder, title) =>
    invoke("create_note", { folder, inFolder, title }),
  deleteNote: (folder, path) => invoke("delete_note", { folder, path }),
  renameNote: (folder, path, title) =>
    invoke("rename_note", { folder, path, title }),
  moveNote: (folder, path, toFolder) =>
    invoke("move_note", { folder, path, toFolder }),
  setNotePinned: (folder, path, pinned) =>
    invoke("set_note_pinned", { folder, path, pinned }),
  // The note's head, as the value the line carries: a colour name
  // (`"yellow"`), an asset address (`"assets/foto.png"`), or null to take it
  // off. Which of the two a value IS is decided in the core.
  setNoteBanner: (folder, path, banner) =>
    invoke("set_note_banner", { folder, path, banner }),
  // Copies a note beside itself, under a free name — the card's "Duplicate".
  duplicateNote: (folder, path) => invoke("duplicate_note", { folder, path }),
  // Moves a note to ANOTHER notes space (the board's bulk "move to"); `moveNote`
  // above only ever moves inside one space.
  moveNoteToSpace: (folder, path, toSpace, toFolder) =>
    invoke("move_note_to_space", { folder, path, toSpace, toFolder }),
  createNoteFolder: (folder, path) => invoke("create_note_folder", { folder, path }),
  renameNoteFolder: (folder, path, name) =>
    invoke("rename_note_folder", { folder, path, name }),
  // Returns how many entries moved up to the parent — nothing is destroyed.
  deleteNoteFolder: (folder, path) => invoke("delete_note_folder", { folder, path }),

  // assets — the notebook's image library (`assets/`, 2026-08-18)
  // What a note points at is an ADDRESS (`assets/foto.png`); the URL an <img>
  // loads it from is built in services/assets.js, not here.
  assets: () => invoke("assets"),
  // `data` is base64: Tauri's raw request body does not exist on Android, and
  // the same `<input type="file">` has to work on both.
  importAsset: (name, data) => invoke("import_asset", { name, data }),
  // The same import, for a file that arrived as a `file://` address instead
  // of as bytes — which is how the desktop hands over a drag (2026-08-19).
  importAssetFromPath: (path) => invoke("import_asset_from_path", { path }),
  // The files sitting on the SYSTEM clipboard, as `file://` addresses — the
  // only door left when the webview's own clipboard says nothing, which for a
  // pasted file is always (2026-08-19).
  clipboardFiles: () => invoke("clipboard_files"),
  // Fetches a picture from the internet into the library. The one call in this
  // app that leaves the machine, and never made without being asked.
  importAssetFromUrl: (url) => invoke("import_asset_from_url", { url }),
  // Renames a file of the library and repoints every note and task that uses
  // it — a rename that broke its own links would not be a rename.
  renameAsset: (path, name) => invoke("rename_asset", { path, name }),
  deleteAsset: (path) => invoke("delete_asset", { path }),
  // Hands an attachment to the system's own app for that kind of file. Only a
  // file of `assets/` resolves — that is the whole of its security.
  openAsset: (path) => invoke("open_asset", { path }),
  // The desktop's own icon for a kind of file, as a `data:` URL — for the
  // chip a non-drawable file gets inside a note (services/fileIcons.js).
  // `null` where the system has no answer, which is not a failure.
  fileIcon: (name) => invoke("file_icon", { name }),
  // Where each file of the library is used, keyed by address. A file nobody
  // points at simply has no entry (2026-08-19).
  assetUsage: () => invoke("asset_usage"),

  // day and week
  periodTasks: (period) => invoke("period_tasks", { period }),
  periodSuggestions: (period) => invoke("period_suggestions", { period }),
  groupedSuggestions: (period) => invoke("grouped_suggestions", { period }),
  pullInto: (period, list, id) => invoke("pull_into_period", { period, list, id }),
  removeFrom: (period, list, id) =>
    invoke("remove_from_period", { period, list, id }),
  addTaskInPeriod: (period, text) => invoke("add_task_in_period", { period, text }),
  // A period has no `.space.json`: how it is arranged lives in the notebook
  // config, and the hand-dragged order goes straight into the state file.
  periodSort: (period) => invoke("period_sort", { period }),
  setPeriodSort: (period, sort) => invoke("set_period_sort", { period, sort }),
  setPeriodOrder: (period, refs) => invoke("set_period_order", { period, refs }),
  periodClock: () => invoke("period_clock"),
  refreshPeriods: () => invoke("refresh_periods"),
};

/// Errors cross the bridge as { kind, message }; anything else is a bug.
export function describeError(error) {
  if (error && typeof error === "object" && "kind" in error) {
    return `${error.kind}: ${error.message}`;
  }
  return String(error);
}
