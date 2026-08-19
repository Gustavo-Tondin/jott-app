# Jott

Tasks and notes that live on your computer, in files you can open without
the app.

Jott is a local-first app: nothing essential depends on the internet or on
creating an account. Your tasks live in plain Markdown files, inside a
folder you choose — you can read, edit, or version them with any other
tool, including Obsidian. If you ever stop using Jott, your data stays
there, readable.

Runs on Linux, windows and Android from the same codebase, with a native interface
(not a packaged website).

> **Status:** early development. No usable version yet.

## Principles

- **Your data is yours** — local files, open format, accessible outside the app, no
  lock-in.
- **Simple first** — anything advanced is optional and doesn't clutter the
  basics.
- **What's local is free, forever.** Online services (sync, backup) are
  paid and optional, but no local feature will ever be removed to push a
  subscription. (services in development)
- **Privacy** — end-to-end encryption on the online services. (services in development)

## How your stuff sits on disk

Each folder is a space with **one job only**: it's either a task list or a
notebook. The three that the app creates carry the `jott.` prefix — they
belong to it, and saying so up front leaves the pretty names free for you.

```
MyNotebook/
├── jott.tasks/          ← the list the app creates
│   ├── Tasks.md
│   └── Completed.md
├── jott.notes/          ← the space for loose notes the app creates
├── Compras/              ← a list of yours
│   ├── Compras.md
│   └── Completed.md
└── Trabalho/             ← a group, gathering spaces
    └── Clientes/         ← a space for notes of yours
```

And inside each task list file, plain Markdown checklists:

```markdown
- [ ] Buy milk
- [x] Pay internet bill
```

## What's coming

Development is sequential: each stage only starts once the previous one
truly works.

### Version 1 — tasks and notes

- [x] App base running on Linux
- [x] Create, edit, and complete tasks, all saved to `.md` files
- [x] Standalone lists and notebooks, which can be gathered into groups
- [x] **Today** and **Week** views: you choose what to pull into each
      period, instead of facing the whole list at once
- [x] Configurable day and week rollover — including the time, for
      whether you plan tomorrow before bed or first thing in the morning
- [x] Completed tasks kept separate, with undo that returns the item to
      its original list
- [x] Detects changes made from outside the app (handy with Syncthing,
      Drive, etc.)
- [x] Deleting never destroys: everything goes through a trash inside the
      notebook
- [ ] Notes: Markdown editor and folder organization, in progress
- [ ] Finished interface, with light and dark theme
- [ ] Android version, with a touch-adapted layout
- [ ] Ready-to-install packages: AppImage/Flatpak on Linux, APK on Android

### After v1

- **Optional features, always local and free** — table and kanban as other
  ways to view the same list, links between notes, importer for other
  apps, interface translations
- **Optional online services (paid)** — sync across devices with
  end-to-end encryption, automatic backup with version history,
  collaboration, and note publishing

Syncing across devices **is already possible for free today**, by pointing
Syncthing, Drive, or similar at your notebook folder. The paid service is
convenience, not permission.


### Install

**Arch and derivatives** — the native way, which adds the app to your
application menu:

```bash
cd packaging && makepkg -sid    # -d if Rust/Node come from rustup or nvm
```

**Any distribution** — the AppImage, `.deb`, and `.rpm` come out in
`target/release/bundle/` after running `npm run package`.

> **AppImage note:** packaging uses `NO_STRIP=1` (that's what the
> `package` script does). The `strip` bundled with `linuxdeploy` is too
> old for the ELF `.relr.dyn` section that current distributions use, and
> without this the bundle fails on every system library.

**Windows** — the installer is built by CI
(`.github/workflows/release.yml`), since a Windows installer can only be
put together on Windows. It installs for the current user and doesn't
require administrator rights.

> Jott isn't signed with a certificate. On first launch Windows shows
> *"Windows protected your PC"* — click **More info**, then **Run
> anyway**. Just once, per version.

**Android** — sideload APK. Building requires JDK 17+, the Android SDK,
and the NDK; with `JAVA_HOME`, `ANDROID_HOME`, and `NDK_HOME` set:

```bash
npm run tauri android build -- --apk    # release (needs a keystore)
npm run tauri android build -- --debug --target aarch64 --apk
```

> **Where the notebook lives on Android.** Jott asks for the *All files
> access* permission and then lets you browse to any folder — the same
> thing Obsidian does, and for the same reason: Android's Storage Access
> Framework hands an app a `content://` URI, which is not a path, and
> Jott's core reads and writes plain paths. Grant it when the app asks
> (Android opens its own Settings screen), and put the notebook wherever
> a sync client such as Syncthing can also see it.
>
> Decline, and Jott falls back to its private folder,
> `Android/data/dev.gustavotondin.jott/files/Documents/Jott`. That folder
> is real `.md` files reachable over USB — but **no other app on the
> phone can read it**, sync clients included: since Android 11 an app's
> own container is off-limits to everyone else, and stays off-limits even
> to an app holding all-files access. Uninstalling Jott deletes it.


## Development

Requirements: Rust (stable, via `rustup`), Node.js with npm, and the
system libraries `webkit2gtk-4.1`, `gtk3`, and `libsoup3`.

```bash
npm install          # frontend dependencies
npm run tauri dev    # run the app
cargo test            # business logic tests
npm test              # frontend tests
npm run package       # build AppImage / deb
```

Layout:

| Folder       | What it is                                                    |
| ------------ | -------------------------------------------------------------- |
| `core/`      | Pure Rust crate with all the business logic. No Tauri dependency. |
| `src-tauri/` | Thin shell that exposes `core` to the frontend via `invoke()`. |
| `src/`       | Svelte frontend, with plain CSS.                                |
