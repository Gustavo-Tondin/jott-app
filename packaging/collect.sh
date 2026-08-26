#!/usr/bin/env bash
# Gathers the newest installer of each kind into packaging/releases/ and writes
# the README.md there, so the latest AppImage, .exe, .apk, .rpm, .deb and Arch
# package sit side by side with the version each one announces.
#
# The build tools scatter them: Tauri writes under target/release/bundle/, the
# Windows cross-compile under target/x86_64-pc-windows-msvc/, gradle under
# src-tauri/gen/android/app/build/outputs/, makepkg next to the PKGBUILD. All
# of those are build output that gets cleaned; packaging/releases/ is the copy
# that survives a `cargo clean` — and it is where release.sh looks for the
# PREVIOUS APK to compare certificates and versionCode against.
#
# One file per kind is kept: collecting a newer one removes the older. The
# folder is gitignored except for the README.
#
#   packaging/collect.sh            # collect and rewrite the README
#   DEBUG=1 packaging/collect.sh    # trace every step
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/packaging/releases"
LOG="${LOG:-$HOME/.claude/tmp/jott-collect.log}"
mkdir -p "$OUT" "$(dirname "$LOG")"

log()   { printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" "${*:2}" | tee -a "$LOG" >&2; }
debug() { [ -n "${DEBUG:-}" ] && log DEBUG "$@" || true; }
trap 'log ERROR "collect.sh aborted at line $LINENO"' ERR

# newest <glob...>: prints the most recently modified file matching any glob.
newest() {
  local f best=""
  for f in "$@"; do
    [ -f "$f" ] || continue
    [ -z "$best" ] || [ "$f" -nt "$best" ] && best="$f"
  done
  [ -n "$best" ] && printf '%s\n' "$best"
}

# The version each installer carries is in its file name, except the APK,
# whose name gradle fixes; that one is read from the build's own version file.
version_of() {
  local name="$1"
  case "$name" in
    *.apk) sed -n 's/^tauri\.android\.versionName=//p' "$ROOT/src-tauri/gen/android/app/tauri.properties" 2>/dev/null || true ;;
    *)     printf '%s\n' "$name" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 ;;
  esac
}

# collect <kind> <pattern-in-releases> <source globs...>
collect() {
  local kind="$1" keep="$2" src; shift 2
  src="$(newest "$@")" || { debug "$kind: nothing built"; return 0; }
  local name
  name="$(basename "$src")"
  if [[ "$kind" == "Android APK" ]]; then
    name="Jott_$(version_of "$name")_universal.apk"
  fi
  if [ -f "$OUT/$name" ] && cmp -s "$src" "$OUT/$name"; then
    debug "$kind: $name already collected"
    return 0
  fi
  find "$OUT" -maxdepth 1 -name "$keep" ! -name README.md -delete
  cp "$src" "$OUT/$name"
  log INFO "$kind: $name"
}

cd "$ROOT"
collect "Linux AppImage" '*.AppImage'      target/release/bundle/appimage/*.AppImage
collect "Debian/Ubuntu"  '*.deb'           target/release/bundle/deb/*.deb
collect "Fedora"         '*.rpm'           target/release/bundle/rpm/*.rpm
collect "Arch"           '*.pkg.tar.zst'   packaging/linux/*.pkg.tar.zst
collect "Windows"        '*.exe'           target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe target/release/bundle/nsis/*.exe
collect "Android APK"    '*.apk'           src-tauri/gen/android/app/build/outputs/apk/universal/release/*.apk

source_version="$(sed -n 's/^version = "\(.*\)"/\1/p' "$ROOT/Cargo.toml" | head -1)"

{
  echo "# Latest installers"
  echo
  echo "Newest build of each kind, copied here by \`packaging/collect.sh\`"
  echo "(run by \`packaging/release.sh\`). Binaries are not versioned; only"
  echo "this file is. Source is at **v$source_version** — a row behind it was"
  echo "built from an older tree."
  echo
  echo "| Installer | File | Version | Built | Size |"
  echo "|---|---|---|---|---|"
  for f in "$OUT"/*; do
    [ -f "$f" ] && [ "$(basename "$f")" != README.md ] || continue
    name="$(basename "$f")"
    case "$name" in
      *.AppImage) kind="Linux AppImage" ;;
      *.deb) kind="Debian/Ubuntu" ;;
      *.rpm) kind="Fedora" ;;
      *.pkg.tar.zst) kind="Arch" ;;
      *.exe) kind="Windows" ;;
      *.apk) kind="Android APK" ;;
      *) kind="—" ;;
    esac
    ver="$(printf '%s\n' "$name" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
    mark=""; [ "$ver" = "$source_version" ] || mark=" ⚠ older"
    printf '| %s | `%s` | %s%s | %s | %s |\n' "$kind" "$name" "$ver" "$mark" \
      "$(date -r "$f" '+%Y-%m-%d')" "$(du -h "$f" | cut -f1)"
  done
} > "$OUT/README.md"
log INFO "wrote $OUT/README.md (source v$source_version)"
