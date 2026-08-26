#!/usr/bin/env bash
#
# windows-preflight.sh — run the Rust suites as Windows binaries, here.
#
# WHY THIS EXISTS
#
# Jott is developed on Linux and no Windows machine takes part. The only place
# the Windows build was ever exercised was the release workflow, which runs on
# a pushed tag. That made the loop for a Windows-only failure:
#
#   push tag -> wait ~12 min -> read the failure -> fix -> delete tag -> push again
#
# On 2026-08-19 that loop ran five times for v0.20.0 — the first attempt alone
# took 56 minutes with a cold Rust cache — and every failure was Windows-only
# and cheap to see: `std::fs::canonicalize` returns a `\\?\` verbatim path that
# broke the folder browser's containment check, a missing directory answered
# differently, and the test binaries died before the first test for want of an
# application manifest. None of it needed real Windows to find. It needed the
# code to RUN as a Windows binary once.
#
# So it runs here: cross-compile with cargo-xwin, execute under wine.
#
# WHAT IT PROVES AND WHAT IT DOES NOT
#
# It proves the path handling, the string formatting and every rule that only
# touches the filesystem synchronously — the class of bug that cost the five
# runs. It does NOT prove the file watcher or anything drawing a real window:
# wine's ReadDirectoryChangesW hands back a misaligned FILE_NOTIFY_INFORMATION
# buffer and there is no WebView2, so those tests fail here and pass on the CI
# runner. They are listed in WINE_CANNOT below and reported separately, never
# silently skipped — a failure this script hides is worse than one it never
# looked for.
#
# Passing here is not a promise that the release workflow is green. It is the
# cheap filter that stops the expensive one from being the first to know.
#
# USAGE
#
#   packaging/windows/windows-preflight.sh            # build and run
#   DEBUG=1 packaging/windows/windows-preflight.sh    # trace every step
#
# Requires `cargo-xwin` (cargo install cargo-xwin) and `wine`.
#
set -uo pipefail

readonly TARGET=x86_64-pc-windows-msvc

# The suites wine cannot host. Reported as "not proven", not as pass or fail.
#
#   watcher / external_changes_reach_the_frontend_as_events
#       notify's Windows backend reads a FILE_NOTIFY_INFORMATION buffer wine
#       hands back misaligned; the alignment check aborts the process.
#   the_window_lets_the_webview_handle_its_own_drops
#       there is no WebView2 under wine to hand a drop to.
readonly WINE_CANNOT="watcher bridge"

# Everything transient goes in one directory so nothing lands in the working
# tree: a separate CARGO_TARGET_DIR (the host target/ must not be invalidated
# by a cross build) and a private WINEPREFIX (never touch the user's own).
WORK="${WINDOWS_PREFLIGHT_DIR:-${TMPDIR:-/tmp}/jott-windows-preflight}"
readonly WORK
readonly LOG="$WORK/preflight.log"

mkdir -p "$WORK"

# Dual output: everything on the console AND in a log that survives the run,
# because the interesting part of a failure is usually scrolled off.
log() {
  local level="$1"; shift
  printf '%s [%s] %s\n' "$(date +%H:%M:%S)" "$level" "$*" | tee -a "$LOG"
}
debug() { [ -n "${DEBUG:-}" ] && log DEBUG "$@"; return 0; }

require() {
  command -v "$1" >/dev/null 2>&1 && return 0
  log ERROR "$1 not found — $2"
  exit 127
}

require cargo "install Rust"
require wine "install wine"
cargo xwin --version >/dev/null 2>&1 \
  || { log ERROR "cargo-xwin not found — cargo install cargo-xwin"; exit 127; }

log INFO "workspace: $WORK"
log INFO "log:       $LOG"

# debug-assertions off is not cosmetic. The alignment check that kills the
# watcher suites under wine is one of them, and with them on the two suites
# abort instead of reporting which of their tests passed.
log INFO "cross-compiling the test binaries for $TARGET"
if ! CARGO_TARGET_DIR="$WORK/target" \
     CARGO_PROFILE_DEV_DEBUG_ASSERTIONS=false \
     cargo xwin build --target "$TARGET" --tests --workspace >>"$LOG" 2>&1; then
  log ERROR "cross build FAILED — the tail of $LOG:"
  tail -30 "$LOG"
  exit 1
fi
log INFO "cross build ok"

export WINEPREFIX="$WORK/wine"
export WINEDEBUG=-all
debug "initialising the wine prefix"
wineboot -i >>"$LOG" 2>&1

deps="$WORK/target/$TARGET/debug/deps"
failed=0
unproven=0

for exe in "$deps"/*.exe; do
  name="$(basename "$exe" .exe)"
  suite="${name%-*}"
  # jott.exe is the app itself, not a suite.
  [ "$suite" = "jott" ] && [ "$name" = "jott" ] && continue

  debug "running $suite"
  out="$(wine "$exe" --test-threads=1 2>&1)"
  result="$(printf '%s' "$out" | grep -E '^test result' | tail -1)"

  if printf '%s' "$result" | grep -q '^test result: ok'; then
    log INFO "PASS  $suite — ${result#test result: }"
    continue
  fi

  if printf '%s' "$WINE_CANNOT" | grep -qw "$suite"; then
    log WARN "WINE  $suite — not proven here (needs real Windows): ${result:-aborted}"
    printf '%s' "$out" | grep -E '^    [a-z_]+' | sed 's/^/           /' | tee -a "$LOG"
    unproven=$((unproven + 1))
    continue
  fi

  log ERROR "FAIL  $suite — ${result:-no result, the process died}"
  printf '%s' "$out" | grep -E 'panicked at|^    [a-z_]+' | head -20 | tee -a "$LOG"
  failed=$((failed + 1))
done

echo
if [ "$failed" -gt 0 ]; then
  log ERROR "$failed suite(s) failed on Windows. Fix them BEFORE pushing the tag."
  exit 1
fi

log INFO "every suite wine can host passes as a Windows binary."
[ "$unproven" -gt 0 ] && log WARN "$unproven suite(s) still only provable on the CI runner (watcher, WebView2)."
exit 0
