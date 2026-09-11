# Changelog

What changed in each release, written for the person using the app rather than for the person who wrote it.

**The GitHub release page is built from this file.** The section matching a tag becomes the "What changed" half of the release notes; the install instructions are the other half and live in `.github/workflows/release.yml`. So a bullet here is read by strangers: keep it short, in plain language, and about something a person can now see or do. **One or two sentences each, and never more** — a bullet that needs a paragraph is either two bullets or a detail nobody outside the repository needs. **And no hard line breaks:** a bullet is one line in this file, however long, because GitHub turns every newline of a release note into a break and a wrapped bullet arrives on the page in pieces.

One `## vX.Y.Z` per version, newest first, with any of `### New`, `### Fixed` and `### Improved` under it. `packaging/release.sh` refuses to tag a version that has no section here. Versions before v0.51.0 predate the file and live only in the commit history.

## v0.55.0

### New

- **A list's file is its order.** Sorting by name, creation date or due date (with ↓ ↑ for the direction) rewrites the `.md` in that order, and dragging a card makes it your custom order, which Custom brings back; a list reordered in another editor switches to Custom and keeps what you did.
- **On a phone, every space has the Home's +.** In a notes space it opens a blank note with the cursor in its body; in a list, one tap opens the task bar above the keyboard.
- **Change a note's banner from its card.** The ⋮ of a note card, on the board and on the Home, now has the Banner row: the eight colours, a picture, or none.

### Fixed

