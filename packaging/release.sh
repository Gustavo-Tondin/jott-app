#!/usr/bin/env bash
#
# release.sh — cut a Jott release in one command.
#
# WHY THIS EXISTS
#
# Every release repeated the same nine steps by hand: bump the version, run two
# suites and clippy, cross-check the Windows build, audit for secrets, commit,
# tag, push, build the APK, verify its signing certificate. Nine steps is more
# than anyone holds in their head at 1am, so the sequence was delegated to an
# assistant each time — slow, and a different order every release.
#
# The steps were never the hard part. Knowing WHY the order matters was. That
# knowledge is now here instead of in a chat log.
#
# THE VERSION LIVES IN ONE FILE
#
# It used to live in four, and this script proved after the fact that they
# agreed. Proving is not preventing: package-lock.json sat on 0.22.0 while the
# other four said 0.23.0, for a whole version, because it was not one of the
# four being compared. So the copies were removed instead of policed:
#
#   Cargo.toml [workspace.package] version   THE version. Cargo is the only
#                                            tool here that cannot read one
#                                            from another file, so it holds it.
#   core/ and src-tauri/Cargo.toml           inherit: version.workspace = true
#   the running app                          env!("CARGO_PKG_VERSION")
#   src-tauri/tauri.conf.json                NO version key — omitted on
#                                            purpose, so the Tauri CLI falls
#                                            back to the Cargo manifest
#   package.json                             NO version key — private:true, and
#                                            nothing in the repo read it
#   packaging/linux/PKGBUILD                 reads Cargo.toml at makepkg time
#
# --check no longer compares four hand-edits. It checks that each derivation
# still WORKS: that the inheritances are in place, that nobody helpfully typed
# a version back into one of the JSON files, and that `cargo metadata` — the
# very command the Tauri CLI runs to resolve the app version — lands on the
# same number.
#
# WHAT IT REFUSES TO DO
#
# It never pushes without asking. A pushed tag starts the release workflow and
# writes a draft release on a public repository — that is publication, and the
# script stops and waits for a typed yes. `--yes` is for a rerun that already
# answered.
#
# It never deletes anything. target/ can be 100 GB and the disk can be full;
# the script SAYS so and carries on, because what to remove is not its call.
#
# And it never skips a number. From v0.52.0 on, versions move one minor at a
# time — 0.52, 0.53, 0.54 — with a patch always allowed on top of the newest
# tag and one jump allowed, the one to 1.0. A release holding a lot of work is
# still the next number.
#
# USAGE
#
#   packaging/release.sh 0.24.0             # the whole cycle, stopping before the push
#   packaging/release.sh 0.24.0 --dry-run   # print every command, change nothing
#   packaging/release.sh --check            # only verify the derivations still work
#   packaging/release.sh --collect          # only refresh packaging/releases/ from what is built
#   packaging/release.sh --publish          # after the workflow: wait for it, publish the
#                                           # draft, make it Latest, push the site, sync the vault
#   packaging/release.sh 0.24.0 --ship      # all of it, unattended: cut, APK, push, wait,
#                                           # publish, site, vault — one command, no questions
#
#   The release notes come from CHANGELOG.md — the `## vX.Y.Z` section for the
#   version being cut. The script refuses to tag a version that has none.
#
#   When test.yml already passed on HEAD (real Linux + real Windows + clippy),
#   that verdict replaces the local suites and the wine preflight.
#
#   --ship             --android --yes, then --publish; pushes HEAD first when
#                      the CI has not seen it, so Windows answers before the tag
#   --skip-tests       skip npm test / cargo test / clippy
#   --skip-preflight   skip the Windows cross-check (packaging/windows/windows-preflight.sh)
#   --android          also build and verify the APK (needs the Android SDK)
#   --no-push          commit and tag, but never offer to push
#   --yes              answer yes to the push and publish gates (no terminal needed)
#
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
readonly ROOT="$PWD"

# Everything transient in one place, and a log that survives the run: the
# interesting part of a failure is always the part that scrolled off.
WORK="${JOTT_RELEASE_DIR:-${TMPDIR:-/tmp}/jott-release}"
readonly WORK
readonly LOG="$WORK/release.log"
mkdir -p "$WORK"

# Progress goes to stderr, never stdout: a couple of these functions have a
# value to return, and a log line on stdout would be captured along with it.
log() {
  local level="$1"; shift
  printf '%s [%s] %s\n' "$(date +%H:%M:%S)" "$level" "$*" | tee -a "$LOG" >&2
}
debug() { [ -n "${DEBUG:-}" ] && log DEBUG "$@"; return 0; }
die()   { log ERROR "$*"; exit 1; }

require() {
  command -v "$1" >/dev/null 2>&1 && return 0
  die "$1 not found — $2"
}

# Every command that changes something goes through this, so --dry-run is one
# rule rather than an `if` at each call site.
run() {
  if [ -n "$DRY_RUN" ]; then
    log DRY  "$*"
    return 0
  fi
  debug "running: $*"
  "$@"
}

# ---------------------------------------------------------------------------
# The one file that declares the version, and the derivations that must hold.
#
# Android is not in here. gen/android/app/tauri.properties is a generated file
# and carries the version separately; it is handled at build time, in step 8.
# ---------------------------------------------------------------------------

readonly SOURCE_FILE="Cargo.toml"

# The single source: [workspace.package] version. Scoped to that table so a
# `version = "1.0"` under [workspace.dependencies] can never be picked up by
# accident.
source_version() {
  sed -n '/^\[workspace\.package\]/,/^\[/{ s/^version *= *"\([^"]*\)".*/\1/p }' "$SOURCE_FILE"
}

# Rewrites the source and PROVES it changed. A sed that silently matches
# nothing is exactly how a release ships the previous version's number.
bump_source() {
  local to="$1" from
  from="$(source_version)"
  [ -n "$from" ] || die "$SOURCE_FILE declares no [workspace.package] version the script can read"

  [ "$from" = "$to" ] && { log INFO "  $SOURCE_FILE already $to"; return 0; }

  if [ -n "$DRY_RUN" ]; then
    log DRY  "  $SOURCE_FILE: $from -> $to"
    return 0
  fi

  sed -i "/^\[workspace\.package\]/,/^\[/ s/^version = \"$from\"\$/version = \"$to\"/" "$SOURCE_FILE"

  local now
  now="$(source_version)"
  [ "$now" = "$to" ] || die "$SOURCE_FILE did not take the bump — still $now. Nothing else was touched."
  log INFO "  $SOURCE_FILE: $from -> $to"
}

# Asks the PKGBUILD itself rather than re-implementing its sed here — a copy of
# the parsing would happily agree with itself while the real file was broken.
# Sourcing it only runs the top-level assignments; build/check/package are
# functions and are merely defined.
pkgbuild_version() (
  # shellcheck disable=SC2034
  startdir="$ROOT/packaging/linux"
  # shellcheck disable=SC1091
  source "$ROOT/packaging/linux/PKGBUILD" >/dev/null 2>&1 || return 1
  printf '%s' "${pkgver:-}"
)

# Reports one derivation. Sets DERIVED_BAD instead of dying so a single run
# lists everything that drifted, rather than one thing per invocation.
DERIVED_BAD=0
derives() {
  local what="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    log INFO  "  $what: $got"
  else
    log ERROR "  $what: ${got:-<nothing>}  (expected $want)"
    DERIVED_BAD=1
  fi
}

# ---------------------------------------------------------------------------
# Android, where the version does NOT derive on its own.
#
# Measured on 2026-08-21: `tauri android build` does not write
# gen/android/app/tauri.properties. Only `tauri android init` does, and nobody
# runs it between releases — so the file sat on 0.22.2 while the repository was
# on 0.23.0, and every APK built from it announced 0.22.2. Deleting the file
# does not help either: tauri.build.gradle.kts reads it with `"1.0"` and `1`
# baked in as defaults, and the APK comes out as version 1.0.
#
# The wrong label is the small half. The big half is versionCode: Android
# refuses to install an APK whose versionCode is not GREATER than the installed
# one, so a code frozen at 22002 means the next release does not install over
# the app at all — it just fails, on the user's phone, with no explanation.
#
# So the file is written here, from the source, right before the build. The
# arithmetic is the Tauri CLI's own, kept identical so an `android init` and
# this script can never disagree:
#
#   versionCode = major * 1000000 + minor * 1000 + patch
# ---------------------------------------------------------------------------

