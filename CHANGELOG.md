# Changelog

What changed in each release, written for the person using the app rather
than for the person who wrote it.

**The GitHub release page is built from this file.** The section matching a
tag becomes the "What changed" half of the release notes; the install
instructions are the other half and live in `.github/workflows/release.yml`.
So a bullet here is read by strangers: keep it short, in plain language, and
about something a person can now see or do.

One `## vX.Y.Z` per version, newest first, with any of `### New`,
`### Fixed` and `### Improved` under it. `packaging/release.sh` refuses to
tag a version that has no section here. Versions before v0.51.0 predate the
file and live only in the commit history.

## v0.52.0

### New

- On the phone, the Home behaves like a sheet: the week and the day's
  summary fold and unfold under your finger, and the page slides up over
  them — its ground rises behind the title and the buttons while the cards
  hold still, the title takes the page's colour as the ground passes it,
  and once the page is full the title scrolls away with the cards. The page
  rests in two places, head open or page full; a fast scroll from the
  bottom stops at the full page, and one more pull opens the head.
- The **+** on the Home opens two buttons again, **Task** and **Note**.
- The Home opens on the greeting and "x of y tasks done today".
- Find & replace in a note has a simpler panel: the field, two arrows, a
  gear with the three options, and the replace row lined up under it. It
  floats over the note as a rounded card, and Replace and All look like
  buttons.
- The new-task bar on the Home (desktop) closes with Escape, or by dragging
  it sideways.

### Fixed

- Lists in the editor: the first line of an item no longer has an extra
  space after the bullet, ordered numbers and a freshly typed `- ` stay
  inside the line, the checkbox of a task line lines up, and an item with
  sub-items draws its guide down to them.
- On the phone, the top bar floats over every screen with no background of
  its own, and its buttons wear the ground behind them: dark on the header,
  light once the page has slid all the way up under them. They drop a small
  soft shadow so they still read as lifted off the page, and hovering one
  inside the back/forward group now lights a plate that sits neatly within
  the group instead of overlapping its corners. The back/forward arrows show
  whether there is anywhere to go.
- The **+** on the Home has a shadow again — it had been floating flat over
  the page.
- The list `[[` offers while you type is a proper menu now: the app's font
  instead of a code font, rows with room to breathe and a tap target on a
  phone, the chosen row rounded inside the panel, and a long note title
  trimmed with an ellipsis rather than stretching the panel across the
  screen. The column of `abc` marks CodeMirror drew beside every name is
  gone — the space each note lives in is already on the row.
- In landscape, the drawer is wide enough for the five header buttons.
- A note's text is centred on its page again. The fold arrow beside each
  line was taking its width out of the left side only, so the whole note sat
  off its axis; the arrow now has the same room kept for it on both sides,
  at any window width, and the text reads at the app's full measure. On a
  phone that room is trimmed to what the arrow itself measures, so the text
  keeps the width.
- The note's title starts exactly where its text starts, on any screen.
- The fold arrow sits on the first line of what it folds — a heading or a
  list item, wrapped over several lines or not — instead of floating above
  it.

## v0.51.0

### New

- The notebook's name at the bottom of the sidebar opens a menu of the
  notebooks you have opened before — the current one marked, each in its own
  colour. Middle-click one to open it in a new window. The last row,
  "Manage notebooks…", leads to the full screen.
- The **+** on the Home screen offers **New note** as well as **New task**.
  The note is created untitled where quick captures go, and opens with the
  cursor already in the body.
- On the phone, the Home header has three heights — name and date, the week,
  the week with the day's summary. Drag it down to unfold, up to fold; the
  grip moves one step per tap.

### Fixed

- **Android reminders now actually go off.** Syncing them failed before it
  scheduled anything, and nothing re-registered after a reboot.
- Pull-to-search on the phone started behind the floating buttons of the top
  bar; it now starts below them.
- In landscape, the drawer no longer loses its fifth header button behind the
  camera cutout.
- The sticky "Home • Sep 7" bar is gone: it reserved empty space at the top of
  the screen and cards scrolled behind the buttons above it.
- On the desktop, the Home's head — the title and the week — scrolls away
  with the page instead of holding the top of it.
- On the Timeline, the pinned month covers the rows passing under it: they
  no longer reappear in a sliver above the month's name.
- The list `[[` offers while you type has its shadow back.
- Bold and italic no longer fight. `***word***` is both, and removing one
  leaves the other standing.
- Typing a `*` against an existing one no longer opens a new pair — deleting
  one of the four in `**word**` and typing it back now just restores it.
- Raw Markdown shows only in the piece the cursor is actually inside: the
  caret in bold reveals the asterisks, selecting the whole line or the whole
  note reveals nothing, and `[text]` without a link keeps its brackets.
- Middle-clicking inside a note no longer pastes the X11 primary selection.
- The list marker column adds up: bullets, numbers and checkboxes stay inside
  the line instead of hanging outside it.

### Improved

- A new tab opens **behind** the current one, the way a browser does. And the
  middle button now reaches everything — Settings, the Timeline, and the rows
  of the sidebar menu.
- Indentation is drawn: one fixed, wider column per level with a thin guide,
  a wrapped line hanging from the first letter of the text rather than from
  under the marker, and an item with children drawing its guide down to them.
- Find and replace has a panel of its own — fields, ↑ ↓, the three switches
  in a popover, and a close button in the corner.
- The drawer on the phone is wider (272px), so its five buttons have room in
  both orientations.
- The bar for a new task closes with Esc, or by dragging it sideways.
