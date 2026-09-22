# Changelog

What changed in each release, written for the person using the app rather than for the person who wrote it.

**The GitHub release page is built from this file.** The section matching a tag becomes the "What changed" half of the release notes; the install instructions are the other half and live in `.github/workflows/release.yml`. So a bullet here is read by strangers: keep it short, in plain language, and about something a person can now see or do. **One or two sentences each, and never more** — a bullet that needs a paragraph is either two bullets or a detail nobody outside the repository needs. **And no hard line breaks:** a bullet is one line in this file, however long, because GitHub turns every newline of a release note into a break and a wrapped bullet arrives on the page in pieces.

One `## vX.Y.Z` per version, newest first, with any of `### New`, `### Fixed` and `### Improved` under it. `packaging/release.sh` refuses to tag a version that has no section here. Versions before v0.51.0 predate the file and live only in the commit history.

## v0.59.0

### New

- **Jott speaks Portuguese (Brazil).** Pick the language under Settings → Display, or let it follow the system.

### Improved

- **Errors read as a sentence, not a code**, with the technical detail after it.
- **Notifications, the tray menu and the names of Home, Tasks and Notes follow the app's language.**

### Fixed

- **Deleting a note no longer warns that it can't be undone** — it goes to the trash, as the dialog already said.

## v0.58.0

### New

- **Code blocks have a Copy button** in their corner; it copies the code without the fences.

### Fixed

- **The highlight of the line being edited no longer bites the corners off a code block or a quote**: inside a box it runs edge to edge.
- **Choosing "system-ui" as the monospace font uses the desktop's monospace font**, not its interface font.
- **The chosen day on the Home calendar is no longer cut off at the bottom** when the system font size is not the default.
- **"Keep" works on sync conflicts of Jott's own files** (settings, tag colors, the Trash list): it used to fail with "invalid note path".
- **On Android, "Show in folder" opens the folder in the Files app** instead of failing; where no app can open it, the path is copied.

### Improved

- **Code reads heavier**: medium weight, and inline code has a color of its own.
- **The font pickers name the family each generic resolves to on this machine** ("system-ui (Cantarell)", "monospace (Noto Sans Mono)"), on Linux.
- **A note card with more text than fits fades out at the bottom** instead of cutting a line in half.
- **Task cards on phones are shorter, with a bigger checkbox**, and a task's pin and age now sit on one axis on every platform.
- **Every suggestion wears the color of its space**, under Urgent and Pulled recently too; the list headings drop their dot.
- **The sync conflict notice says when each version was last edited and how big it is**, marks the newer one, and puts a Keep button beside each.
- **Fewer sync conflicts to answer**: copies of the completed-tasks index and of the timeline are settled on their own, and two devices deleting different things keep both in the Trash.

## v0.57.0

### New

- **Reminder notifications have Done, Later and Tomorrow buttons** on Linux and Android: Later rings again in an hour, Tomorrow at your reminder time, and none of them opens the app.
- **Settings › Tasks on Android says whether Jott may notify and ring alarms on the minute**, with a button to the system screen that allows it when it may not.
- **A reorder mode for notes**: pick "Reorder" on a card's ring (or "Reorder notes…" in the notepad's ⋮), tap the cards you mean, and hold one to carry them all together — onto a new place, into a folder, or onto another notepad in the sidebar. The bar at the foot moves or deletes what you marked. Tasks have the same mode, from the same slice.
- **Tasks can be pinned on the Home for today**: the pin brings a task to the top of the day without touching its list, and it clears when the day turns.
- **A "The day before" reminder for dated tasks**: the reminder menu is now grouped — from now, from the due date, pick — with an icon per option, and picking a date starts from the reminder already chosen (or tomorrow).
- **A task's title can be edited from its ring**: "Edit" opens the title in a small card — on a phone it sits over the keyboard, so you never lose sight of what you are typing.
- **The columns of a table can be resized**: drag the border between two of them, and double-click it to go back. The widths are kept as proportions in the note itself, so they hold on a phone and on a monitor alike, and they travel with the file.

### Fixed

