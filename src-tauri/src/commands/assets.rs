//! The notebook's file library — `assets/` at the root, one flat folder.
//!
//! Three doors bring a file in, because a picture arrives three ways: as bytes
//! from an `<input type="file">` or a paste, as a path from a drag out of the
//! file manager, and as an `https://` address copied from a web page. What a
//! downloaded file is CALLED and whether it is a picture at all are the
//! library's rules (`jott_core::assets`); fetching the bytes is this side's,
//! and it is the one thing this app does that leaves the machine.

use std::path::PathBuf;

use tauri::{AppHandle, Runtime, State};

use crate::error::{CommandError, CommandResult};
use crate::state::AppState;

use super::shell::open_path;

/// Every image in the notebook's library, newest first.
#[tauri::command]
pub fn assets(state: State<'_, AppState>) -> CommandResult<Vec<jott_core::AssetEntry>> {
    state.read(|nb| nb.assets().list())
}

/// Writes an image into the library, returning the address a note carries.
///
/// The bytes arrive as base64 because that is the one transport that works
/// everywhere: `tauri::ipc::Request`'s raw body is documented as unavailable
/// on Android, and the webview's `<input type="file">` is the same code path
/// on desktop and on a phone. See `crate::base64` for the decoder.
#[tauri::command]
pub fn import_asset(
    state: State<'_, AppState>,
    name: String,
    data: String,
) -> CommandResult<String> {
    let bytes = crate::base64::decode(&data)
        .ok_or_else(|| CommandError::new("invalid", "the image could not be read"))?;
    state.read(|nb| nb.import_asset(&name, &bytes))
}

/// Copies a file of THIS machine into the library, by its path.
///
/// The other door for the same gesture. `import_asset` takes the bytes,
/// because that is all a `<input type="file">` and a pasted image ever have;
/// a file dragged from the file manager arrives as a `file://` address and
/// nothing else, and reading it here beats sending a photo through the IPC as
/// base64 (user report, 2026-08-19 — the drag was doing nothing at all).
///
/// The path is chosen by the person doing the dragging, in their own file
/// manager, which is the same trust the folder picker already carries. What
/// this can do is READ that one file and write a copy into `assets/` — the
/// notebook is the only thing it can write to.
#[tauri::command]
pub fn import_asset_from_path(state: State<'_, AppState>, path: PathBuf) -> CommandResult<String> {
    let name = jott_core::fsio::file_name_of(&path);
    let bytes = std::fs::read(&path)
        .map_err(|e| CommandError::new("io", format!("{}: {e}", path.display())))?;
    state.read(|nb| nb.import_asset(&name, &bytes))
}

