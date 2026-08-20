#!/usr/bin/env bash
#
# release.sh — cut a Jott release in one command.
#
# WHY THIS EXISTS
#
# Every release repeated the same nine steps by hand: bump the version in four
# files that must never disagree, run two suites and clippy, cross-check the
# Windows build, audit for secrets, commit, tag, push, build the APK, verify
# its signing certificate. Nine steps is more than anyone holds in their head
# at 1am, so the sequence was delegated to an assistant each time — slow, and
# a different order every release.
#
# The steps were never the hard part. Knowing WHICH four files and WHY the
# order matters was. That knowledge is now here instead of in a chat log.
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
#   scripts/release.sh 0.23.0             # the whole cycle, stopping before the push
#   scripts/release.sh 0.23.0 --dry-run   # print every command, change nothing
#   scripts/release.sh --check            # only verify the four versions agree
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
# The four files that declare the version.
#
# They must agree: the app announces one version, the bundle carries another,
# and a rollback aims at the wrong one. Android is NOT in this list —
# gen/android/app/tauri.properties is generated from tauri.conf.json by the
# Tauri CLI (versionCode 22000 for 0.22.0), and editing it by hand is undone
# on the next build.
# ---------------------------------------------------------------------------

version_of() {
  case "$1" in
    package.json)              grep -m1 '"version"'   package.json              | sed 's/.*"version": *"\([^"]*\)".*/\1/' ;;
    src-tauri/tauri.conf.json) grep -m1 '"version"'   src-tauri/tauri.conf.json | sed 's/.*"version": *"\([^"]*\)".*/\1/' ;;
    Cargo.toml)                grep -m1 '^version'    Cargo.toml                | sed 's/.*"\([^"]*\)".*/\1/' ;;
    packaging/PKGBUILD)        grep -m1 '^pkgver='    packaging/PKGBUILD        | cut -d= -f2 ;;
  esac
}

readonly VERSION_FILES=(package.json src-tauri/tauri.conf.json Cargo.toml packaging/PKGBUILD)

# Rewrites one file and PROVES it changed. A sed that silently matches nothing
# is exactly how three files end up on the new version and one stays behind.
bump_file() {
  local file="$1" to="$2" from
  from="$(version_of "$file")"

  [ "$from" = "$to" ] && { log INFO "  $file already $to"; return 0; }

  if [ -n "$DRY_RUN" ]; then
    log DRY  "  $file: $from -> $to"
    return 0
  fi

  case "$file" in
    package.json|src-tauri/tauri.conf.json)
      sed -i "0,/\"version\": *\"$from\"/s//\"version\": \"$to\"/" "$file" ;;
    Cargo.toml)
      sed -i "0,/^version = \"$from\"/s//version = \"$to\"/" "$file" ;;
    packaging/PKGBUILD)
      sed -i "s/^pkgver=$from\$/pkgver=$to/" "$file" ;;
  esac

  local now
  now="$(version_of "$file")"
  [ "$now" = "$to" ] || die "$file did not take the bump — still $now. Nothing else was touched."
  log INFO "  $file: $from -> $to"
}

# Sets AGREED_VERSION rather than printing it. `die` inside a $( ) subshell
# only kills the subshell — the script would sail past a disagreement it just
# reported as fatal.
AGREED_VERSION=""
check_versions() {
  local first="" file current disagree=0
  for file in "${VERSION_FILES[@]}"; do
    current="$(version_of "$file")"
    [ -z "$current" ] && die "$file declares no version the script can read"
    [ -z "$first" ] && first="$current"
    if [ "$current" != "$first" ]; then
      log ERROR "  $file: $current  (expected $first)"
      disagree=1
    else
      log INFO  "  $file: $current"
    fi
  done
  [ "$disagree" -eq 0 ] || die "the version files disagree — fix them before releasing"
  AGREED_VERSION="$first"
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
    -h|--help)        sed -n '2,40p' "$0"; exit 0 ;;
    -*)               die "unknown option: $1" ;;
    *)                VERSION="$1" ;;
  esac
  shift
done

log INFO "log: $LOG"

if [ -n "$CHECK_ONLY" ]; then
  log INFO "version files:"
  check_versions
  log INFO "all four agree on $AGREED_VERSION"
  exit 0
fi

[ -n "$VERSION" ] || die "give the new version: scripts/release.sh 0.23.0  (or --check)"
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

log INFO "current version files:"
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
for file in "${VERSION_FILES[@]}"; do
  bump_file "$file" "$VERSION"
done
[ -n "$DRY_RUN" ] || check_versions

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
# Cargo.lock goes in with them: it names the version too, and a lock left
# out of the commit is a dirty tree the moment the tag exists.
commit_files=("${VERSION_FILES[@]}")
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

  if [ -n "$DRY_RUN" ]; then
    log DRY  "npm run tauri android build -- --apk"
  else
    npm run tauri android build -- --apk >>"$LOG" 2>&1 \
      || { tail -40 "$LOG"; die "the Android build failed — read $LOG"; }
    [ -f "$apk" ] || die "the build reported success but $apk is not there"
    log INFO "  built $apk"

    # Same certificate as last time, or the update installs as a second app.
    if command -v apksigner >/dev/null 2>&1 && [ -f "$previous" ]; then
      now="$(apksigner verify --print-certs "$apk"      2>/dev/null | grep -m1 'SHA-256 digest')"
      was="$(apksigner verify --print-certs "$previous" 2>/dev/null | grep -m1 'SHA-256 digest')"
      if [ -n "$was" ] && [ "$now" != "$was" ]; then
        log ERROR "  the signing certificate CHANGED:"
        log ERROR "    was: $was"
        log ERROR "    now: $now"
        die "this APK would install beside the old app, not over it"
      fi
      log INFO "  signing certificate matches the previous APK"
    else
      log WARN "  could not compare signatures (apksigner missing, or no previous APK)"
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