# The release page's "what changed" half is CHANGELOG.md — the workflow reads
# the `## vX.Y.Z` section for the tag it is building. Written after the tag, it
# would be written for a page that is already published, so it is checked
# before anything is bumped. Prints the section, or nothing.
changelog_section() {
  [ -f CHANGELOG.md ] || return 0
  awk -v want="## v$1" '
    $0 == want { inside = 1; next }
    inside && /^## / { exit }
    inside { print }
  ' CHANGELOG.md
}

readonly ANDROID_PROPERTIES="src-tauri/gen/android/app/tauri.properties"

android_version_code() {
  local major minor patch
  IFS=. read -r major minor patch <<<"$1"
  # 10# so a zero-padded segment is read as decimal and not as octal.
  printf '%d' "$(( 10#$major * 1000000 + 10#$minor * 1000 + 10#$patch ))"
}

# Written byte for byte the way the Tauri CLI writes it, including the absent
# trailing newline, so that a later `android init` produces no diff and nobody
# has to wonder which of the two was here last.
write_android_properties() {
  local version="$1" code
  code="$(android_version_code "$version")"
  [ "$code" -ge 1 ] || die "version $version gives versionCode $code, which Android rejects"

  if [ -n "$DRY_RUN" ]; then
    log DRY  "  write $ANDROID_PROPERTIES  (versionName=$version versionCode=$code)"
    return 0
  fi

  [ -d "$(dirname "$ANDROID_PROPERTIES")" ] \
    || die "$(dirname "$ANDROID_PROPERTIES") does not exist — run 'tauri android init' first"

  printf '// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.\ntauri.android.versionName=%s\ntauri.android.versionCode=%s' \
    "$version" "$code" > "$ANDROID_PROPERTIES"
  log INFO "  $ANDROID_PROPERTIES: versionName=$version versionCode=$code"
}

# The SDK's build-tools live in a versioned directory and are NOT on PATH —
# which is how the signing-certificate comparison below quietly never ran on
# this machine: `command -v apksigner` failed every time and the check fell
# through to its warning branch. Resolved by path instead, newest first.
build_tool() {
  ls -1 "${ANDROID_HOME:-$HOME/Android/Sdk}"/build-tools/*/"$1" 2>/dev/null | sort -V | tail -1
}

# Prints "versionCode versionName" for an APK, or nothing.
apk_version() {
  local aapt="$1" apk="$2" line
  line="$("$aapt" dump badging "$apk" 2>/dev/null | head -1)"
  printf '%s %s' \
    "$(printf '%s' "$line" | sed -n "s/.*versionCode='\([^']*\)'.*/\1/p")" \
    "$(printf '%s' "$line" | sed -n "s/.*versionName='\([^']*\)'.*/\1/p")"
}

# Sets AGREED_VERSION rather than printing it. `die` inside a $( ) subshell
# only kills the subshell — the script would sail past a disagreement it just
# reported as fatal.
AGREED_VERSION=""
check_versions() {
  DERIVED_BAD=0

  local want
  want="$(source_version)"
  [ -n "$want" ] || die "$SOURCE_FILE declares no [workspace.package] version the script can read"
  printf '%s' "$want" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' \
    || die "$SOURCE_FILE says '$want', which is not X.Y.Z"
  log INFO "  $SOURCE_FILE [workspace.package]: $want   <- the source"

  # The two crates must INHERIT. A literal here would compile and test and pass
  # every other check in this function, and ship a binary announcing the wrong
  # version through CARGO_PKG_VERSION.
  local crate
  for crate in core/Cargo.toml src-tauri/Cargo.toml; do
    if grep -qE '^version\.workspace *= *true' "$crate"; then
      log INFO  "  $crate: inherits (version.workspace = true)"
    else
      log ERROR "  $crate: does NOT inherit — it must say 'version.workspace = true'"
      DERIVED_BAD=1
    fi
  done

  # The two JSON files derive by SAYING NOTHING. Someone typing a version back
  # into either of them is the regression this whole rework exists to prevent,
  # and it is silent: the file would simply win over the source.
  local json
  for json in src-tauri/tauri.conf.json package.json; do
    if grep -qE '^[[:space:]]*"version"[[:space:]]*:' "$json"; then
      log ERROR "  $json: has a \"version\" key. Remove it — the key is what breaks the derivation."
      case "$json" in
        src-tauri/tauri.conf.json)
          log ERROR "    With no key, the Tauri CLI reads the version from $SOURCE_FILE." ;;
        package.json)
          log ERROR "    Nothing in this repo reads it, and the package is private." ;;
      esac
      DERIVED_BAD=1
    else
      log INFO  "  $json: no version key (derives from $SOURCE_FILE)"
    fi
  done

  derives "packaging/linux/PKGBUILD (pkgver, evaluated)" "$(pkgbuild_version)" "$want"

  # This is the strong one, and the only check here that asks CARGO instead of
  # reading a text file. `cargo metadata --no-deps --format-version 1` is the
  # exact command the Tauri CLI runs to resolve the app version when
  # tauri.conf.json omits it, so agreeing here is agreeing with what the
  # bundles, the installers and Android's versionName end up carrying — and
  # with what the running app announces through CARGO_PKG_VERSION.
  #
  # It reads the MANIFESTS, not the lock, so it answers correctly the moment
  # the source is edited. `cargo pkgid` looks like the shorter way to ask and
  # is not: it reports what Cargo.lock says, which is a different question —
  # asked separately, below.
  if command -v cargo >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
    local meta pkg
    meta="$(cargo metadata --no-deps --format-version 1 --offline 2>/dev/null \
         || cargo metadata --no-deps --format-version 1 2>/dev/null)"
    if [ -n "$meta" ]; then
      for pkg in jott jott-core; do
        derives "cargo resolves $pkg" \
          "$(printf '%s' "$meta" | python3 -c 'import json,sys
m = json.load(sys.stdin)
print(next((p["version"] for p in m["packages"] if p["name"] == sys.argv[1]), ""))' "$pkg")" \
          "$want"
      done
    else
      log WARN "  cargo metadata did not run — the resolution the bundles use went unchecked"
    fi
  else
    log WARN "  cargo or python3 missing — the resolution the bundles use went unchecked"
  fi

  # Cargo.lock carries the version too, and cargo — not this script — writes
  # it, so it lags a hand-edit of the source until the next cargo command. That
  # lag is harmless right up until it is committed next to a tag, which is the
  # same drift as before in a new hiding place. Checked, with the fix in the
  # message; the release flow refreshes the lock before it gets here.
  if [ -f Cargo.lock ]; then
    local locked
    locked="$(sed -n '/^name = "jott"$/,/^version/ s/^version = "\(.*\)"$/\1/p' Cargo.lock | head -1)"
    if [ "$locked" = "$want" ]; then
      log INFO  "  Cargo.lock: $locked"
    else
      log ERROR "  Cargo.lock: ${locked:-<nothing>}  (expected $want)"
      log ERROR "    cargo has not caught up yet. Fix:  cargo metadata --offline >/dev/null"
      DERIVED_BAD=1
    fi
  fi

  # Android is reported, not enforced. The file is generated, it is gitignored,
  # and `--android` rewrites it from the source right before the build — so a
  # stale value here is not drift, it is simply a file waiting to be written.
  # Making it fatal would stop the release at step 1 over something step 8
  # fixes. It is still worth SAYING, because a `tauri android build` run by
  # hand, outside this script, will use whatever is in there.
  if [ -f "$ANDROID_PROPERTIES" ]; then
    local android_name android_code
    android_name="$(sed -n 's/^tauri\.android\.versionName=//p' "$ANDROID_PROPERTIES")"
    android_code="$(sed -n 's/^tauri\.android\.versionCode=//p' "$ANDROID_PROPERTIES")"
    if [ "$android_name" = "$want" ]; then
      log INFO "  $ANDROID_PROPERTIES: $android_name (versionCode $android_code)"
    else
      log WARN "  $ANDROID_PROPERTIES: ${android_name:-<nothing>}  (the source says $want)"
      log WARN "    Harmless here — 'release.sh <version> --android' rewrites it before building."
      log WARN "    It only bites a 'tauri android build' run by hand, which would ship that number."
    fi
  fi

  [ "$DERIVED_BAD" -eq 0 ] || die "a derivation is broken — fix it before releasing"
  AGREED_VERSION="$want"
}

