//! Putting the app itself into the desktop's application menu.
//!
//! An AppImage is deliberately one file that installs nothing: it does not
//! appear in the launcher, in search, or with an icon, because it never wrote
//! the two files a desktop reads to know an app exists — a `.desktop` entry
//! and an icon in the theme. Every other Linux install (deb, rpm, the
//! PKGBUILD) writes them at install time; the AppImage has no install time,
//! so the app has to offer it once, itself.
//!
//! This module is the whole of that, and it is pure on purpose: it takes the
//! data directory, the executable's path and the icon's bytes, and never asks
//! the environment anything. The bridge is what knows about `$APPIMAGE` and
//! `$XDG_DATA_HOME`. Keeping it here rather than in `src-tauri/` is the same
//! reason every other rule lives in the core — a second frontend (a GTK Jott)
//! would need exactly this, and a rule that only exists in the bridge is
//! invisible to it.
//!
//! **The entry text is not written here.** It is `packaging/linux/jott.desktop`,
//! the same file the PKGBUILD installs, handed in by the caller with only the
//! `Exec=` line rewritten. Two copies of an app's desktop entry is how the
//! packaged Jott and the AppImage Jott end up with different names in the
//! menu.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{IoContext, Result};
use crate::fsio;

/// The basename both files carry, matching what the packaged installs use so
/// a machine cannot end up with two entries for one app.
const NAME: &str = "jott";

/// Where the icon goes. Still under the theme's 256 folder — the entry names
/// it by absolute path, so the theme is not what finds it, but a PNG that
/// lives where icons live is one a user can recognise and delete. 256 because
/// the launcher draws it at whatever size it likes.
const ICON_DIR: &str = "icons/hicolor/256x256/apps";

/// The two files an entry is made of.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    /// `<data>/applications/jott.desktop`
    pub desktop: PathBuf,
    /// `<data>/icons/hicolor/256x256/apps/jott.png`
    pub icon: PathBuf,
}

/// Where the two files belong under a data directory, without touching disk.
pub fn entry(data_dir: &Path) -> Entry {
    Entry {
        desktop: data_dir.join("applications").join(format!("{NAME}.desktop")),
        icon: data_dir.join(ICON_DIR).join(format!("{NAME}.png")),
    }
}

/// The entry text for an app that lives at `exec`, from the packaged template.
///
/// Two lines change, and both for the same reason: a packaged Jott is on the
/// `PATH` with its icon in the system theme, and an AppImage is two files
/// somewhere in the user's home. Everything else — the name, the categories,
/// the `StartupWMClass` that lets the shell match the window to the icon — is
/// whatever the template says, so editing the template moves both installs.
///
/// **`Icon=` becomes an absolute path, not the theme name `jott`, and that is
/// a measured decision** (2026-08-21). Writing a PNG into
/// `~/.local/share/icons/hicolor` is the textbook way and it silently fails on
/// any machine that already has an `icon-theme.cache` there: GTK trusts the
/// cache and does **not** fall back to scanning the folder, so the icon simply
/// is not found. Measured with a real `Gtk.IconTheme` over a cache built one
/// file earlier — the pre-existing icon resolved, the new one did not. The
/// alternatives were shelling out to `gtk-update-icon-cache` (a subprocess
/// that may not be installed, and GTK-only — KDE and XFCE read the same entry)
/// or deleting another program's cache. The spec allows an absolute path here
/// and it skips theme lookup entirely, so it works everywhere and cannot go
/// stale.
pub fn contents(template: &str, exec: &Path, icon: &Path) -> String {
    // `Exec=` is read as a command line, so a path with a space in it has to
    // be quoted. `Icon=` is not — it is a plain string, and quoting it would
    // make the desktop look for a file whose name starts with a quote.
    let exec = quoted(exec);
    let icon = icon.to_string_lossy().into_owned();

    let mut out = String::with_capacity(template.len() + exec.len() + icon.len());
    let mut wrote = (false, false);

    for line in template.lines() {
        if !wrote.0 && line.starts_with("Exec=") {
            out.push_str("Exec=");
            out.push_str(&exec);
            wrote.0 = true;
        } else if !wrote.1 && line.starts_with("Icon=") {
            out.push_str("Icon=");
            out.push_str(&icon);
            wrote.1 = true;
        } else {
            out.push_str(line);
        }
        out.push('\n');
    }
    // A template missing either line is a broken entry, not something to write
    // silently: the desktop would list an app that cannot start, or one with
    // no icon to click.
    if !wrote.0 {
        out.push_str(&format!("Exec={exec}\n"));
    }
    if !wrote.1 {
        out.push_str(&format!("Icon={icon}\n"));
    }
    out
}

