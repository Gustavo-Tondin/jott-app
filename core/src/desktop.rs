//! Desktop-menu integration for the AppImage: the `.desktop` entry and icon a
//! packaged install writes at install time. Pure: takes the data dir, the
//! executable and the icon bytes; the bridge knows `$APPIMAGE`/`$XDG_DATA_HOME`.
//! The entry text is `packaging/linux/jott.desktop`, handed in by the caller —
//! never a second copy here, or the two installs drift apart in the menu.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{IoContext, Result};
use crate::fsio;

/// The basename both files carry, matching what the packaged installs use so
/// a machine cannot end up with two entries for one app.
const NAME: &str = "jott";

/// The entry names the icon by absolute path, so the theme never looks it up;
/// it still lives where icons live so a user can recognise and delete it.
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

/// The entry text for an app at `exec`: only `Exec=` and `Icon=` change from
/// the packaged template. `Icon=` is an absolute path, never the theme name —
/// GTK trusts a stale `icon-theme.cache` and does not rescan the folder.
/// See docs/platform-gotchas.md#ponte-e-empacotamento
pub fn contents(template: &str, exec: &Path, icon: &Path) -> String {
    // `Exec=` is read as a command line and needs quoting; `Icon=` is a plain
    // string, and a quote there becomes part of the filename.
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
    // A template missing either line would list an app that cannot start or
    // has no icon: append rather than write it silently.
    if !wrote.0 {
        out.push_str(&format!("Exec={exec}\n"));
    }
    if !wrote.1 {
        out.push_str(&format!("Icon={icon}\n"));
    }
    out
}

/// A path as the Desktop Entry spec wants it inside `Exec=`: the value is a
/// command line, so a space (`~/Área de trabalho`) must be quoted or the
/// launcher reports "app not found". Quoted only when needed.
fn quoted(exec: &Path) -> String {
    let raw = exec.to_string_lossy();
    if !raw.contains(|c: char| c.is_whitespace() || "\"'\\><~|&;$*?#()`".contains(c)) {
        return raw.into_owned();
    }
    let escaped = raw.replace('\\', r"\\").replace('"', r#"\""#);
    format!("\"{escaped}\"")
}

/// Writes both files, replacing whatever was there. Atomic: a launcher
/// reading a half-written entry drops the app until the next rescan.
pub fn install(data_dir: &Path, template: &str, exec: &Path, icon: &[u8]) -> Result<Entry> {
    let entry = entry(data_dir);
    let text = contents(template, exec, &entry.icon);
    fsio::write_atomically(&entry.desktop, text.as_bytes())?;
    fsio::write_atomically(&entry.icon, icon)?;
    Ok(entry)
}

/// Takes both files away. A missing file counts as removed, not as an error.
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

/// Whether what is on disk is exactly what this build would write. An
/// in-place update replaces only the `.AppImage`; comparing both files lets
/// the launch refresh a redrawn icon or new entry text under the same consent.
fn is_current(data_dir: &Path, template: &str, exec: &Path, icon: &[u8]) -> bool {
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
    /// Installed, but the icon or entry text is not what this build would
    /// write. Never true when not installed: there is nothing to refresh.
    pub stale: bool,
}

/// `is_installed` and `is_current` folded into the one rule the launch
/// needs: stale is "installed, and not current".
pub fn status(data_dir: &Path, template: &str, exec: &Path, icon: &[u8]) -> Status {
    let installed = is_installed(data_dir, exec);
    let stale = installed && !is_current(data_dir, template, exec, icon);
    Status { installed, stale }
}

/// Whether the entry's `Exec=` line points at `exec`. Existence is not
/// enough: a moved or renamed AppImage leaves an entry that opens nothing,
/// and that has to become an offer again.
fn is_installed(data_dir: &Path, exec: &Path) -> bool {
    let Ok(text) = std::fs::read_to_string(entry(data_dir).desktop) else {
        return false;
    };
    let wanted = quoted(exec);
    text.lines()
        .filter_map(|line| line.strip_prefix("Exec="))
        .any(|value| value.trim() == wanted)
}

// --- The window buttons ----------------------------------------------------
// The window is frameless, so the app draws the buttons the system would, in
// the system's order and side. Reading `gsettings` is the bridge's job; what
// its text means is decided here.

/// Which window buttons go on each side, in order.
#[derive(Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ButtonLayout {
    pub left: Vec<String>,
    pub right: Vec<String>,
}

/// The layout when the system does not say otherwise — and the answer when
/// anything goes wrong: a window with no close button is a trap.
pub fn default_button_layout() -> ButtonLayout {
    ButtonLayout {
        left: Vec::new(),
        right: ["minimize", "maximize", "close"]
            .iter()
            .map(|s| s.to_string())
            .collect(),
    }
}

/// Parses GNOME's `button-layout` (`"appmenu:minimize,maximize,close"`): the
/// colon splits the sides, commas the names. Names this build cannot draw
/// (`appmenu`, `icon`, `spacer`) are dropped; no recognised name on either
/// side falls back to the default entirely.
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
        // The theme name would be hidden by a stale `icon-theme.cache`, so the
        // entry names the file. `Icon=` is not a command line: a quote in it
        // becomes part of the filename.
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
        // An update ships a redrawn icon: the AppImage replaced itself, the
        // PNG on disk did not.
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
