//! The machine around the window: title-bar buttons, platform, the machine's
//! own folders, and the one door that hands a path back to the desktop.
//! Nothing here reads a notebook's CONTENT.

use std::path::{Path, PathBuf};

use jott_core::desktop::{default_button_layout, parse_button_layout, ButtonLayout};
use tauri::{AppHandle, Runtime, State};
// Desktop-only: the trait brings in the folder picker, which Android does not
// have — see `pick_notebook_folder`.
#[cfg(not(target_os = "android"))]
use tauri_plugin_dialog::DialogExt;

use crate::error::{CommandError, CommandResult};
use crate::state::AppState;

/// What the desktop says the window buttons should be — the window is
/// frameless and draws them itself. Read once at boot. Asking `gsettings` is
/// this side's; what its text MEANS is `jott_core::desktop`'s.
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

/// The font families this machine has installed, sorted and safe to name in
/// CSS. Linux answers through fontconfig (`fc-list : family`, one line per
/// FACE, folded into families by the core); elsewhere the answer is empty,
/// never a guess. `host_command` so the AppImage answers for the machine.
/// Async: a spawned process must not hold the thread that draws.
#[tauri::command]
pub async fn system_fonts() -> Vec<String> {
    if !cfg!(target_os = "linux") {
        return Vec::new();
    }
    host_command("fc-list")
        .args([":", "family"])
        .output()
        .ok()
        .filter(|out| out.status.success())
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|listing| jott_core::fonts::families(&listing))
        .unwrap_or_default()
}

/// The family this desktop draws its own interface in — what the CSS
/// `system-ui` is SUPPOSED to mean. It is asked because it is not what
/// `system-ui` answers with here: WebKitGTK resolves it through fontconfig
/// (Adwaita Sans on this machine) and never looks at the desktop's setting,
/// while Chrome and Firefox do. Empty when there is nothing to ask (every
/// system but Linux, where `system-ui` already means the right thing).
/// See docs/platform-gotchas.md#webview-e-gestos
/// Async for the reason `system_fonts` is.
#[tauri::command]
pub async fn system_ui_font() -> String {
    if !cfg!(target_os = "linux") {
        return String::new();
    }
    host_command("gsettings")
        .args(["get", "org.gnome.desktop.interface", "font-name"])
        .output()
        .ok()
        .filter(|out| out.status.success())
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .and_then(|text| jott_core::fonts::ui_family(&text))
        .unwrap_or_default()
}

/// The bundle's environment, wiped off a child that answers for the HOST:
/// inside the AppImage a system binary would load the BUNDLED GLib, and
/// `spawn` resolves the program against the PARENT's PATH (bundle first) —
/// hence the absolute path. See docs/platform-gotchas.md#ponte-e-empacotamento
fn host_command(program: &str) -> std::process::Command {
    let host_path = match (std::env::var("APPDIR"), std::env::var("PATH")) {
        (Ok(appdir), Ok(path)) => Some(path_without_bundle(&path, &appdir)),
        _ => None,
    };
    let program = host_path
        .as_deref()
        .and_then(|path| find_on_path(program, path))
        .unwrap_or_else(|| std::path::PathBuf::from(program));
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
    if let Some(path) = host_path {
        cmd.env("PATH", path);
    }
    cmd
}

/// The first `program` found under an entry of `path`, as an absolute path.
fn find_on_path(program: &str, path: &str) -> Option<std::path::PathBuf> {
    path.split(':')
        .filter(|entry| !entry.is_empty())
        .map(|entry| Path::new(entry).join(program))
        .find(|candidate| candidate.is_file())
}

/// `path` with every entry under `appdir` dropped.
fn path_without_bundle(path: &str, appdir: &str) -> String {
    path.split(':')
        .filter(|entry| !entry.starts_with(appdir))
        .collect::<Vec<_>>()
        .join(":")
}