# ---------------------------------------------------------------------------
# The cadence — one step at a time, and no number skipped
#
# From v0.52.0 on, versions move 0.1 at a time: 0.52 -> 0.53 -> 0.54. The only
# jump is the one to 1.0. A version that holds a lot of work is still the next
# number: how much went into it is what the notes are for.
#
# The rule starts AT v0.52.0 rather than at the first tag, because the tags
# before it were cut under no rule at all — v0.51.0 was never even tagged —
# and a guard that refuses to run against the history it inherits is a guard
# nobody can switch on.
#
# A patch on top of the newest tag stays legal at every point. A fix for
# something already installed out there is not a step forward, it is the same
# step again; refusing it would make the only way to fix a shipped version be
# to announce a new one.
# ---------------------------------------------------------------------------

readonly CADENCE_FROM="0.52.0"

# True when $1 sorts strictly before $2. sort -V, not string order: 0.9.0
# comes before 0.52.0 and no caller has to know that.
version_lt() {
  [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$1" ]
}

# Prints "<next> <hotfix> [1.0.0]" — every version that may legally follow the
# newest tag. Nothing at all when there is no tag to follow.
cadence_options() {
  local last from major minor patch
  last="$(git tag --list 'v*' --sort=-v:refname | head -1)"
  [ -n "$last" ] || return 0
  from="${last#v}"
  IFS=. read -r major minor patch <<<"$from"
  printf '%s %s' "$major.$((minor + 1)).0" "$major.$minor.$((patch + 1))"
  [ "$major" = "0" ] && printf ' 1.0.0'
  printf '\n'
}

# Dies unless $1 is one of them. Against the newest TAG, not the source
# version: the source is where the next release is being written, and what
# must not be skipped is what was released.
check_cadence() {
  local want="$1" last from options next hotfix jump option
  last="$(git tag --list 'v*' --sort=-v:refname | head -1)"
  if [ -z "$last" ]; then
    log INFO "  cadence: no tag to follow — v$want starts the count"
    return 0
  fi

  from="${last#v}"
  if version_lt "$from" "$CADENCE_FROM"; then
    log INFO "  cadence: starts at v$CADENCE_FROM, newest tag is $last — not checked"
    return 0
  fi

  options="$(cadence_options)"
  read -r next hotfix jump <<<"$options"
  for option in $options; do
    if [ "$want" = "$option" ]; then
      log INFO "  cadence: $last -> v$want"
      return 0
    fi
  done

  log ERROR "v$want does not follow $last."
  log ERROR "  The next version is v$next, or v$hotfix to fix what $last shipped${jump:+, or v$jump for the jump to 1.0}."
  log ERROR "  A number is never skipped because a version holds a lot of work."
  die "v$want breaks the cadence"
}

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------

VERSION=""
# ---------------------------------------------------------------------------
# packaging/releases/ — the newest installer of each kind, side by side
#
# The build tools scatter them: Tauri writes under target/release/bundle/, the
# Windows cross-compile under target/x86_64-pc-windows-msvc/, gradle under
# src-tauri/gen/android/app/build/outputs/, makepkg next to the PKGBUILD. All
# of that is build output and gets cleaned; packaging/releases/ is the copy
# that survives a `cargo clean` — and where the PREVIOUS APK is read from to
# compare certificate and versionCode. One file per kind is kept: collecting
# a newer one removes the older. Gitignored except for the README (and the
# versions.tsv beside it, which is ignored too).
# ---------------------------------------------------------------------------

readonly RELEASES_DIR="$ROOT/packaging/releases"
# The version is no longer in the file NAME — here or on the release page. A
# person installing for the first time does not need to read a version out of
# a filename to find their own operating system, and the release above the
# files already says which version it is. THESE ARE THE SAME FIVE NAMES the
# workflow's `assets` job renames the uploaded artifacts to, and they have to
# stay the same ones: the APK is built here and uploaded to the release by
# hand, so this folder is where its name comes from.
#
# What the name stops carrying, this file remembers: one `name<TAB>version`
# line per collected installer, so the README below can still say which
# version each row was built from. Gitignored with the binaries.
readonly VERSIONS_FILE="$RELEASES_DIR/versions.tsv"

# newest <files...>: the most recently modified of those that exist.
newest() {
  local f best=""
  for f in "$@"; do
    [ -f "$f" ] || continue
    if [ -z "$best" ] || [ "$f" -nt "$best" ]; then best="$f"; fi
  done
  [ -n "$best" ] && printf '%s\n' "$best"
}

remember_version() {
  local name="$1" version="$2" tmp="$WORK/versions.tsv"
  touch "$VERSIONS_FILE"
  grep -v "^$name	" "$VERSIONS_FILE" > "$tmp" 2>/dev/null || true
  printf '%s\t%s\n' "$name" "$version" >> "$tmp"
  sort -o "$VERSIONS_FILE" "$tmp"
}

version_of() {
  [ -f "$VERSIONS_FILE" ] || { printf '?'; return 0; }
  awk -F'\t' -v n="$1" '$1 == n { print $2; found = 1; exit } END { if (!found) print "?" }' \
    "$VERSIONS_FILE"
}

# collect_one <kind> <name-it-gets> <source globs...>
collect_one() {
  local kind="$1" name="$2" src version; shift 2
  src="$(newest "$@")" || { debug "releases: $kind — nothing built"; return 0; }
  # Read the version from what the build wrote, while it still says so: the
  # bundler puts it in the file name, and gradle — which fixes the APK's name
  # — leaves it in the properties file the build was given.
  if [ "$kind" = "Android" ]; then
    version="$(sed -n 's/^tauri\.android\.versionName=//p' "$ANDROID_PROPERTIES" 2>/dev/null)"
  else
    version="$(basename "$src" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
  fi
  # One file per kind: an older build of the same kind goes, including one
  # that still carries a version in its name from before this folder was
  # renamed. Only ever inside packaging/releases/, and only build copies.
  find "$RELEASES_DIR" -maxdepth 1 -name "*.${name##*.}" ! -name "$name" -delete
  if [ -f "$RELEASES_DIR/$name" ] && cmp -s "$src" "$RELEASES_DIR/$name"; then
    debug "releases: $kind — $name already there"
    remember_version "$name" "${version:-?}"
    return 0
  fi
  cp -p "$src" "$RELEASES_DIR/$name"
  remember_version "$name" "${version:-?}"
  log INFO "  releases/: $kind -> $name (${version:-unknown version})"
}

# The folder used to hold the bundler's own names. Nothing is rebuilt for a
# file that is already here, so a file that never gets rebuilt would keep its
# old name forever — rename what is here, reading the version out of the name
# while the name still carries it.
adopt_existing() {
  local f name ver clear
  for f in "$RELEASES_DIR"/*; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"
    case "$name" in README.md|versions.tsv) continue ;; esac
    case "$name" in
      *.AppImage)    clear=jott-linux.AppImage ;;
      *.deb)         clear=jott-ubuntu.deb ;;
      *.rpm)         clear=jott-fedora.rpm ;;
      *.pkg.tar.zst) clear=jott-arch.pkg.tar.zst ;;
      *.exe)         clear=jott-windows.exe ;;
      *.apk)         clear=jott-android.apk ;;
      *)             continue ;;
    esac
    [ "$name" = "$clear" ] && continue
    # A file already under the clear name was collected later than this one.
    if [ -e "$RELEASES_DIR/$clear" ]; then
      log INFO "  releases/: dropping $name ($clear is newer)"
      rm -f "$f"
      continue
    fi
    ver="$(printf '%s' "$name" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
    mv -f "$f" "$RELEASES_DIR/$clear"
    remember_version "$clear" "${ver:-?}"
    log INFO "  releases/: $name -> $clear (${ver:-unknown version})"
  done
}

collect_releases() {
  mkdir -p "$RELEASES_DIR"
  adopt_existing
  collect_one "Linux AppImage" jott-linux.AppImage      target/release/bundle/appimage/*.AppImage
  collect_one "Debian/Ubuntu"  jott-ubuntu.deb          target/release/bundle/deb/*.deb
  collect_one "Fedora"         jott-fedora.rpm          target/release/bundle/rpm/*.rpm
  collect_one "Arch"           jott-arch.pkg.tar.zst    packaging/linux/*.pkg.tar.zst
  collect_one "Windows"        jott-windows.exe         target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe target/release/bundle/nsis/*.exe
  collect_one "Android"        jott-android.apk         src-tauri/gen/android/app/build/outputs/apk/universal/release/*.apk

  local source_version f name kind ver mark
  source_version="$(source_version)"
  {
    echo "# Latest installers"
    echo
    echo "Newest build of each kind, copied here by \`packaging/release.sh\`"
    echo "(at the end of a release, or alone with \`--collect\`). These are the"
    echo "names the release page uses too — the version is not in them, it is in"
    echo "the table. Binaries are not versioned; only this file is. Source is at"
    echo "**v$source_version** — a row behind it was built from an older tree."
    echo
    echo "| Installer | File | Version | Built | Size |"
    echo "|---|---|---|---|---|"
    for f in "$RELEASES_DIR"/*; do
      name="$(basename "$f")"
      [ -f "$f" ] || continue
      case "$name" in README.md|versions.tsv) continue ;; esac
      case "$name" in
        *.AppImage)    kind="Linux AppImage" ;;
        *.deb)         kind="Debian/Ubuntu" ;;
        *.rpm)         kind="Fedora" ;;
        *.pkg.tar.zst) kind="Arch" ;;
        *.exe)         kind="Windows" ;;
        *.apk)         kind="Android" ;;
        *)             kind="—" ;;
      esac
      ver="$(version_of "$name")"
      mark=""; [ "$ver" = "$source_version" ] || mark=" ⚠ older"
      printf '| %s | `%s` | %s%s | %s | %s |\n' "$kind" "$name" "$ver" "$mark" \
        "$(date -r "$f" '+%Y-%m-%d')" "$(du -h "$f" | cut -f1)"
    done
  } > "$RELEASES_DIR/README.md"
  log INFO "  releases/README.md lists what is there (source v$source_version)"
}

# ---------------------------------------------------------------------------
# --publish — the half that happens AFTER the workflow
#
# Cutting a release ends at a pushed tag. Twelve minutes later there is a
# DRAFT release with the installers on it, and an APK to attach by hand. What
# came next used to be four manual steps, three of which are traps:
#
#   1. Publishing is not just un-drafting. A release that was BORN a draft
#      does not take the `Latest` alias when it stops being one — measured on
#      v0.50.4, 2026-09-04 — so releases/latest/download/... went on serving
#      the previous version to everyone, silently. `make_latest` goes in the
#      same call, always.
#   2. A draft is invisible to every lookup BY TAG (`GET /releases/tags/...`
#      answers 404, and that is what `gh release view|upload|edit <tag>` call
#      underneath). It is found by LISTING and matching tag_name — the same
#      trap the workflow's `assets` job fell into.
#   3. The site links to releases/latest/download/<name> and to nothing else,
#      so it must not be told about a version before that alias has actually
#      moved. It is asked with a cache-buster, because the edge keeps serving
#      the old JSON for a couple of minutes after the release changes.
#
# Then the site, which is the second place a release is published since
# 2026-09-07: the version and date on the download page, and a new entry on
# the changelog page, written out of the same CHANGELOG.md section the GitHub
# release page carries. Two files, one commit, one push.
#
# The whole thing is idempotent. Run it again after a failure and it publishes
# nothing twice, rewrites the same two files to the same bytes, and finds
# nothing to commit.
# ---------------------------------------------------------------------------

# Where the site is checked out. Not everyone who clones this repository has
# it; if the path is not there the release still finishes, the site half is
# skipped, and the log says so.
readonly SITE_DIR="${JOTT_SITE_DIR:-$HOME/Documentos/GitHub/Jott-web}"

# The five names the workflow's `assets` job renames the uploaded artifacts
# to. The download page links to all five, so a missing one is a dead button
# rather than a missing option.
readonly PUBLISHED_ASSETS="jott-linux.AppImage jott-ubuntu.deb jott-fedora.rpm jott-windows.exe jott-android.apk"

readonly AUDIT="$HOME/.claude/scripts/audit-secrets.sh"

# owner/name, from the remote, for either URL form.
github_repo() {
  git config --get remote.origin.url \
    | sed -e 's#^git@github\.com:#https://github.com/#' \
          -e 's#^.*github\.com/##' \
          -e 's#\.git$##'
}

# The release id for a tag, draft or not. See trap 2 above for why this is not
# `gh release view`.
release_id() {
  gh api "repos/$1/releases" --paginate --jq ".[] | select(.tag_name==\"$2\") | .id" \
    2>/dev/null | head -1
}

# ---------------------------------------------------------------------------
# The CI's verdict, read instead of earned again. Each prints
# "<run id> <status> <conclusion>" for the newest matching run, or nothing.
# ---------------------------------------------------------------------------

ci_run_for_commit() {
  gh run list --workflow "$1" --commit "$2" --limit 1 \
    --json databaseId,status,conclusion \
    --jq '.[0] | select(.) | "\(.databaseId) \(.status) \(.conclusion)"' 2>/dev/null
}

# A tag's run is found by listing: its headBranch is the tag name.
ci_run_for_tag() {
  gh run list --workflow "$1" --limit 20 --json databaseId,status,conclusion,headBranch \
    --jq ".[] | select(.headBranch == \"$2\") | \"\(.databaseId) \(.status) \(.conclusion)\"" \
    2>/dev/null | head -1
}

# ci_settle <run id> <status> <conclusion> — waits quietly if the run is still
# going, and prints its final conclusion.
ci_settle() {
  if [ "$2" = "completed" ]; then
    printf '%s' "$3"
    return 0
  fi
  log INFO "  waiting for $(gh run view "$1" --json url --jq .url 2>/dev/null)"
  gh run watch "$1" --exit-status --interval 30 >>"$LOG" 2>&1
  gh run view "$1" --json conclusion --jq .conclusion 2>/dev/null
}

# What failed, in a dozen lines — enough to act on without opening the page.
ci_explain() {
  gh run view "$1" --json jobs --jq '.jobs[] | select(.conclusion == "failure")
    | "  failed: \(.name) — \([.steps[] | select(.conclusion == "failure") | .name] | join(", "))"' \
    2>/dev/null | tee -a "$LOG" >&2
  # GitHub keeps the colours as a literal "^[", not as ESC.
  gh run view "$1" --log-failed 2>/dev/null \
    | sed -e 's/\x1b\[[0-9;]*m//g' -e 's/\^\[\[[0-9;]*m//g' > "$WORK/ci-failed.log"
  cut -f3- "$WORK/ci-failed.log" | sed 's/^[0-9T:.-]*Z //' \
    | grep -E '(^|[[:space:]])(FAIL|×|##\[error\]|error(\[E[0-9]+\])?:|thread .* panicked)' \
    | grep -v '✓' | cut -c1-200 | head -12 >&2
  log INFO "  the failed steps' full log: $WORK/ci-failed.log"
}

readonly VAULT_SYNC="$HOME/Documentos/GitHub/jott-vault/sync.sh"

# The keys' backup, owed after every release. Never fatal: the release is out.
sync_vault() {
  if [ ! -x "$VAULT_SYNC" ]; then
    log WARN "  no $VAULT_SYNC — back up the keys by hand"
  elif "$VAULT_SYNC" >>"$LOG" 2>&1; then
    log INFO "  jott-vault synced"
  else
    log WARN "  jott-vault sync failed — read $LOG"
  fi
}

# What the world's copy of latest.json says, right now: the same URL every
# installed Jott checks once a day. The query string defeats the CDN cache;
# without it this reads the answer from before the release was published.
latest_manifest_version() {
  curl -fsSL --max-time 20 --connect-timeout 10 \
    "https://github.com/$1/releases/latest/download/latest.json?cb=$(date +%s%N)" 2>/dev/null \
    | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"v\{0,1\}\([^"]*\)".*/\1/p' | head -1
}

# publish_release <version> — the GitHub half. Leaves the release published,
# Latest, and with every installer the site links to attached.
publish_release() {
  local version="$1" tag="v$1" repo id draft names missing name apk apk_version answer got tries

  require gh    "install the GitHub CLI (https://cli.github.com)"
  require curl  "install curl"

  repo="$(github_repo)"
  [ -n "$repo" ] || die "could not read the GitHub repository out of remote.origin.url"

  # The suites run BESIDE the installers (release.yml), so a draft can exist
  # for a tag whose tests failed. Only a green run is publishable.
  local run run_id run_status run_conclusion n
  for n in $(seq 1 12); do
    run="$(ci_run_for_tag release.yml "$tag")"
    [ -n "$run" ] && break
    [ "$n" -eq 1 ] && log INFO "  looking for the release run of $tag"
    sleep 10
  done
  [ -n "$run" ] || die "no release workflow run for $tag — was the tag pushed?"
  read -r run_id run_status run_conclusion <<<"$run"
  run_conclusion="$(ci_settle "$run_id" "$run_status" "$run_conclusion")"
  if [ "$run_conclusion" != "success" ]; then
    ci_explain "$run_id"
    die "the release run for $tag ended '${run_conclusion:-unknown}' — nothing was published"
  fi
  log INFO "  release run $run_id passed: suites and installers"

  id="$(release_id "$repo" "$tag")"
  [ -n "$id" ] || die "$repo has no release for $tag. The workflow writes one about 12 minutes after the tag is pushed — watch it with: gh run watch"

  draft="$(gh api "repos/$repo/releases/$id" --jq .draft 2>/dev/null)"
  log INFO "  $repo release $tag is id $id (draft: ${draft:-unknown})"

  # What is on it, against what the download page links to.
  names="$(gh api "repos/$repo/releases/$id/assets" --paginate --jq '.[].name' 2>/dev/null)"
  missing=""
  for name in $PUBLISHED_ASSETS; do
    printf '%s\n' "$names" | grep -qx "$name" || missing="$missing $name"
  done

  # The APK is the one the CI cannot build: it is signed here, with a keystore
  # that is not in Secrets. If it is missing and the copy in packaging/
  # releases/ is this very version, it goes up as part of publishing — that
  # folder is where a hand upload would have taken it from anyway.
  apk=""
  case " $missing " in
    *" jott-android.apk "*)
      apk_version="$(version_of jott-android.apk)"
      if [ -f "$RELEASES_DIR/jott-android.apk" ] && [ "$apk_version" = "$version" ]; then
        apk="$RELEASES_DIR/jott-android.apk"
      elif [ -f "$RELEASES_DIR/jott-android.apk" ]; then
        log WARN "  packaging/releases/jott-android.apk is v$apk_version, not v$version — not attaching it"
      fi
      ;;
  esac

  if [ -n "$missing" ]; then
    log WARN "  not on the release yet:$missing"
    log WARN "    The download page links to all five by name — a missing one is a dead link."
  else
    log INFO "  all five installers are on the release"
  fi

  if [ "$draft" != "true" ] && [ -z "$apk" ]; then
    log INFO "  already published — nothing to do on GitHub"
  else
    echo
    echo "  On $repo:"
    [ -n "$apk" ]           && echo "    · attach jott-android.apk (v$version) to $tag"
    [ "$draft" = "true" ]   && echo "    · publish $tag and make it Latest — this is public, and"
    [ "$draft" = "true" ]   && echo "      every installed Jott starts offering it within a day"
    if [ -n "$ASSUME_YES" ]; then
      answer="yes"
    elif [ ! -t 0 ]; then
      die "no terminal to ask on — run again with --yes to publish"
    else
      printf '  go ahead? '
      read -r answer
    fi
    case "$answer" in
      yes|y) ;;
      *) die "stopped. Nothing was published." ;;
    esac

    if [ -n "$apk" ]; then
      # By id and through the uploads host: `gh release upload` goes by tag,
      # and the release is still a draft here.
      gh api --method POST \
        "https://uploads.github.com/repos/$repo/releases/$id/assets?name=jott-android.apk" \
        -H "Content-Type: application/vnd.android.package-archive" \
        --input "$apk" >>"$LOG" 2>&1 \
        || die "could not attach the APK — read $LOG"
      log INFO "  attached jott-android.apk"
    fi

    if [ "$draft" = "true" ]; then
      # draft is a boolean (-F), make_latest is a STRING enum (-f). Sending
      # make_latest is the whole point: see trap 1 above.
      gh api -X PATCH "repos/$repo/releases/$id" \
        -F draft=false -f make_latest=true >>"$LOG" 2>&1 \
        || die "could not publish the release — read $LOG"
      log INFO "  published $tag and set it as Latest"
    fi
  fi

  # And now the question the site depends on: does the alias answer this
  # version? Asked rather than assumed, because the answer arrives a minute
  # or so after the call above returns.
  log INFO "  asking releases/latest what version it serves"
  tries=0
  while :; do
    got="$(latest_manifest_version "$repo")"
    [ "$got" = "$version" ] && break
    tries=$((tries + 1))
    [ "$tries" -ge 6 ] && break
    log INFO "    it says ${got:-nothing} — waiting 10s ($tries/6)"
    sleep 10
  done

  if [ "$got" != "$version" ]; then
    log ERROR "releases/latest still serves ${got:-nothing}, not $version."
    log ERROR "  The site links to releases/latest/download/<file> and nothing else, so"
    log ERROR "  writing it now would announce $version over the previous installers."
    log ERROR "  Check that $tag is published AND marked Latest, then run:"
    log ERROR "    packaging/release.sh --publish $version"
    die "the Latest alias has not moved to $version"
  fi
  log INFO "  releases/latest serves $version — the permanent links are live"
}

