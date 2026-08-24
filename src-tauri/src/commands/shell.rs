//! The machine around the window.
//!
//! What the desktop draws its title bar like, which platform this build is,
//! the folders of the machine itself — the ones a notebook has not been put
//! in yet — and the one door that hands a path back to the desktop. Nothing
//! here reads a notebook's CONTENT; every other module in this folder is
//! about that.

use std::path::{Path, PathBuf};

use jott_core::desktop::{default_button_layout, parse_button_layout, ButtonLayout};
use tauri::{AppHandle, Runtime, State};
// Desktop-only: the trait brings in the folder picker, which Android does not
// have — see `pick_notebook_folder`.
#[cfg(not(target_os = "android"))]
use tauri_plugin_dialog::DialogExt;

use crate::error::{CommandError, CommandResult};
use crate::state::AppState;

/// What the desktop says the window buttons should be.
///
/// The window is frameless, so the app draws them itself — and a shell that
/// draws its own chrome has to follow the system's, or it reads as a foreign
/// app on the desktop. Read once at boot; there is no live signal to watch and
/// a setting change is rare enough to cost a restart. What the setting's text
/// MEANS is `jott_core::desktop`'s; asking `gsettings` is this side's.
#[tauri::command]
pub fn window_button_layout() -> ButtonLayout {
    if !cfg!(target_os = "linux") {
        return default_button_layout();
    }
    host_command("gsettings")
        .args(["get", "org.gnome.desktop.wm.preferences", "button-layout"])
        .output()
        .ok()
        .filter(|out| out.status.success())
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|text| parse_button_layout(&text))
        .unwrap_or_else(default_button_layout)
}

/// The bundle's environment, wiped off a child that answers for the HOST.
///
/// Inside the AppImage every child inherits what the runtime and the GTK
/// AppRun hook exported: `LD_LIBRARY_PATH` into the bundled libraries, GLib
/// schema and GIO module dirs of the bundle, and a PATH whose first entries
/// are the bundle's own bin (which ships an `xdg-open`). A system binary
/// started like that loads the BUNDLED GLib, and that GLib cannot find the
/// host's GIO modules — so `gsettings` answers the schema DEFAULT
/// (`appmenu:close`, upstream GNOME's) instead of the user's setting, and the
/// minimize/maximize buttons silently vanish. Measured against the v0.25.0
/// AppImage (2026-08-24): dropping `LD_LIBRARY_PATH` alone brings the user's
/// value back; the rest is the same poison waiting for another distro's
/// paths to line up with it.
fn host_command(program: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    for var in [
        "LD_LIBRARY_PATH",
        "LD_PRELOAD",
        "GSETTINGS_SCHEMA_DIR",
        "GIO_EXTRA_MODULES",
        "GIO_MODULE_DIR",
        "GDK_PIXBUF_MODULE_FILE",
        "GTK_PATH",
        "GTK_DATA_PREFIX",
        "GTK_EXE_PREFIX",
        "GTK_IM_MODULE_FILE",
    ] {
        cmd.env_remove(var);
    }
    // `APPDIR` is the mounted bundle: only set inside the AppImage, and the
    // prefix of every PATH entry the runtime pushed in front of the host's.
    if let (Ok(appdir), Some(path)) = (std::env::var("APPDIR"), std::env::var_os("PATH")) {
        if let Ok(path) = path.into_string() {
            cmd.env("PATH", path_without_bundle(&path, &appdir));
        }
    }
    cmd
}

/// `path` with every entry under `appdir` dropped.
fn path_without_bundle(path: &str, appdir: &str) -> String {
    path.split(':')
        .filter(|entry| !entry.starts_with(appdir))
        .collect::<Vec<_>>()
        .join(":")
}

