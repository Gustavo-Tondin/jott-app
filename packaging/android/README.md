# Android

The APK is built with `packaging/release.sh <version> --android` (needs the
SDK, NDK and the Android JDK under `~/Android/`). No CI builds it: the signing
keystore lives on this machine only, and an APK signed with a different key
installs beside the old app instead of over it.

What lives where:

- `src-tauri/gen/android/` — the Gradle project Tauri scaffolds once and that
  is then hand-edited (manifest permissions, signing config, `MainActivity`).
  It cannot move: `tauri android build` looks for it there.
- `src-tauri/gen/android/keystore.properties` — points at the keystore,
  gitignored, never published.
- `src-tauri/gen/android/app/tauri.properties` — `versionName`/`versionCode`,
  written by `release.sh` right before the build (the build does not write it).
- `packaging/releases/*.apk` — the last APK shipped, which `release.sh`
  compares the new one against (certificate must match, versionCode must go up).

`versionCode = major*1e6 + minor*1e3 + patch`, the same arithmetic the Tauri
CLI uses.
