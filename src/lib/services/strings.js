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
  browseFolders: "Choose a folder",
  parentFolder: "Up one folder",
  newFolder: "New folder",
  newFolderName: "Name for the new folder:",
  useThisFolder: "Use this folder",
  noSubfolders: "No folders here.",
  existingNotebook: "notebook",
  today: "Today",
  week: "Week",
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
  conflictsTitle: (count) => `${count} sync conflict(s) in this notebook`,
  conflictsBody:
    "Another device edited the same files. Jott does not choose for you — " +
    "open the folder and decide which version stays.",
  dismissError: "ok",

  // Spaces (phase 7.5)
  readOnlySpace: "read-only (newer version)",
  missingSpace: "This page is no longer in the notebook.",
  // A space has one function, and the interface says which by name when it is
  // being MADE: a tasks one is a LIST, a notes one is a NOTEPAD. "Space" is
  // what the container itself is called, on screen and on disk alike — the app
  // and the file format say the same word since 2026-08-17 (user call), so
  // there is no second vocabulary to translate. Home, Tasks and Notes are the
  // **fixed spaces**.
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
  unsupportedSpaceTitle: (kind) =>
    kind ? `"${kind}" space` : "Space without a type",
  unsupportedSpaceBody:
    "This version of Jott does not know how to show this space. " +
    "Its files are untouched — a newer version may support it.",
  spaceNoLists: "No list in this space yet.",
  // Reestruturação 2026-07-30 — inline naming, groups, trash, tags.
  cancel: "Cancel",
  create: "Create",
  newTask: "New task",
  // What the single list of a tasks space is CALLED. Its file is
  // `task-list.md` in every space — a structural name, never meant to be
  // read (services/paths.js → listTitle).
  mainList: "Inbox",
  noTasksYet: "No tasks yet",
  // The ⋮ of a space's own screen: arrangement and bulk selection (Etapa 1).
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
  // A label now, not a caption: the control is the trash glyph.
  deleteTag: "Delete tag",
  confirmDeleteTag: (name) => `Delete the tag "${name}"?`,
  // What removing a tag actually does (core: `remove_tag`): only the colour
  // is forgotten — the detail must not promise a trash trip that never
  // happens.
  tagTextStays: "Its colour is forgotten; the #tag text in tasks stays.",
  deleteTask: "Delete task",

  // App Functions (2026-08-06): which parts of the app are switched on.
  featureTasks: "Tasks",
  featureNotes: "Notes",
  featureMyDay: "My Day",
  featureWeek: "Week",
  featureSubtasks: "Subtasks",
  featureTaskTags: "Task tags",
  featureDueDate: "Complete date",
  featureRepeat: "Repeat",
  featurePriority: "Priority",
  featureDescription: "Description",
  featureFiles: "Add files",
  featureBanners: "Banners",
  featureWikiLinks: "WikiLinks [[ ]]",
  featureEmbeds: "Embedded images and files",
  featureNoteFolders: "Note folders",
  featurePinNotes: "Pin notes",

  // The shortcuts table in Settings (2026-08-18).
  sectionShortcuts: "Shortcuts",
  sectionShortcutsHint:
    "Click a key to record a new one, Escape to leave it as it was. Bindings " +
    "travel with the notebook, so the same keys answer wherever it is opened.",
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
  // WHERE the controls sit, not whether they exist: writing a note is what
  // they are for, so the choice is a place (user call, 2026-08-19).
  formattingDocked: "In the side panel",
  formattingFloating: "Floating over the note",
  // The button beside the floating bar. It says where the controls GO,
  // not what it does to them — the panel is a place, the same way the two
  // menu items above are.
  formattingDock: "Dock the formatting panel",
  noteTextSize: "Text size",
  noteSizeSmall: "Small",
  noteSizeMedium: "Medium",
  noteSizeLarge: "Large",
  noteFontSizeLabel: "Note text size",
  noteFontSizeHint:
    "How big the body of a note is drawn. The interface's own zoom is the " +
    "other half of the question, and lives on the keyboard (Ctrl +/-).",

  // Commands (2026-08-18): the name of every keyboard command, read by the
  // shortcuts table in Settings and by the formatting panel's tooltips. They
  // are the imperative the user would say out loud, not a description.
  cmdNewTask: "New task",
  cmdNewNote: "New note",
  cmdSearch: "Search",
  cmdSearchEverywhere: "Search the whole notebook",
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
  // The panel's second row and its last two (2026-08-19, wireframe "Format
  // panel").
  cmdUnderline: "Underline",
  cmdIndent: "Indent",
  cmdOutdent: "Outdent",
  cmdReference: "Link to a note",
  cmdAttach: "Insert a file",
  cmdUndo: "Undo",
  cmdRedo: "Redo",
  // What the openers of the narrow bar say. They open nothing but more
  // buttons, so they are named after what is INSIDE them.
  formatMarks: "Text style",
  formatHeadings: "Heading",
  formatBlocks: "Block",
  formatLists: "List",
  formatInsert: "Insert",

  // Settings (phase 9)
  settings: "Settings",
  settingsSaved: "Saved.",
  // The label above the menu of sections (2026-08-20, wireframe "Settings").
  // It names the LIST, which is why it is not the screen's own title repeated:
  // the day this menu gains a second group, that group gets a label of its own
  // beside this one.
  settingsSections: "Settings",
  // The second block of the menu (wireframe "Settings screen mobile",
  // 2026-08-20): what the app can DO, as opposed to how it is set up. Its rows
  // are a door into a group, which is why neither of them carries an icon.
  settingsFunctions: "App functions",
  settingsBackToMenu: "All settings",
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
  // Kept for the notebooks that still name the screen this way, and for the
  // search index: the section was renamed, the subject was not.
  sectionDay: "Day and week",
  sectionDisplay: "Display",
  // Whose answers these are (2026-08-20). Said once at the top of the section
  // rather than on each row: the whole section moved to the machine, and a
  // note repeated eight times reads as a warning instead of a fact.
  sectionDisplayHint:
    "These answer for this device, not for the notebook — a phone can be dark " +
    "while the desktop stays in Jott's own. Until one is chosen here, the " +
    "notebook's own choice is what shows.",
  sectionNotebook: "Notebook",
  rolloverDaily: "When the day turns",
  rolloverWeekly: "When the week turns",
  rolloverMode: "Unfinished tasks",
  rolloverModeReset: "go back to suggestions",
  rolloverModeCarry: "stay pulled",
  rolloverAtHint: "Offset from midnight. -02:00 means 22:00 the evening before.",
  weekStartsOn: "Week starts on",
  datedTasksJoinPeriod: "A task with a date joins the day",
  datedTasksJoinPeriodHint:
    "On by default: a task written for today shows up in Today on its own, " +
    "and in the Week when its date falls inside it. Nothing is written to the " +
    "notebook — take the date away and it leaves. Off, the day is a 100% " +
    "deliberate choice and a date only ranks the suggestions.",
  monday: "Monday",
  sunday: "Sunday",
  dateFormat: "Date format",
  theme: "Theme",
  themeDefault: "Jott",
  themeDefaultHint: "Black frame, white page.",
  themeLight: "Light",
  themeLightHint: "Light throughout.",
  themeDark: "Dark",
  themeDarkHint: "Dark throughout.",
  accentColor: "Accent colour",
  accentColorHint:
    "The colour of the open place, the primary button and every focus ring. Each colour runs from light to dark; the app picks the step that reads on whatever it lands on.",
  headingColor: "Headings",
  headingColorAccent: "Accent",
  headingColorAccentHint: "Titles take the colour of the place they live in.",
  headingColorInk: "Ink",
  headingColorInkHint: "Titles in plain text colour, like a document.",
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
  quickNoteFolderHint:
    "Where the Home's capture box files a note. It names a folder of THIS " +
    "notebook, so it stays with the notebook and not with the device.",

  // The function pages (2026-08-20). One subtitle per group of rows: a
  // function page is a list of what the function HAS, then of how it behaves.
  subText: "Text",
  subInterface: "Interface",
  subLocation: "Location",
  subSafety: "Safety",
  subKeeping: "Keeping",
  dateFormatElsewhere:
    "How a date is WRITTEN answers to this device, so it lives in Display → Interface.",
  shortcutFilter: "Filter commands",
  subScreens: "Screens",
  subFields: "Fields",
  subNoteHas: "What a note can have",
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

  // Notebook / Location (2026-08-20). Both of these were reachable only from
  // somewhere else — the folder from no menu at all, the switch from the
  // sidebar's foot.
  openNotebookFolder: "Open notebook folder",
  openNotebookFolderAction: "Open",
  switchNotebook: "Switch notebook",
  switchNotebookAction: "Choose…",

  // Display / Text (2026-08-20): the zoom was only ever on the keyboard.
  interfaceZoom: "Interface zoom",
  interfaceZoomHint:
    "How big the app itself is drawn — the same thing Ctrl + and Ctrl - do. " +
    "The note's own size is the row above.",

  // The search over every row of every page (2026-08-20).
  settingsSearch: "Search settings",
  settingsSearchEmpty: "Nothing here matches that.",
  settingsSearchIn: (section) => `in ${section}`,
  completedRetention: "Clear completed after (days)",
  completedRetentionHint:
    "A finished task leaves its Completed list after this many days and waits " +
    "in the trash, so it is still recoverable. 0 keeps it forever.",
  trashRetention: "Empty the trash after (days)",
  trashRetentionHint: "0 keeps deleted items until you clear them yourself.",
  notebookPath: "Folder",
  readOnlyNotice:
    "This notebook was written by a newer version of Jott and is open for reading only.",

  // About — was "Updates" until the section grew the other half of its
  // subject (2026-08-20): what this app IS, next to what version it is.
  sectionAbout: "About",
  subVersion: "Version",
  subThisApp: "This app",
  yourFiles: "Your files",
  yourFilesHint:
    "Every notebook documents its own format, in plain text, inside " +
    ".jott/_FORMAT.txt — so your notes stay readable without Jott.",
  yourFilesAction: "Open the folder",
  reportIssue: "Report an issue",
  reportIssueAction: "Open GitHub",
  updateVersion: "This app",
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

  // The application menu (2026-08-21). Only an AppImage ever sees these: a
  // deb/rpm/pacman Jott was put in the menu by its package manager.
  menuEntryBanner: "Jott is running as a single file, so it is not in your applications menu yet.",
  menuEntryAdd: "Add to menu",
  menuEntryAdding: "Adding…",
  menuEntryDismiss: "No thanks",
  menuEntryLabel: "Show in applications menu",
  menuEntryHint:
    "Writes a launcher and an icon into your home folder (~/.local/share) so Jott shows up in the applications list and in search, the way an installed app does. It points at this file where it is now — move the file and switch this off and on again. Nothing outside your home folder is touched.",

  // Shell (phase 8.5)
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

  // The compact shell (below 768px, 2026-08-18). The tab strip is a sheet you
  // pull up rather than a row you read, so its button has to SAY how many are
  // behind it — the count is the only thing left on screen about them.
  openTabs: (count) => (count === 1 ? "1 open tab" : `${count} open tabs`),
  openSidebar: "open sidebar",
  closeSheet: "close",
  // The Home's + on a phone: it opens the two composers rather than being one
  // of them, because Home is the only screen that is neither tasks nor notes.
  capture: "capture",
  todaysTasks: "Today tasks",
  todaysNotes: "Today notes",
  newNoteAction: "New note",
  quickNoteTo: "to",
  // The Home's capture box (2026-08-13). It asks ONE question and both halves
  // of the app answer it.
  captureQuestion: "What do you want to capture?",
  task: "Task",
  note: "Note",
  newTaskPlaceholder: "New task…",
  newNotePlaceholder: "New note…",
  // Its own label, not the tasks block's: with both blocks centred and each
  // ending in a ⋮, one name for both menus named two different things.
  notesOptions: "notes options",
  // The + itself. It says the VERB, while the field says what is being made —
  // sharing "New task" between the two made the box announce the same name
  // twice and left a screen reader with no way to tell them apart.
  captureAction: (kind) => (kind === "note" ? "capture note" : "capture task"),
  noNotesToday: "No notes written today.",
  collapseSidebar: "collapse sidebar",
  expandSidebar: "expand sidebar",
  untitled: "Untitled",

  // Notes (phase 8)
  notes: "Notes",
  // The board's ⋮, where creating lives now (user call, 2026-08-19): the row
  // of buttons above the grid went away, and what it did is menu items and the
  // quick-note bar.
  newNote: "New note",
  newNoteTitle: "New note",
  promptNewNote: "Title of the new note:",
  promptRenameNote: (title) => `New title for "${title}":`,
  promptNewNoteFolder: "Name of the new folder:",
  newNoteFolder: "New group",
  // A folder of notes is a card on the board, and carries the same two
  // controls a note card does (2026-08-19).
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
  pullToWeek: "→ Week",

  // Today / Week
  weekTitle: "This week",
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
  // Was in Today or the Week and left — taken out by hand, or dropped when the
  // period turned (2026-08-17).
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

  // Notebook-wide search (2026-08-14). Prefixed `find*` because `search*`
  // already names the notes board's own box, and two different boxes sharing a
  // label would be a bug waiting to happen.
  findTitle: "Search",
  findPlaceholder: "Search tasks and notes…",
  findHint: "Type to search the whole notebook.",
  findNothing: (query) => `Nothing found for “${query}”.`,
  findTasks: "Tasks",
  findNotes: "Notes",
  findMore: "Showing the first matches only — narrow the search to see the rest.",
  findDone: "completed",
  // The same box, narrowed to one space (2026-08-17). It says which one, or
  // the user cannot tell why the notebook seems to have gone quiet.
  findIn: (place) => `Search in ${place}…`,
  findHintIn: (place) => `Type to search ${place}.`,
  findNothingIn: (query, place) => `Nothing found for “${query}” in ${place}.`,

  // The page ⋮ and the canvas right-click menu (2026-08-17): what can be done
  // to the SCREEN itself, wherever the pointer is.
  renameThisSpace: "Rename space",
  openInFileManager: "Open in file manager",
  findInPlace: (place) => `Find in ${place}`,
  findInNote: "Find in note",
  replaceInNote: "Replace in note",
  thisNotebook: "this notebook",

  // The sidebar head (2026-08-17): search, and the + that makes things.
  search: "search",
  newEntry: "new list, notepad or group",
  resizeSidebar: "resize sidebar",
  resizePanel: "resize panel",
  sidebarWidthValue: (px) => `sidebar width: ${px} pixels`,

  // The file library (2026-08-18): one folder the whole notebook shares,
  // reached from the sidebar's hamburger. Images are drawn (banners, pictures
  // in a note); anything else is a file a task points at.
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
  // The picker, when what is being asked for is a picture and not any file.
  chooseImageOnly: "Only an image can be a banner or go inside a note.",
  openFile: "Open file",
  removeAttachment: "Remove attachment",

  // The note's banner (2026-08-18) — a colour or a picture at the head of a
  // note, written on its first line.
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
  // Links between notes (2026-08-19). A title that names no note is worth
  // saying out loud: the link is a promise the notebook did not keep.
  noteNotFound: (title) => `No note called “${title}”.`,

  // The Images screen saying which files are carrying their weight
  // (2026-08-19). A file nobody points at is room being taken up — worth
  // saying, right beside the button that deletes it.
  // A drag or a paste that declared a file and carried none. The types are in
  // the message on purpose: they are the only clue to what the desktop
  // actually sent, and they turn a mystery into a bug report.
  noFileInGesture: (types) =>
    `Nothing could be read from that${types.length ? ` (${types.join(", ")})` : ""}.`,

  // Deleting, in the app's own dialog rather than the system's (2026-08-19).
  // Nothing in this app is destroyed, and the second sentence is where that
  // gets said — the system dialog had no room for it.
  deleteAction: "Delete",
  dontAskAgain: "Don’t ask again",
  goesToTrash: "It goes to the trash, and can be restored from there.",
  assetInUseWarning: (n) =>
    n === 1
      ? "One note or task is showing this file. That link will stop working."
      : `${n} notes and tasks are showing this file. Those links will stop working.`,

  // Fetching a picture from the internet (2026-08-19). The one thing the app
  // does that leaves the machine, so it says so — and says WHERE to.
  downloadImageTitle: "Download this picture?",
  downloadImageBody:
    "This picture is not on your computer. To put it in the note, Jott has to fetch it from:",
  downloadImageConfirm: "Download",

  renameFile: "Rename",
  promptRenameFile: (name) => `Rename “${name}”`,
  assetUnused: "Not used",
  assetUsedIn: (n) => (n === 1 ? "Used in 1 place" : `Used in ${n} places`),
  assetGoTo: (title) => `Go to “${title}”`,

  // Picking notes on the board, the way tasks are picked (2026-08-18).
  selectNotes: "Select notes…",
  moveNotesTo: "Move to…",
  notesFolderCount: (n) => (n === 1 ? "1 note" : `${n} notes`),
  openFolder: (name) => `open ${name}`,
  backToBoard: "Back",
  noteOptions: "note options",
};