- **On GNOME, answering a reminder notification no longer leaves the mouse cursor spinning** for fifteen seconds after Done, Later or Tomorrow.
- **On GNOME, opening Jott from its icon while it is already running no longer leaves the mouse cursor spinning** for fifteen seconds: the window that comes forward takes the launch.
- **The date, reminder and repeat fields of a task's panel no longer spill out of a narrow panel**: once chosen, their controls fill a line of their own under the name and the ×, at the same height.
- **A reminder that appeared on one device while you were away still rings on the other**: only clicking, answering or dismissing the notification counts as seen, not the banner timing out.
- **On Android, updating Jott no longer crashes it in the background** over reminders an older version had scheduled.
- **Ticking a task off can no longer send it twice**: once the card has left, a late tap does nothing, instead of showing "no task with id" while the task was already completed.
- **On the Home of a phone, the + no longer stands over the bar it opened**: while you write a task the + steps aside, and comes back when the bar is put away.
- **On Android, the day summary lists the day it is announced on**: synced after the summary's hour, it used to carry today's tasks into tomorrow morning's notification.
- **A reminder that could not be shown is said once inside the app** instead of erroring every hour, and a change that lands while a reminder is being shown no longer rings it a second time.
- **With two windows open on the same notebook, a reminder rings once**, and a window hidden in the tray rings on time instead of waiting on a slowed-down page timer.
- **A reminder moved to an earlier time rings again**: it used to stay silent for good once the later time had been acknowledged.
- **Editing a note's name from a held card no longer leaves the column of actions stuck on the screen**, standing over every screen you opened afterwards: the column comes down before the panel opens, so nothing the panel does can leave it behind.
- **The cards on the notes board no longer shuffle and pile up while you carry one across them**: they move to where they will actually stand once you let go, so what you see during the drag is the arrangement you get.
- **A carried card no longer has a black dot floating beside it.**
- **On a phone, tapping outside a task's panel closes it** instead of opening the task that was under your finger.
- **The week at the top of Home can be dragged sideways with a finger again**: the drag used to be taken as "open the sidebar", so the strip stood still and the drawer slid in instead.

### Improved

