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

**Arch**: `cd packaging/linux && makepkg -sid`. The `PKGBUILD` reads the version
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
`packaging/windows/windows-preflight.sh` that checks the things that only break on
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

`.cargo/config.toml` links the Android library with 16 KB page alignment
(`-z max-page-size=16384`): devices on Android 15+ may boot with 16 KB pages,
and a library aligned to 4 KB does not load there. NDK r28 and later do this
by default; the flag keeps r27 builds right. Check a build with
`readelf -lW libjott_lib.so | grep LOAD` — the last column should be `0x4000`.

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

Cutting a release is one command (`packaging/release.sh <version>`), which
bumps that one file, proves every derivation followed, runs both suites plus
clippy, tags, and stops to ask before pushing — because a pushed tag writes a
draft release on a public repository. When the `test` workflow already passed
on that commit — both suites on real Linux and real Windows, plus clippy — its
verdict stands in for the local suites and the Windows preflight.
`packaging/release.sh <version> --ship` runs the whole cycle unattended: cut,
APK, push, wait for the workflow, publish, website.

Versions move one minor at a time — 0.52, 0.53, 0.54 — with a patch always
allowed on top of the newest tag and exactly one jump allowed, the one to 1.0.
The script refuses to tag anything else: a release holding a lot of work is
still the next number.

Publishing is the other half, and it is `packaging/release.sh --publish`. It
waits for the tag's workflow run and refuses unless it is green — the release
workflow runs the suites beside the build, so a draft can exist for a tag whose
tests failed. Then it attaches the APK (nothing in CI can build it), publishes
the draft **and marks
it Latest in the same call** — a release born as a draft does not take that
alias on its own, and `releases/latest/...` would go on serving the previous
version — then waits until `releases/latest/download/latest.json` really
answers the new version before pointing anything at it. When a checkout of the
website is present, it also writes the version onto its download page and a
new entry onto its changelog page, from this same `CHANGELOG.md`.

Everything that packages the app lives under `packaging/`, one folder per
platform (`linux/` holds the `PKGBUILD` and the `.desktop` entry, `windows/`
the preflight, `android/` notes on the APK — the Gradle project itself stays
in `src-tauri/gen/android/`, where Tauri looks for it). At the end of a
release the script copies the newest installer of each kind into
`packaging/releases/` and writes a README there naming the version each one
announces; `packaging/release.sh --collect` does only that step. The binaries
are gitignored — only the README is versioned.

Installers are published under names that say what they are and nothing else:
`jott-windows.exe`, `jott-ubuntu.deb`, `jott-fedora.rpm`,
`jott-linux.AppImage`, `jott-android.apk`. The version is not in them — the
release above them says it. The bundler names its output after itself, so the
workflow's `assets` job renames the uploaded files (and `packaging/releases/`
uses the same names, because the APK is built locally and uploaded by hand).
`latest.json`, which the in-app update check reads, points at those files by
URL, so the same job rewrites it with the new names; a signature covers a
file's bytes, not its name.

Release notes come from `CHANGELOG.md`: the workflow reads the `## vX.Y.Z`
section for the tag it is building and puts the install instructions above it.
`packaging/release.sh` refuses to tag a version with no section.