/// Which machine this build runs on: `"android"`, `"windows"`, `"macos"` or
/// `"linux"`.
///
/// The app needs this for what belongs to the DEVICE rather than to the
/// window: there are no window buttons to draw on a phone, no edges to drag,
/// and the system bars own strips of the screen that the layout has to keep
/// clear. None of that follows from how wide the viewport is — a narrow
/// desktop window is still a desktop window — so it cannot be a media query.
///
/// Resolved at compile time by `cfg!`, which is the honest answer: a build
/// either targets Android or it does not, and nothing at runtime can change
/// it. The mirror image of this is width, which the CSS answers on its own
/// (styles/tokens.css, `--theme-compact`): width decides the LAYOUT, this
/// decides the AFFORDANCES.
///
/// It NAMES THE DESKTOP it is on (2026-08-20) for the one thing that is not a
/// yes/no about the device: the window's own corner. The app draws an
/// undecorated window, so the rounding is the app's to draw, and each system
/// rounds its windows differently — copying the host is what keeps the app
/// from looking like a stranger on it. Nothing else asks; the front end folds
/// every desktop answer back into "desktop" for the affordance question
/// (shell/platform.js), which is why widening this vocabulary broke nothing.
#[tauri::command]
pub fn platform() -> &'static str {
    if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

/// Opens the native folder picker. `None` when the user cancels.
///
/// Two things here are not optional, and getting either wrong freezes the
/// window the moment the dialog opens:
///
/// 1. **The command must be `async`.** A synchronous `#[tauri::command]` runs
///    on the main thread, which is the same thread that drives the GTK event
///    loop — and therefore the dialog itself.
/// 2. **The callback form, not `blocking_pick_folder`.** The plugin is
///    explicit that the blocking variants must never run on the main thread.
///    Waiting for the answer on a blocking-pool thread keeps the main thread
///    free to actually draw the dialog, whatever thread Tauri picks for the
///    command in the future.
/// On Android there is no folder picker at all: `FileDialogBuilder` has no
/// `pick_folder` there, because the platform answers folder requests with a
/// Storage Access Framework `content://` URI rather than a path, and the core
/// speaks `std::fs`. Answering `None` is honest — and the app never asks,
/// because [`default_notebook_folder`] gives it a folder up front.
#[tauri::command]
pub async fn pick_notebook_folder<R: Runtime>(app: AppHandle<R>) -> Option<PathBuf> {
    #[cfg(target_os = "android")]
    {
        let _ = app;
        None
    }
    #[cfg(not(target_os = "android"))]
    {
        let (tx, rx) = std::sync::mpsc::channel();

        // Fires on the main thread when the user answers; sending never blocks.
        app.dialog().file().pick_folder(move |folder| {
            let _ = tx.send(folder);
        });

        tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten())
            .await
            .ok()
            .flatten()
            .and_then(|folder| folder.into_path().ok())
    }
}

/// The app's own container on Android — the notebook's home when the user has
/// not given it another one. `None` on desktop.
///
/// **This is the fallback, not the plan** (revised 2026-08-19). It used to be
/// the only answer Android had: scoped storage means an app cannot open an
/// arbitrary folder, the Storage Access Framework returns a `content://` URI
/// that `std::fs` cannot open, and the core speaks `std::fs`. What that
/// reasoning got wrong was the consolation prize — this folder was described
/// as "reachable by a sync client such as Syncthing pointed at it", and it is
/// not: `Android/data/<package>` is unreadable to every other app since
/// Android 11, and stays unreadable even to one holding all-files access,
/// because that path is carved out of the permission. Only USB reaches it.
///
/// So the app now asks for `MANAGE_EXTERNAL_STORAGE` and browses real folders
/// (`list_folders`), the way Obsidian does. This container remains for the two
/// cases that still need it: the user who declines the permission, and the
/// notebooks already living here from earlier versions.
///
/// `document_dir()` on Android resolves to
/// `/storage/emulated/0/Android/data/<identifier>/files/Documents`. It falls
/// back to the app data dir, which is private but at least always exists —
/// losing the notebook is worse than losing its visibility.
#[tauri::command]
pub fn default_notebook_folder<R: Runtime>(app: AppHandle<R>) -> Option<PathBuf> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let base = app
            .path()
            .document_dir()
            .or_else(|_| app.path().app_data_dir())
            .ok()?;
        Some(base.join("Jott"))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        None
    }
}

