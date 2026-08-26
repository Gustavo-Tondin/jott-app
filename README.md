# Jott

Tasks and notes that live on your computer, in plain Markdown files you can
open without the app.

Jott is **local-first**: no account, no server, no internet required. Your
tasks and notes are `.md` files inside a folder you choose — read them, edit
them, sync them or version them with any other tool, including Obsidian. If
you ever stop using Jott, everything stays there, readable.

Runs on **Linux, Windows and Android** from one codebase, with a native
interface (not a packaged website).

- [Install](#install) · [What it does today](#what-it-does-today) ·
  [Your data on disk](#your-data-on-disk) · [Roadmap](#roadmap) ·
  [Contributing](#contributing) · [Documentation](documentation/)

## Install

Grab the file for your platform from the
[**latest release**](https://github.com/Gustavo-Tondin/jott-app/releases/latest):

| Platform | File | Notes |
|---|---|---|
| Linux (any distro) | `.AppImage` | `chmod +x`, then run. To remove it, delete the file. |
| Debian / Ubuntu | `.deb` | Installs into the app menu; uninstall with the package manager. |
| Fedora | `.rpm` | Same as above. |
| Arch | — | Build from source: `cd packaging/linux && makepkg -sid` |
| Windows | `.exe` | Installs for the current user — no administrator password. Uninstall from Settings → Apps. |
| Android | `.apk` | Open the release page **on the phone**, download and tap the file. Android asks once to allow installs from your browser. |

**Updates.** Jott checks GitHub once a day for a new version (you can turn
this off in Settings — it is the only connection the app ever makes, and it
sends nothing about you or your notebook). The AppImage and the Windows build
update themselves in place; package-manager installs and the APK get a button
that opens the download page. A newer APK installs over the old one and keeps
your data.

> **Windows warning on first run.** Jott isn't code-signed: Windows shows
> *"Windows protected your PC"* — click **More info**, then **Run anyway**.
> Once, per version.

## Principles

- **Your data is yours** — local files, open format, readable outside the
  app, no lock-in.
- **Simple first** — anything advanced is optional and doesn't clutter the
  basics.
- **What's local is free, forever.** Online services (sync, backup) may come
  later as paid options, but no local feature will ever be removed to push a
  subscription.
- **Privacy** — the app makes no connection beyond the optional update check.

## What it does today

Pre-1.0, and used daily. The
[releases page](https://github.com/Gustavo-Tondin/jott-app/releases) says
what the current version is.

**Tasks**
- Inbox and lists of your own, in as many task spaces as you want.
- **Today** and **Week**: you pull in what you want to face, instead of
  staring at the whole list. Suggestions are ordered by urgency, never
  auto-selected — unless you turn on "dated tasks join the day".
- Due dates, priorities, tags, repetition, descriptions, subtasks and file
  attachments; completed tasks kept in their own file, restorable.
- A task shown outside its space — on Today, in a search, among the
  suggestions, in Completed — wears a badge with the space it came from,
  in that space's colour. Tags are neutral `#chips`: the one colour a card
  carries is its space's.
- Every task carries the day it entered the app — a line you typed by hand
  gets today's date the next time the notebook opens, and nothing else
  about it changes.
- **Reminders**: a date and time on any task (presets or your own), or an
  automatic one for every dated task — the day of, or the day before, at an
  hour you choose. They ring through the system's notifications; on the
  desktop Jott waits in the tray after the window closes (and can start with
  the session), on Android the alarm is the system's and rings with the app
  closed.
- A day/week rollover you configure, down to the hour.

**Notes**
- A masonry card board, with folders as cards; or a plain board with every
  note on screen.
- Markdown editor with live preview (CodeMirror): headings, lists, quotes,
  code, tables as an editable grid, find & replace, a formatting panel you
  can dock to any edge or float.
- `[[Note]]` links between notes and `[[/file.pdf]]` references to files,
  both with autocompletion; colour or image banners; pinning; bulk select.
- **Note tags**, as properties under the title (`tags:` in the front matter,
  the way Obsidian writes it), picked from the same list as task tags and
  found by the same `#name` search.

**The notebook**
- **One image and file library** (`assets/`) for the whole notebook, with
  usage tracking and safe renaming — links inside notes follow the file.
- **Global search** (Ctrl+F / Ctrl+K), or scoped to one space.
- **A notebooks screen**: everything this machine has opened, with colours
  and counts read without opening anything; rename, move, reveal, forget.
  Two notebooks can be open side by side, one per window.
- **Nothing is destroyed** — everything deleted goes to the notebook's trash
  and comes back exactly where it was. Undo/redo (Ctrl+Z) for app actions,
  separate from the editor's own.
- **Outside changes are detected** — edit a file in another editor, or let
  Syncthing/Drive sync it, and the app follows.

**Looks and input**
- Three themes (default, light, dark) × eight accent colours, each with a
  six-rung ladder so headings and chrome agree with the theme.
- **Themes you bring in yourself**: drop a `.css` file into your notebook's
  `.jott/themes/` and pick it in Settings — saving the file repaints the app.
  The app writes the first one for you, out of the look already on screen
  ([how](documentation/theming.md)).
- Three font choices (interface, note body, monospace) from the fonts your
  machine has; interface zoom; note text size.
- Configurable keyboard shortcuts for ~50 commands.
- One responsive shell: sidebar and panels on the desktop, drawer and bottom
  sheets on the phone.

## Your data on disk

Each folder is a **space** with one job only: it's either a task list or a
notebook of notes. The three the app creates carry the `jott.` prefix — they
belong to it, which leaves the pretty names free for you. Groups are plain
folders that gather spaces in the sidebar.

```
MyNotebook/
├── jott.tasks/          ← the app's task space
│   ├── task-list.md     ← shown as "Inbox" in the app
│   └── completed.md
├── jott.notes/          ← the app's space for loose notes
├── assets/              ← every image and file the notebook uses
├── Groceries/           ← a task list of yours
│   ├── task-list.md
│   └── completed.md
├── Work/                ← a group, gathering spaces
│   └── Clients/         ← a notes space of yours
└── .jott/               ← config and trash — nothing is ever destroyed,
                            deleted things wait here to be restored
```

A task is one Markdown checklist line; a note is one Markdown file:

```markdown
- [ ] Buy milk
- [x] Pay internet bill
```

Every notebook documents its own format in plain text
(`.jott/_FORMAT.txt`), so your files never depend on this repository to be
understood. The full contract — front matter, banners, attachments, config
files — is in [`documentation/file-format.md`](documentation/file-format.md).

## Roadmap

Jott is pre-1.0. This is the honest state of it, by horizon.

**Now — what's left before v1**

One product decision remains, then it is proving things on hardware.

| | |
|---|---|
| **The time axis** — a Timeline of everything you wrote, by day, and a weekly sweep of what you have not looked at in a while | decided 2026-08-25; every task and note already carries its creation date. The Timeline will read an append-only log in `.jott/timeline/` (one plain-text file per year, never rewritten — a deleted item stays as a dated mention, a living one opens from there), every task will get an id, and a last-seen record for notes will live in `.jott/index/` (regenerable — losing it loses nothing you wrote) |
| Android on real hardware | the build installs and runs, and has been used on one physical phone — everything since has been the emulator |
| Clicking through what only tests have seen | app-level undo/redo, the mouse back button, the light and dark themes |

**Next — after v1, in rough order of appetite**

- **Other views of the same list** — table and kanban, reading the data v1
  already writes. Not a new kind of space.
- **Local version history for a note** (`.jott/history/`) — the trash
  protects a deleted file; nothing yet protects a paragraph you overwrote.
- **Command palette** (Ctrl+P) — the command registry already exists; today
  a command without a key is unreachable from the keyboard.
- **System-wide capture** (Ctrl+Alt+Space) — the one shortcut that matters
  most for an app whose thesis is "write it down before you forget it".
- **Easier theme authoring** — the format is honest but verbose (~50
  assignments per region). The app now writes the first file for you; making
  the file itself smaller is still open ([theming](documentation/theming.md)).
- **Translations**, importers (Todoist, Microsoft To Do, Obsidian Tasks),
  CSV export/import, PDF export of a note, split view, time-of-day on tasks.

**Later — optional paid services, never replacing a local feature**

End-to-end encrypted multi-device sync, cloud backup, sharing and
publishing. Syncing today is already free and works: point Syncthing, Drive
or git at the notebook folder.

**Not happening** — decided, not pending

| | Why |
|---|---|
| Third-party plugins running code from the notebook folder | executable JavaScript inside your *data*, synced to every device |
| A graph view | the product is "simplified Obsidian, no graph" |
| Whiteboard, mindmap, dashboards, multi-widget spaces | cut in 2026-08 — they were the most expensive part of the app and the least aligned with "write it down fast" |
| Smart typography that rewrites what you typed | the app never puts characters in your file that you didn't type |
| An iOS build | no free path to distribution |

## Contributing

Issues and pull requests are welcome. Start with
[`CONTRIBUTING.md`](CONTRIBUTING.md) — it covers the setup, the two test
suites, and the handful of rules that keep this codebase the way it is.

Writing a **theme** is the smallest useful contribution and needs no Rust:
[`documentation/theming.md`](documentation/theming.md).

## Development

Requirements: Rust (stable, via `rustup`), Node.js with npm, and the system
libraries `webkit2gtk-4.1`, `gtk3` and `libsoup3`.

```bash
npm install          # frontend dependencies
npm run tauri dev    # run the app
cargo test           # business logic tests
npm test             # frontend tests
npm run package      # build AppImage / deb / rpm
```

| Folder | What it is |
| --- | --- |
| `core/` | Pure Rust crate with all the business logic. No Tauri dependency. |
| `src-tauri/` | Thin shell that exposes `core` to the frontend via `invoke()`. |
| `src/` | Svelte frontend, with plain CSS. |
| `documentation/` | Architecture, file format, theming, contributing. |

Platform-specific build notes (AppImage stripping, Windows CI, the Android
SDK and its storage permission) are in
[`documentation/building.md`](documentation/building.md).

## License

Jott is free software under the [MIT License](LICENSE) — use it, read it, fork
it, ship your own build of it. The notebook it writes is plain Markdown, so
your side of the deal never depended on the license anyway.
