# Building Jott

One codebase, three platforms. Linux is the development platform; the others
are built from it or by CI.

## Requirements

**All platforms**

- Rust, stable, via [rustup](https://rustup.rs)
- Node.js with npm
- On Linux: `webkit2gtk-4.1`, `gtk3`, `libsoup3` and their development
  headers (`webkit2gtk-4.1`, `base-devel` on Arch; `libwebkit2gtk-4.1-dev`,
  `build-essential`, `libssl-dev` on Debian/Ubuntu)

```bash
npm install
npm run tauri dev    # the app, with hot reload on the frontend
cargo test           # the rules
npm test             # the frontend
```

## Linux packages

```bash
npm run package      # AppImage + .deb + .rpm, into src-tauri/target/release/bundle/
```

`npm run package` sets `NO_STRIP=1`, and that is not cosmetic: the `strip`
bundled with linuxdeploy predates the `.relr.dyn` ELF section current
toolchains emit, and stripping with it produces a binary that will not start.

**Arch**: `cd packaging && makepkg -sid`. The `PKGBUILD` reads the version
out of `Cargo.toml` instead of carrying its own, and its `check()` runs the
test suites — a package that builds is a package whose tests passed.

**AppImage caveat worth knowing if you hack on the bridge**: the AppImage
runtime rewrites `PATH` and friends for the app *and every process it
spawns*, which is how a bundled `xdg-open` ends up being launched instead of
the system one. The bridge resolves host binaries to an absolute path itself
before spawning.

## Windows

Installers are built by CI (`.github/workflows/release.yml`, matrix
`ubuntu-22.04` + `windows-latest`, triggered by a `v*` tag) because a Windows
installer can only be assembled on Windows. Both suites run before anything
is packaged, so a tag never becomes an installer from a commit that doesn't
pass.

Cross-compiling a `.exe` from Linux for testing is possible; there is a
`scripts/windows-preflight.sh` that checks the things that only break on
Windows before a tag is cut.

The installer is `installMode: currentUser` — no administrator password. It
is not code-signed (see the README), and signing is not planned: a
certificate is a recurring cost for a free app.

## Android

Needs JDK 17+, the Android SDK and NDK, with `JAVA_HOME`, `ANDROID_HOME` and
`NDK_HOME` set.

```bash
npm run tauri android build -- --debug --target aarch64 --apk   # to try it
npm run tauri android build -- --apk                            # release; needs a keystore
```

A release APK must be signed. Generate your own keystore locally — it is
free, it never goes in the repository, and it is the one key you cannot lose:
Android refuses to install an update signed by a different key, so a new APK
would land *beside* the old app instead of over it.

`versionCode` is derived as `major×1e6 + minor×1e3 + patch`, and the release
script asks the built APK what it thinks it is (via `aapt2`), refusing a
build whose version doesn't match the source or whose `versionCode` didn't
increase.

**Storage.** Jott asks for *All files access* and then lets you browse to any
folder — the same thing Obsidian does, and for the same reason: Android's
Storage Access Framework hands an app a `content://` URI, which is not a
path, and Jott's core reads and writes plain paths. Put the notebook
somewhere a sync client can also see it. Decline the permission and Jott
falls back to its private folder
(`Android/data/dev.gustavotondin.jott/files/Documents/Jott`) — real `.md`
files reachable over USB, but invisible to every other app on the phone, sync
clients included, and deleted when Jott is uninstalled.

Android is not in CI: without a keystore in secrets it would be a dead step.

## Where the version lives

**One file: `[workspace.package] version` in the root `Cargo.toml`.**
Everything else derives from it — the two crates inherit it, the running app
reads `CARGO_PKG_VERSION`, `tauri.conf.json` and `package.json` deliberately
**have no `version` key** (the Tauri CLI falls back to the cargo manifest),
the `PKGBUILD` greps it, and the Android properties file is written during
the release.

Typing a `"version"` back into either JSON is the regression to fear: the
file would quietly win over the source. An architecture test rejects it.

Cutting a release is one command (`scripts/release.sh <version>`), which
bumps that one file, proves every derivation followed, runs both suites plus
clippy, tags, and stops to ask before pushing — because a pushed tag writes a
draft release on a public repository.