# write_site <version> — the two files, from CHANGELOG.md. Prints nothing on
# its own; the python says what it changed.
write_site() {
  local version="$1" today
  today="$(date +%F)"
  python3 - "$version" "$today" "$SITE_DIR" "$ROOT/CHANGELOG.md" <<'PY'
import html
import pathlib
import re
import sys

version, today = sys.argv[1], sys.argv[2]
site, changelog_md = pathlib.Path(sys.argv[3]), pathlib.Path(sys.argv[4])
REPO = "https://github.com/Gustavo-Tondin/jott-app"
MONTHS = ("January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December")

year, month, day = (int(part) for part in today.split("-"))
pretty = f"{day} {MONTHS[month - 1]} {year}"


def inline(text):
    """Markdown as this changelog writes it: bold, code, and nothing else.

    Escaped FIRST, so a `<u>` inside a code span survives as text instead of
    becoming a tag."""
    out = html.escape(text, quote=False)
    out = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    return out


def groups_of(version):
    """[(heading, [bullet, ...]), ...] for one ## vX.Y.Z section."""
    lines = changelog_md.read_text().splitlines()
    try:
        start = lines.index(f"## v{version}") + 1
    except ValueError:
        sys.exit(f"{changelog_md} has no '## v{version}' section")

    found = []
    for line in lines[start:]:
        if line.startswith("## "):
            break
        if line.startswith("### "):
            found.append((line[4:].strip(), []))
        elif line.startswith("- "):
            if not found:
                sys.exit(f"a bullet outside any ### heading in v{version}")
            found[-1][1].append(line[2:].strip())
        elif line.strip() and found and found[-1][1]:
            # a wrapped bullet: the file wraps at 76 columns, the page does not
            found[-1][1][-1] += " " + line.strip()
    if not any(bullets for _, bullets in found):
        sys.exit(f"the v{version} section has no bullets")
    return found


def entry_html(version):
    out = [
        f'            <article class="release">',
        f'              <div class="release__head">',
        f'                <h2 class="release__version">v{version}</h2>',
        f'                <time class="release__date" datetime="{today}">{pretty}</time>',
        f'                <a class="link" href="{REPO}/releases/tag/v{version}">Release and files ↗</a>',
        f'              </div>',
        f'              <div class="release__notes prose">',
    ]
    for heading, bullets in groups_of(version):
        if not bullets:
            continue
        out.append(f'                <h3 class="label">{inline(heading)}</h3>')
        out.append('                <ul>')
        out.extend(f'                  <li>{inline(b)}</li>' for b in bullets)
        out.append('                </ul>')
    out += ['              </div>', '            </article>']
    return "\n".join(out) + "\n"


def edit(name, change):
    path = site / name
    before = path.read_text()
    after = change(before)
    if after == before:
        print(f"  {name}: already right")
        return
    path.write_text(after)
    print(f"  {name}: written")


def download(text):
    text, n = re.subn(r"(<strong data-app-version>)[^<]*(</strong>)",
                      rf"\g<1>v{version}\g<2>", text)
    if n != 1:
        sys.exit(f"download.html: expected one data-app-version, found {n}")
    text, n = re.subn(r'<time data-app-date datetime="[^"]*">[^<]*</time>',
                      f'<time data-app-date datetime="{today}">{pretty}</time>', text)
    if n != 1:
        sys.exit(f"download.html: expected one data-app-date, found {n}")
    return text


def changelog(text):
    entry = entry_html(version)
    mine = re.compile(
        r'[ ]*<article class="release">.*?'
        rf'<h2 class="release__version">v{re.escape(version)}</h2>.*?</article>\n',
        re.DOTALL)
    # Rewriting rather than inserting is what makes a second run a no-op — and
    # what lets a fixed changelog bullet reach a page already published.
    if mine.search(text):
        return mine.sub(lambda _: entry, text, count=1)
    anchor = "<!-- newest first; release.sh inserts the new entry right here -->\n"
    if anchor not in text:
        sys.exit("changelog.html: the insertion anchor is gone — put it back inside .releases")
    return text.replace(anchor, anchor + entry, 1)


edit("download.html", download)
edit("changelog.html", changelog)
PY
}

