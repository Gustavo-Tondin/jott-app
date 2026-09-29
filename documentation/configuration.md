# Configuration

Every option Jott keeps, where it lives, what it accepts and what it is when
nobody chose. There are two files, and **the split is the Settings section,
not the key**: the Display section answers to *this machine*, every other
section answers to *the notebook*.

| File | Where | Travels with the notebook |
|---|---|---|
| `.jott/config.json` | inside the notebook | yes |
| `machine-prefs.json` | the OS config folder: `~/.config/dev.gustavotondin.jott/` on Linux, `%APPDATA%\dev.gustavotondin.jott\` on Windows, the app's private storage on Android. `JOTT_CONFIG_DIR` overrides it | no |

Both files keep the same pact:

1. **An absent key means the app's default.** Nothing has to be written for
   the app to work, and deleting a key resets it.
2. **A value that fails validation reads as the default**, and is not
   corrected in the file.
3. **An unknown key makes the round trip.** A key written by a newer version
   survives this one rewriting the file.

Editing `config.json` by hand while the app runs works: a watcher picks it
up, no restart. Edit `machine-prefs.json` with the app closed.

---

## `.jott/config.json`

Written in camelCase. The table follows the Settings screen; "hand" means
there is no row for it and the file is the only way in.

`schemaVersion` (`1`) is required. A notebook declaring a higher one was
written by a newer app and opens read-only. Two keys of older versions are
removed on the next write, because their meaning moved: `autoRemind` (the day
summary replaced it) and `autoSpaceColors` (now `rainbowSpaces`).

### Date preferences

| Key | Accepts | Default | Settings row |
|---|---|---|---|
| `rollover.daily.mode` | `reset` (unfinished tasks go back to suggestions) · `carry` (they stay pulled into the new day) | `reset` | At midnight, unfinished tasks |
| `weekStartsOn` | `monday` · `sunday` | `monday` | Week starts on |
| `datedTasksJoinPeriod` | bool: a task with a date shows on its day without being pulled | `true` | A task with a date joins its day |

`rollover.weekly.startsOn`, from older notebooks, is still read when
`weekStartsOn` is absent.

### Notebook

| Key | Accepts | Default | Settings row |
|---|---|---|---|
| `confirmDeletes` | bool | `true` | Ask before deleting |
| `trashRetentionDays` | days an item waits in `.jott/trash/`; `0` keeps it until you empty the trash | `30` | Empty the trash after (days) |
| `completedRetentionDays` | days a completed task stays in `completed.md` before going to the trash; `0` never | `30` | Clear completed after (days) |
| `quickNoteFolder` | a folder inside the Notes space; empty is the space's root | `""` | Quick note goes to |
| `quickTaskList` | empty is the Tasks Inbox; a list's name is a list of the fixed Tasks space; a root-relative path is one of your task spaces | `""` | Quick tasks go to |

### Tasks (App functions › Tasks)

| Key | Accepts | Default | Settings row |
|---|---|---|---|
| `newTasksOnTop` | bool: a new task lands above the first (`true`) or below the last | `true` | New tasks go to |
| `tasksShowAll` | bool: the Tasks screen shows every list by space instead of the Inbox alone | `false` | Tasks screen shows |
| `autoUrgentByDate` | bool: a task due today or overdue counts as urgent (`#urgent` always does) | `true` | Treat overdue tasks as urgent |
| `reminderTime` | `HH:MM`: where the reminder presets land | `09:00` | Reminder time |
| `daySummary` | bool: one notification at the start of the day listing what it holds | `false` | Day summary |
| `daySummaryTime` | `HH:MM` | `08:00` | Summary time |
| `offerTaskFields` | bool: the task panel offers the fields that are switched off. Closing that offer sets it to `false` | `true` | hand (the offer itself) |

### Notes (App functions › Notes)

| Key | Accepts | Default | Settings row |
|---|---|---|---|
| `languages` | BCP 47 tags in your order; the first is every note's default | `[]` | Languages I write in |
| `hyphenateNotes` | bool: break long words at line ends while drawing (the file keeps them whole) | `false` | Hyphenate note text |
| `checkSpelling` | bool: underline misspelt words against every language in `languages` | `true` | Check spelling |
| `confirmImageDownloads` | bool: ask before fetching a pasted `https://` image | `true` | Ask before downloading an image |
| `tableLayout` | empty (squeezed to the column, cells wrap) · `scroll` (tables run wide) | `""` | Wide tables |

### Time (App functions › Time)

| Key | Accepts | Default | Settings row |
|---|---|---|---|
| `timelineGhostTasks` | bool: the Timeline names deleted tasks instead of "deleted task" | `false` | Name deleted tasks in the Timeline |
| `timelineGhostNotes` | bool: the same, for notes | `false` | Name deleted notes in the Timeline |

### Ages (hand)

```json
"age": { "fresh": 7, "stale": 30, "inboxStale": 7 }
```

Days. Below `fresh` something is fresh, below `stale` it is stale, at or
above it forgotten. `inboxStale` is the Inbox's own `stale`, shorter because
an inbox is a place things pass through. Each number falls back on its own.

### Native Functions: `features`

A map of switches, `"key": bool`. **It only holds what differs from the
default**: switching back to the default removes the key. An unknown key is
on. A child is off whenever its parent is.

| Key | Parent | Default |
|---|---|---|
| `tasks` | | on |
| `dueDate`, `priority`, `repeat`, `subtasks`, `taskTags` | `tasks` | on |
| `remind`, `description`, `files` | `tasks` | off |
| `notes` | | on |
| `wikiLinks`, `embeds`, `noteFolders`, `pinNotes`, `tables` | `notes` | on |
| `banners`, `noteTags` | `notes` | off |
| `fixedSpaces` | | on |
| `homeSpace`, `tasksSpace`, `notesSpace` | `fixedSpaces` | on |
| `time` | | on |
| `timeline` | `time` | on |

