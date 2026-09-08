//! The notebook's file library — `assets/` at the root, one flat folder.
//! Three doors bring a file in: bytes (`<input type="file">`, paste), a path
//! (drag from the file manager), an `https://` address (copied off a page).
//! Naming and "is it a picture" are `jott_core::assets`'; fetching bytes is
//! this side's, and the one thing this app does that leaves the machine.

use std::path::PathBuf;

use tauri::{AppHandle, Runtime, State};

use crate::error::{CommandError, CommandResult};
use crate::state::AppState;

use super::shell::open_path;

/// Every image in the notebook's library, newest first.
#[tauri::command]
pub fn assets<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>,) -> CommandResult<Vec<jott_core::AssetEntry>> {
    state.read(window.label(), |nb| nb.assets().list())
}

/// Writes an image into the library, returning the address a note carries.
/// Base64 because it is the one transport that works everywhere: the raw IPC
/// body is unavailable on Android (`crate::base64` decodes).
#[tauri::command]
pub fn import_asset<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    name: String,
    data: String,
) -> CommandResult<String> {
    let bytes = crate::base64::decode(&data)
        .ok_or_else(|| CommandError::new("invalid", "the image could not be read"))?;
    state.quiet(window.label(), |nb| nb.import_asset(&name, &bytes))
}

/// Copies a file of THIS machine into the library, by its path — a drag from
/// the file manager arrives as a `file://` address and nothing else. The path
/// is chosen by the person dragging, the same trust the folder picker carries;
/// all this can WRITE is a copy into `assets/`.
#[tauri::command]
pub fn import_asset_from_path<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, path: PathBuf) -> CommandResult<String> {
    let name = jott_core::fsio::file_name_of(&path);
    let bytes = std::fs::read(&path)
        .map_err(|e| CommandError::new("io", format!("{}: {e}", path.display())))?;
    state.quiet(window.label(), |nb| nb.import_asset(&name, &bytes))
}

/// Renames a file of the library, repointing every note and task that uses it.
#[tauri::command]
pub fn rename_asset<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    path: String,
    name: String,
) -> CommandResult<String> {
    state.quiet(window.label(), |nb| nb.rename_asset(&path, &name))
}

/// Sends a file to the notebook's trash. Notes and tasks pointing at it keep
/// their address — the file is what came back, if it comes back.
#[tauri::command]
pub fn delete_asset<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, path: String) -> CommandResult<()> {
    state.quiet(window.label(), |nb| nb.delete_asset(&path))
}

/// Opens an attachment in whatever the system uses for that kind of file —
/// unlike `open_in_file_manager`, which opens the FOLDER. The address is
/// resolved by the library: only a direct child of `assets/` resolves at all,
/// which keeps this from being "open any file on this machine".
#[tauri::command]
pub fn open_asset<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, path: String) -> CommandResult<()> {
    let file = state.read(window.label(), |nb| nb.asset_file(&path))?;
    if !file.is_file() {
        return Err(CommandError::new(
            "io",
            format!("{path} is not in this notebook's files"),
        ));
    }
    open_path(&file)
}

/// Downloads a picture from the internet into the library — the one thing this
/// app does that leaves the machine, asked for until told to stop
/// (`confirmImageDownloads`). Fenced by `crate::net` (https only, timeouts, size
/// ceiling) and by content type: the extension comes from the type, not the URL.
#[tauri::command]
pub async fn import_asset_from_url<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    url: String,
) -> CommandResult<String> {
    let (name, bytes) = tauri::async_runtime::spawn_blocking(move || fetch_image(&url))
        .await
        .map_err(|e| CommandError::new("io", e.to_string()))??;
    state.quiet(window.label(), |nb| nb.import_asset(&name, &bytes))
}

/// Ten megabytes. Larger than any picture a note wants and smaller than
/// anything that would hurt.
const MAX_IMAGE_BYTES: u64 = 10 * 1024 * 1024;

fn fetch_image(url: &str) -> CommandResult<(String, Vec<u8>)> {
    crate::net::require_https(url)?;
    let fetched = crate::net::get_bounded(url, MAX_IMAGE_BYTES)?;

    let kind = fetched.content_type;
    let Some(extension) = jott_core::assets::extension_for_type(&kind) else {
        return Err(CommandError::new(
            "invalid",
            format!("that address answered {kind:?}, which is not a picture"),
        ));
    };

    Ok((
        format!("{}.{extension}", jott_core::assets::name_from_url(url)),
        fetched.body,
    ))
}

/// The files sitting on the system clipboard, as `file://` addresses. A file
/// copied in the file manager reaches the webview as a paste whose only type
/// is `text/uri-list`, and every DOM read of it comes back EMPTY — so the
/// system is asked. (A drag is different: `text/html`, read by services/assets.js.)
/// Async for the reason `file_icon` is. See docs/platform-gotchas.md#webview-e-gestos
#[tauri::command]
pub async fn clipboard_files<R: Runtime>(app: AppHandle<R>) -> Vec<String> {
    clipboard_uris(&app).unwrap_or_default()
}

/// Runs `f` on the GTK main thread and waits — bounded — for its answer. GTK3
/// is not thread-safe; the wait is bounded because both callers are niceties
/// and must never hang a command.
#[cfg(target_os = "linux")]
fn on_main_thread<R: Runtime, T: Send + 'static>(
    app: &AppHandle<R>,
    f: impl FnOnce() -> T + Send + 'static,
) -> Option<T> {
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(f());
    })
    .ok()?;
    rx.recv_timeout(std::time::Duration::from_secs(2)).ok()
}