# publish_site <version> — write, audit, commit, push. The site is a public
# repository of its own, so it gets the same audit the app does.
publish_site() {
  local version="$1" answer

  if [ ! -d "$SITE_DIR/.git" ]; then
    log WARN "  no site checkout at $SITE_DIR — the site half is skipped"
    log WARN "    Point JOTT_SITE_DIR at it, or update the page by hand."
    return 0
  fi

  log INFO "  site: $SITE_DIR"
  # Not `write_site | tee`: in a pipeline the status belongs to tee, and a
  # python that died on a missing anchor would report success and leave the
  # site claiming the previous version.
  local written status
  written="$(write_site "$version" 2>&1)"; status=$?
  printf '%s\n' "$written" | tee -a "$LOG"
  [ "$status" -eq 0 ] || die "the site was not written"

  if [ -z "$(git -C "$SITE_DIR" status --porcelain -- download.html changelog.html)" ]; then
    log INFO "  the site already says v$version — nothing to commit"
    return 0
  fi

  git -C "$SITE_DIR" --no-pager diff --stat -- download.html changelog.html | tee -a "$LOG"

  if [ -x "$AUDIT" ]; then
    if "$AUDIT" "$SITE_DIR" >>"$LOG" 2>&1; then
      log INFO "  site audit clean"
    else
      tail -20 "$LOG"
      die "the secret audit flagged something in the site — read $LOG"
    fi
  else
    log WARN "  audit-secrets.sh not available; the site went unaudited"
  fi

  git -C "$SITE_DIR" add download.html changelog.html
  git -C "$SITE_DIR" commit -m "chore(release): o site aponta a v$version" >>"$LOG" 2>&1 \
    || die "the site commit failed — read $LOG"
  git -C "$SITE_DIR" push >>"$LOG" 2>&1 || { tail -20 "$LOG"; die "the site push failed"; }
  log INFO "  site pushed — download and changelog now say v$version"
}