- **A task card marks a reminder with a small clock**, the moment in its tooltip; the date on the card stays the task's own.
- **A reminder notification leads with the task** and says which list it is in and when it is due; reminders missed while Jott was closed arrive as one notification, and the day summary names the day's first reminder.
- **Holding a card with the mouse no longer turns the screen over to selecting tasks**: the right button opens the same ring of actions, and its “Reorder” slice is the way into picking.
- **The + that makes a task or a note is easier to find**: it is round now, a little bigger than the buttons beside it and standing clear of them — the same shape on the computer and on the phone. The bar it closes arrives a moment after the rest of the screen, so the eye lands on it.
- **A note card leads with the note's name**: the name sits on a chip the width of the card and is the one thing on it that steps up in size, so a heading inside the note no longer shouts louder than the note it belongs to.
- **A note that opens with its own name as a heading draws it once**: the card leaves the repeated heading out of the text it shows.
- **A banner reaches the card's edges**, a little taller than before, with the name straddling its lower edge.
- **The settings rows fit their labels on a phone**: the control beside a label now stops at a share of the line instead of claiming a fixed width, so a name like "Notes board layout" reads on one line rather than three, and the `?` beside it is smaller.
- **The accent colour is one swatch on a phone**: tap it and the eight colours open in a small panel, instead of a row of dots taking the whole line.
- **The buttons and fields on a phone are rounder**: a control a thumb makes bigger now takes a corner to match, and the bars that float over the screen — the top bar and the formatting strip — are rounded like the cards they sit above. The strip over the keyboard is slimmer too, its buttons the size of the ones at the top, so it takes less of the note while you write.
- **The pin and the ⋮ only appear when the pointer is on the card**, on a small ground of their own — the one the name sits on — so they read over a banner as clearly as over the name itself; hovering no longer fades the whole card, and on a phone a pinned note is said by the ring around it.
- **A card carried across the board reads as one movement now**: it lifts with its own rounded shadow instead of a square one, the cards making room for it glide rather than snap, and when you let go the board flows into its new arrangement instead of jumping into it.
- **A note card on a phone no longer carries a ⋮**: holding the card opens the very same actions, and the corner it took back belongs to the note.
- **The Suggestions button is quieter**: a soft wash of the accent instead of a solid one, so it no longer passes for the + beside it.
- **A held card offers the same five actions whether it is a task or a note**, in the same order: Pin, Move, Edit, Reorder, and the ⋮ with the rest. Completing a task and pulling it into today are the swipes, as before; duplicating and deleting a note moved behind the ⋮.
- **Settings opens on About**, where the version and the update check are, instead of on Display.
- **A note is only ever dragged in reorder mode** — on the computer too — so a slip of the mouse or the finger never rearranges the board.
- **On the computer, the right button opens the column of actions** at the pointer — on a task, a note or a space in the sidebar — and a note card's ⋮ is the whole menu again.
- **A task marked in reorder mode fills its box with the accent and a light dot**, the way a done box fills with a tick, so a mark is never mistaken for the task open in the inspector.
- **The sidebar deals its own colours now**: each space and group takes the next of the seven, and moving one deals the column again. Choosing a colour by hand keeps the colours on screen — yours among them — and stops the dealing; what you make next still takes the colour after the last one.
- **The rainbow switch left Settings**: it is a tick, "Auto-rainbow spaces", in the menu of the empty sidebar — the right button, or a hold on a phone.
- **A week that holds two months says so**: a hairline stands in the gap where the month turns, so the 1st is never read as just another day.
- **The ends of the week strip soften while you are moving it** — and stay soft while your finger rests mid-drag, since the strip is still open between two weeks. Once it lands on a week the ends are as solid as they ever were.
- **The week at the top of Home answers a flick**: throw it and it glides on, slowing down, as far as two weeks; drag it slowly and it turns one. It always comes to rest on a whole week, never between two.
- **New list, New notepad and New group wear the icon of the thing they make**, so the sidebar's menu can be read at a glance instead of word by word.
- **Two notes are no longer made into a folder by accident on the way past**: the card has to rest on the middle of another for a moment before it is taken as "put these together", and the ring tells you when it has.
- **The day you are on wears a slightly less rounded marker**: it stopped a hair short of a pill, and the small flat at the top and bottom of the curve made the shape look cut off.
- **Ticking a task off plays out before the list moves**: the card leaves, closing its own gap, and only then do the others slide up — nothing jumps under your finger. Unticking a completed one plays the same way.
- **A card answers a tap with a soft wash of the accent** inside its own rounded corners, instead of the square grey flash of the system.
- **A task card keeps its bookmark and its age together at its end**, so the title sits in the middle whether or not the task has fields; the × on a completed card takes the bookmark's place.
- **Opening a task from the search lands on its own list**, the screen you always read it on, with the task open in the panel and brought to the middle; a completed one unfolds the Completed run. Home, the timeline and a reminder open tasks the same way.
- **Two search shortcuts, as in a browser**: Ctrl+F finds on the screen you are on — inside the open note, or in the space on screen — and Ctrl+Space searches the whole notebook from anywhere, a note included.
- **Opening a note from the search lights the word you looked for**: the first place it appears is centred on screen and highlighted for a moment.
- **The search box is simpler**: the magnifier sits inside the field, a small × inside it clears what you typed, and the results say only which space a hit is from — and "completed" for a done task — instead of repeating the list or the Inbox folder on every row. The Completed screen no longer says every task goes back to the main list.

## v0.56.1

### Fixed

- **Holding a card no longer raises the system's own text selection over it** — a hard grey rectangle across the rounded card, on the way to opening its actions.

### Improved

- **The actions of a held card now stand in a column beside your finger**, as separate squares instead of circles scattered around it, and the one under your finger is lit and names itself. Sliding onto it and letting go is the same gesture as before, and letting go anywhere else still does nothing.

## v0.56.0

### New

- **Hold a card and its actions open around your finger** — tasks, notes and the spaces in the sidebar: drag to the one you want and let go, or let go anywhere else and nothing happens. On the computer the ⋮ on a note card opens the same ring.
- **A sync conflict is settled from the banner.** Each copy now says what the two versions disagree about and has "Keep this device's" and "Keep the other's"; whichever version goes lands in the Trash, and Ctrl+Z takes it back.
- **Two devices that changed different tasks of the same list are merged on their own**, and so are two that wrote in different parts of the same note: the changes are put together, the copy goes to the Trash and a line says what was merged. A copy is left for you only where both devices changed the same thing — and there, in a list, the other device's version lands right under yours, marked, so you can delete one with a tap.
- **The Home's notes of the day now include the notes you edited today**, not only the ones created today — from any notepad, and from any device on a synced notebook.
- **Drag a card to the top or the bottom of a long list and the list scrolls with it**, faster the further into the edge you go, so a task can reach a place off the screen without being let go of.
- **A screen reader now says where a task landed** when you move it, whether you dragged it or pressed Alt and an arrow.