Switching a feature off takes it out of the interface and touches nothing on
disk.

### Shortcuts: `shortcuts`

A map `command id → chord`, holding only the bindings you changed
(Settings › Shortcuts). A chord is one string, modifiers in a fixed order and
then the key: `"Mod+Shift+F"`. `Mod` is Ctrl on Linux and Windows. A
binding the app cannot honour is kept and ignored.

```json
"shortcuts": { "task.new": "Mod+Shift+T" }
```

### The sidebar and the orders

These are set by dragging and by the sidebar's own menu (right click, or a
held finger, on the empty column), not in Settings.

| Key | Accepts | Default |
|---|---|---|
| `rainbowSpaces` | bool: each top-level entry takes the next of the seven colours. Turning it off writes the colours on screen into each `.space.json` / `.group.json` | `true` |
| `spacesSort` | empty (the dragged order) · `name` · `type` | `""` |
| `order` | `namespace → [names]`: the dragged order of the sidebar (`spaces`) and of each folder's lists (`lists:<folder>`) | `{}` |
| `daySort` | empty (the order tasks were pulled in) · `name` · `created` · `completed`; applies to today and the days ahead | `""` |

A space's own sort and order live in its `.space.json`
([`file-format.md`](file-format.md)).

### Display, as the notebook's fallback

Every key of the [Display](#display) section below can also sit in
`config.json`. There it is the answer for a machine that never chose, so a
notebook opened somewhere new still looks the way it was left.

---

## `machine-prefs.json`

One file for every notebook this installation opens. Written in camelCase.

### Display

Stored per notebook, under `notebookDisplay` keyed by the notebook's
absolute path, so a work notebook can be dark while a personal one is not.
Every field is optional, and **absent is not "off"**: it means this machine
did not answer, and the notebook's `config.json` value stands, then the
app's default. A top-level `display` object, from older versions, seeds a
notebook with no entry of its own.

| Key | Accepts | Default | Settings row |
|---|---|---|---|
| `mode` | `jott` · `light` · `dark` | `jott` | Mode |
| `theme` | a palette name from `.jott/themes/` ([`theming.md`](theming.md)); empty is the app's own | `""` | Theme |
| `accentColor` | a colour slot `"1"`…`"7"`: the notebook's colour in the notebook picker | `"1"` | Notebook colour |
| `headingColor` | `accent` · `ink` (headings in plain text colour) | `accent` | Headings |
| `noteFontSize` | `small` · `medium` · `large` | `medium` | Note text size |
| `interfaceFont`, `noteFont`, `monoFont` | a font family installed on this machine; empty is the bundled one (Geist, Geist Mono). A name that could break CSS is dropped | `""` | Interface font · Note font · Monospace font |
| `cardLines` | lines of preview a note card draws, `3`…`16` | `12` | Note card height |
| `noteLayout` | `grid` · `tree`: a notes space's board, until the space chooses in its `.space.json` | `grid` | Notes board layout |
| `formatBar` | `floating` · `panel` (docked in the side panel; desktop only) · `off` | `panel` | Formatting bar |
| `formatBarSide` | `top` · `left` · `right` · `bottom`: the edge the floating bar hugs | `top` | Bar position |
| `dateDisplayFormat` | `mm/dd/yyyy` · `dd/mm/yyyy` · `yyyy/mm/dd`. Files always store ISO | `mm/dd/yyyy` | Date format |
| `showListCounts` | bool | `true` | Show task counts in the sidebar |
| `restoreLastScreen` | bool: reopen on the last screen instead of the Home | `false` | Reopen on the last screen |
| `closeInspectorOnClickAway` | bool | `false` | Close the task panel when clicking outside |
| `tabStrip` | bool: the tab strip over the window (desktop) | `false` | Show the tab strip |
| `simpleTasks` | bool: task rows as a plain list, a hairline under each and the title alone | `false` | Simple task rows |

### This installation

| Key | Accepts | Default | Where |
|---|---|---|---|
| `language` | an interface language tag, or `system` | `system` | Display › Language |
| `zoom` | `0.8` · `0.9` · `1` · `1.1` · `1.25` · `1.5` · `1.75` · `2` | `1` | Display › Interface zoom |
| `autoUpdateCheck` | bool: look for a new version once a day | `true` | About › Check for updates automatically |
| `closeToTray` | bool: closing the window keeps Jott in the tray, so reminders still ring | `true` | About › Keep Jott running in the tray… |
| `pickerCloses` | bool: the notebook picker's window closes once it opens a notebook | `true` | the picker's ⋮ |
| `opensOnPicker` | bool: the app opens on the picker instead of the last notebook | `false` | the picker's ⋮ |
| `sidebarWidth`, `panelWidth` | CSS pixels, clamped by the app | the app's own | dragging the edge |

### Kept by the app

Not preferences: the app writes these to remember where it was. Losing them
costs a folder choice and a few clicks.

| Key | Holds |
|---|---|
| `lastNotebook`, `recentNotebooks` | the last notebook, and the picker's list (up to 20, `{ path, opened }`) |
| `lastScreen` | the screen to return to when `restoreLastScreen` is on |
| `remindedUntil`, `summarizedOn` | per notebook, how far reminders have rung and the last day summarised, so nothing rings twice |
| `lastUpdateCheck` | when the automatic check last ran |
| `desktopEntryDismissed` | the offer to add Jott to the application menu was waved away |
| `deviceId` | this installation's name in the notebook's per-device files (`.jott/index/`) |