/// Whether this machine asked for the front's instrumentation: `JOTT_PERF`
/// set to anything but empty or `0` in the environment the app was started
/// from. A phone has no environment to set; it flips the flag in the page
/// (services/perf.js).
#[tauri::command]
pub fn perf_enabled() -> bool {
    std::env::var_os("JOTT_PERF").is_some_and(|v| !v.is_empty() && v != "0")
}

/// Which machine this build runs on: `"android"`, `"windows"`, `"macos"` or
/// `"linux"`. Resolved by `cfg!`; it decides AFFORDANCES (buttons, edges,
/// system bars, the window's corner), never layout — width is the CSS's
/// (`--app-compact`). The front folds every desktop into "desktop" itself.
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
/// Must be `async` AND use the callback form, never `blocking_pick_folder`: a
/// sync command runs on the main thread, which drives the GTK loop and the
/// dialog itself. Android has no picker (SAF hands `content://` URIs) and
/// answers `None` — the app never asks there, see [`default_notebook_folder`].
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

/// The app's own container on Android — the fallback when the user declines
/// `MANAGE_EXTERNAL_STORAGE`, and where older notebooks already live. NOT
/// reachable by any other app (`Android/data/<package>`, USB only). `None` on
/// desktop. See docs/platform-gotchas.md#android
#[tauri::command]
pub async fn default_notebook_folder<R: Runtime>(app: AppHandle<R>) -> Option<PathBuf> {
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

/// Where the folder browser starts, and how far up it may go. The browser
/// exists for Android (no system picker; SAF hands `content://`), rooted at
/// `EXTERNAL_STORAGE`. On desktop it is the home folder, though desktop never
/// opens it — the system's own picker is used there.
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

/// Opens the folder that holds `path` in the system's file manager. `path` is
/// root-relative; empty means the notebook root. Always a FOLDER, never a
/// document: an address that names a file opens the directory around it.
#[tauri::command]
pub fn open_in_file_manager<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    path: Option<String>,
) -> CommandResult<()> {
    let target = state.read(window.label(), |nb| nb.folder_of(path.as_deref()))?;
    open_path(&target)
}

/// Opens a notebook's own folder in the file manager, from the picker. There
/// is no open notebook here, so the path is CHECKED (absolute, and a notebook)
/// rather than resolved — never a door to any folder the webview names.
#[tauri::command]
pub fn reveal_notebook(path: PathBuf) -> CommandResult<()> {
    if !jott_core::Notebook::is_notebook(&path) {
        return Err(CommandError::new(
            "notebook",
            format!("{} is not a notebook", path.display()),
        ));
    }
    open_path(&path)
}

/// Hands a path to the desktop: the file manager on a folder, the system's
/// own app on an attachment. Spawned and left alone — waiting for exit would
/// block for as long as the window stays open. Failing to start is reported.
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
        // Scrubbed like `gsettings`: the AppImage bundles its own `xdg-open`
        // first on PATH — the host's must run, in the host's environment.
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

// ---- windows ----

