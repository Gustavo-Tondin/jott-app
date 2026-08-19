# Jott

Tasks and notes that live on your computer, in plain Markdown files you can
open without the app.

Jott is **local-first**: no account, no server, no internet required. Your
tasks and notes are `.md` files inside a folder you choose — read them, edit
them, sync them or version them with any other tool, including Obsidian. If
you ever stop using Jott, everything stays there, readable.

Runs on **Linux, Windows and Android** from one codebase, with a native
interface (not a packaged website).

## Install

Grab the file for your platform from the
[**latest release**](https://github.com/Gustavo-Tondin/jott-app/releases/latest):

| Platform | File | Notes |
|---|---|---|
| Linux (any distro) | `.AppImage` | `chmod +x`, then run. To remove it, delete the file. |
| Debian / Ubuntu | `.deb` | Installs into the app menu; uninstall with the package manager. |
| Fedora | `.rpm` | Same as above. |
| Arch | — | Build from source: `cd packaging && makepkg -sid` |
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

## How your stuff sits on disk

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
├── assets/              ← every image the notebook uses, in one library
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

The format is documented inside every notebook, in plain text
(`.jott/_FORMAT.txt`), so your files never depend on this repository to be
understood.

## What the app does today (v0.20)

- **Tasks** — Inbox and your own lists; **Today** and **Week** views where
  you pull in what you want to face, instead of the whole list; priorities,
  tags, repetition, due dates, descriptions and file attachments; completed
  tasks kept separate, with undo.
- **Notes** — folders shown as a card board; Markdown editor with live
  preview; `[[links]]` between notes with autocompletion; colour or image
  banners; find & replace; global search (Ctrl+F).
- **One image library** for the whole notebook, with safe renaming — links
  inside notes are rewritten with the file.
- **Day and week rollover** you configure — including the hour, for whether
  you plan tomorrow before bed or first thing in the morning.
- **Three themes** (default, light, dark) × eight accent colours;
  configurable shortcuts; interface zoom.
- **Nothing is destroyed** — everything deleted goes to the notebook's own
  trash and can be restored to where it was.
- **Outside changes are detected** — edit a file in another editor, or let
  Syncthing/Drive sync it, and the app follows.

Syncing across devices **is already possible for free**: point Syncthing,
Drive or similar at the notebook folder. Planned next: table and kanban as
other views of the same list, importers, translations — and optional paid
conveniences (encrypted sync, backup) that never replace the free local way.

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

Platform notes:

- **AppImage** is packaged with `NO_STRIP=1` (the `package` script does it):
  the `strip` bundled with linuxdeploy predates the `.relr.dyn` ELF section
  current toolchains emit.
- **Windows** installers are built by CI (`.github/workflows/release.yml`) —
  they can only be assembled on Windows.
- **Android** builds need JDK 17+, the Android SDK and NDK, with `JAVA_HOME`,
  `ANDROID_HOME` and `NDK_HOME` set:

  ```bash
  npm run tauri android build -- --apk    # release (needs a keystore)
  npm run tauri android build -- --debug --target aarch64 --apk
  ```

  On Android, Jott asks for the *All files access* permission and then lets
  you browse to any folder — the same thing Obsidian does, and for the same
  reason: Android's Storage Access Framework hands an app a `content://` URI,
  which is not a path, and Jott's core reads and writes plain paths. Put the
  notebook wherever a sync client can also see it. Decline the permission and
  Jott falls back to its private folder
  (`Android/data/dev.gustavotondin.jott/files/Documents/Jott`) — real `.md`
  files reachable over USB, but invisible to every other app on the phone,
  sync clients included; uninstalling Jott deletes it.
