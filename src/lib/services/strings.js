// Every string the user reads, in one place. English until i18n lands after
// v1; translating later means adding a file here, not hunting text through
// components. Functions take the variable parts.

/// The actions the app records, in words — keyed by the bridge command.
const ACTION_NAMES = {
  create_task: "New task",
  edit_task_text: "Rename task",
  set_task_pinned: "Pin task",
  move_task_to: "Reorder tasks",
  move_task: "Move task",
  duplicate_task: "Duplicate task",
  complete_task: "Complete task",
  uncomplete_task: "Reopen task",
  delete_task: "Delete task",
  create_list: "New list",
  rename_list: "Rename list",
  delete_list: "Delete list",
  pull_into: "Add to a day",
  remove_from: "Remove from a day",
  set_day_order: "Reorder the day",
  set_day_sort: "Sort the day",
  quick_capture_note: "Quick note",
  create_note: "New note",
  delete_note: "Delete note",
  rename_note: "Rename note",
  move_note: "Move note",
  move_note_to_space: "Move note",
  set_note_pinned: "Pin note",
  set_note_banner: "Note banner",
  duplicate_note: "Duplicate note",
  create_note_folder: "New folder",
  rename_note_folder: "Rename folder",
  delete_note_folder: "Delete folder",
  set_note_folder_color: "Folder colour",
  set_note_folder_pinned: "Pin folder",
  create_space_in: "New space",
  rename_space: "Rename space",
  delete_space: "Delete space",
  move_space: "Move space",
  set_space_appearance: "Space colour and icon",
  set_space_sort: "Sort space",
  set_space_order: "Reorder space",
  set_space_note_layout: "Board layout",
  create_group: "New group",
  rename_group: "Rename group",
  delete_group: "Delete group",
  move_group: "Move group",
  set_group_appearance: "Group colour and icon",
  set_order: "Reorder sidebar",
  set_spaces_sort: "Sort sidebar",
  set_tag: "Save tag",
  remove_tag: "Remove tag",
  restore_from_trash: "Restore from trash",
  purge_from_trash: "Delete for good",
  empty_trash: "Empty trash",
  set_notebook_settings: "Change a setting",
  reset_settings: "Reset a settings section",
  set_feature: "Switch a function",
  set_shortcut: "Change a shortcut",
  reset_shortcuts: "Reset shortcuts",
};

/// What the floating undo says an action did: the thing that vanished, past
/// tense. A command not named here reads as its action.
const UNDO_OFFERS = {
  delete_task: "Task deleted",
  delete_note: "Note deleted",
  delete_list: "List deleted",
  delete_space: "Space deleted",
  delete_group: "Group deleted",
  delete_note_folder: "Folder deleted",
  remove_from: "Removed from the day",
  move_task: "Task moved",
  move_note: "Note moved",
  move_note_to_space: "Note moved",
};