/// A path as the Desktop Entry spec wants it inside `Exec=`.
///
/// The spec reads the value as a command line, so a home folder with a space
/// in it — which is most non-English installs, `~/Área de trabalho` on this
/// very machine — would otherwise be read as a command plus an argument, and
/// the launcher would report "app not found". Quoting is only applied when it
/// is needed, so the common case stays readable in a text editor.
fn quoted(exec: &Path) -> String {
    let raw = exec.to_string_lossy();
    if !raw.contains(|c: char| c.is_whitespace() || "\"'\\><~|&;$*?#()`".contains(c)) {
        return raw.into_owned();
    }
    let escaped = raw.replace('\\', r"\\").replace('"', r#"\""#);
    format!("\"{escaped}\"")
}

/// Writes both files, replacing whatever was there.
///
/// Atomic like every other write in Jott: a launcher reading a half-written
/// entry drops the app from the menu until the next rescan.
pub fn install(data_dir: &Path, template: &str, exec: &Path, icon: &[u8]) -> Result<Entry> {
    let entry = entry(data_dir);
    let text = contents(template, exec, &entry.icon);
    fsio::write_atomically(&entry.desktop, text.as_bytes())?;
    fsio::write_atomically(&entry.icon, icon)?;
    Ok(entry)
}

/// Takes both files away again.
///
/// A missing file is a removed file — the user may well have deleted the
/// entry by hand, and that is the same outcome, not an error to report.
pub fn remove(data_dir: &Path) -> Result<()> {
    let entry = entry(data_dir);
    for path in [entry.desktop, entry.icon] {
        match std::fs::remove_file(&path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e).ctx(&path),
        }
    }
    Ok(())
}

/// Whether what is on disk is exactly what this build would write.
///
/// The reason this exists rather than a plain "is the file there": **an
/// in-place update replaces the `.AppImage` and nothing else** (2026-08-21).
/// A new version with a redrawn icon, a new name or a new category would
/// leave every already-integrated machine pointing at the old PNG and the old
/// entry text, with no way to notice — the user said yes once, months ago, and
/// would have to toggle the setting off and on to get the new artwork.
///
/// Comparing both files against what we would write now turns that into
/// something the launch can fix silently: same consent, refreshed files.
pub fn is_current(data_dir: &Path, template: &str, exec: &Path, icon: &[u8]) -> bool {
    let entry = entry(data_dir);
    let Ok(text) = std::fs::read_to_string(&entry.desktop) else {
        return false;
    };
    if text != contents(template, exec, &entry.icon) {
        return false;
    }
    std::fs::read(&entry.icon).is_ok_and(|bytes| bytes == icon)
}

/// What the menu says about the app running from `exec`, in one answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Status {
    /// The entry on disk points at THIS executable.
    pub installed: bool,
    /// It does, but the icon or the entry text is not what this build would
    /// write. Never true for an entry that is not installed: a stale entry
    /// is one worth refreshing, and there is nothing to refresh where the
    /// offer has to be made from scratch.
    pub stale: bool,
}

/// Whether the menu points at `exec`, and whether what it points with is out
/// of date — `is_installed` and `is_current` folded into the one rule the
/// launch needs: stale is "installed, and not current".
pub fn status(data_dir: &Path, template: &str, exec: &Path, icon: &[u8]) -> Status {
    let installed = is_installed(data_dir, exec);
    let stale = installed && !is_current(data_dir, template, exec, icon);
    Status { installed, stale }
}

/// Whether the menu currently points at the app running from `exec`.
///
/// Not just "does the file exist": an AppImage that was moved or renamed
/// leaves an entry behind that opens nothing, and reporting that as installed
/// would hide the one click that fixes it. Comparing the `Exec=` line is what
/// turns a stale entry back into an offer.
pub fn is_installed(data_dir: &Path, exec: &Path) -> bool {
    let Ok(text) = std::fs::read_to_string(entry(data_dir).desktop) else {
        return false;
    };
    let wanted = quoted(exec);
    text.lines()
        .filter_map(|line| line.strip_prefix("Exec="))
        .any(|value| value.trim() == wanted)
}

// ---------------------------------------------------------------------------
// The window buttons
// ---------------------------------------------------------------------------
//
// The other thing the desktop tells the app about itself. The window is
// frameless, so the app draws the buttons, and it has to draw the ones the
// system would — in the system's order, on the system's side. Reading the
// setting is the bridge's (`gsettings`); what its text means is here, where a
// second frontend can read it the same way.

/// Which window buttons go on each side, in order.
#[derive(Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ButtonLayout {
    pub left: Vec<String>,
    pub right: Vec<String>,
}

/// The layout every desktop gets when the system does not say otherwise.
///
/// It is also the answer when anything at all goes wrong: a window with no way
/// to close it is not a fallback, it is a trap.
pub fn default_button_layout() -> ButtonLayout {
    ButtonLayout {
        left: Vec::new(),
        right: ["minimize", "maximize", "close"]
            .iter()
            .map(|s| s.to_string())
            .collect(),
    }
}