DRY_RUN=""
CHECK_ONLY=""
COLLECT_ONLY=""
PUBLISH_ONLY=""
SKIP_TESTS=""
SKIP_PREFLIGHT=""
WITH_ANDROID=""
NO_PUSH=""
ASSUME_YES=""
SHIP=""

while [ $# -gt 0 ]; do
  case "$1" in
    --ship)           SHIP=1; WITH_ANDROID=1; ASSUME_YES=1 ;;
    --dry-run)        DRY_RUN=1 ;;
    --check)          CHECK_ONLY=1 ;;
    --collect)        COLLECT_ONLY=1 ;;
    --publish)        PUBLISH_ONLY=1 ;;
    --skip-tests)     SKIP_TESTS=1 ;;
    --skip-preflight) SKIP_PREFLIGHT=1 ;;
    --android)        WITH_ANDROID=1 ;;
    --no-push)        NO_PUSH=1 ;;
    --yes|-y)         ASSUME_YES=1 ;;
    -h|--help)        awk '/^# USAGE$/{u=1} u&&!/^#/{exit} u{sub(/^# ?/,""); print}' "$0"; exit 0 ;;
    -*)               die "unknown option: $1" ;;
    *)                VERSION="$1" ;;
  esac
  shift
done

log INFO "log: $LOG"

if [ -n "$CHECK_ONLY" ]; then
  log INFO "version, and the derivations from it:"
  check_versions
  log INFO "every derivation lands on $AGREED_VERSION"
  cadence_last="$(git tag --list 'v*' --sort=-v:refname | head -1)"
  if [ -z "$cadence_last" ]; then
    log INFO "no tag yet — the first release starts the cadence"
  elif version_lt "${cadence_last#v}" "$CADENCE_FROM"; then
    log INFO "the cadence starts at v$CADENCE_FROM; the newest tag, $cadence_last, predates it"
  else
    log INFO "after $cadence_last, the versions allowed are: $(cadence_options | sed 's/ /, v/g; s/^/v/')"
  fi
  exit 0
fi

if [ -n "$COLLECT_ONLY" ]; then
  log INFO "collecting the newest installers into packaging/releases/"
  collect_releases
  exit 0
fi

# The second half of a release, run once the workflow has finished: publish
# the draft, make it Latest, and point the site at it. With no version given
# it publishes the one in the source, which is the one that was just cut.
if [ -n "$PUBLISH_ONLY" ]; then
  [ -n "$VERSION" ] || VERSION="$(source_version)"
  printf '%s' "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' \
    || die "version must be X.Y.Z, got '$VERSION'"
  log INFO "publishing v$VERSION — GitHub first, then the site"
  publish_release "$VERSION"
  publish_site "$VERSION"
  echo
  sync_vault
  log INFO "v$VERSION is out, in both places ($((SECONDS / 60)) min):"
  log INFO "  https://github.com/$(github_repo)/releases/tag/v$VERSION"
  log INFO "  the site's download and changelog pages"
  log INFO "  full log: $LOG"
  exit 0
fi

[ -n "$VERSION" ] || die "give the new version: packaging/release.sh 0.24.0  (or --check, --collect)"
printf '%s' "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || die "version must be X.Y.Z, got '$VERSION'"

require git    "install git"
require npm    "install Node"
require cargo  "install Rust"

# ---------------------------------------------------------------------------
# Step 1 — the tree has to be a releasable one
# ---------------------------------------------------------------------------

log INFO "step 1/8 — checking the working tree"

branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || log WARN "on branch '$branch', not main"

if [ -n "$(git status --porcelain)" ]; then
  git status --short | tee -a "$LOG"
  die "the working tree is dirty — commit or stash first"
fi

git rev-parse "v$VERSION" >/dev/null 2>&1 \
  && die "tag v$VERSION already exists. Pick another version, or delete it first."

check_cadence "$VERSION"

log INFO "current version, and the derivations from it:"
check_versions
[ "$AGREED_VERSION" = "$VERSION" ] && log WARN "already at $VERSION — the bump will be a no-op"

# The disk is part of the build. A target/ that outgrew the free space turns a
# 20-second rebuild into minutes of eviction, and cargo never says so.
free_gb="$(df -BG --output=avail "$ROOT" | tail -1 | tr -dc '0-9')"
target_gb="$(du -sBG target 2>/dev/null | cut -f1 | tr -dc '0-9')"
log INFO "disk: ${free_gb}G free, target/ is ${target_gb:-0}G"
if [ "${free_gb:-99}" -lt 20 ]; then
  log WARN "under 20G free. 'cargo clean -p jott' or removing target/debug/incremental"
  log WARN "would give most of it back — but that is your call, not the script's."
fi

