// Every string the user reads, in one place.
//
// Spec 4.4: the interface is English until i18n lands after v1, and the
// strings are born centralized — translating later means adding a file here,
// not hunting text through components. Functions take the variable parts.

export const S = {
  // App shell
  onboardingIntro:
    "Choose a folder to be your notebook. If it is not one yet, Jott creates " +
    "the structure inside it — your files stay plain .md, readable in any editor.",
  chooseFolder: "Choose notebook folder…",
  switchNotebook: "switch notebook…",
  today: "Today",
  week: "Week",
  completed: "Completed",
  // The right-rail hamburger and the lesser pages it opens.
  menu: "menu",
  tagsManagement: "Tags management",
  trash: "Trash",
  tagsSoon: "Managing tags — name and colour — is coming soon.",
  trashSoon:
    "Restoring deleted workspaces, tasks and notes from here is coming soon. " +
    "Deletions already go to the system trash in the meantime.",
  readOnly: "read-only",
  renameList: "rename list",
  deleteList: "delete list",
  promptRenameList: (name) => `New name for "${name}":`,
  confirmDeleteList: (name) =>
    `Delete "${name}"? Remaining tasks go to the Inbox.`,
  tasksRescued: (count, name) =>
    `${count} task(s) from "${name}" were moved to the Inbox.`,
  conflictsTitle: (count) => `${count} sync conflict(s) in this notebook`,
  conflictsBody:
    "Another device edited the same files. Jott does not choose for you — " +
    "open the folder and decide which version stays.",
  dismissError: "ok",

  // Workspaces (phase 7.5)
  readOnlyWorkspace: "read-only (newer version)",
  missingWorkspace: "This page is no longer in the notebook.",
  // A workspace has one function, and the interface says which by name: a
  // tasks one is a LIST, a notes one is a NOTEPAD. "Workspace" is the term of
  // the file format, not of the app (user call, 2026-08-11).
  newList: "New list",
  newNotepad: "New notepad",
  promptNewList: "Name of the new list:",
  promptNewNotepad: "Name of the new notepad:",
  promptRenameWorkspace: (name) => `New name for "${name}":`,
  confirmDeleteWorkspace: (name) => `Delete "${name}"? It goes to the trash.`,
  renameWorkspace: "Rename",
  deleteWorkspace: "Delete",
  workspaceAppearance: "Colour & icon",
  // A workspace inside a group picks only its icon — the colour is the group's.
  iconOnly: "Icon",
  appearance: "appearance",
  color: "colour",
  icon: "icon",
  defaultAppearance: "default",
  unsupportedWidgetTitle: (kind) =>
    kind ? `"${kind}" widget` : "Workspace without a type",
  unsupportedWidgetBody:
    "This version of Jott does not know how to show this workspace. " +
    "Its files are untouched — a newer version may support it.",
  widgetNoLists: "No list in this workspace yet.",
  // Reestruturação 2026-07-30 — inline naming, widget flow, groups, trash, tags.
  cancel: "Cancel",
  create: "Create",
  newTask: "New task",
  noTasksYet: "No tasks yet",
  // The widget's own ⋮ menu: arrangement and bulk selection (Etapa 1).
  widgetOptions: "widget options",
  selectTasks: "Select tasks…",
  selectedCount: (n) => `${n} selected`,
  moveTo: "Move to…",
  deleteSelected: "Delete",
  sortFileOrder: "File order",
  sortByName: "Sort by name",
  sortByCreated: "Sort by creation date",
  sortByCompleted: "Sort by completion date",
  sortCustom: "Custom order (dragged)",
  // The composing row (the New task popup, and the bar on the Tasks screen).
  createTaskPlaceholder: "Create a task…",
  completedCount: (n) => `Completed ${n}`,
  newGroup: "New group",
  nameGroup: "Name for the new group",
  moveToGroup: "Move to group",
  removeFromGroup: "Remove from group",
  renameGroup: "Rename group",
  deleteGroup: "Delete group",
  collapseGroup: "collapse group",
  expandGroup: "expand group",
  // The tasks screen's ⋮ (2026-08-05): the sortings open a submenu.
  sortTasks: "Sort",
  pinTask: "Pin to top",
  unpinTask: "Unpin",
  confirmDeleteGroup: (name) =>
    `Delete the group "${name}"? What it holds moves up one level; the group goes to the trash.`,
  trashTitle: "Trash",
  trashEmpty: "The trash is empty.",
  restore: "Restore",
  trashHint: "Deleted items wait here before they are cleared for good.",
  tagsTitle: "Tags",
  tagsEmpty: "No tags yet. Add one from a task.",
  newTagName: "New tag name",
  deleteTag: "Delete",
  deleteTask: "Delete task",

  // App Functions (2026-08-06): which parts of the app are switched on.
  sectionFeatures: "App functions",
  sectionFeaturesHint:
    "Switching one off takes it out of the whole interface. Nothing is deleted " +
    "— your files keep every field, and it all comes back when you switch it on.",
  featureTasks: "Tasks",
  featureNotes: "Notes",
  featureMyDay: "My Day",
  featureWeek: "Week",
  featureSubtasks: "Subtasks",
  featureTaskTags: "Task tags",
  featureDueDate: "Complete date",
  featureRemind: "Remind me",
  featureRepeat: "Repeat",
  featurePriority: "Priority",
  featureDescription: "Description",
  featureFiles: "Add files",

  // Settings (phase 9)
  settings: "Settings",
  settingsSaved: "Saved.",
  sectionDay: "Day and week",
  sectionDisplay: "Display",
  sectionNotebook: "Notebook",
  rolloverDaily: "When the day turns",
  rolloverWeekly: "When the week turns",
  rolloverMode: "Unfinished tasks",
  rolloverModeReset: "go back to suggestions",
  rolloverModeCarry: "stay pulled",
  rolloverAt: "Turn at",
  rolloverAtHint: "Offset from midnight. -02:00 means 22:00 the evening before.",
  weekStartsOn: "Week starts on",
  monday: "Monday",
  sunday: "Sunday",
  dateFormat: "Date format",
  restoreLastScreen: "Reopen on the last screen",
  restoreLastScreenHint:
    "Off by default: landing on Today is more predictable.",
  showListCounts: "Show task counts in the sidebar",
  autoUrgentByDate: "Treat overdue tasks as urgent",
  autoUrgentByDateHint:
    "The #urgent tag written by hand always counts, either way.",
  closeOnClickAway: "Close the task panel when clicking outside",
  closeOnClickAwayHint:
    "Off by default: it fires easily, and losing a half-typed task costs more than the shortcut is worth.",
  quickNoteFolder: "Quick note goes to",
  completedRetention: "Clear completed after (days)",
  completedRetentionHint:
    "A finished task leaves its Completed list after this many days and waits " +
    "in the trash, so it is still recoverable. 0 keeps it forever.",
  trashRetention: "Empty the trash after (days)",
  trashRetentionHint: "0 keeps deleted items until you clear them yourself.",
  notebookPath: "Folder",
  readOnlyNotice:
    "This notebook was written by a newer version of Jott and is open for reading only.",

  // Shell (phase 8.5)
  home: "Home",
  tasks: "Tasks",
  inboxTab: "Inbox",
  openInNewTab: "open in new tab",
  closeTab: "close tab",
  newTab: "new tab",

  // Title bar window controls (frameless window)
  minimizeWindow: "minimize",
  maximizeWindow: "maximize",
  closeWindow: "close window",
  goBack: "back",
  goForward: "forward",
  pageMenu: "page menu",
  todaysTasks: "Today tasks",
  todaysNotes: "Today notes",
  newNoteAction: "New note",
  quickNote: "Quick note…",
  quickNoteTo: "to",
  noNotesToday: "No notes written today.",
  openSettings: "settings",
  collapseSidebar: "collapse sidebar",
  expandSidebar: "expand sidebar",
  untitled: "Untitled",

  // Notes (phase 8)
  notes: "Notes",
  newNote: "+ new note",
  newNoteTitle: "New note",
  promptNewNote: "Title of the new note:",
  promptRenameNote: (title) => `New title for "${title}":`,
  promptNewNoteFolder: "Name of the new folder:",
  newNoteFolder: "+ new folder",
  renameFolder: "rename folder",
  deleteFolder: "delete folder",
  promptRenameFolder: (name) => `New name for "${name}":`,
  confirmDeleteFolder: (name) =>
    `Delete the folder "${name}"? Its notes and subfolders move up one level — nothing is deleted.`,
  folderEmptied: (count, name) =>
    `${count} item(s) from "${name}" moved up one level.`,
  confirmDeleteNote: (title) => `Delete "${title}"? This cannot be undone.`,
  searchNotes: "Search notes…",
  noNotes: "No notes yet.",
  noNotesFound: "No notes match this search.",
  allNotes: "All notes",
  emptyNote: "Empty note",
  pin: "pin",
  unpin: "unpin",
  pinned: "pinned",
  deleteNote: "delete",
  renameNote: "rename",
  moveNote: "move to…",
  promptMoveNote: (folders) =>
    `Move to which folder?\n\nAvailable: ${folders || "(root)"}`,
  backToNotes: "← notes",
  noteBodyPlaceholder: "Write here…",
  gridView: "grid",
  treeView: "folders",

  // Lists
  newTaskPlaceholder: "New task…",
  addTask: "Add",
  emptyList: "No tasks in this list.",
  pullToToday: "→ Today",
  pullToWeek: "→ Week",

  // Today / Week
  weekTitle: "This week",
  weekOf: (start) => `week of ${start}`,
  /// The week's span, shown beside the Index/Today/Week strip.
  weekRange: (from, to) => `${from} - ${to}`,
  suggestionsTitle: "Suggestions",
  // The right panel's heading — it says which period it would pull into.
  suggestionsForDay: "Suggestions for today",
  suggestionsForWeek: "Suggestions for this week",
  noSuggestions: "No tasks available.",
  groupUrgent: "Urgent",
  groupSoon: "Soon",
  groupThisWeek: "This week",
  groupLists: "From the lists",
  pull: "pull",
  removeFromPeriod: "remove",

  // Completed
  nothingCompleted: "Nothing completed yet.",
  goesBackTo: (name) => `back to ${name}`,

  // Task row and inspector
  complete: "complete",
  uncheck: "uncheck",
  taskRowHint: "click to open, double-click to rename",
  repeatsHint: "repeats",
  taskName: "task name",
  closePanel: "close",
  collapsePanel: "collapse panel",
  collapseSubtasks: "hide subtasks",
  expandSubtasks: "show subtasks",
  myDay: "Send to My Day",
  removeFromDay: "Take out of My Day",
  taskOptions: "task options",
  duplicateTask: "Duplicate task",
  addTag: "add tag",
  completeDateLabel: "Complete date",
  remindMeLabel: "Remind me at",
  addFilesLabel: "Add files",
  comingSoon: "coming soon",
  deleteTask: "delete task",
  moveToList: "move to list",
  subtasksTitle: "Subtasks",
  subtaskLabel: (text) => `subtask: ${text}`,
  newSubtaskPlaceholder: "New subtask…",
  removeSubtask: "remove subtask",
  tagsTitle: "Tags",
  newTagPlaceholder: "New tag…",
  removeTag: (tag) => `remove #${tag}`,
  descriptionTitle: "Description",
  dueDateLabel: "Due date",
  clearDate: "clear date",
  clearDateHint: "clear",
  pickDate: "pick date",
  prevMonth: "previous month",
  nextMonth: "next month",
  closeDatePicker: "close calendar",
  months: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  // Sunday-first, matching JavaScript's getDay().
  weekdaysShort: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
  priorityLabel: "Priority",
  priorityNone: "none",
  priorityHigh: "high",
  priorityMedium: "medium",
  priorityLow: "low",
  repeatLabel: "Repeat",
  repeatEvery: "every",
  noRepeat: "never",
  repeatDays: "day",
  repeatWeeks: "week",
  repeatMonths: "month",
};