/// Renames a file of the library, repointing every note and task that uses it.
#[tauri::command]
pub fn rename_asset(
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> CommandResult<String> {
    state.read(|nb| nb.rename_asset(&path, &name))
}

/// Sends a file to the notebook's trash. Notes and tasks pointing at it keep
/// their address — the file is what came back, if it comes back.
#[tauri::command]
pub fn delete_asset(state: State<'_, AppState>, path: String) -> CommandResult<()> {
    state.read(|nb| nb.delete_asset(&path))
}

/// Opens an attachment in whatever the system uses for that kind of file.
///
/// The app's other door, `open_in_file_manager`, opens the FOLDER and never
/// the document (2026-08-17) — deliberately, because there it is the user's
/// own notebook being browsed. An attachment is the other case: it exists to
/// be opened, and a task's paperclip that only revealed a folder would be a
/// second click for nothing (user call, 2026-08-18).
///
/// The address is resolved by the library, which is what keeps this from
/// becoming "open any file on this machine": only a direct child of `assets/`
/// resolves at all.
#[tauri::command]
pub fn open_asset(state: State<'_, AppState>, path: String) -> CommandResult<()> {
    let file = state.read(|nb| nb.asset_file(&path))?;
    if !file.is_file() {
        return Err(CommandError::new(
            "io",
            format!("{path} is not in this notebook's files"),
        ));
    }
    open_path(&file)
}

/// Downloads a picture from the internet into the library.
///
/// **The one thing this app does that leaves the machine**, and it is asked
/// for explicitly every time until the person says to stop asking
/// (`confirmImageDownloads`, principle 9). It exists because pasting an image
/// copied from a web page hands the app an `https://` address and nothing
/// else — no bytes anywhere — so drawing it means fetching it.
///
/// The request is fenced on four sides (the first three are `crate::net`'s):
///
///   - **`https` only.** A picture is not worth a plaintext request, and
///     `file://` here would be this command reading the disk.
///   - **Timeouts**, on connecting and on the whole call: a page that never
///     answers must not be a note that never finishes pasting.
///   - **A size ceiling.** The body is read through `take`, so a server
///     claiming a small file and sending a stream cannot fill the disk.
///   - **It has to BE a picture** — the content type is checked, and the
///     extension the file is stored under comes from that type rather than
///     from the URL, which may have none (`…/large/daoz-51.jpg?1747030361`).
#[tauri::command]
pub async fn import_asset_from_url(
    state: State<'_, AppState>,
    url: String,
) -> CommandResult<String> {
    let (name, bytes) = tauri::async_runtime::spawn_blocking(move || fetch_image(&url))
        .await
        .map_err(|e| CommandError::new("io", e.to_string()))??;
    state.read(|nb| nb.import_asset(&name, &bytes))
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

/// The files sitting on the system clipboard, as `file://` addresses.
///
/// **Why this exists, measured rather than assumed** (2026-08-19, with the
/// gesture logged from inside the running window): pasting a file copied in
/// the file manager reaches the webview as a paste whose only type is
/// `text/uri-list` — and every way the DOM has of reading that type comes back
/// EMPTY. `dataTransfer.files` is empty, `getData("text/uri-list")` is `""`,
/// and so is `items[…].getAsString()`. There is nothing left to read on that
/// side, so the question is asked of the system instead, which has the answer
/// and always did.
///
/// (A DRAG is different and does not come through here: there the webview
/// hands the address over in the `text/html` flavour, which the frontend
/// reads — see `services/assets.js`.)
///
/// Async for the reason `file_icon` is: GTK is not thread-safe, so the read
/// happens on the main thread, and a synchronous command might BE on it.
#[tauri::command]
pub async fn clipboard_files<R: Runtime>(app: AppHandle<R>) -> Vec<String> {
    clipboard_uris(&app).unwrap_or_default()
}

/// Runs `f` on the GTK main thread and waits — bounded — for its answer.
///
/// GTK3 is not thread-safe: the clipboard and the icon theme may only be
/// touched from the main thread. The wait is bounded because both callers
/// are niceties — a missing icon or an empty paste must never hang a
/// command.
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

/// Everywhere else the clipboard is not asked. The GTK read above is the
/// Linux answer to a paste the webview cannot see; Android has no such
/// clipboard to reach for, and Windows and macOS hand the files to the
/// webview in the first place, so the frontend already has them.
/// Without it the crate does not compile off Linux at all, which is how the
/// gap was found: the first Android build after it landed.
#[cfg(not(target_os = "linux"))]
fn clipboard_uris<R: Runtime>(_app: &AppHandle<R>) -> Option<Vec<String>> {
    None
}

/// Where each file of the library is used, keyed by its address — so the
/// Images screen can say which files are carrying their weight, and offer the
/// way to what uses them (2026-08-19). A file nobody points at has no entry.
#[tauri::command]
pub fn asset_usage(
    state: State<'_, AppState>,
) -> CommandResult<std::collections::HashMap<String, Vec<jott_core::search::SearchHit>>> {
    state.read(|nb| nb.asset_usage())
}

/// The desktop's own icon for a kind of file, as a `data:` URL.
///
/// What it is for: a note can carry a video, a PDF, a spreadsheet, and the
/// app draws one as a chip with its name (`services/embeds.js`). The chip
/// reads better with the icon the person's file manager already uses for that
/// type (user call, 2026-08-19).
///
/// `None` is an ordinary answer, not a failure: there is no icon theme on a
/// phone, and a desktop may simply have no entry for that type. The chip
/// keeps the extension it drew for itself.
///
/// `name` is a file NAME and never a path — the type is guessed from it and
/// nothing is opened, so there is nothing here to escape from.
///
/// **Async on purpose.** The lookup has to happen on the GTK thread (GTK3 is
/// not thread-safe, and an icon theme read from a worker is undefined
/// behaviour), which means handing the work to the main thread and waiting
/// for it. An async command never RUNS on the main thread, so that wait
/// cannot be a deadlock; a sync one might.
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
    //! The lookup itself, against the machine's real icon theme.
    //!
    //! Skipped where there is no display to init GTK against — a CI runner,
    //! a tty. That is not a reason to leave the one interesting part of this
    //! untested on the machine that has one.

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