# The two things that make this a project other people — and code signing
# programmes for open source — can actually take seriously.
#
# A LICENSE file, because a public repository without one is not open source
# to anybody, whatever Cargo.toml says. And a previous release that is
# PUBLISHED: `releases/latest` only resolves for a published release, so a
# draft left behind means no install out there ever sees an update, and no
# download page for anyone to point at.

[ -f LICENSE ] || log WARN "no LICENSE file — a public repo without one is not open source to anybody"

if printf '%s' "$(changelog_section "$VERSION")" | grep -q '[^[:space:]]'; then
  log INFO "  CHANGELOG.md has a section for v$VERSION"
else
  log ERROR "CHANGELOG.md has no '## v$VERSION' section with anything under it."
  log ERROR "  The release page is built from it: install instructions from the"
  log ERROR "  workflow, everything else from that section. Write it, commit it,"
  log ERROR "  and run this again."
  die "no release notes for v$VERSION"
fi

if command -v gh >/dev/null 2>&1; then
  previous_tag="$(git tag --list 'v*' --sort=-v:refname | head -1)"
  if [ -n "$previous_tag" ]; then
    # Timed out on purpose: a hanging network call must not park a release.
    draft="$(timeout 15 gh release view "$previous_tag" --json isDraft --jq .isDraft 2>/dev/null)"
    case "$draft" in
      true)  log WARN "$previous_tag is still a DRAFT on GitHub. Publish it —"
             log WARN "  a draft is not an update, and not a download page either." ;;
      false) log INFO "  previous release $previous_tag is published" ;;
      *)     debug "no GitHub release found for $previous_tag" ;;
    esac
  fi
fi

# ---------------------------------------------------------------------------
# Step 2 — the suites, before anything is touched
#
# test.yml runs them on real Linux and real Windows, plus clippy, on every
# push to main. When HEAD has that verdict it stands in for the local suites
# AND the wine preflight (step 4), which answers less. Without it they run
# here — or, with --ship, HEAD is pushed so the runners answer before the tag.
# Before the bump, so a failure leaves the tree exactly as it was.
# ---------------------------------------------------------------------------

CI_GREEN=""
head_sha="$(git rev-parse HEAD)"

run_local_suites() {
  log INFO "  npm test"
  run npm test >>"$LOG" 2>&1 || { tail -40 "$LOG"; die "the frontend suite failed"; }
  log INFO "  cargo test --workspace"
  run cargo test --workspace >>"$LOG" 2>&1 || { tail -40 "$LOG"; die "the Rust suite failed"; }
  log INFO "  cargo clippy"
  run cargo clippy --workspace --all-targets -- -D warnings >>"$LOG" 2>&1 \
    || { tail -40 "$LOG"; die "clippy found warnings"; }
  log INFO "  local suites and clippy ok"
}

if [ -n "$SKIP_TESTS" ]; then
  log WARN "step 2/8 — SKIPPED (--skip-tests). The CI will be the first to know."
else
  log INFO "step 2/8 — the suites"
  verdict=""
  command -v gh >/dev/null 2>&1 && verdict="$(ci_run_for_commit test.yml "$head_sha")"
  if [ -z "$verdict" ] && [ -n "$SHIP" ] && [ -z "$DRY_RUN" ] \
     && [ -n "$(git rev-list '@{u}..HEAD' 2>/dev/null)" ]; then
    log INFO "  ${head_sha:0:7} is not on GitHub yet — pushing it so Linux and Windows answer"
    git push >>"$LOG" 2>&1 || { tail -20 "$LOG"; die "the push failed"; }
    for _ in $(seq 1 12); do
      sleep 5
      verdict="$(ci_run_for_commit test.yml "$head_sha")"
      [ -n "$verdict" ] && break
    done
  fi

  if [ -z "$verdict" ]; then
    log INFO "  the CI has no run for ${head_sha:0:7} — running them here"
    run_local_suites
  else
    read -r ci_id ci_status ci_conclusion <<<"$verdict"
    ci_conclusion="$(ci_settle "$ci_id" "$ci_status" "$ci_conclusion")"
    case "$ci_conclusion" in
      success)
        CI_GREEN=1
        log INFO "  CI passed on ${head_sha:0:7} (Linux, Windows, clippy) — not repeated here" ;;
      failure)
        ci_explain "$ci_id"
        die "the CI failed on ${head_sha:0:7} — fix it before cutting v$VERSION" ;;
      *)
        log INFO "  the CI run for ${head_sha:0:7} ended '$ci_conclusion' — running them here"
        run_local_suites ;;
    esac
  fi
fi

# ---------------------------------------------------------------------------
# Step 3 — bump
# ---------------------------------------------------------------------------

log INFO "step 3/8 — bumping to $VERSION"
bump_source "$VERSION"

# Cargo.lock carries the workspace's own version, so the bump changes it too —
# but only the next cargo invocation writes it. Left to that, the lock is
# rewritten by the test run AFTER the commit was composed: the tag ships a lock
# that still names the old version, and the tree is dirty when the script ends.
# `cargo metadata` resolves the graph and rewrites the lock without building.
if [ -f Cargo.lock ]; then
  run cargo metadata --format-version 1 --offline >/dev/null 2>&1 \
    || run cargo metadata --format-version 1 >/dev/null 2>&1 \
    || log WARN "  could not refresh Cargo.lock — check it before the tag"
  [ -n "$DRY_RUN" ] || log INFO "  Cargo.lock refreshed"
fi

# Re-run AFTER the lock, not before: this is where the one edit is proved to
# have reached everything that derives from it. Only three files changed on
# disk — Cargo.toml, Cargo.lock, and nothing else — and this is what says the
# other artifacts will still carry $VERSION anyway.
log INFO "  derivations after the bump:"
[ -n "$DRY_RUN" ] || check_versions

# ---------------------------------------------------------------------------
# Step 4 — Windows, here, before the tag
# ---------------------------------------------------------------------------

if [ -n "$SKIP_PREFLIGHT" ]; then
  log WARN "step 4/8 — SKIPPED (--skip-preflight)"
elif [ -n "$CI_GREEN" ]; then
  log INFO "step 4/8 — Windows preflight not needed: a real Windows passed ${head_sha:0:7}"
elif [ ! -x packaging/windows/windows-preflight.sh ]; then
  log WARN "step 4/8 — packaging/windows/windows-preflight.sh not found or not executable"
else
  log INFO "step 4/8 — Windows preflight (cross-compile + wine, ~3 min)"
  if [ -n "$DRY_RUN" ]; then
    log DRY  "packaging/windows/windows-preflight.sh"
  elif packaging/windows/windows-preflight.sh; then
    log INFO "  Windows preflight ok"
  else
    die "the Windows preflight failed — fix it BEFORE the tag, that is the whole point"
  fi
fi

# ---------------------------------------------------------------------------
# Step 5 — nothing private goes public
# ---------------------------------------------------------------------------

log INFO "step 5/8 — secret audit"
audit="$AUDIT"
if [ -x "$audit" ]; then
  if [ -n "$DRY_RUN" ]; then
    log DRY  "$audit ."
  elif "$audit" . >>"$LOG" 2>&1; then
    log INFO "  audit clean"
  else
    tail -20 "$LOG"
    die "the secret audit flagged something — read $LOG"
  fi
else
  log WARN "  audit-secrets.sh not available; skipping"
fi

# The two files that must never be published, checked directly because they
# are the ones that would hurt.
for leak in src-tauri/gen/android/keystore.properties CLAUDE.md; do
  if [ -f "$leak" ] && git check-ignore -q "$leak"; then
    debug "$leak is ignored, good"
  elif [ -f "$leak" ]; then
    die "$leak is NOT gitignored and would be committed"
  fi
done

# ---------------------------------------------------------------------------
# Step 6 — commit and tag
# ---------------------------------------------------------------------------

log INFO "step 6/8 — commit and tag"
# Two files, because the bump touched two. Cargo.lock goes in with the source:
# it names the version too, and a lock left out of the commit is a dirty tree
# the moment the tag exists.
commit_files=("$SOURCE_FILE")
[ -f Cargo.lock ] && commit_files+=(Cargo.lock)
run git add "${commit_files[@]}"
if [ -z "$DRY_RUN" ] && git diff --cached --quiet; then
  log INFO "  nothing to commit (already at $VERSION)"
else
  run git commit -m "chore(release): v$VERSION" || die "the commit failed"
  log INFO "  committed chore(release): v$VERSION"