- **A new list item starts with a capital letter on Android.** After Enter on a bullet, a task or a quote, the keyboard now capitalizes the first word, as it does at the start of a paragraph.
- **Selecting text next to a picture no longer makes the note jump.** The page stopped chasing the end of the selection each time it crossed an image.
- **New tasks go to the top on the Home too**, when Settings › Tasks says so — and in a list you have arranged by hand, where they used to land at the bottom.
- **On a phone, one ⋮ per screen.** The menu that sat alone on the canvas of a list or notes space (and on the Home's blocks) is now part of the top bar's ⋮.
- **The top bar's buttons float on every screen on a phone**, with no band painted behind them.
- **Switches in Settings have white knobs again**, instead of black.
- **A ticked task on the page is one clean colour**: no darker rim around the box, and a white tick.
- **Ctrl+V pastes a screenshot on Linux.** A picture copied to the clipboard (the Print Screen tool, an image viewer) now goes into the note, with no need to find the file first.
- **The checkboxes in a note card's preview are all the same square**, instead of some coming out a pixel taller or wider than the rest.
- **Jott opens on Android phones that use 16 KB memory pages**, which newer devices can boot with, instead of failing to load.
- **Settings opens at once the first time**, instead of freezing for a second or two, and its segmented buttons start on your choice rather than sliding there from a corner.
- **Jott opens straight into your notebook**, instead of flashing the notebooks screen first; the launch also reads the notebook without holding up the screen on Android.

### Improved

- **Swiping a task follows your finger all the way.** The coloured square grows with the card; sending a task to the day counts halfway, while deleting or taking it out of the day counts after a third of the card, where the card slides away and the colour fills the row.
- **The warning looks yellow again on the light page.** Error, warning and success are now softer than the eight colours you pick from, so they never pass for one of them; a warning's block is a clear yellow, and its text stays close to what it was.
- **A note's title opens its name and its banner together.** One popover renames the note and picks its banner; the banner's own ⋮ is gone, and the page's ⋮ keeps its Banner row.
- **The quick note and task bars are easier to spot.** Both have the same rounded corners and a soft lift instead of an outline; the quick note grows to eight lines as you type, then scrolls, and its text sits level with the +.
- **The floating formatting bar is quieter**: a softer shadow, and the button that docks it is the same size and shape as the others.
- **The timeline's year sits beside the month, not over the cards.** On a small window the year no longer covers the month's numbers when the timeline opens: it starts on the first month's line, centred on its rule, and stays there as you scroll — so the month heading no longer repeats the year.

## v0.54.0

### New

- **Write a theme from a few colours you like.** `make-theme.py` takes the colours you hand it and fills in the rest of the palette around them, keeping every shade readable on both the dark frame and the light page; it also checks a theme you already have and names what would be hard to read.
- **An open note follows its file.** When the note on screen is changed by something else — a sync, another editor — the editor reloads it, cursor in place. If you were typing at that moment, what you typed stays on screen and the other version is kept beside the note as a conflict copy, listed in the app like a Syncthing conflict, so nothing is lost either way.
- **Hyphenate note text** (Settings › Display › Text), off by default: a long word breaks across two lines instead of leaving a hole in the right edge. It is only ever drawn — the `.md` file keeps every word whole.

### Fixed

- **The cursor stays in sight while you type.** The note now scrolls to follow the line you are writing instead of letting it slip behind the formatting strip or off the bottom edge.
- **The Home's title enters the canvas again on a phone.** As the sheet rises through the title row, the canvas-coloured copy is revealed along the ground's edge, pixel by pixel; since v0.53.0 it stayed hidden until the sheet had reached the top and then dropped in late.
- **The formatting strip's groups open on a phone.** Text style, Heading, List, Insert and the rest unfolded behind the note instead of over the strip; they also no longer float up to the top of the screen while the keyboard is open.
- **The sliders in Settings answer to a finger drag** (interface zoom, note card height). A drag on the thumb was being read as the sidebar gesture, so only a tap moved them.
- **No black strip under the keyboard on Android.** When the WebView pans the page under an open keyboard, the room below the app wears the canvas's colour instead of the window's black.
- On a phone, the timeline's month and year no longer sit in the status bar: they stop below the top bar, where they can be read.
- The page no longer scrolls up into the status bar behind the floating buttons — the top bar paints the ground it is over, everywhere but an open note and the Home.
- On Android the clock and the system icons follow the app's own colours instead of the phone's dark mode: no more white clock on a white bar.
- **Typing in a note on Android no longer stalls after a pause.** The app's own auto-save was reloading every screen and refetching every picture in the note; it now recognises its own writes, and the save itself left the thread that draws.
- **Typing in a task's fields is lighter too.** Each pause in the task panel was refreshing the whole window — sidebar, counts and all — for a field that changes none of them; now only the open screen redraws, and the reminder schedule when the reminder moved.
- **On a phone, the app's own save no longer comes back as an outside change.** Saving to the phone's storage takes long enough that the app was mistaking its own write for another program's and reloading every screen after each pause; it now recognises the write the moment it lands.
- **Opening Jott from its icon no longer leaves a second tray icon behind.** With the window closed to the tray, launching the app again now brings that window back instead of starting a whole second copy of Jott.

### Improved

- **The eight colours are slots now, not fixed names.** A theme decides what each one looks like, so a palette that paints the sixth colour lilac no longer has to keep calling it yellow. Notebooks that already chose colours keep them.
- **A theme file is twelve lines shorter.** The error, warning and success colours carried seven shades each and only ever used four, so writing a theme no longer means inventing shades nothing draws with.
- **The Timeline lights up in the accent colour while it is open**, the way the Settings button already did.
- **The eight colours are spread evenly around the wheel, and each one now reads the same on the sidebar as on the page.** Orange sat twelve degrees from red and was hard to tell apart, and yellow turned brown on its way to the white page; only coloured text still changes with the ground, so a word stays readable wherever it lands.
- **The app's page now declares English**, so the editor's spell-check and the new hyphenation use English rules instead of Portuguese ones.
- **The chosen day glides** on the Home's week, the way the pill of a segmented control moves, instead of jumping from one day to the next.
- **The Home's + is bigger on a phone** — the same 72px it has on the desktop, up from 64px.

## v0.53.0

### New

- **Rename a note from its card** — the ⋮ on the board and the right mouse button both offer it, so a note no longer has to be opened to be named.
- **Note card height** (Settings › Display): a slider, three to sixteen lines of the note, answering to this machine.
- **The notes board's layout moved to Settings › Display** (grid or folders), and answers to this machine too. A space that chose its own still keeps it.
- A floating **Undo** after a delete, a move, or a task taken off the day — one line at the bottom of the screen, gone by itself in a few seconds.
- The task panel ends with a card naming the task fields that are switched off, with a button straight to Settings › Tasks.
- **Day summary** (Settings › Tasks): one notification at the hour you choose, listing the day's tasks. A task now rings on its own only if you gave it a reminder.
- **Repeat: freely** — a task that comes back undated the moment it is ticked, one open copy at a time.

### Fixed

- The checkbox drawn in a note's summary on a card is a rounded square at every size again, however small the card.
- **The "system-ui" font choice does something on Linux** — the interface now draws in the font the desktop itself uses.

### Improved

- **The completed section reads newest-first** — the task you just ticked is at the top of it.
- **Sending a task to a day now shows**: the sun pops on the card, a card swiped sideways springs back, a suggestion taken lifts out of the panel.
- **Today notes shows the notes you wrote today wherever you wrote them** — every notepad, each card carrying a dot in its space's colour.
- A note nobody named draws no title on its card: the first lines of the note say what it is.
- Settings say less: the explanations wait behind a **?**, and on a phone a group of three or more choices is a drop-down.
- About reads in order — the version with its **Check now**, the system rows, the help rows, and **Quit Jott** last.
- The theme is a drop-down beside its label, and **New theme from this one…** is its last option: it copies the look on screen (desktop only).
- On a phone the back arrow at the top returns from a Settings page to the menu, the same as the swipe.
- The formatting bar setting says how the bar **opens** with a note: floating, in the side panel, or off. The ⋮ still moves it between the first two.
- "Close the task panel when clicking outside" now works anywhere on the content, not only on the bare margin. The row is desktop only.
- New tasks go to the **top** of the list by default.
- Banners and note tags start switched off; the Notes page turns them on.
- The Timeline's deleted names are two switches — one for tasks, one for notes.
- The "Suggest more fields in the task panel" row left Settings: the card is a one-time offer, and the Tasks page already holds the fields.
- **Pasting from another app keeps the formatting** — bold, links, lists, quotes, code and tables arrive as Markdown. One Ctrl+Z gives back the plain paste.
- The fold arrow in a note stands only beside something that HOLDS something — a heading, a list item with a sublist, a quote, a code block, a table.
- The foot of the side panel names the **space** the task or note is in, since every space keeps a list called Inbox.
- The side panel slides open and shut, the way the sidebar does.
- The notebook menu marks the open notebook with its own colour instead of a tick, and rules **Manage notebooks** off from the list.
- The icon picker holds still: choosing an icon no longer re-orders the grid.
- The floating formatting bar takes the same corner as the rest of the app.

## v0.52.1

### Fixed

- Enter in a list no longer skips a line: the next bullet comes right under the last one, and Enter on an empty bullet ends the list. Shift+Enter is still the way to a blank line.
- On Android the app no longer fails with "Something went wrong … Notification.getId() on a null object reference": the reminders the phone keeps between launches are now stored in a form it can read back.
- The Trash fits a phone and a narrow window: the date and the countdown go under the item's name instead of pushing the buttons off the screen.
- A pinned note on the phone shows its mark at the head of the title, and the card's corner keeps only the ⋮.

### Improved

- The notes board reads by rows: the first three notes go across the top, the next three under them, and so on. It used to run down each column, which scrambled an order sorted by time.
- The task panel's fields keep the icon alone when the panel is narrow and bring the words back as it widens — nothing wraps or overlaps any more.
- In the task panel the date a task was written stands on a line of its own, just above the footer: the date alone, without the label or the day count.
- A pinned note or folder wears a thin ring in the accent colour, so it stands out from the cards around it without a block of its own.

## v0.52.0

### New

- On the phone the Home is a sheet: the week and the day's summary fold under your finger while the page slides up over them. It rests in two places — head open, or page full.
- The Home's head has three heights — name and date, the week, the week with the day's summary. Drag to fold it, or tap the grip to move one step.
- The **+** on the Home opens two buttons, **Task** and **Note**. The note is created untitled where quick captures go, cursor in the body.
- The Home opens on the greeting and "x of y tasks done today".
- The notebook's name at the bottom of the sidebar opens a menu of the notebooks you have opened before, the current one marked and each in its own colour. Middle-click one to open it in a new window.
- Find & replace is a card floating over the note: the field, two arrows, a gear with the three options, and the replace row lined up under it.
- **Colour & icon** on a space or a group now offers the whole Phosphor set — 1,500 icons behind a search field that also knows what each one is about ("money" finds the bank). The ten it used to offer still lead the grid, and the empty slot puts the type's own icon back.

### Fixed

- **Android reminders now actually go off.** Syncing them failed before it scheduled anything, and nothing re-registered after a reboot.
- Lists in the editor: no stray space after the bullet, ordered numbers and a freshly typed `- ` stay inside the line, the task checkbox lines up, and an item with sub-items draws its guide down to them.
- On the phone the top bar floats over every screen with no background of its own; its buttons wear the ground behind them, drop a small shadow, and the arrows show whether there is anywhere to go.
- Pull-to-search on the phone started behind the floating buttons of the top bar; it now starts below them.
- The sticky "Home • Sep 7" bar is gone: it reserved empty space and cards scrolled behind the buttons above it.
- On the desktop, the Home's head scrolls away with the page instead of holding the top of it.
- Ticking a dated task on the Home keeps it on the day, under Completed, so the summary reads "1 of 3 tasks done" instead of the task vanishing. One finished on another day stays out, as before.
- The list `[[` offers is a proper menu now: the app's font, rows with a tap target, the chosen one rounded inside the panel, long titles trimmed, and no more column of `abc` marks beside every name.
- It also knows where the phone's keyboard is: near the keys the list opens above the caret instead of under them, and scrolls when the room is tight.
- On the Timeline, the pinned month covers the rows passing under it.
- Bold and italic no longer fight: `***word***` is both, and removing one leaves the other standing.
- Typing a `*` against an existing one no longer opens a new pair.
- Raw Markdown shows only in the piece the cursor is inside: the caret in bold reveals the asterisks, selecting the line or the note reveals nothing, and `[text]` without a link keeps its brackets.
- Middle-clicking inside a note no longer pastes the X11 primary selection.
- A note's text is centred on its page again: the fold arrow now keeps the same room on both sides, at any width, so the note reads at full measure.
- The note's title starts exactly where its text starts, on any screen.
- The fold arrow sits on the first line of what it folds — heading or list item, wrapped or not — instead of floating above it.

### Improved

- A new tab opens **behind** the current one, the way a browser does. And the middle button now reaches Settings, the Timeline and the rows of the sidebar menu.
- Indentation is drawn: a wider column per level with a thin guide, wrapped lines hanging from the first letter, and an item with children drawing its guide down to them.
- The drawer on the phone is wider (272px), so its five buttons have room in both orientations.
- The bar for a new task closes with Esc, or by dragging it sideways.

## v0.51.0

Never published. The work under this heading shipped in v0.52.0, and these notes were folded into that section rather than left for a release page that will never exist.