/// Parses GNOME's `button-layout` — `"appmenu:minimize,maximize,close"`.
///
/// The colon splits the title bar's two sides; the names are comma separated.
/// Anything this build cannot draw (`appmenu`, `icon`, `spacer`) is dropped
/// rather than guessed at, and a value with no side we recognise falls back
/// entirely — half a set of buttons is worse than the standard one.
pub fn parse_button_layout(value: &str) -> ButtonLayout {
    const KNOWN: [&str; 3] = ["minimize", "maximize", "close"];
    let side = |part: &str| -> Vec<String> {
        part.split(',')
            .map(str::trim)
            .filter(|name| KNOWN.contains(name))
            .map(str::to_string)
            .collect()
    };

    let value = value.trim().trim_matches('\'');
    let (left, right) = value.split_once(':').unwrap_or(("", value));
    let layout = ButtonLayout {
        left: side(left),
        right: side(right),
    };
    if layout.left.is_empty() && layout.right.is_empty() {
        return default_button_layout();
    }
    layout
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_button_layout_follows_the_system_and_never_leaves_the_window_shut() {
        // GNOME's default.
        assert_eq!(
            parse_button_layout("appmenu:minimize,maximize,close"),
            ButtonLayout {
                left: vec![],
                right: ["minimize", "maximize", "close"]
                    .map(str::to_string)
                    .to_vec(),
            }
        );

        // Buttons on the left, the way macOS-style setups put them — and the
        // `gsettings` quoting stripped.
        assert_eq!(
            parse_button_layout("'close,minimize,maximize:'"),
            ButtonLayout {
                left: ["close", "minimize", "maximize"].map(str::to_string).to_vec(),
                right: vec![],
            }
        );

        // Someone who dropped the maximize keeps exactly what they asked for.
        assert_eq!(
            parse_button_layout(":minimize,close").right,
            ["minimize", "close"].map(str::to_string).to_vec()
        );

        // Anything unreadable, empty, or naming only things we cannot draw
        // gives the standard set back: a window has to be closable.
        for hostile in ["", "   ", ":", "appmenu:icon,spacer", "banana"] {
            assert_eq!(
                parse_button_layout(hostile),
                default_button_layout(),
                "{hostile:?}"
            );
        }
    }

    const TEMPLATE: &str = "[Desktop Entry]\nType=Application\nName=Jott\nExec=jott\nIcon=jott\n";

    fn dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn both_files_land_where_the_desktop_looks() {
        let e = entry(Path::new("/home/x/.local/share"));
        assert_eq!(
            e.desktop,
            Path::new("/home/x/.local/share/applications/jott.desktop")
        );
        assert_eq!(
            e.icon,
            Path::new("/home/x/.local/share/icons/hicolor/256x256/apps/jott.png")
        );
    }

    #[test]
    fn the_exec_and_icon_lines_are_rewritten_and_nothing_else() {
        let out = contents(
            TEMPLATE,
            Path::new("/home/x/AppImages/Jott.AppImage"),
            Path::new("/home/x/.local/share/icons/hicolor/256x256/apps/jott.png"),
        );
        assert_eq!(
            out,
            "[Desktop Entry]\nType=Application\nName=Jott\n\
             Exec=/home/x/AppImages/Jott.AppImage\n\
             Icon=/home/x/.local/share/icons/hicolor/256x256/apps/jott.png\n"
        );
    }

    #[test]
    fn the_icon_is_an_absolute_path_and_is_never_quoted() {
        // The theme name would be hidden by a stale `icon-theme.cache`
        // (measured 2026-08-21), so the entry names the file itself. `Icon=`
        // is a plain string and not a command line: a quote in it becomes part
        // of the filename the desktop looks for.
        let out = contents(
            TEMPLATE,
            Path::new("/home/x/Jott.AppImage"),
            Path::new("/home/x/Área de trabalho/jott.png"),
        );
        assert!(out.contains("Icon=/home/x/Área de trabalho/jott.png\n"));
        assert!(!out.contains("Icon=jott\n"));
    }

    #[test]
    fn a_path_with_a_space_is_quoted() {
        // `~/Área de trabalho` is a real folder on a pt-BR desktop; unquoted,
        // the launcher reads it as a command plus two arguments.
        let out = contents(
            TEMPLATE,
            Path::new("/home/x/Área de trabalho/Jott.AppImage"),
            Path::new("/i.png"),
        );
        assert!(out.contains("Exec=\"/home/x/Área de trabalho/Jott.AppImage\"\n"));
    }

    #[test]
    fn a_template_missing_a_line_still_gets_a_complete_entry() {
        let out = contents(
            "[Desktop Entry]\nName=Jott\n",
            Path::new("/a/Jott.AppImage"),
            Path::new("/a/jott.png"),
        );
        assert!(out.contains("Exec=/a/Jott.AppImage"));
        assert!(out.contains("Icon=/a/jott.png"));
    }

    #[test]
    fn install_then_remove_leaves_nothing_behind() {
        let d = dir();
        let exec = Path::new("/home/x/Jott.AppImage");
        let e = install(d.path(), TEMPLATE, exec, b"png-bytes").unwrap();

        assert!(e.desktop.is_file() && e.icon.is_file());
        assert_eq!(std::fs::read(&e.icon).unwrap(), b"png-bytes");
        // The entry names the PNG that was just written, by absolute path.
        let text = std::fs::read_to_string(&e.desktop).unwrap();
        assert!(text.contains(&format!("Icon={}\n", e.icon.display())));
        assert!(is_installed(d.path(), exec));

        remove(d.path()).unwrap();
        assert!(!e.desktop.exists() && !e.icon.exists());
        assert!(!is_installed(d.path(), exec));
    }

    #[test]
    fn a_new_icon_makes_the_entry_stale() {
        // The case that made this exist: an update ships a redrawn icon. The
        // AppImage replaced itself; the PNG on disk did not.
        let d = dir();
        let exec = Path::new("/home/x/Jott.AppImage");
        install(d.path(), TEMPLATE, exec, b"old-icon").unwrap();

        assert!(is_current(d.path(), TEMPLATE, exec, b"old-icon"));
        assert!(!is_current(d.path(), TEMPLATE, exec, b"new-icon"));

        install(d.path(), TEMPLATE, exec, b"new-icon").unwrap();
        assert!(is_current(d.path(), TEMPLATE, exec, b"new-icon"));
    }

    #[test]
    fn a_changed_template_makes_the_entry_stale_too() {
        // A new Name= or Categories= in packaging/linux/jott.desktop reaches the
        // menu the same way the icon does.
        let d = dir();
        let exec = Path::new("/home/x/Jott.AppImage");
        install(d.path(), TEMPLATE, exec, b"i").unwrap();

        let renamed = TEMPLATE.replace("Name=Jott", "Name=Jott Notes");
        assert!(!is_current(d.path(), &renamed, exec, b"i"));
    }

    #[test]
    fn nothing_on_disk_is_not_current() {
        assert!(!is_current(
            dir().path(),
            TEMPLATE,
            Path::new("/home/x/Jott.AppImage"),
            b"i"
        ));
    }

    #[test]
    fn removing_what_is_not_there_is_not_an_error() {
        remove(dir().path()).unwrap();
    }

    #[test]
    fn an_entry_pointing_somewhere_else_is_not_installed() {
        // The AppImage was moved. The file is still there and still opens
        // nothing, so the offer has to come back.
        let d = dir();
        install(d.path(), TEMPLATE, Path::new("/old/Jott.AppImage"), b"i").unwrap();
        assert!(!is_installed(d.path(), Path::new("/new/Jott.AppImage")));
    }

    #[test]
    fn status_folds_installed_and_current_into_one_answer() {
        let d = dir();
        let exec = Path::new("/x/Jott.AppImage");

        // Nothing written yet: not installed, and therefore not stale either.
        assert_eq!(
            status(d.path(), TEMPLATE, exec, b"i"),
            Status {
                installed: false,
                stale: false
            }
        );

        // Freshly installed: current.
        install(d.path(), TEMPLATE, exec, b"i").unwrap();
        assert_eq!(
            status(d.path(), TEMPLATE, exec, b"i"),
            Status {
                installed: true,
                stale: false
            }
        );

        // The icon this build would write changed: still installed, now stale.
        assert_eq!(
            status(d.path(), TEMPLATE, exec, b"redrawn"),
            Status {
                installed: true,
                stale: true
            }
        );

        // Pointing somewhere else is not stale — it is not installed at all.
        assert_eq!(
            status(d.path(), TEMPLATE, Path::new("/moved/Jott.AppImage"), b"i"),
            Status {
                installed: false,
                stale: false
            }
        );
    }

    #[test]
    fn installing_twice_replaces_rather_than_appends() {
        let d = dir();
        install(d.path(), TEMPLATE, Path::new("/old/Jott.AppImage"), b"i").unwrap();
        install(d.path(), TEMPLATE, Path::new("/new/Jott.AppImage"), b"i").unwrap();

        let text = std::fs::read_to_string(entry(d.path()).desktop).unwrap();
        assert_eq!(text.matches("Exec=").count(), 1);
        assert!(is_installed(d.path(), Path::new("/new/Jott.AppImage")));
    }
}