fi
run git tag "v$VERSION" || die "could not create the tag"
log INFO "  tagged v$VERSION"

# ---------------------------------------------------------------------------
# Step 7 — the push, which is publication
# ---------------------------------------------------------------------------

log INFO "step 7/8 — push"
if [ -n "$NO_PUSH" ]; then
  log INFO "  --no-push. When you are ready:  git push && git push origin v$VERSION"
elif [ -n "$DRY_RUN" ]; then
  log DRY  "git push && git push origin v$VERSION"
else
  answer="no"
  if [ -n "$ASSUME_YES" ]; then
    answer="yes"
  elif [ ! -t 0 ]; then
    log INFO "  no terminal to ask on, and no --yes: not pushing"
  else
    echo
    echo "  Pushing v$VERSION starts the release workflow and writes a DRAFT"
    echo "  release on the public repository. Type yes to push."
    printf '  push? '
    read -r answer
  fi
  if [ "$answer" = "yes" ] || [ "$answer" = "y" ]; then
    git push >>"$LOG" 2>&1 && git push origin "v$VERSION" >>"$LOG" 2>&1 \
      || { tail -20 "$LOG"; die "the push failed"; }
    log INFO "  pushed. The workflow takes ~10 min and leaves a DRAFT release."
  else
    log INFO "  not pushed. The commit and the tag are local:"
    log INFO "    git push && git push origin v$VERSION"
    log INFO "    git tag -d v$VERSION && git reset --hard HEAD~1   # to undo"
  fi
fi

# ---------------------------------------------------------------------------
# Step 8 — Android, which no CI builds
#
# The APK is signed here or nowhere: the keystore is not in the repository and
# not in Secrets. A different signature installs BESIDE the old app instead of
# over it, so the certificate is compared against the previously shipped APK.
# ---------------------------------------------------------------------------

if [ -z "$WITH_ANDROID" ]; then
  log INFO "step 8/8 — Android skipped (pass --android to build the APK)"
else
  log INFO "step 8/8 — Android APK"
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
  export JAVA_HOME="${JAVA_HOME:-$HOME/Android/jdk}"
  ndk="$(ls -d "$ANDROID_HOME"/ndk/* 2>/dev/null | sort -V | tail -1)"
  export NDK_HOME="${NDK_HOME:-$ndk}"

  [ -d "$JAVA_HOME" ]  || die "JAVA_HOME=$JAVA_HOME does not exist. The JDK is the Android one, at ~/Android/jdk."
  [ -d "$NDK_HOME" ]   || die "no NDK under $ANDROID_HOME/ndk"
  log INFO "  JAVA_HOME=$JAVA_HOME"
  log INFO "  NDK_HOME=$NDK_HOME"

  apk="src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"
  # The certificate is compared against the APK collected into
  # packaging/releases/ — any version will do, the key never changes. The
  # versionCode is NOT: that folder already holds this very version whenever a
  # tag is re-cut. It is compared against the previous tag, further down.
  previous="$WORK/previous-release.apk"
  last_collected="$(ls -1t packaging/releases/*.apk 2>/dev/null | head -1)"
  if [ -n "$last_collected" ]; then
    cp "$last_collected" "$previous"
  elif [ -f "$apk" ]; then
    cp "$apk" "$previous"
  fi

  # Before the build, not after: this is the file gradle reads the version out
  # of, and the build does not write it. See the block up top for what happens
  # when it is left alone.
  write_android_properties "$VERSION"

  if [ -n "$DRY_RUN" ]; then
    log DRY  "npm run tauri android build -- --apk"
  else
    npm run tauri android build -- --apk >>"$LOG" 2>&1 \
      || { tail -40 "$LOG"; die "the Android build failed — read $LOG"; }
    [ -f "$apk" ] || die "the build reported success but $apk is not there"
    log INFO "  built $apk"

    # The APK is asked what it thinks it is, rather than the properties file
    # being trusted to have been read. Writing a value and assuming it arrived
    # is exactly the habit that let 0.22.2 ship out of a 0.23.0 tree.
    aapt="$(build_tool aapt2)"
    if [ -n "$aapt" ]; then
      read -r apk_code apk_name <<<"$(apk_version "$aapt" "$apk")"
      want_code="$(android_version_code "$VERSION")"
      if [ "$apk_name" = "$VERSION" ] && [ "$apk_code" = "$want_code" ]; then
        log INFO "  the APK announces $apk_name (versionCode $apk_code)"
      else
        log ERROR "  the APK announces ${apk_name:-<nothing>} (versionCode ${apk_code:-<nothing>})"
        log ERROR "    expected $VERSION (versionCode $want_code)"
        die "the build did not pick up $ANDROID_PROPERTIES"
      fi

      # An APK whose versionCode does not GO UP does not install over the app
      # that is on the phone. Android refuses it outright, and the person on
      # the other end sees only that the install failed.
      # Derived from the previous TAG the way the build derives it — what is
      # on people's phones is what was published, not what was built here.
      prev_tag="$(git tag --list 'v*' --sort=-v:refname | grep -vx "v$VERSION" | head -1)"
      if [ -n "$prev_tag" ]; then
        was_code="$(android_version_code "${prev_tag#v}")"
        if [ "$apk_code" -le "$was_code" ]; then
          log ERROR "  versionCode did not go up: $was_code ($prev_tag) -> $apk_code ($apk_name)"
          die "Android would refuse to install this over $prev_tag"
        fi
        log INFO "  versionCode goes up: $was_code ($prev_tag) -> $apk_code"
      fi
    else
      log WARN "  aapt2 not found under \$ANDROID_HOME/build-tools — the APK's own version went unchecked"
    fi

    # Same certificate as last time, or the update installs as a second app.
    #
    # apksigner is a shell wrapper around a jar, so it needs `java` on PATH —
    # and JAVA_HOME here is the Android JDK, which is not on it. Without both
    # halves this check reports nothing and reports it as a warning, which is
    # indistinguishable from a check that passed.
    apksigner="$(build_tool apksigner)"
    certs_of() { PATH="$JAVA_HOME/bin:$PATH" "$apksigner" verify --print-certs "$1" 2>/dev/null | grep -m1 'SHA-256 digest'; }
    if [ -z "$apksigner" ]; then
      log WARN "  apksigner not found under \$ANDROID_HOME/build-tools — the signature went unchecked"
    elif [ ! -f "$previous" ]; then
      log WARN "  no previous APK to compare against — the signature went unchecked"
    else
      now="$(certs_of "$apk")"
      was="$(certs_of "$previous")"
      if [ -z "$now" ]; then
        die "apksigner read no certificate out of the APK it just built — it is unsigned, or java is missing from $JAVA_HOME/bin"
      fi
      if [ -n "$was" ] && [ "$now" != "$was" ]; then
        log ERROR "  the signing certificate CHANGED:"
        log ERROR "    was: $was"
        log ERROR "    now: $now"
        die "this APK would install beside the old app, not over it"
      fi
      log INFO "  signing certificate matches the previous APK"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# What is left, which is the part a script must not do on its own
# ---------------------------------------------------------------------------

# Whatever got built lands in packaging/releases/, one file per kind, with a
# README naming the version of each — the place to look for the newest
# installers without digging through target/.
if [ -z "$DRY_RUN" ]; then
  collect_releases
fi

# --ship: the APK was built while the runners worked; now wait for them and
# finish the job the way --publish would.
if [ -n "$SHIP" ] && [ -z "$DRY_RUN" ] && [ -z "$NO_PUSH" ]; then
  log INFO "shipping v$VERSION — the release run, then GitHub, the site and the vault"
  publish_release "$VERSION"
  publish_site "$VERSION"
  sync_vault
  log INFO "v$VERSION is out ($((SECONDS / 60)) min): https://github.com/$(github_repo)/releases/tag/v$VERSION"
  log INFO "  full log: $LOG"
  exit 0
fi

echo
log INFO "v$VERSION is cut ($((SECONDS / 60)) min). The rest waits on the workflow (~10 min):"
log INFO "  packaging/release.sh --publish $VERSION"
log INFO "  (waits for the run, attaches the APK, sets Latest, pushes the site, syncs the vault)"
log INFO "  full log: $LOG"
exit 0