export const S = {
  // App shell
  // Android only: the notebook lives wherever the user says, and that needs
  // the all-files permission — see services/androidStorage.js.
  storageIntro:
    "To keep your notebook in a folder you choose — and to let a sync app " +
    "like Syncthing reach it — Jott needs permission to manage files. " +
    "Android opens its Settings screen; turn Jott on there and come back.",
  allowFiles: "Allow file access",
  usePrivateFolder: "Use Jott's private folder instead",
  privateFolderNote:
    "Kept inside the app. Nothing else on the phone can read it, and " +
    "uninstalling Jott deletes it.",
  // The notebooks screen — the picker the app opens on.
  pickANotebook: "Pick a notebook",
  createNotebook: "Create a new notebook",
  openNotebook: "Open a notebook",
  // What a card carries under the notebook's name: what is still to do in
  // there, and what came into the Inbox and has not been filed.
  notebookCounts: (notes, tasks) =>
    `${notes === 1 ? "1 note" : `${notes} notes`} \u00b7 ${
      tasks === 1 ? "1 task" : `${tasks} tasks`
    }`,
  // When this machine last opened it. The desktop draws it beside the name;
  // the phone does not draw it at all.
  ago: ({ unit, count } = {}) => {
    switch (unit) {
      case "now":
        return "just now";
      case "minute":
        return count === 1 ? "1 min ago" : `${count} min ago`;
      case "hour":
        return count === 1 ? "1 hour ago" : `${count} hours ago`;
      case "day":
        return count === 1 ? "1 day ago" : `${count} days ago`;
      case "month":
        return count === 1 ? "1 month ago" : `${count} months ago`;
      case "year":
        return count === 1 ? "1 year ago" : `${count} years ago`;
      default:
        return "";
    }
  },
  notebookOptions: "notebook options",
  // The footer's menu of notebooks: the recent ones, to switch in place, and
  // the door to the screen that manages them.
  notebookMenu: "switch notebook",
  manageNotebooks: "Manage notebooks\u2026",
  // The picker window's OWN ⋮ — two questions about windows, not about any
  // one notebook, which is why it hangs off the screen and not off a card.
  notebooksOptions: "screen options",
  keepPickerOpen: "Keep this screen open after opening a notebook",
  openAppOnPicker: "Open Jott on this screen",
  closeNotebooks: "Close",
  notebookReadOnly: "read-only",
  // The five rows of a card's \u22ee. The first is not a row but a label: the
  // path is what tells two notebooks of the same name apart.
  renameNotebook: "Rename notebook",
  renameNotebookPrompt: "New name for the notebook:",
  moveNotebook: "Move notebook\u2026",
  revealNotebook: "Show in file manager",
  forgetNotebook: "Remove from the list",
  // Asked before forgetting, because the word "remove" beside a notebook has
  // to be unambiguous about what it does NOT do.
  confirmForget: (name) => `Remove ${name} from the list?`,
  confirmForgetDetail:
    "The notebook stays exactly where it is on disk \u2014 only this list forgets it. " +
    "Open it again from \u201cOpen a notebook\u201d whenever you like.",
  browseFolders: "Choose a folder",
  parentFolder: "Up one folder",
  newFolder: "New folder",
  newFolderName: "Name for the new folder:",
  useThisFolder: "Use this folder",
  noSubfolders: "No folders here.",
  existingNotebook: "notebook",
  today: "Today",
  completed: "Completed",
  // The right-rail hamburger and the lesser pages it opens.
  menu: "menu",
  tagsManagement: "Tags management",
  trash: "Trash",
  readOnly: "read-only",
  renameList: "rename list",
  deleteList: "delete list",
  promptRenameList: (name) => `New name for "${name}":`,
  confirmDeleteList: (name) =>
    `Delete "${name}"? Remaining tasks go to the Inbox.`,
  tasksRescued: (count, name) =>
    `${count} task(s) from "${name}" were moved to the Inbox.`,
  conflictsTitle: (count) =>
    count === 1 ? "1 sync conflict in this notebook" : `${count} sync conflicts in this notebook`,
  conflictsBody:
    "Another device edited the same files. Jott does not choose for you — " +
    "open the folder and decide which version stays.",
  // The row per conflict: its list, the copy the sync tool wrote, and the
  // door to the folder it sits in.
  conflictReveal: "Show in folder",
  conflictOriginalGone: "the original is gone",
  conflictsHide: "Hide for now",
  dismissError: "ok",
  // The shell's states.
  errorTitle: "Something went wrong",
  openingNotebook: (name) => (name ? `Opening ${name}…` : "Opening the notebook…"),
  openFailedTitle: "This notebook could not be opened",
  openFailedRetry: "Try again",
  openFailedOther: "Open another one",

  // Spaces
  readOnlySpace: "read-only (newer version)",
  missingSpace: "This page is no longer in the notebook.",
  // A space has one function, named when it is MADE: a tasks one is a LIST,
  // a notes one a NOTEPAD. "Space" is the container's word on screen, in the
  // code and on disk alike. Home, Tasks and Notes are the fixed spaces.
  newList: "New list",
  newNotepad: "New notepad",
  promptNewList: "Name of the new list:",
  promptNewNotepad: "Name of the new notepad:",
  promptRenameSpace: (name) => `New name for "${name}":`,
  confirmDeleteSpace: (name) => `Delete "${name}"? It goes to the trash.`,
  renameSpace: "Rename",
  deleteSpace: "Delete",
  spaceAppearance: "Colour & icon",
  // A space inside a group picks only its icon — the colour is the group's.
  iconOnly: "Icon",
  color: "colour",
  icon: "icon",
  defaultAppearance: "default",
  // The icon picker: the field over the grid, and the count line under it.
  searchIcons: "Search icons",
  iconsCount: (n) => (n === 1 ? "1 icon" : `${n} icons`),
  iconsNone: "No icon matches that.",
  unsupportedSpaceTitle: (kind) =>
    kind ? `"${kind}" space` : "Space without a type",
  unsupportedSpaceBody:
    "This version of Jott does not know how to show this space. " +
    "Its files are untouched — a newer version may support it.",
  spaceNoLists: "No list in this space yet.",
  // Inline naming, groups, trash, tags.
  cancel: "Cancel",
  create: "Create",
  newTask: "New task",
  // What the single list of a tasks space is CALLED. Its file is
  // `task-list.md` in every space — a structural name, never meant to be
  // read (services/paths.js → listTitle).
  mainList: "Inbox",
  noTasksYet: "No tasks yet",
  // The ⋮ of a space's own screen: arrangement and bulk selection.
  spaceOptions: "space options",
  selectTasks: "Select tasks…",
  selectedCount: (n) => `${n} selected`,
  moveTo: "Move to…",
  deleteSelected: "Delete",
  // Deleting twelve must ask what deleting one asks.
  confirmDeleteTasks: (n) => (n === 1 ? "Delete 1 task?" : `Delete ${n} tasks?`),
  confirmDeleteNotes: (n) => (n === 1 ? "Delete 1 note?" : `Delete ${n} notes?`),
  sortFileOrder: "File order",
  sortByName: "Sort by name",
  sortByType: "Sort by type",
  searchTag: (name) => `Search #${name}`,
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
  // The tasks screen's ⋮: the sortings open a submenu.
  sortTasks: "Sort",
  pinTask: "Pin to top",
  unpinTask: "Unpin",
  confirmDeleteGroup: (name) =>
    `Delete the group "${name}"? What it holds moves up one level; the group goes to the trash.`,
  trashTitle: "Trash",
  trashEmpty: "The trash is empty.",
  // Under the title of the empty trash: what the screen is FOR, said once
  // instead of a hint that repeats on every visit.
  trashEmptyHint: "Anything you delete waits here, and can be put back.",
  trashLoading: "Reading the trash…",
  // The kind filter over the trash list; the counts say how many of each
  // are waiting.
  trashAll: "All",
  trashTasks: "Tasks",
  trashFiles: "Files",
  trashKindTask: "task",
  trashKindFile: "file or folder",
  trashNoneOfKind: "Nothing of this kind in the trash.",
  restore: "Restore",
  trashHint: "Deleted items wait here before they are cleared for good.",
  // The countdown the reaper acts on (`trash::days_left`), in the row.
  trashDaysLeft: (n) => (n <= 0 ? "clears today" : n === 1 ? "1 day left" : `${n} days left`),
  trashKeptForever: "kept until you restore it",
  // The one destructive act besides the reaper. The dialogs say "for good"
  // because nothing else in the app is.
  restoreItem: "Restore",
  deleteForever: "Delete forever",
  emptyTrash: "Empty trash",
  confirmDeleteForever: (label) => `Delete "${label}" for good?`,
  confirmEmptyTrash: (n) => (n === 1 ? "Delete the 1 item for good?" : `Delete all ${n} items for good?`),
  deleteForeverDetail: "This cannot be undone — it is the one thing in Jott that is not kept.",
  tagsTitle: "Tags",
  tagsEmpty: "No tags yet. Add one from a task.",
  tagsEmptyHint: "Type #word in a task, or name a tag here so the picker offers it.",
  tagsLoading: "Counting the tags…",
  // The Tags screen lists every #word in use, not only the coloured ones.
  tagsFilter: "Filter tags",
  tagsFilterEmpty: "No tag matches that.",
  tagUses: (n) => (n === 0 ? "not in use" : n === 1 ? "1 task" : `${n} tasks`),
  tagUncatalogued: "not in the picker yet",
  newTagName: "New tag name",
  // A label now, not a caption: the control is the trash glyph.
  deleteTag: "Delete tag",
  confirmDeleteTag: (name) => `Delete the tag "${name}"?`,
  // Removing a tag only forgets the colour (core: `remove_tag`) — the detail
  // must not promise a trash trip that never happens.
  tagTextStays: "It leaves the picker; the #tag text in tasks stays.",
  deleteTask: "Delete task",

  // App Functions: which parts of the app are switched on.
  featureTasks: "Tasks",
  featureNotes: "Notes",
  featureSubtasks: "Subtasks",
  featureTaskTags: "Task tags",
  featureDueDate: "Complete date",
  featureRepeat: "Repeat",
  featurePriority: "Priority",
  featureDescription: "Description",
  featureFiles: "Add files",
  featureRemind: "Remind me",
  featureBanners: "Banners",
  featureWikiLinks: "WikiLinks [[ ]]",
  featureEmbeds: "Embedded images and files",
  featureNoteFolders: "Note folders",
  featurePinNotes: "Pin notes",
  featureNoteTags: "Note tags",
  noteCreated: "created",
  noteTags: "tags",
  featureTables: "Tables",
  featureFixedSpaces: "Fixed spaces",
  fixedSpacesHelp: "What hiding a fixed space does",
  // The ? beside a setting: the explanation, off the page until asked.
  helpAbout: (label) => `About ${label}`,
  fixedSpacesHelpIntro:
    "The app's own spaces — Home, Tasks and Notes — as sidebar shortcuts " +
    "and screens. Hiding one only takes it off the interface: the files " +
    "stay, and everything returns when the space does.",
  fixedSpacesHelpTasks:
    "Tasks: hiding the screen hides the Inbox. The day lives on the Home, " +
    "and stays: a task can still be pulled into today from any list.",
  fixedSpacesHelpNotes:
    "Notes: quick notes can go to another notepad; the notes written today " +
    "still show on the Home.",
  // Named "<Name> space", not the bare name: the bare "Tasks" would be the
  // second switch on the page wearing the label of the first — ambiguous to
  // a screen reader and to the settings search alike.
  featureHomeSpace: "Home space",
  featureTasksSpace: "Tasks space",
  featureNotesSpace: "Notes space",

  // The time axis: the function and its one screen so far.
  featureTime: "Time",
  featureTimeline: "Timeline",
  timelineGhostTasks: "Name deleted tasks in the Timeline",
  timelineGhostNotes: "Name deleted notes in the Timeline",
  timelineGhostHint:
    "Off, a deleted item is only counted — \u201c3 deleted tasks\u201d " +
    "in the colour of its space. The log keeps the name either way; to " +
    "drop the line itself, use \u201cRemove from timeline\u201d on the item.",

  // The Timeline screen.
  timeline: "Timeline",
  myTimeline: "My Timeline",
  thisMonth: "This month",
  statNotes: "Notes",
  statTasks: "Tasks",
  statCompleted: "Completed",
  tasksCreated: (n) => (n === 1 ? "1 Task created" : `${n} Tasks created`),
  tasksCompleted: (n) => (n === 1 ? "1 Task completed" : `${n} Tasks completed`),
  notesCreated: (n) => (n === 1 ? "1 Note created" : `${n} Notes created`),
  deletedTasks: (n) => (n === 1 ? "1 deleted task" : `${n} deleted tasks`),
  deletedNotes: (n) => (n === 1 ? "1 deleted note" : `${n} deleted notes`),
  deletedTask: "Deleted task",
  deletedNote: "Deleted note",
  nothingInTimeline: "Nothing here yet.",
  nothingInTimelineHint: "Every task and note you write lands here, on the month it was born.",
  removeFromTimeline: "Remove from timeline",
  removeFromTimelineDetail:
    "This forgets it from the log for good — the task or note itself is not touched.",
  timelineLoadingYear: (year) => `Reading ${year}\u2026`,
  goToYear: (year) => `Go to ${year}`,
  // A repeating task writes one item per occurrence, and they fold into one
  // row (services/timeline.js). The count is a multiplication sign and a
  // number — the shortest thing that reads as "this happened N times" — and
  // the title spells it out for a screen reader, which cannot say "×".
  timelineTimes: (n) => `\u00d7${n}`,
  timelineOccurrences: (n) => `${n} occurrences this month`,
  timelineOptions: "timeline item options",

  // The shortcuts table in Settings.
  sectionShortcuts: "Shortcuts",
  sectionShortcutsHint: "Click a key to record a new one. Escape keeps it.",
  // Named for what the user is DOING, not for the word the code uses.
  shortcutScope: (scope) =>
    ({
      global: "Anywhere",
      tasks: "In a task list",
      editor: "While writing a note",
    })[scope] ?? scope,
  pressAKey: "Press a key…",
  noShortcut: "None",
  changeShortcut: "Record a new key",
  clearShortcut: "Remove this key",
  shortcutNotBindable: "That would swallow typing",
  shortcutTaken: (name) => `Already: ${name}`,
  resetShortcuts: "Reset to defaults",

  formatting: "Formatting",
  // WHERE the controls sit, not whether they exist: the choice is a place.
  formattingDocked: "In the side panel",
  formattingFloating: "Floating over the note",
  // The button beside the floating bar says where the controls GO, not what
  // it does to them — the panel is a place.
  formattingDock: "Dock the formatting panel",
  noteTextSize: "Text size",
  noteSizeSmall: "Small",
  noteSizeMedium: "Medium",
  noteSizeLarge: "Large",
  noteFontSizeLabel: "Note text size",

  // The floating formatting bar of an open note. Display, so it answers to
  // this screen. On a phone there is no floating bar: the controls ride
  // above the keyboard.
  formatBarLabel: "Formatting bar",
  formatBarFloating: "Floating",
  formatBarPanel: "In the side panel",
  formatBarOff: "Off",
  formatBarHint:
    "How the bar opens with a note. While the note is open, the ⋮ menu " +
    "moves it between floating and the side panel.",
  formatBarSideLabel: "Bar position",
  formatBarSideTop: "Top",
  formatBarSideLeft: "Left",
  formatBarSideRight: "Right",
  formatBarSideBottom: "Bottom",

  // Commands: the name of every keyboard command, read by the shortcuts
  // table and the panel's tooltips — the imperative the user would say.
  cmdNewTask: "New task",
  cmdNewNote: "New note",
  cmdSearch: "Search",
  cmdSearchEverywhere: "Search the whole notebook",
  cmdNotebooks: "Notebooks",
  cmdSettings: "Settings",
  cmdFullscreen: "Fullscreen",
  cmdToggleSidebar: "Show/hide the sidebar",
  cmdRename: "Rename what is open",
  cmdZoomIn: "Zoom in",
  cmdZoomOut: "Zoom out",
  cmdZoomReset: "Reset zoom",
  cmdNewTab: "New tab",
  cmdCloseTab: "Close tab",
  cmdNextTab: "Next tab",
  cmdPreviousTab: "Previous tab",
  cmdLastTab: "Last tab",
  cmdGoToTab: (n) => `Go to tab ${n}`,
  cmdBack: "Back",
  cmdForward: "Forward",
  cmdTaskUp: "Select the task above",
  cmdTaskDown: "Select the task below",
  cmdTaskOpen: "Open the task",
  cmdTaskComplete: "Complete/reopen the task",
  cmdTaskMoveUp: "Move the task up",
  cmdTaskMoveDown: "Move the task down",
  cmdTaskDelete: "Delete the task",
  cmdTaskDuplicate: "Duplicate the task",
  cmdBold: "Bold",
  cmdItalic: "Italic",
  cmdStrike: "Strikethrough",
  cmdInlineCode: "Inline code",
  cmdLink: "Link",
  cmdHeading: (n) => `Heading ${n}`,
  cmdParagraph: "Plain paragraph",
  cmdBulletList: "Bullet list",
  cmdOrderedList: "Numbered list",
  cmdTaskList: "Checkbox",
  cmdQuote: "Quote",
  cmdRule: "Horizontal rule",
  cmdReplace: "Find and replace",
  // The panel's second row and its last two.
  cmdUnderline: "Underline",
  cmdIndent: "Indent",
  cmdOutdent: "Outdent",
  cmdReference: "Link to a note",
  cmdAttach: "Insert a file",
  cmdUndo: "Undo",
  cmdRedo: "Redo",
  // The app's own pair (scope global), named apart from the editor's so the
  // Shortcuts page does not list "Undo" twice.
  cmdUndoAction: "Undo last action",
  cmdRedoAction: "Redo last action",
  // What the shell says after one. `actionName` turns the command the bridge
  // answered into words; a command the table has not met still reads.
  undone: (what) => `Undone: ${what}`,
  redone: (what) => `Redone: ${what}`,
  nothingToUndo: "Nothing to undo",
  nothingToRedo: "Nothing to redo",
  undoStale: "That can't be undone: the files changed since (a sync, another window).",
  // The floating offer (services/undoOffer.js): one line, one button.
  undoOfferText: (command) => UNDO_OFFERS[command] ?? S.actionName(command),
  undoOfferAction: "Undo",
  undoOfferGone: "Something else changed since, so nothing was undone. Ctrl+Z steps back through it all.",
  actionName: (command) => ACTION_NAMES[command] ?? command.replaceAll("_", " "),
  // What the openers of the narrow bar say. They open nothing but more
  // buttons, so they are named after what is INSIDE them.
  formatMarks: "Text style",
  formatHeadings: "Heading",
  formatBlocks: "Block",
  formatLists: "List",
  formatInsert: "Insert",
  // Tables.
  formatTable: "Table",
  cmdTableInsert: "Insert table",
  cmdTableAddColumn: "Add column to the right",
  cmdTableAddRow: "Add row below",
  cmdTableDeleteColumn: "Delete column",
  cmdTableDeleteRow: "Delete row",
  cmdTableDelete: "Delete table",
  tableColumn: "Column",
  tableCell: "Table cell",
  tableHeaderCell: "Header cell",
  tableMoveColumn: "Move column",
  tableMoveRow: "Move row",

  // Settings
  settings: "Settings",
  settingsSaved: "Saved.",
  // The label above the menu of sections. It names the LIST, not the screen:
  // a second group of the menu would get a label of its own beside it.
  settingsSections: "Settings",
  // The second block of the menu: what the app can DO. Its rows are a door
  // into a group, which is why neither carries an icon.
  settingsFunctions: "App functions",
  sectionNative: "Native Functions",
  sectionNativeHint:
    "Everything Jott can do. Switching one off takes it out of the whole " +
    "interface — sidebar, tabs, buttons — and touches nothing on disk: your " +
    "files keep every field, and it all comes back when you switch it on.",
  // The arrow at the end of a function's row. It needs a name of its own: the
  // switch beside it already carries the function's, and two controls answering
  // to one name is two controls nobody can tell apart by voice or by test.
  openFunction: (name) => `${name} options`,
  sectionDates: "Date preferences",
  // The page's other name, for the search index: it decides what a day IS
  // — when it turns, what the calendar strip starts on.
  sectionDay: "Day and calendar",
  sectionDisplay: "Display",
  // Whose answers these are — said once at the top of the section, not on
  // each row.
  sectionDisplayHint:
    "These answer for this device, not for the notebook — a phone can be dark " +
    "while the desktop stays in Jott's own. Until one is chosen here, the " +
    "notebook's own choice is what shows.",
  sectionNotebook: "Notebook",
  rolloverMode: "At midnight, unfinished tasks",
  rolloverModeReset: "go back to suggestions",
  rolloverModeCarry: "stay pulled",
  weekStartsOn: "Week starts on",
  subCalendar: "Calendar",
  datedTasksJoinPeriod: "A task with a date joins its day",
  datedTasksJoinPeriodHint:
    "On by default: a task dated for the 5th shows up on the 5th on its own, " +
    "and one that is overdue shows up today. Nothing is written to the " +
    "notebook — take the date away and it leaves. Off, a day is a 100% " +
    "deliberate choice and a date only ranks the suggestions.",
  monday: "Monday",
  sunday: "Sunday",
  dateFormat: "Date format",
  mode: "Mode",
  modeJott: "Jott",
  modeJottHint: "Black frame, white page.",
  modeLight: "Light",
  modeLightHint: "Light throughout.",
  modeDark: "Dark",
  modeDarkHint: "Dark throughout.",
  theme: "Theme",
  // Themes the reader brought into the notebook. The hint names the folder
  // because that IS the whole installation procedure — no import button.
  themeJott: "Jott",
  themeJottMeta: "the app's own",
  themesFromNotebookHint:
    "A theme is a .css file — or a folder with theme.css inside — in " +
    ".jott/themes/. It sets the colours, spacing and radius, and wears any " +
    "mode. Saving the file repaints the app.",
  themeBy: (author) => `by ${author}`,
  themeNeedsNewerApp: (version) =>
    `Made for Jott ${version} or newer — parts of the app may go unpainted.`,
  themeUnreadable: "This one could not be read. The app is wearing its own.",
  newThemeAction: "New theme from this one",
  themeBlockedRefs: (n) =>
    n === 1
      ? "1 address pointing off this machine was blocked."
      : `${n} addresses pointing off this machine were blocked.`,
  accentColor: "Accent colour",
  headingColor: "Headings",
  headingColorAccent: "Accent",
  headingColorAccentHint: "Titles take the colour of the place they live in.",
  headingColorInk: "Ink",
  headingColorInkHint: "Titles in plain text colour, like a document.",
  restoreLastScreen: "Reopen on the last screen",
  showListCounts: "Show task counts in the sidebar",
  autoUrgentByDate: "Treat overdue tasks as urgent",
  newTasksGoTo: "New tasks go to",
  newTasksTop: "Top of the list",
  newTasksBottom: "Bottom of the list",
  autoUrgentByDateHint:
    "The #urgent tag written by hand always counts, either way.",
  autoRemind: "Remind me about dated tasks",
  autoRemindOff: "Never",
  autoRemindDayOf: "On the due day",
  autoRemindDayBefore: "The day before",
  autoRemindBoth: "The day before and on the due day",
  reminderTime: "Reminder time",
  autoRemindHint:
    "A task with a reminder of its own keeps it. Presets in the task panel land on the reminder time too.",
  closeToTray: "Keep Jott running in the tray when the window closes",
  closeToTrayHint:
    "Reminders ring while Jott waits in the tray. On GNOME the tray icon needs the AppIndicator extension.",
  autostart: "Start Jott with the system",
  autostartHint: "Opens hidden in the tray.",
  quitApp: "Quit Jott",
  closeOnClickAway: "Close the task panel when clicking outside",
  quickNoteFolder: "Quick note goes to",

  // The function pages. One subtitle per group of rows.
  subColours: "Colours",
  subText: "Text",
  subEditor: "Editor",
  subInterface: "Interface",
  subLocation: "Location",
  subSafety: "Safety",
  resetSection: "Reset this section",
  resetSectionTitle: "Reset this section?",
  resetSectionDetail: "Every option on this page goes back to what the app ships with.",
  resetSectionAction: "Reset",
  autoSpaceColors: "Rainbow sidebar",
  autoSpaceColorsHint:
    "Each space and group takes the next of the seven colours, in sidebar order, starting from the accent. Colours chosen by hand are set aside while this is on.",
  subKeeping: "Keeping",
  notebookContents: "Notebook contents",
  notebookContentsLine: ({ notes, tasks, files, bytes }) => {
    const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;
    const mb = bytes / (1024 * 1024);
    const size = mb < 0.1 ? `${Math.ceil(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
    return `${n(notes, "note", "notes")} \u00b7 ${n(tasks, "task", "tasks")} \u00b7 ${n(files, "file", "files")} \u00b7 ${size}`;
  },
  shortcutFilter: "Filter commands",
  subScreens: "Screens",
  subBehaviour: "Behaviour",
  subFields: "Fields",
  subNoteHas: "What a note can have",
  subBoard: "Board",
  noteLayout: "Default layout",
  // The fixed Tasks screen: the Inbox alone, or every list arranged by space.
  subTasksScreen: "Tasks screen",
  /// The screen's own title when it shows every list.
  allListsTitle: "All lists",
  tasksShowAll: "Tasks screen shows",
  tasksShowAllInbox: "the Inbox only",
  tasksShowAllEvery: "every list, arranged by space",
  // The task panel's card: the fields that are off, and the door to
  // Settings › Tasks.
  moreFieldsTitle: "Tasks can do more",
  moreFieldsBody: (names) => `Switched off right now: ${names}.`,
  moreFieldsOpen: "Add functions",
  moreFieldsDismiss: "Not now",
  quickTasksGoTo: "Quick tasks go to",
  subTables: "Tables",
  tableLayout: "Wide tables",
  tableLayoutFit: "Fit the content width",
  tableLayoutScroll: "Scroll sideways",
  noteLayoutHint:
    "How a notes space draws its board until it chooses for itself — each " +
    "space keeps its own choice, from its ⋮ → Layout.",
  subImages: "Images",
  featureBannersHint:
    "The colour or picture at the head of a note. Off, the editor draws no " +
    "band and the card is title and preview — the <!--banner:--> line in the " +
    "file stays exactly where it is.",
  confirmDeletes: "Ask before deleting",
  confirmDeletesHint:
    "Nothing is destroyed either way: a deleted note, list, space or file " +
    "goes to .jott/trash/ and comes back to where it was.",
  confirmImageDownloads: "Ask before downloading an image",
  confirmImageDownloadsHint:
    "Pasting a picture copied from a web page hands Jott an address, not a " +
    "file, so drawing it means fetching it. The question says which site is " +
    "being contacted.",

  // Notebook / Location.
  openNotebookFolder: "Open notebook folder",
  openNotebookFolderAction: "Open",
  switchNotebook: "Switch notebook",
  switchNotebookAction: "Choose…",

  // Display / Text.
  interfaceZoom: "Interface zoom",
  interfaceZoomHint: "The same thing Ctrl + and Ctrl − do.",

  // The search over every row of every page.
  settingsSearch: "Search settings",
  settingsSearchEmpty: "Nothing here matches that.",
  // The three faces (Display). The default row names the face the app
  // carries, so "Default" is never a mystery.
  interfaceFontLabel: "Interface font",
  noteFontLabel: "Note font",
  monoFontLabel: "Monospace font",
  fontDefault: (name) => `Default (${name})`,
  fontDefaultNote: "Same as the interface",
  fontGeneric: "This system",
  fontInstalled: "Installed",
  fontsNotListed: "Installed fonts are only listed on Linux.",
  settingsSearchIn: (section) => `in ${section}`,
  completedRetention: "Clear completed after (days)",
  completedRetentionHint:
    "A finished task leaves its Completed list after this many days and waits " +
    "in the trash, so it is still recoverable. 0 keeps it forever.",
  trashRetentionHint: "0 keeps deleted items until you clear them yourself.",
  trashRetention: "Empty the trash after (days)",
  notebookPath: "Folder",
  readOnlyNotice:
    "This notebook was written by a newer version of Jott and is open for reading only.",

  // About: what this app IS, next to what version it is.
  sectionAbout: "About",
  subVersion: "Version",
  subSystem: "System",
  subHelp: "Help",
  yourFiles: "Your files",
  yourFilesHint:
    "Every notebook documents its own format, in plain text, inside " +
    ".jott/_FORMAT.txt — so your notes stay readable without Jott.",
  yourFilesAction: "Open the folder",
  reportIssue: "Report an issue",
  reportIssueAction: "Open GitHub",
  updateVersion: "Version",
  updateAutoCheck: "Check for updates automatically",
  updateAutoCheckHint:
    "Once a day, Jott asks github.com for the number of the latest release — the only connection the app ever makes, and nothing about you or your notebook travels with it. Off means checking stays yours, with the button below.",
  updateCheckNow: "Check now",
  updateChecking: "Checking…",
  updateUpToDate: "You have the latest version.",
  updateAvailable: (version) => `Version ${version} is available.`,
  updateBanner: (version) => `A new version of Jott is out: ${version}.`,
  updateInstall: "Update and restart",
  updateInstalling: "Updating…",
  updateDownload: "Download",
  updateDismiss: "Later",

  // The application menu. Only an AppImage sees these: a deb/rpm/pacman Jott
  // was put in the menu by its package manager.
  menuEntryBanner: "Jott is running as a single file, so it is not in your applications menu yet.",
  menuEntryAdd: "Add to menu",
  menuEntryAdding: "Adding…",
  menuEntryDismiss: "No thanks",
  menuEntryLabel: "Show in applications menu",
  menuEntryHint:
    "Writes a launcher and an icon into your home folder (~/.local/share) so Jott shows up in the applications list and in search, the way an installed app does. It points at this file where it is now — move the file and switch this off and on again. Nothing outside your home folder is touched.",

  // Shell
  home: "Home",
  tasks: "Tasks",
  inboxTab: "Inbox",
  openInNewTab: "open in new tab",
  // The same gesture as a menu row: the tooltip above is a hint on a control
  // that already answers the middle button, this is a line the user reads.
  openInNewTabItem: "Open in new tab",
  closeTab: "close tab",
  newTab: "new tab",

  // Title bar window controls (frameless window)
  minimizeWindow: "minimize",
  maximizeWindow: "maximize",
  closeWindow: "close window",
  goBack: "back",
  goForward: "forward",
  pageMenu: "page menu",

  // The compact shell (below 768px). The tab strip is a sheet, so its button
  // has to SAY how many tabs are behind it.
  openTabs: (count) => (count === 1 ? "1 open tab" : `${count} open tabs`),
  openSidebar: "open sidebar",
  closeSheet: "close",
  closeComposer: "close the new task bar",
  // The note's find & replace panel (services/searchPanel.js).
  noteFindPlaceholder: "Find",
  noteReplacePlaceholder: "Replace with",
  findNext: "next match",
  findPrevious: "previous match",
  findOptions: "search options",
  findMatchCase: "Match case",
  findByWord: "Whole words",
  findRegexp: "Regular expression",
  findClose: "close search",
  replaceOne: "Replace",
  replaceAll: "All",
  // The Home's +: a task or a note, for the day the calendar has open.
  capture: "new",
  // The two choices the + opens (components/CaptureFab.svelte).
  task: "Task",
  note: "Note",
  todaysTasks: "Today tasks",
  todaysNotes: "Today notes",
  /// The blocks of a day that is not today, named by the day: "Sep 5 tasks".
  dayTasks: (day) => `${day} tasks`,
  /// The strip's head: the month beside the title, and the day's own line
  /// once the head has scrolled away on a phone ("Sep 3").
  shortDay: (month, day) => `${month.slice(0, 3)} ${day}`,
  backToToday: "back to today",
  previousWeek: "previous week",
  nextWeek: "next week",
  showOverview: "show the day's summary",
  hideOverview: "hide the day's summary",
  // The head's three heights on a phone: name and date, the week, the week
  // and the summary. The grip's label says what the next tap does.
  showWeek: "show the week",
  hideWeek: "show less",
  goodMorning: "Good morning",
  goodAfternoon: "Good afternoon",
  goodEvening: "Good evening",
  tasksDone: (done, total) => `${done} of ${total} ${total === 1 ? "task" : "tasks"} done today.`,
  /// A day gone by, in one line: the three counts of the recap,
  /// comma-separated, "completed" and never "done".
  daySummary: ({ done, created, notes }) =>
    [
      `${done} ${done === 1 ? "task" : "tasks"} completed`,
      `${created} ${created === 1 ? "task" : "tasks"} created`,
      `${notes} ${notes === 1 ? "note" : "notes"} created`,
    ].join(", ") + ".",
  tasksPlanned: (n) => `${n} ${n === 1 ? "task" : "tasks"} planned.`,
  nothingThatDay: "Nothing happened that day.",
  inboxNotes: "Inbox notes",
  inboxTasks: "Inbox tasks",
  quickNoteTo: "to",
  newTaskPlaceholder: "New task…",
  notesOptions: "notes options",
  noNotesToday: "No notes written today.",
  collapseSidebar: "collapse sidebar",
  expandSidebar: "expand sidebar",
  untitled: "Untitled",

  // Notes
  notes: "Notes",
  // The board's ⋮, where creating lives: menu items and the quick-note bar.
  newNote: "New note",
  newNoteTitle: "New note",
  promptNewNote: "Title of the new note:",
  promptRenameNote: (title) => `New title for "${title}":`,
  promptNewNoteFolder: "Name of the new folder:",
  newNoteFolder: "New group",
  // A folder of notes is a card on the board, with the same two controls a
  // note card has.
  folderOptions: "folder options",
  renameFolder: "Rename",
  deleteFolder: "Delete",
  promptRenameFolder: (name) => `New name for "${name}":`,
  confirmDeleteFolder: (name) =>
    `Delete the folder "${name}"? Its notes and subfolders move up one level — nothing is deleted.`,
  folderEmptied: (count, name) =>
    `${count} item(s) from "${name}" moved up one level.`,
  confirmDeleteNote: (title) => `Delete "${title}"? This cannot be undone.`,
  noNotes: "No notes yet.",
  allNotes: "All notes",
  emptyNote: "Empty note",
  pin: "Pin",
  unpin: "Unpin",
  deleteNote: "Delete",
  renameNote: "Rename",
  noteBodyPlaceholder: "Write here…",
  layout: "Layout",
  gridView: "Grid",
  treeView: "Folders",
  // The bar under the title: type the note itself, press + (or Enter) to file
  // it. Shift+Enter is a new line, which is why the field is a textarea.
  quickNote: "Quick note…",
  addNote: "Create the note",
  duplicateNote: "Duplicate",

  // Lists
  newTaskPlaceholder: "New task…",
  addTask: "Add",
  emptyList: "No tasks in this list.",
  pullToToday: "→ Today",

  // The day
  suggestionsTitle: "Suggestions",
  // The right panel's heading — it says which day it would pull into.
  suggestionsForDay: "Suggestions for today",
  suggestionsFor: (day) => `Suggestions for ${day}`,
  noSuggestions: "No tasks available.",
  groupUrgent: "Urgent",
  groupSoon: "Soon",
  // Was in Today and left — taken out by hand, or dropped when the day turned.
  groupRecent: "Pulled recently",
  pull: "pull",

  // Completed
  nothingCompleted: "Nothing completed yet.",
  goesBackTo: (name) => `back to ${name}`,

  // Task row and inspector
  complete: "complete",
  uncheck: "uncheck",
  taskRowHint: "click to open, double-click to rename",
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
  addFilesLabel: "Add files",
  deleteTask: "delete task",
  moveToList: "move to list",
  subtaskLabel: (text) => `subtask: ${text}`,
  newSubtaskPlaceholder: "New subtask…",
  removeSubtask: "remove subtask",
  tagsTitle: "Tags",
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
  weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  priorityLabel: "Priority",
  priorityNone: "none",
  priorityHigh: "high",
  priorityMedium: "medium",
  priorityLow: "low",
  repeatLabel: "Repeat",
  remindLabel: "Remind me",
  addReminder: "add reminder",
  clearReminder: "clear reminder",
  clearReminderHint: "clear",
  remindLaterToday: "Later today",
  remindTomorrow: "Tomorrow",
  remindNextWeek: "Next week",
  remindOnDue: "On the due date",
  remindPick: "Pick date and time…",
  remindTimeLabel: "reminder time",
  remindDateLabel: "reminder date",
  reminderTitle: "Reminder",
  reminderDueTitle: "Task due",
  repeatEvery: "every",
  noRepeat: "never",
  repeatDays: "day",
  repeatWeeks: "week",
  repeatMonths: "month",

  // Notebook-wide search. Prefixed `find*` because `search*` already names
  // the notes board's own box.
  findTitle: "Search",
  findPlaceholder: "Search tasks and notes…",
  findHint: "Type to search the whole notebook.",
  findNothing: (query) => `Nothing found for “${query}”.`,
  findTasks: "Tasks",
  findNotes: "Notes",
  findMore: "Showing the first matches only — narrow the search to see the rest.",
  findDone: "completed",
  // The same box, narrowed to one space. It says which one.
  findIn: (place) => `Search in ${place}…`,
  findHintIn: (place) => `Type to search ${place}.`,
  findNothingIn: (query, place) => `Nothing found for “${query}” in ${place}.`,

  // The page ⋮ and the canvas right-click menu: what can be done to the
  // SCREEN itself, wherever the pointer is.
  renameThisSpace: "Rename space",
  openInFileManager: "Open in file manager",
  findInPlace: (place) => `Find in ${place}`,
  findInNote: "Find in note",
  replaceInNote: "Replace in note",
  thisNotebook: "this notebook",

  // The sidebar head: search, and the + that makes things.
  search: "search",
  newEntry: "new list, notepad or group",
  resizeSidebar: "resize sidebar",
  resizePanel: "resize panel",
  sidebarWidthValue: (px) => `sidebar width: ${px} pixels`,

  // The file library: one folder the whole notebook shares. Images are drawn;
  // anything else is a file a task points at.
  assetsTitle: "Files",
  assetsHint:
    "Every file you add lives in the notebook's assets folder. Notes and tasks " +
    "point at it by address, so moving them never breaks a link.",
  assetsEmpty: "No files yet.",
  addImages: "Add files",
  addingImages: "Adding…",
  copyAddress: "Copy address",
  addressCopied: "Address copied",
  deleteImage: "Delete file",
  confirmDeleteAsset: (name) =>
    `Delete "${name}"? It goes to the trash, and whatever points at it will point at nothing.`,
  imageCount: (n) => (n === 1 ? "1 file" : `${n} files`),
  imageSize: (kb) => (kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`),
  missingImage: "image not found",
  // The age stamp on a card: short, because it sits in a meta row. The words
  // are in the tooltip.
  ageDays: (days) => (days === 0 ? "today" : `${days}d`),
  lastSeenOn: (date) => `Last opened ${date}`,
  createdLabel: "Created",
  neverOpened: "Never opened in Jott",
  createdOn: (date) => `Created ${date}`,
  // The picker, when what is being asked for is a picture and not any file.
  chooseImageOnly: "Only an image can be a banner or go inside a note.",
  openFile: "Open file",
  removeAttachment: "Remove attachment",

  // The note's banner — a colour or a picture at the head of a note, on its
  // first line.
  banner: "Banner",
  bannerOptions: "banner options",
  bannerColor: "Colour",
  // The eight palette names, written out for a MENU — the picker shows
  // swatches and needs none of these, but a row of a menu is a word.
  colorName: (name) =>
    ({
      yellow: "Yellow",
      orange: "Orange",
      pink: "Pink",
      green: "Green",
      blue: "Blue",
      red: "Red",
      purple: "Purple",
      neutral: "Neutral",
    })[name] ?? name,
  bannerImage: "Choose image…",
  removeBanner: "Remove banner",
  chooseImage: "Choose an image",
  chooseFile: "Choose a file",
  insertImage: "Insert image…",
  // Links between notes. A title that names no note is worth saying out loud.
  noteNotFound: (title) => `No note called “${title}”.`,

  // A drag or a paste that declared a file and carried none. The types are in
  // the message on purpose: the only clue to what the desktop actually sent.
  noFileInGesture: (types) =>
    `Nothing could be read from that${types.length ? ` (${types.join(", ")})` : ""}.`,

  // Deleting, in the app's own dialog: the second sentence is where "nothing
  // is destroyed" gets said.
  deleteAction: "Delete",
  dontAskAgain: "Don’t ask again",
  goesToTrash: "It goes to the trash, and can be restored from there.",
  assetInUseWarning: (n) =>
    n === 1
      ? "One note or task is showing this file. That link will stop working."
      : `${n} notes and tasks are showing this file. Those links will stop working.`,

  // Fetching a picture from the internet — the one thing the app does that
  // leaves the machine, so it says WHERE to.
  downloadImageTitle: "Download this picture?",
  downloadImageBody:
    "This picture is not on your computer. To put it in the note, Jott has to fetch it from:",
  downloadImageConfirm: "Download",

  renameFile: "Rename",
  promptRenameFile: (name) => `Rename “${name}”`,
  assetUnused: "Not used",
  assetUsedIn: (n) => (n === 1 ? "Used in 1 place" : `Used in ${n} places`),
  assetGoTo: (title) => `Go to “${title}”`,

  // Picking notes on the board, the way tasks are picked.
  selectNotes: "Select notes…",
  moveNotesTo: "Move to…",
  notesFolderCount: (n) => (n === 1 ? "1 note" : `${n} notes`),
  openFolder: (name) => `open ${name}`,
  backToBoard: "Back",
  noteOptions: "note options",
};