/// Opens a second window, which loads the same page with a question in its
/// query string and answers it itself on boot (`shell/entry.js`), opening its
/// own notebook under its own label. `None` opens the picker. Answers the new
/// window's label. Android has no second window and refuses.
#[tauri::command]
pub fn open_window<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    notebook: Option<PathBuf>,
) -> CommandResult<String> {
    #[cfg(target_os = "android")]
    {
        let _ = (app, state, notebook);
        Err(CommandError::new(
            "platform",
            "this platform has one window",
        ))
    }
    #[cfg(not(target_os = "android"))]
    {
        use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

        // Already open somewhere: raise that window instead of making a second
        // one on the same folder — two windows on one notebook are two writers
        // on the same files.
        if let Some(path) = &notebook {
            if let Some(label) = state.window_holding(path) {
                if let Some(open) = app.get_webview_window(&label) {
                    // Best effort: a window that refuses to come forward is
                    // still the right window, and its label stops a duplicate.
                    let _ = open.unminimize();
                    let _ = open.set_focus();
                }
                return Ok(label);
            }
        }

        // Unique for as long as the app runs: the label IS the key a window's
        // notebook is filed under, and reusing one would hand a new window the
        // notebook the old one had.
        let label = format!(
            "jott-{}",
            jott_core::id::generate_unique(&app.webview_windows().keys().cloned().collect())
        );
        let url = match &notebook {
            // Percent-encoded: a `&` or `#` in the folder name would cut the
            // address in half. `decodeURIComponent` undoes it on the other side.
            Some(path) => format!("index.html?notebook={}", encode_query(&path.to_string_lossy())),
            None => "index.html?picker".to_string(),
        };

        // Same shape as the window in tauri.conf.json, sized like the window
        // asking, so a resized window opens its sibling at that size.
        let (width, height) = app
            .webview_windows()
            .values()
            .next()
            .and_then(|w| w.inner_size().ok().zip(w.scale_factor().ok()))
            .map(|(size, scale)| {
                let logical = size.to_logical::<f64>(scale);
                (logical.width, logical.height)
            })
            .unwrap_or((1000.0, 700.0));

        WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
            .title("Jott")
            .inner_size(width, height)
            .min_inner_size(400.0, 500.0)
            .resizable(true)
            .decorations(false)
            .transparent(true)
            .disable_drag_drop_handler()
            .build()
            .map_err(|e| CommandError::new("window", format!("could not open a window: {e}")))?;

        Ok(label)
    }
}

/// Percent-encodes a value for a query string: everything outside RFC 3986's
/// unreserved set goes to `%XX`, which `decodeURIComponent` undoes. Written
/// out rather than pulled in — a dependency for eighteen lines of table.
#[cfg(not(target_os = "android"))]
fn encode_query(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// Whether the picker's window closes once it has opened a notebook. A
/// machine preference set in the picker's own ⋮; absent means it closes.
#[tauri::command]
pub async fn picker_closes<R: Runtime>(app: AppHandle<R>) -> bool {
    crate::prefs::picker_closes(&app)
}

#[tauri::command]
pub fn remember_picker_closes<R: Runtime>(app: AppHandle<R>, closes: bool) {
    crate::prefs::remember_picker_closes(&app, closes);
}

/// Whether the app opens on the picker instead of on the last notebook. The
/// other half of the same ⋮; absent means the last notebook.
#[tauri::command]
pub async fn opens_on_picker<R: Runtime>(app: AppHandle<R>) -> bool {
    crate::prefs::opens_on_picker(&app)
}

#[tauri::command]
pub fn remember_opens_on_picker<R: Runtime>(app: AppHandle<R>, on: bool) {
    crate::prefs::remember_opens_on_picker(&app, on);
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
        // The one measured breaking, and the rest of what the AppRun hook exports.
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

    // Unix only: the PATH is `:`-separated and the bundle is an AppImage; on
    // Windows the separator is `;` and the test could only fail.
    #[cfg(unix)]
    #[test]
    fn the_host_program_is_found_past_the_bundle() {
        // A bundle dir with its own `xdg-open` first, the host's after: the
        // scrubbed PATH must lead to the host's, by absolute path.
        let dir = tempfile::tempdir().unwrap();
        let bundle = dir.path().join("bundle/usr/bin");
        let host = dir.path().join("host/bin");
        std::fs::create_dir_all(&bundle).unwrap();
        std::fs::create_dir_all(&host).unwrap();
        std::fs::write(bundle.join("xdg-open"), "").unwrap();
        std::fs::write(host.join("xdg-open"), "").unwrap();

        let path = format!("{}:{}", bundle.display(), host.display());
        let scrubbed = path_without_bundle(&path, &dir.path().join("bundle").to_string_lossy());
        assert_eq!(find_on_path("xdg-open", &scrubbed), Some(host.join("xdg-open")));
        assert_eq!(find_on_path("nope", &scrubbed), None);
    }
}