/// Where the folder browser starts, and how far up it may go.
///
/// This is the app's own browser rather than the system's, and it exists for
/// Android: `pick_notebook_folder` has no picker there, and the Storage Access
/// Framework — the platform's answer — hands back a `content://` URI that
/// `std::fs` cannot open. With the all-files permission granted, ordinary
/// paths work again, and a folder browser is a list of directories.
///
/// On Android the root is the shared storage the user sees over USB
/// (`/storage/emulated/0`), which is what `EXTERNAL_STORAGE` names. On desktop
/// it is the home folder, though desktop never opens this browser: it has the
/// system's own picker, which knows about bookmarks, network mounts and typing
/// a path.
fn browse_root() -> PathBuf {
    #[cfg(target_os = "android")]
    {
        std::env::var_os("EXTERNAL_STORAGE")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/storage/emulated/0"))
    }
    #[cfg(not(target_os = "android"))]
    {
        dirs_home().unwrap_or_else(|| PathBuf::from("/"))
    }
}

#[cfg(not(target_os = "android"))]
fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// Lists the folders inside `path`, or inside the browse root when it is
/// `None`. The rules a path from the UI makes necessary are the core's
/// (`jott_core::browse`); which root they are bounded by is this side's.
#[tauri::command]
pub fn list_folders(path: Option<String>) -> CommandResult<jott_core::browse::FolderListing> {
    Ok(jott_core::browse::listing(&browse_root(), path)?)
}

/// Creates a folder inside `parent`, so the notebook can be put somewhere that
/// does not exist yet.
#[tauri::command]
pub fn create_folder(parent: String, name: String) -> CommandResult<String> {
    Ok(jott_core::browse::create_folder(&browse_root(), parent, &name)?)
}

/// Opens the folder that holds `path` in the system's file manager.
///
/// The notebook is plain files (principle 4), and this is the one command that
/// says so out loud: whatever screen the user is on, its folder is one click
/// away. `path` is a root-relative address — a space, a list, a note — and
/// empty means the notebook root.
///
/// What is opened is always a FOLDER, never a document: an address that names
/// a file opens the directory around it. Opening the `.md` would hand the file
/// to whatever editor the desktop has registered, which is a different promise
/// from the one the menu makes.
#[tauri::command]
pub fn open_in_file_manager(
    state: State<'_, AppState>,
    path: Option<String>,
) -> CommandResult<()> {
    let target = state.read(|nb| nb.folder_of(path.as_deref()))?;
    open_path(&target)
}

/// Hands a path to the desktop. Both doors end here: the file manager on a
/// folder, and the system's own app on an attachment.
///
/// One process per platform, spawned and left alone — waiting for it to exit
/// would block the command for as long as the window stays open. A failure
/// to even start it is reported: the menu promised something.
pub(crate) fn open_path(target: &Path) -> CommandResult<()> {
    #[cfg(target_os = "linux")]
    let program = "xdg-open";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = target;
        return Err(CommandError::new(
            "io",
            "this platform has nothing to open files with",
        ));
    }

    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    {
        // Scrubbed like `gsettings` is: the AppImage bundles an `xdg-open` of
        // its own and puts it first on PATH — the one that runs must be the
        // host's, in the host's environment.
        host_command(program)
            .arg(target)
            .spawn()
            .map(|_| ())
            .map_err(|e| {
                eprintln!("[jott] could not open {}: {e}", target.display());
                CommandError::new("io", format!("could not open it: {e}"))
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_host_command_gets_the_bundle_wiped_from_its_environment() {
        let cmd = host_command("gsettings");
        let removed: Vec<_> = cmd
            .get_envs()
            .filter(|(_, value)| value.is_none())
            .map(|(key, _)| key.to_string_lossy().into_owned())
            .collect();
        // The one that was measured breaking (v0.25.0 AppImage, 2026-08-24)
        // and the rest of what the AppRun hook exports.
        assert!(removed.contains(&"LD_LIBRARY_PATH".to_string()));
        assert!(removed.contains(&"GSETTINGS_SCHEMA_DIR".to_string()));
        assert!(removed.contains(&"GIO_EXTRA_MODULES".to_string()));
    }

    #[test]
    fn the_bundles_path_entries_are_dropped_and_the_hosts_kept() {
        assert_eq!(
            path_without_bundle(
                "/tmp/.mount_jottXY/usr/bin/:/tmp/.mount_jottXY/usr/sbin/:/bin:/usr/bin",
                "/tmp/.mount_jottXY"
            ),
            "/bin:/usr/bin"
        );
        // Outside the AppImage nothing matches and nothing changes.
        assert_eq!(path_without_bundle("/bin:/usr/bin", "/tmp/.mount_x"), "/bin:/usr/bin");
    }
}