### Fixed

- **A numbered item is no longer pushed a step to the right while you type it.** The `1.` of an item with a single letter after it sat out of line with the bullets above until you typed the second letter.

- **Starting a list from the formatting bar leaves the cursor after the `- `, `1. ` or `- [ ] `**, ready to type, instead of in front of it.
- **A reminder shown on one device no longer rings again on the next one to sync.** The notebook now remembers which reminders have been dealt with, alongside the rest of its bookkeeping.

- **Moving a task with Alt and an arrow works press after press.** Only the first press used to land: the card lost the focus as soon as the list came back from disk.
- **Scrolling in the middle of a drag no longer drops the card in the wrong place.** The list's positions now follow the scroll instead of staying where they were when you picked the card up.
- **A card being dragged no longer pops its tooltip over the list** while your hand rests.

- **On a phone, the app no longer files its own typing as a sync conflict.** A pause while typing on Android could leave a `sync-conflict` copy of the note's own earlier text beside it, and the banner on every device.
- **Two devices on one synced notebook no longer produce conflict copies of `.jott/index/`.** Each device now keeps its own "last seen" file, and Jott reads them all together.
- **A sync conflict arriving while the app is open raises the notice right away**, instead of waiting for the next time the notebook was read.
- **A list saved while another device's version was arriving keeps that version instead of writing over it.** Jott checks the file just before it saves, and anything it did not read is kept beside the list as a `sync-conflict` copy — the same thing it already did for the open note.
- **A conflict copy still being fetched is no longer counted as one.** A half-transferred copy has a temporary name, and the notice used to ask about a file that was about to be called something else — or that never arrived at all.
- **Two devices that changed the same day apart no longer leave a conflict copy.** What is in Today and what is planned for the days ahead are now merged on their own — each device's choices kept, the copy moved to the Trash — and the banner is left for what Jott cannot decide.
- **A sync-conflict copy holding exactly what the original holds no longer asks you to choose.** Both devices wrote the same thing, so opening the notebook moves the copy to the Trash instead of leaving the banner up — for your own lists and notes too, not just Jott's own files.
- **No more conflict copies of files neither device changed.** Jott now writes a file only when its contents really differ, so opening the app on the phone and on the computer while they are out of contact stops leaving `sync-conflict` copies of its own bookkeeping.
- **Renaming the open note no longer flashes "No such file or directory".** The app now recognises its own rename instead of re-reading the name it just left behind.
- **Deleting the open note no longer leaves an error on the screen.** The app used to re-read the file it had just deleted and show the raw "io error"; a re-read that comes from the disk changing is now quiet, and only opening a note reports when it cannot be read.

### Improved

- **Bullets and numbers in a note now read one step back from the text.** A list marker is drawn in a lighter ink than the words it introduces, and the bullet itself is a little bigger, so the structure of a list is easy to run your eye down.
- **A change arriving from another device reloads the screen once, not twice.** A file landing again with exactly the content Jott already has is no longer treated as news.
- **A card you drag is no longer cut off by the edge of the page.** It lifts as you pick it up, stops at the edge of the list instead of being clipped by it, and flies to its new place rather than appearing there.
- **Dragging a card in a long list is smooth, and the order stops flickering when your hand rests on the line between two cards.** A drag now also lets go instead of guessing when the list changes underneath it — a task arriving from another device, say.

## v0.55.0

### New

- **A list's file is its order.** Sorting by name, creation date or due date (with ↓ ↑ for the direction) rewrites the `.md` in that order, and dragging a card makes it your custom order, which Custom brings back; a list reordered in another editor switches to Custom and keeps what you did.
- **On a phone, every space has the Home's +.** In a notes space it opens a blank note with the cursor in its body; in a list, one tap opens the task bar above the keyboard.
- **Change a note's banner from its card.** The ⋮ of a note card, on the board and on the Home, now has the Banner row: the eight colours, a picture, or none.

### Fixed

- **Pinning or colouring a folder of notes no longer reloads every screen**, and Ctrl+Z takes it back like any other action.
- **A damaged preferences file is kept, not overwritten.** If `machine-prefs.json` cannot be read, it is set aside with a timestamp and a fresh one starts; and a key written by a newer Jott survives an older one saving the file.
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

- **On a phone, no action holds the screen while the notebook is read or written.** Every command that touches the notebook's files now runs off the thread that draws, not only opening it.
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
