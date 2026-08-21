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
#   packaging/PKGBUILD                       reads Cargo.toml at makepkg time
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
# USAGE
#
#   scripts/release.sh 0.24.0             # the whole cycle, stopping before the push
#   scripts/release.sh 0.24.0 --dry-run   # print every command, change nothing
#   scripts/release.sh --check            # only verify the derivations still work
#
#   --skip-tests       skip npm test / cargo test / clippy
#   --skip-preflight   skip the Windows cross-check (scripts/windows-preflight.sh)
#   --android          also build and verify the APK (needs the Android SDK)
#   --no-push          commit and tag, but never offer to push
#   --yes              answer yes to the push gate (for a scripted rerun)
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
  startdir="$ROOT/packaging"
  # shellcheck disable=SC1091
  source "$ROOT/packaging/PKGBUILD" >/dev/null 2>&1 || return 1
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

  derives "packaging/PKGBUILD (pkgver, evaluated)" "$(pkgbuild_version)" "$want"

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
# Arguments
# ---------------------------------------------------------------------------

VERSION=""
DRY_RUN=""
CHECK_ONLY=""
SKIP_TESTS=""
SKIP_PREFLIGHT=""
WITH_ANDROID=""
NO_PUSH=""
ASSUME_YES=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)        DRY_RUN=1 ;;
    --check)          CHECK_ONLY=1 ;;
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
  exit 0
fi

[ -n "$VERSION" ] || die "give the new version: scripts/release.sh 0.24.0  (or --check)"
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
# Step 2 — bump
# ---------------------------------------------------------------------------

log INFO "step 2/8 — bumping to $VERSION"
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
# Step 3 — the suites
#
# Before the tag, never after: the workflow runs them again on the runner, and
# a tag that fails there costs twelve minutes and a deleted tag to find out.
# ---------------------------------------------------------------------------

if [ -n "$SKIP_TESTS" ]; then
  log WARN "step 3/8 — SKIPPED (--skip-tests). The CI will be the first to know."
else
  log INFO "step 3/8 — npm test"
  run npm test >>"$LOG" 2>&1 || { tail -40 "$LOG"; die "the frontend suite failed"; }
  log INFO "  frontend suite ok"

  log INFO "step 3/8 — cargo test --workspace"
  run cargo test --workspace >>"$LOG" 2>&1 || { tail -40 "$LOG"; die "the Rust suite failed"; }
  log INFO "  Rust suite ok"

  log INFO "step 3/8 — cargo clippy"
  run cargo clippy --workspace --all-targets -- -D warnings >>"$LOG" 2>&1 \
    || { tail -40 "$LOG"; die "clippy found warnings"; }
  log INFO "  clippy clean"
fi

# ---------------------------------------------------------------------------
# Step 4 — Windows, here, before the tag
# ---------------------------------------------------------------------------

if [ -n "$SKIP_PREFLIGHT" ]; then
  log WARN "step 4/8 — SKIPPED (--skip-preflight)"
elif [ ! -x scripts/windows-preflight.sh ]; then
  log WARN "step 4/8 — scripts/windows-preflight.sh not found or not executable"
else
  log INFO "step 4/8 — Windows preflight (cross-compile + wine, ~3 min)"
  if [ -n "$DRY_RUN" ]; then
    log DRY  "scripts/windows-preflight.sh"
  elif scripts/windows-preflight.sh; then
    log INFO "  Windows preflight ok"
  else
    die "the Windows preflight failed — fix it BEFORE the tag, that is the whole point"
  fi
fi

# ---------------------------------------------------------------------------
# Step 5 — nothing private goes public
# ---------------------------------------------------------------------------

log INFO "step 5/8 — secret audit"
audit="$HOME/.claude/scripts/audit-secrets.sh"
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
    log INFO "  pushed. The workflow takes ~12 min and leaves a DRAFT release."
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
  previous="$WORK/previous-release.apk"
  [ -f "$apk" ] && cp "$apk" "$previous"

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
      if [ -f "$previous" ]; then
        read -r was_code was_name <<<"$(apk_version "$aapt" "$previous")"
        if [ -n "$was_code" ] && [ "$apk_code" -le "$was_code" ]; then
          log ERROR "  versionCode did not go up: $was_code ($was_name) -> $apk_code ($apk_name)"
          die "Android would refuse to install this over the previous APK"
        fi
        [ -n "$was_code" ] && log INFO "  versionCode goes up: $was_code -> $apk_code"
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

echo
log INFO "v$VERSION done here. What is left is yours:"
log INFO "  1. watch the workflow:  gh run watch"
log INFO "  2. attach the APK to the draft, if you built one"
log INFO "  3. read the draft release, then PUBLISH it"
log INFO "     (releases/latest only resolves for a PUBLISHED release — a draft is not an update)"
log INFO "  4. back up the keys:  cd ~/Documentos/GitHub/jott-vault && ./sync.sh"
log INFO "  full log: $LOG"
exit 0
