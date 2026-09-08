# Changelog

What changed in each release, written for the person using the app rather
than for the person who wrote it.

**The GitHub release page is built from this file.** The section matching a
tag becomes the "What changed" half of the release notes; the install
instructions are the other half and live in `.github/workflows/release.yml`.
So a bullet here is read by strangers: keep it short, in plain language, and
about something a person can now see or do. **Two or three lines each, and
never more** — a bullet that needs a paragraph is either two bullets or a
detail nobody outside the repository needs.

One `## vX.Y.Z` per version, newest first, with any of `### New`,
`### Fixed` and `### Improved` under it. `packaging/release.sh` refuses to
tag a version that has no section here. Versions before v0.51.0 predate the
file and live only in the commit history.

## v0.53.0

### New

- A floating **Undo** after a delete, a move to another list or space, or
  after taking a task off the day: one line at the bottom of the screen,
  gone by itself in a few seconds.
  It only ever takes back that action — if something else happened since,
  it says so and leaves it to Ctrl+Z.
- The task panel ends with a card naming the task fields that are switched
  off, with a button straight to Settings › Tasks. Close it once and it
  stays closed; the "Suggest more fields in the task panel" row brings it
  back.

### Improved

- Settings say less. The explanations left the rows and wait behind a **?**
  next to the ones that need one; the categories on a page sit further
  apart; and on a phone a group of three or more choices is a drop-down.
- About reads in order: the version with its **Check now** on the same line,
  then the system rows, then the help rows, and **Quit Jott** last.
- The theme is a drop-down beside its label, like the other rows, and
  **New theme from this one…** is its last option: it copies the look on
  screen, puts it on and opens the theme's folder (desktop only).
- On a phone the back arrow at the top returns from a Settings page to the
  menu, the same as the swipe — the page no longer draws a back button of
  its own.
- The formatting bar setting says how the bar **opens** with a note:
  floating, in the side panel, or off. While the note is open the ⋮ menu
  still moves it between the first two. Off is off everywhere, the phone's
  strip included; a phone is offered floating or off.
- "Close the task panel when clicking outside" now works anywhere on the
  content, not only on the bare margin. A click that opens another task or
  lands in a field keeps the panel. The row is desktop only.
- The automatic reminder can ring both the day before and on the due day.
- New tasks go to the **top** of the list by default.
- Banners and note tags start switched off; the Notes page turns them on.
- The Timeline's deleted names are two switches — one for tasks, one for notes.
- The "Suggest more fields in the task panel" row left Settings: the card is
  a one-time offer, and the Tasks page it points to already holds the fields.
- **Pasting from another app keeps the formatting.** Bold, italic, links,
  lists, checklists, quotes, code and tables copied out of Keep, Docs, Notion
  or a web page arrive as Markdown instead of bare text. One Ctrl+Z gives
  back the plain paste.
- The fold arrow in a note stands only beside something that HOLDS
  something — a heading, a list item with a sublist, a quote, a code block, a
  table. Ordinary prose no longer offers one.

## v0.52.1

### Improved

- The notes board reads by rows: the first three notes go across the top,
  the next three under them, and so on. It used to run down each column,
  which scrambled an order sorted by time.

### Fixed

- Enter in a list no longer skips a line: the next bullet comes right under
  the last one, and Enter on an empty bullet ends the list. Shift+Enter is
  still the way to a blank line.
- On Android the app no longer fails with "Something went wrong …
  Notification.getId() on a null object reference": the reminders the phone
  keeps between launches are now stored in a form it can read back.
- The Trash fits a phone and a narrow window: the date and the countdown go
  under the item's name instead of pushing the buttons off the screen.
- A pinned note on the phone shows its mark at the head of the title, and the
  card's corner keeps only the ⋮.

### Improved

- The task panel's fields keep the icon alone when the panel is narrow and
  bring the words back as it widens — nothing wraps or overlaps any more.
- In the task panel the date a task was written stands on a line of its own,
  just above the footer: the date alone, without the label or the day count.
- A pinned note or folder wears a thin ring in the accent colour, so it
  stands out from the cards around it without a block of its own.

## v0.52.0

### New

- On the phone the Home is a sheet: the week and the day's summary fold
  under your finger while the page slides up over them. It rests in two
  places — head open, or page full.
- The Home's head has three heights — name and date, the week, the week with
  the day's summary. Drag to fold it, or tap the grip to move one step.
- The **+** on the Home opens two buttons, **Task** and **Note**. The note is
  created untitled where quick captures go, cursor in the body.
- The Home opens on the greeting and "x of y tasks done today".
- The notebook's name at the bottom of the sidebar opens a menu of the
  notebooks you have opened before, the current one marked and each in its
  own colour. Middle-click one to open it in a new window.
- Find & replace is a card floating over the note: the field, two arrows, a
  gear with the three options, and the replace row lined up under it.
- **Colour & icon** on a space or a group now offers the whole Phosphor set —
  1,500 icons behind a search field that also knows what each one is about
  ("money" finds the bank). The ten it used to offer still lead the grid, and
  the empty slot puts the type's own icon back.

### Fixed

- **Android reminders now actually go off.** Syncing them failed before it
  scheduled anything, and nothing re-registered after a reboot.
- Lists in the editor: no stray space after the bullet, ordered numbers and
  a freshly typed `- ` stay inside the line, the task checkbox lines up, and
  an item with sub-items draws its guide down to them.
- On the phone the top bar floats over every screen with no background of
  its own; its buttons wear the ground behind them, drop a small shadow, and
  the arrows show whether there is anywhere to go.
- Pull-to-search on the phone started behind the floating buttons of the top
  bar; it now starts below them.
- The sticky "Home • Sep 7" bar is gone: it reserved empty space and cards
  scrolled behind the buttons above it.
- On the desktop, the Home's head scrolls away with the page instead of
  holding the top of it.
- Ticking a dated task on the Home keeps it on the day, under Completed, so
  the summary reads "1 of 3 tasks done" instead of the task vanishing. One
  finished on another day stays out, as before.
- The list `[[` offers is a proper menu now: the app's font, rows with a tap
  target, the chosen one rounded inside the panel, long titles trimmed, and
  no more column of `abc` marks beside every name.
- It also knows where the phone's keyboard is: near the keys the list opens
  above the caret instead of under them, and scrolls when the room is tight.
- On the Timeline, the pinned month covers the rows passing under it.
- Bold and italic no longer fight: `***word***` is both, and removing one
  leaves the other standing.
- Typing a `*` against an existing one no longer opens a new pair.
- Raw Markdown shows only in the piece the cursor is inside: the caret in
  bold reveals the asterisks, selecting the line or the note reveals
  nothing, and `[text]` without a link keeps its brackets.
- Middle-clicking inside a note no longer pastes the X11 primary selection.
- A note's text is centred on its page again: the fold arrow now keeps the
  same room on both sides, at any width, so the note reads at full measure.
- The note's title starts exactly where its text starts, on any screen.
- The fold arrow sits on the first line of what it folds — heading or list
  item, wrapped or not — instead of floating above it.

### Improved

- A new tab opens **behind** the current one, the way a browser does. And
  the middle button now reaches Settings, the Timeline and the rows of the
  sidebar menu.
- Indentation is drawn: a wider column per level with a thin guide, wrapped
  lines hanging from the first letter, and an item with children drawing its
  guide down to them.
- The drawer on the phone is wider (272px), so its five buttons have room in
  both orientations.
- The bar for a new task closes with Esc, or by dragging it sideways.

## v0.51.0

Never published. The work under this heading shipped in v0.52.0, and these
notes were folded into that section rather than left for a release page that
will never exist.
