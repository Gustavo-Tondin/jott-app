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
  rememberScreen: (screen) => invoke("remember_screen", { screen }),

  // lists
  listNames: () => invoke("list_names"),
  listCounts: () => invoke("list_counts"),
  listConflicts: () => invoke("list_conflicts"),
  listTasks: (list) => invoke("list_tasks", { list }),
  // `folder` is a workspace folder ("Tasks"); the UI takes it from
  // layout.tasksFolder until it is workspace-aware.
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
  // Manual order (dragging in the sidebar). Namespace: "workspaces" or
  // "lists:<folder>". Names is the ordered list of item names.
  setOrder: (namespace, names) => invoke("set_order", { namespace, names }),

  // Workspace management.
  // A workspace has a single function, chosen at creation: `tasks` / `notes`.
  createWorkspace: (name, kind) => invoke("create_workspace", { name, kind }),
  renameWorkspace: (folder, name) => invoke("rename_workspace", { folder, name }),
  setWorkspaceAppearance: (folder, color, icon) =>
    invoke("set_workspace_appearance", { folder, color, icon }),
  deleteWorkspace: (folder) => invoke("delete_workspace", { folder }),
  // A workspace's ordering preference lives in its own .workspace.json —
  // `workspace` is the folder name (the identity).
  setWorkspaceSort: (workspace, sort) =>
    invoke("set_workspace_sort", { workspace, sort }),
  setWorkspaceOrder: (workspace, order) =>
    invoke("set_workspace_order", { workspace, order }),

  // Switching a part of the app on or off (App Functions, 2026-08-06).
  setFeature: (key, on) => invoke("set_feature", { key, on }),

  // How the sidebar arranges workspaces: "name", or "" for the dragged order.
  workspacesSort: () => invoke("workspaces_sort"),
  setWorkspacesSort: (sort) => invoke("set_workspaces_sort", { sort }),

  // Groups (reestruturação 2026-07-30): a folder that holds workspaces.
  groups: () => invoke("groups"),
  // A group is made at the root, or inside another group (they nest).
  createGroup: (name, group = null) => invoke("create_group", { name, group }),
  renameGroup: (folder, name) => invoke("rename_group", { folder, name }),
  setGroupAppearance: (folder, color, icon) =>
    invoke("set_group_appearance", { folder, color, icon }),
  deleteGroup: (folder) => invoke("delete_group", { folder }),
  moveWorkspace: (name, intoGroup) =>
    invoke("move_workspace", { name, intoGroup }),
  // Moves a group — with everything under it — into another, or back out.
  moveGroup: (name, intoGroup) => invoke("move_group", { name, intoGroup }),
  createWorkspaceIn: (name, kind, group) =>
    invoke("create_workspace_in", { name, kind, group }),

  // Trash (internal, `.jott/trash/`) — restore or let it expire.
  trashEntries: () => invoke("trash_entries"),
  restoreFromTrash: (id) => invoke("restore_from_trash", { id }),
  deleteTask: (list, id) => invoke("delete_task", { list, id }),

  // Tags catalogue (name + colour).
  tags: () => invoke("tags"),
  setTag: (name, color) => invoke("set_tag", { name, color }),
  removeTag: (name) => invoke("remove_tag", { name }),

  // Completed tasks aggregated across every widget, for the Completed tab.
  completedTasks: () => invoke("completed_tasks"),
  ensureTaskId: (list, position) => invoke("ensure_task_id", { list, position }),
  completeTask: (list, id) => invoke("complete_task", { list, id }),
  // `list` is the Completed list the task sits in — one per widget.
  uncompleteTask: (list, id) => invoke("uncomplete_task", { list, id }),

  // notes
  // `folder` is a notes widget's address ("Notes"); `path` is relative to it
  // ("Inbox/ideia.md") — the widget owns its subtree.
  listNotes: (folder, query) => invoke("list_notes", { folder, query }),
  noteFolders: (folder) => invoke("note_folders", { folder }),
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
  createNoteFolder: (folder, path) => invoke("create_note_folder", { folder, path }),
  renameNoteFolder: (folder, path, name) =>
    invoke("rename_note_folder", { folder, path, name }),
  // Returns how many entries moved up to the parent — nothing is destroyed.
  deleteNoteFolder: (folder, path) => invoke("delete_note_folder", { folder, path }),

  // day and week
  periodTasks: (period) => invoke("period_tasks", { period }),
  periodSuggestions: (period) => invoke("period_suggestions", { period }),
  groupedSuggestions: (period) => invoke("grouped_suggestions", { period }),
  pullInto: (period, list, id) => invoke("pull_into_period", { period, list, id }),
  removeFrom: (period, list, id) =>
    invoke("remove_from_period", { period, list, id }),
  addTaskInPeriod: (period, text) => invoke("add_task_in_period", { period, text }),
  // A period has no `.workspace.json`: how it is arranged lives in the notebook
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