#[cfg(target_os = "linux")]
fn clipboard_uris<R: Runtime>(app: &AppHandle<R>) -> Option<Vec<String>> {
    on_main_thread(app, gtk_clipboard_uris)?
}

#[cfg(target_os = "linux")]
fn gtk_clipboard_uris() -> Option<Vec<String>> {
    let display = gdk::Display::default()?;
    let clipboard = gtk::Clipboard::default(&display)?;

    let uris: Vec<String> = clipboard
        .wait_for_uris()
        .into_iter()
        .map(|uri| uri.to_string())
        .collect();
    if !uris.is_empty() {
        return Some(uris);
    }

    // Nautilus writes `x-special/gnome-copied-files` as well — `copy\n` and
    // then the addresses — and it is the one some desktops fill when the
    // plain uri-list stays empty.
    let gnome = clipboard
        .wait_for_contents(&gdk::Atom::intern("x-special/gnome-copied-files"))
        .map(|data| String::from_utf8_lossy(&data.data()).to_string())
        .unwrap_or_default();
    Some(
        gnome
            .lines()
            .filter(|line| line.starts_with("file://"))
            .map(str::to_string)
            .collect(),
    )
}

/// Everywhere else the clipboard is not asked: Android has none to reach for,
/// and Windows and macOS hand the files to the webview in the first place.
/// Without this the crate does not compile off Linux.
#[cfg(not(target_os = "linux"))]
fn clipboard_uris<R: Runtime>(_app: &AppHandle<R>) -> Option<Vec<String>> {
    None
}

/// Where each file of the library is used, keyed by its address — for the
/// Images screen. A file nobody points at has no entry.
#[tauri::command]
pub fn asset_usage<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<std::collections::HashMap<String, Vec<jott_core::search::SearchHit>>> {
    state.read(window.label(), |nb| nb.asset_usage())
}

/// The desktop's own icon for a kind of file, as a `data:` URL, for the chip
/// a note draws for a video or a PDF (`services/embeds.js`). `None` is an
/// ordinary answer (no theme on a phone, no entry for the type). `name` is a
/// file NAME, never a path: nothing is opened. Async on purpose: the lookup
/// must run on the GTK thread, and an async command never runs there.
#[tauri::command]
pub async fn file_icon<R: Runtime>(app: AppHandle<R>, name: String) -> Option<String> {
    let png = system_icon(&app, &name)?;
    Some(format!("data:image/png;base64,{}", crate::base64::encode(&png)))
}

/// The icon bytes, from the system that has them.
#[cfg(target_os = "linux")]
fn system_icon<R: Runtime>(app: &AppHandle<R>, name: &str) -> Option<Vec<u8>> {
    let name = name.to_string();
    on_main_thread(app, move || gtk_icon(&name))?
}

#[cfg(target_os = "linux")]
fn gtk_icon(name: &str) -> Option<Vec<u8>> {
    use gtk::prelude::*;

    // The type from the NAME alone — no file is touched, and the library may
    // not even hold this one yet.
    let (content_type, _) = gio::functions::content_type_guess(Some(name), &[]);
    let icon = gio::functions::content_type_get_icon(&content_type);
    let theme = gtk::IconTheme::default()?;
    let info = theme.lookup_by_gicon(&icon, ICON_SIZE, gtk::IconLookupFlags::FORCE_SIZE)?;
    let pixbuf = info.load_icon().ok()?;
    pixbuf.save_to_bufferv("png", &[]).ok()
}

/// Drawn at 64 so it stays sharp on a scaled display; the chip sizes it down
/// in CSS.
#[cfg(target_os = "linux")]
const ICON_SIZE: i32 = 64;

#[cfg(all(test, target_os = "linux"))]
mod icon_tests {
    //! The lookup itself, against the machine's real icon theme. Skipped where
    //! there is no display to init GTK against (CI, a tty).

    #[test]
    fn the_system_draws_an_icon_for_a_kind_of_file() {
        if gtk::init().is_err() {
            eprintln!("no display: skipping the icon theme lookup");
            return;
        }
        // A PNG is what a real theme always has an entry for; the unknown
        // extension exercises the generic fallback, which is also an icon.
        for name in ["file.pdf", "file.mp4", "file.xyzzy"] {
            let png = super::gtk_icon(name).unwrap_or_else(|| panic!("no icon for {name}"));
            assert_eq!(&png[1..4], b"PNG", "{name} did not come back as a PNG");
        }
    }
}

/// Everywhere else the app draws its own chip. Android has no icon theme at
/// all, and Windows and macOS keep theirs behind APIs this app does not link.
#[cfg(not(target_os = "linux"))]
fn system_icon<R: Runtime>(_app: &AppHandle<R>, _name: &str) -> Option<Vec<u8>> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The https fence, measured before any socket is opened. A picture is
    /// not worth a plaintext request, and `file://` here would be this
    /// command reading the disk.
    #[test]
    fn plaintext_is_refused_before_a_socket_is_opened() {
        assert!(fetch_image("http://exemplo.com/a.png").is_err());
        assert!(fetch_image("file:///etc/passwd").is_err());
    }
}
