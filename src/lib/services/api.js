// Every call into Rust goes through here.
//
// One place to see the whole surface, and one place to fix when a command
// changes. Nothing in this file decides anything — it just names the bridge.

import { invoke as callBridge } from "@tauri-apps/api/core";
import { announce } from "./undoOffer.js";

/// The bridge, with the command's name attached to whatever comes back
/// wrong. The value is annotated, never wrapped: `kind` is what the shell
/// branches on. Arguments are forwarded verbatim — an explicit `undefined`
/// second argument is a different call to anything watching the bridge.
function invoke(...call) {
  const [command] = call;
  return Promise.resolve(callBridge(...call))
    // A command that answered is said by name (services/undoOffer.js): the
    // floating undo is offered from here, not from every screen that deletes.
    .then((result) => (announce(command), result))
    .catch((cause) => {
    if (cause && typeof cause === "object") {
      try {
        cause.command = command;
      } catch {
        // Frozen, or a proxy that refuses. Nothing is owed here.
      }
      throw cause;
    }
    throw { kind: "bridge", message: String(cause), command };
  });
}

export const api = {
  // notebook
  // Everything the shell needs after any change, in one round trip —
  // info (with the layout names), clock, counts and conflicts.
  notebookSnapshot: () => invoke("notebook_snapshot"),
  lastNotebook: () => invoke("last_notebook"),
  pickFolder: () => invoke("pick_notebook_folder"),
  // The app's own container on Android — the notebook's home for whoever
  // declines the file permission, and for notebooks already living there.
  // Desktop answers null: choosing is the first thing it asks.
  defaultFolder: () => invoke("default_notebook_folder"),
  // The in-app folder browser (Android). `path` null starts at the top of
  // shared storage; anything outside it lands there too, rather than erroring.
  listFolders: (path = null) => invoke("list_folders", { path }),
  createFolder: (parent, name) => invoke("create_folder", { parent, name }),
  // `create` true makes a notebook in a folder that is not one yet; false
  // demands an existing notebook. Never left out.
  openNotebook: (path, create = false) =>
    invoke("open_notebook", { path, create }),
  // Every notebook this MACHINE has opened, newest first, read without
  // opening any (`Notebook::summarize`); a folder that is gone is left out.
  recentNotebooks: () => invoke("recent_notebooks"),
  // Takes one off that list. Nothing on disk is touched.
  forgetNotebook: (path) => invoke("forget_notebook", { path }),
  // A notebook's name IS its folder name, so rename and move are the same
  // operation on the folder; both answer the new path and never overwrite.
  renameNotebook: (path, name) => invoke("rename_notebook", { path, name }),
  moveNotebook: (path, into) => invoke("move_notebook", { path, into }),
  revealNotebook: (path) => invoke("reveal_notebook", { path }),
  // `notebook` null opens the picker; a path opens that folder in the new
  // window, which asks for its own notebook. Android refuses (one Activity).
  openWindow: (notebook = null) => invoke("open_window", { notebook }),
  // Two machine preferences: whether the picker gets out of the way once it
  // opened something, and whether the app opens on the picker or the work.
  pickerCloses: () => invoke("picker_closes"),
  rememberPickerCloses: (closes) => invoke("remember_picker_closes", { closes }),
  opensOnPicker: () => invoke("opens_on_picker"),
  rememberOpensOnPicker: (on) => invoke("remember_opens_on_picker", { on }),
  // Every field is optional: the core keeps what it is not told about, so a
  // screen can send one key without holding the rest.
  notebookSettings: () => invoke("notebook_settings"),
  // "Reset this section": a notebook page by key (dates · notebook · tasks ·
  // notes), or this machine's Display drawer.
  resetSettings: (section) => invoke("reset_settings", { section }),
  resetMachineDisplay: () => invoke("reset_machine_display"),
  // What the notebook holds: {notes, tasks, files, bytes}. Walks the tree —
  // ask when a section opens, not on every render.
  notebookContents: () => invoke("notebook_contents"),
  setNotebookSettings: (settings) => invoke("set_notebook_settings", { settings }),
  // Display answers to THIS machine, not to the notebook. Same pact as
  // above: send only the key that changed.
  setMachineDisplay: (display) => invoke("set_machine_display", { display }),
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

  // The session history, outside the editor. Both answer the command's name
  // (`services/strings.js` turns it into words) or null; a `stale` error
  // means the files moved on since and the entry was dropped, not written.
  undo: () => invoke("undo"),
  redo: () => invoke("redo"),
  /// What `undo` would take back, without taking it: the floating offer's check.
  undoable: () => invoke("undoable"),

  // search
  // Two answers (tasks, notes) plus whether anything was left out. `limit`
  // null is the core's own; `scope` null is the whole notebook.
  search: (query, limit = null, scope = null) =>
    invoke("search", { query, limit, scope }),

  // The notebook is plain folders, and this is the door to them: `path` is a
  // root-relative address (a space, a list, a note), empty for the root. What
  // opens is always the FOLDER around it, never the document.
  openInFileManager: (path = null) => invoke("open_in_file_manager", { path }),
  /// This machine's font families, sorted and safe to name in CSS. Empty off
  /// Linux (no fontconfig). Asked when the Display page opens, never per render.
  systemFonts: () => invoke("system_fonts"),

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

  // update. The check itself is Rust's — the webview's CSP does not reach
  // github.com. The two prefs answer for this INSTALL, a machine matter.
  appVersion: () => invoke("app_version"),
  checkForUpdate: () => invoke("check_for_update"),
  autoUpdateCheck: () => invoke("auto_update_check"),
  rememberAutoUpdateCheck: (on) => invoke("remember_auto_update_check", { on }),
  lastUpdateCheck: () => invoke("last_update_check"),
  rememberLastUpdateCheck: (when) => invoke("remember_last_update_check", { when }),

  // Putting the app into the desktop's application menu — only an AppImage
  // has anything to write here, which is what `supported` answers.
  desktopEntryState: () => invoke("desktop_entry_state"),
  setDesktopEntry: (on) => invoke("set_desktop_entry", { on }),
  dismissDesktopEntry: () => invoke("dismiss_desktop_entry"),

  // lists
  listTasks: (list) => invoke("list_tasks", { list }),
  // `folder` is a space folder ("Tasks"); the UI takes it from
  // layout.tasksFolder until it is space-aware.
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
  // How a notes space draws its board (`grid` / `tree`); null follows the
  // notebook's default (Settings → Notes → Board).
  setSpaceNoteLayout: (space, layout) =>
    invoke("set_space_note_layout", { space, layout }),

  // Switching a part of the app on or off (App Functions).
  setFeature: (key, on) => invoke("set_feature", { key, on }),

  // A command's chord. `chord: null` unbinds; neither string is judged by
  // the core. A binding travels with the notebook, not the machine.
  setShortcut: (id, chord) => invoke("set_shortcut", { id, chord }),
  resetShortcuts: () => invoke("reset_shortcuts"),

  /// The themes the open notebook carries (`.jott/themes/`): name, label,
  /// author, version, and whether this build is new enough. Walks a folder:
  /// ask when the Display page opens or a stylesheet changed, never per render.
  userThemes: () => invoke("user_themes"),
  /// One of their stylesheets, already stripped of anything that would reach
  /// the network. `{ name, css, blocked }` — `blocked` counts what was
  /// neutralised, so the interface can say it out loud.
  userThemeCss: (name) => invoke("user_theme_css", { name }),
  /// Writes a new theme into the notebook, seeded with a stylesheet the app
  /// hands over — the look in use, with its selectors made nameless
  /// (services/themeSeed.js). Refuses to overwrite one that exists.
  createUserTheme: (name, css) => invoke("create_user_theme", { name, css }),

  // How the sidebar arranges spaces: "name", or "" for the dragged order.
  spacesSort: () => invoke("spaces_sort"),
  setSpacesSort: (sort) => invoke("set_spaces_sort", { sort }),

  // Groups: a folder that holds spaces and other groups (they nest).
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

  // Trash (`.jott/trash/`) — restore, let it expire, or delete for good.
  trashEntries: () => invoke("trash_entries"),
  restoreFromTrash: (id) => invoke("restore_from_trash", { id }),
  purgeFromTrash: (id) => invoke("purge_from_trash", { id }),
  emptyTrash: () => invoke("empty_trash"),
  deleteTask: (list, id) => invoke("delete_task", { list, id }),

  // Tags catalogue (name + colour).
  /// Every tag in use with its count, catalogued or not. Walks every list:
  /// ask when the screen opens, not on each render.
  tagUsage: () => invoke("tag_usage"),
  setTag: (name, color) => invoke("set_tag", { name, color }),
  removeTag: (name) => invoke("remove_tag", { name }),

  // Completed tasks aggregated across every space, for the Completed tab.
  completedTasks: () => invoke("completed_tasks"),

  // The Timeline. `from`/`to` are `yyyy-mm-dd` or null; reads the whole log
  // and every list with a live task — ask when the screen opens, never per render.
  timeline: (from = null, to = null) => invoke("timeline", { from, to }),
  // The years the log has a file for, newest first — the year pills.
  timelineYears: () => invoke("timeline_years"),
  // Forgets one thing from the log for good: `{kind: "task", key: id}` or
  // `{kind: "note", key: path}`. The one rewrite of the log, always behind
  // a confirmation. Answers how many lines went.
  forgetFromTimeline: (kind, key) => invoke("forget_from_timeline", { target: { kind, key } }),
  ensureTaskId: (list, position) => invoke("ensure_task_id", { list, position }),
  completeTask: (list, id) => invoke("complete_task", { list, id }),
  // `list` is the Completed list the task sits in — one per space.
  uncompleteTask: (list, id) => invoke("uncomplete_task", { list, id }),

  // notes
  // `folder` is a notes space's address ("Notes"); `path` is relative to it
  // ("Inbox/ideia.md") — the space owns its subtree.
  listNotes: (folder, query) => invoke("list_notes", { folder, query }),
  // `{ path, color, pinned }` per folder — colour and pin live in the
  // space's `.space.json`, since a folder of notes is a plain directory.
  noteFolders: (folder) => invoke("note_folders", { folder }),
  setNoteFolderColor: (folder, path, color) =>
    invoke("set_note_folder_color", { folder, path, color }),
  setNoteFolderPinned: (folder, path, pinned) =>
    invoke("set_note_folder_pinned", { folder, path, pinned }),
  // Every notes space answers, so no space is named: each row is
  // `{folder, note}` (the core's `ListedNote`).
  notesCreatedToday: () => invoke("notes_created_today"),
  inboxNotes: (folder) => invoke("inbox_notes", { folder }),
  quickCaptureNote: (folder, inFolder, text) =>
    invoke("quick_capture_note", { folder, inFolder, text }),
  readNote: (folder, path) => invoke("read_note", { folder, path }),
  writeNote: (folder, path, body) => invoke("write_note", { folder, path, body }),
  createNote: (folder, inFolder, title) =>
    invoke("create_note", { folder, inFolder, title }),
  deleteNote: (folder, path) => invoke("delete_note", { folder, path }),
  renameNote: (folder, path, title) =>
    invoke("rename_note", { folder, path, title }),
  setNotePinned: (folder, path, pinned) =>
    invoke("set_note_pinned", { folder, path, pinned }),
  // The note's subjects (`tags:` in its properties), replaced whole; the
  // core normalises the names like a task's tags.
  setNoteTags: (folder, path, tags) => invoke("set_note_tags", { folder, path, tags }),
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

  // assets — the notebook's image library (`assets/`). What a note points at
  // is an ADDRESS; the URL an <img> loads is built in services/assets.js.
  assets: () => invoke("assets"),
  // `data` is base64: Tauri's raw request body does not exist on Android, and
  // the same `<input type="file">` has to work on both.
  importAsset: (name, data) => invoke("import_asset", { name, data }),
  // The same import, for a file that arrived as a `file://` address instead
  // of as bytes — how the desktop hands over a drag.
  importAssetFromPath: (path) => invoke("import_asset_from_path", { path }),
  // The files on the SYSTEM clipboard, as `file://` addresses — the only door
  // when the webview's clipboard says nothing, which for a pasted file is always.
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
  // Where each file of the library is used, keyed by address; a file nobody
  // points at has no entry.
  assetUsage: () => invoke("asset_usage"),

  // the day, and the days ahead. `day` is an ISO date or null (today); a day
  // gone by is the log's, and the core refuses to plan it (`kind: "dayGone"`).
  dayTasks: (day = null) => invoke("day_tasks", { day }),
  // Every open task of the notebook, arranged by space — the fixed Tasks
  // screen's "every list". Walks every list: ask when the screen opens.
  allTasks: () => invoke("all_tasks"),
  groupedSuggestions: (day = null) => invoke("grouped_suggestions", { day }),
  pullInto: (day, list, id) => invoke("pull_into_day", { day, list, id }),
  removeFrom: (day, list, id) => invoke("remove_from_day", { day, list, id }),
  // A day has no `.space.json`: how it is arranged lives in the notebook
  // config (one choice for every day), and the hand-dragged order goes
  // straight into the day's file.
  daySort: () => invoke("day_sort"),
  setDaySort: (sort) => invoke("set_day_sort", { sort }),
  setDayOrder: (day, refs) => invoke("set_day_order", { day, refs }),
  dayClock: () => invoke("day_clock"),
  refreshDay: () => invoke("refresh_day"),
  // reminders: the core's sorted list, this machine's memory of what rang,
  // the desktop bell, and the tray the app waits in.
  reminders: () => invoke("reminders"),
  remindedUntil: () => invoke("reminded_until"),
  rememberRemindedUntil: (until) => invoke("remember_reminded_until", { until }),
  notifyReminder: (title, body, target) =>
    invoke("notify_reminder", { title, body, target }),
  closeToTray: () => invoke("close_to_tray"),
  rememberCloseToTray: (on) => invoke("remember_close_to_tray", { on }),
  autostart: () => invoke("autostart"),
  setAutostart: (on) => invoke("set_autostart", { on }),
  quitApp: () => invoke("quit_app"),
};

/// Errors cross the bridge as `{kind, message}`; anything else is a bug the
/// reader must still be told about, and `[object Object]` must never reach
/// them. In order: the core's own shape; anything with a real `toString`;
/// a plain object's `message`, else the object itself as JSON.
export function describeError(error) {
  const where = error?.command ? ` (${error.command})` : "";
  if (error && typeof error === "object") {
    if ("kind" in error) return `${error.kind}: ${error.message ?? ""}${where}`;
    const said = String(error);
    if (said !== "[object Object]") return said + where;
    if (typeof error.message === "string" && error.message) return error.message + where;
    try {
      return JSON.stringify(error) + where;
    } catch {
      // Circular, or a getter that throws.
      return `unreadable error${where}`;
    }
  }
  return String(error) + where;
}
