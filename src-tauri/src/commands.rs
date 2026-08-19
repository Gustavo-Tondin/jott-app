//! One `invoke()` command per core operation.
//!
//! Every function here is a wire: read the arguments, call `jott_core`, hand
//! back the result. Any `if` that decides something about tasks, lists or
//! dates belongs in the core instead — see the architecture rule in
//! `CLAUDE.md`.

use std::path::{Path, PathBuf};

use jott_core::config::{Config, RolloverMode};
use jott_core::state::{Period, PeriodState};
use jott_core::{Conflict, ListedTask, Notebook, OriginAction, Task, TurnOffset, WeekStart};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime, State};
// Desktop-only: the trait brings in the folder picker, which Android does not
// have — see `pick_notebook_folder`.
#[cfg(not(target_os = "android"))]
use tauri_plugin_dialog::DialogExt;

use crate::error::{CommandError, CommandResult};
use crate::state::AppState;

/// The addresses the core creates, so the frontend never hard-codes them.
///
/// The frontend used to mirror these in a `names.js` — and when the core
/// renamed `Completas` to `Completed` in phase 5, the completed screen kept
/// reading a file that no longer existed and showed "nothing done yet"
/// forever. Coming over the bridge, a rename reaches every screen at once.
///
/// Since phase 7 these are **paths**, not names: `Tasks/Inbox.md`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookLayout {
    /// Where quick-captured tasks land.
    pub inbox: String,
    /// The fixed space's completed list.
    pub completed: String,
    /// The folder new lists are created in, until the UI is space-aware.
    pub tasks_folder: String,
    /// The per-folder completed list's NAME (`Completed`) — every tasks
    /// space has one, and the UI must not hard-code it (the names.js lesson).
    pub completed_name: String,
    /// The fixed Notes space's folder, and the folder loose notes land in.
    pub notes_folder: String,
    pub notes_inbox: String,
    /// Preferences the screens need on every render, so they do not each ask
    /// for the settings separately: how to draw a date, whether clicking away
    /// closes the task panel, and where the quick capture writes.
    pub date_display_format: String,
    pub close_inspector_on_click_away: bool,
    pub quick_note_folder: String,
    /// Which of the seven the app is accented with, and which theme is on,
    /// both by name (2026-08-13). They ride in the layout rather than the
    /// settings because the shell needs them on the FIRST paint — both are
    /// attributes on the document root, and waiting for a second round trip
    /// would flash the wrong colours. Empty means what the app ships as.
    pub accent_color: String,
    pub theme: String,
    /// Whether headings take the accent or plain ink (2026-08-17). Rides here
    /// for the same reason as the other two: it is an attribute on the
    /// document root, wanted on the first paint.
    pub heading_color: String,
    pub note_font_size: String,
    pub shortcuts: serde_json::Map<String, serde_json::Value>,
    /// Which parts of the app are switched on (2026-08-06). Only what was
    /// switched OFF is listed; the frontend's `services/features.js` reads a
    /// missing key as on, and applies a child's parent for it.
    pub features: std::collections::BTreeMap<String, bool>,
}

/// What the frontend needs to know about the open notebook.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookInfo {
    pub path: PathBuf,
    /// Folder name, which is what the user recognizes as the notebook's name.
    pub name: String,
    pub read_only: bool,
    /// Every list as `{ path, name }` — the path is the address commands
    /// take, the name is what the user reads.
    pub lists: Vec<jott_core::notebook::ListEntry>,
    pub layout: NotebookLayout,
}

impl NotebookInfo {
    fn of(notebook: &Notebook) -> CommandResult<Self> {
        Ok(Self {
            path: notebook.root().to_path_buf(),
            name: notebook
                .root()
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
            read_only: notebook.is_read_only(),
            lists: notebook.lists()?,
            layout: NotebookLayout {
                inbox: Notebook::inbox_path(),
                completed: Notebook::completed_path_of(&Notebook::inbox_path())?,
                // 2026-08-11: a space owns its files directly — tasks land
                // in the fixed `Tasks/` space, loose notes in `Notes/`.
                tasks_folder: jott_core::TASKS_DIR.to_string(),
                completed_name: jott_core::COMPLETED_LIST.to_string(),
                notes_folder: jott_core::NOTES_DIR.to_string(),
                // The core's name, never a mirror: this used to be hard-coded
                // to "" and every note the Home created landed in the space's
                // ROOT instead of the Inbox the spec (and the config default)
                // point at.
                notes_inbox: jott_core::notefolder::NOTES_INBOX.to_string(),
                date_display_format: notebook
                    .config()
                    .date_display_format
                    .render()
                    .to_string(),
                close_inspector_on_click_away: notebook
                    .config()
                    .close_inspector_on_click_away,
                quick_note_folder: notebook.config().quick_note_folder.clone(),
                accent_color: notebook.config().accent_color.clone(),
                theme: notebook.config().theme.clone(),
                heading_color: notebook.config().heading_color.clone(),
                note_font_size: notebook.config().note_font_size.clone(),
                shortcuts: notebook.config().shortcuts.clone(),
                features: notebook.config().features.clone(),
            },
        })
    }
}

/// The notebook preferences, flattened for the UI.
///
/// Every field is a plain string or bool: the frontend should not have to know
/// the core's types, and a value it cannot parse still round-trips.
///
/// Everything is optional on the way **in**: a missing field keeps whatever is
/// stored, instead of failing the whole call. Otherwise adding a preference
/// here would break every caller that does not know about it yet — including
/// an older frontend against a newer shell. On the way **out** all fields are
/// filled.
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NotebookSettings {
    pub daily_mode: Option<String>,
    pub daily_at: Option<String>,
    pub weekly_mode: Option<String>,
    pub weekly_at: Option<String>,
    pub week_starts_on: Option<String>,
    pub restore_last_screen: Option<bool>,
    pub show_list_counts: Option<bool>,
    pub dated_tasks_join_period: Option<bool>,
    /// Ask before deleting. Turned off from the dialog itself.
    pub confirm_deletes: Option<bool>,
    /// Ask before fetching a picture from the internet. The user turns this
    /// off from the dialog itself ("don't ask again").
    pub confirm_image_downloads: Option<bool>,
    pub auto_urgent_by_date: Option<bool>,
    pub date_display_format: Option<String>,
    /// One of the seven, by name; empty goes back to the app's own.
    pub accent_color: Option<String>,
    /// A theme name; empty goes back to the app's own.
    pub theme: Option<String>,
    /// `"ink"` draws headings in plain ink; empty (or anything else) accents.
    pub heading_color: Option<String>,
    pub note_font_size: Option<String>,
    pub close_inspector_on_click_away: Option<bool>,
    pub quick_note_folder: Option<String>,
    /// Days a completed task stays in its `Completed.md` before the reaper
    /// files it away into the trash; 0 means never (2026-08-06).
    pub completed_retention_days: Option<i64>,
    /// Days a trashed item waits before the trash reaper clears it for good.
    pub trash_retention_days: Option<i64>,
}

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
fn default_button_layout() -> ButtonLayout {
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
fn parse_button_layout(value: &str) -> ButtonLayout {
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

/// What the desktop says the window buttons should be.
///
/// The window is frameless, so the app draws them itself — and a shell that
/// draws its own chrome has to follow the system's, or it reads as a foreign
/// app on the desktop. Read once at boot; there is no live signal to watch and
/// a setting change is rare enough to cost a restart.
#[tauri::command]
pub fn window_button_layout() -> ButtonLayout {
    if !cfg!(target_os = "linux") {
        return default_button_layout();
    }
    std::process::Command::new("gsettings")
        .args(["get", "org.gnome.desktop.wm.preferences", "button-layout"])
        .output()
        .ok()
        .filter(|out| out.status.success())
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|text| parse_button_layout(&text))
        .unwrap_or_else(default_button_layout)
}

/// Which kind of machine this build runs on: `"android"` or `"desktop"`.
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
#[tauri::command]
pub fn platform() -> &'static str {
    if cfg!(target_os = "android") {
        "android"
    } else {
        "desktop"
    }
}

// --------------------------------------------------------------- notebook

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

/// A folder and the folders inside it — one rung of the in-app folder browser.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderListing {
    /// The folder that was listed, absolute.
    pub path: String,
    /// What to display for it — the last component, or the whole path at the
    /// top, where there is no component to name.
    pub name: String,
    /// One rung up, or `None` at the top of what the app may browse.
    pub parent: Option<String>,
    /// The folders inside, sorted, hidden ones left out. Files are not listed:
    /// the question this browser asks is "which FOLDER", and a list of every
    /// photo on the phone would only be scrolled past.
    pub folders: Vec<FolderEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    pub path: String,
    pub name: String,
    /// True when the folder already holds a notebook — the browser marks it,
    /// so opening an existing notebook does not look like creating one.
    pub notebook: bool,
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
/// `None`.
///
/// **`path` is never trusted to be inside the root**: it arrives from the UI,
/// and a browser that accepted `..` would walk out of shared storage into
/// wherever the process happens to be allowed. Anything outside answers the
/// root instead of an error — the browser lands somewhere usable rather than
/// showing a failure the user cannot act on.
#[tauri::command]
pub fn list_folders(path: Option<String>) -> CommandResult<FolderListing> {
    listing_in(&browse_root(), path)
}

/// The whole of `list_folders` except which root it is bounded by — so the
/// containment rule can be tested against a temporary folder rather than
/// against whatever `$HOME` happens to be on the machine running the tests.
fn listing_in(root: &Path, path: Option<String>) -> CommandResult<FolderListing> {
    let root = root.to_path_buf();
    let at = match path {
        Some(path) => {
            let candidate = PathBuf::from(path);
            // `canonicalize` resolves `..` and symlinks, which is what makes
            // the containment check mean anything.
            let resolved = candidate.canonicalize().unwrap_or(candidate);
            if resolved.starts_with(&root) {
                resolved
            } else {
                root.clone()
            }
        }
        None => root.clone(),
    };

    let mut folders: Vec<FolderEntry> = jott_core::fsio::dir_paths(&at)?
        .into_iter()
        .filter(|p| p.is_dir() && !jott_core::fsio::is_hidden(p))
        .map(|p| FolderEntry {
            notebook: p.join(".jott").is_dir(),
            name: file_label(&p),
            path: p.to_string_lossy().into_owned(),
        })
        .collect();
    folders.sort_by_key(|f| f.name.to_lowercase());

    Ok(FolderListing {
        parent: (at != root)
            .then(|| at.parent().map(|p| p.to_string_lossy().into_owned()))
            .flatten(),
        name: file_label(&at),
        path: at.to_string_lossy().into_owned(),
        folders,
    })
}

/// The last component of a path, falling back to the whole thing — a root has
/// no last component, and an empty label would draw an empty breadcrumb.
fn file_label(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

/// Creates a folder inside `parent`, so the notebook can be put somewhere that
/// does not exist yet — which is most of the time, on a phone whose shared
/// storage came with the manufacturer's folders and nothing else.
///
/// The name goes through the same guard as every name the user types
/// (`relpath::is_safe_leaf`), so a slash or a `..` cannot make this write
/// anywhere but inside `parent`.
#[tauri::command]
pub fn create_folder(parent: String, name: String) -> CommandResult<String> {
    create_folder_in(&browse_root(), parent, &name)
}

fn create_folder_in(root: &Path, parent: String, name: &str) -> CommandResult<String> {
    let name = name.trim();
    if !jott_core::relpath::is_safe_leaf(name) {
        return Err(CommandError::new(
            "invalidName",
            format!("bad folder name: {name}"),
        ));
    }
    // Through the browser's own resolution, so a `parent` from outside the
    // root cannot be written to either.
    let listing = listing_in(root, Some(parent))?;
    let folder = PathBuf::from(listing.path).join(name);
    std::fs::create_dir_all(&folder)
        .map_err(|e| CommandError::new("io", format!("{}: {e}", folder.display())))?;
    Ok(folder.to_string_lossy().into_owned())
}

/// Opens a notebook, creating one in that folder if it is not one yet.
#[tauri::command]
pub fn open_notebook<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    path: PathBuf,
) -> CommandResult<NotebookInfo> {
    let notebook = Notebook::open_or_init(&path)?;
    let info = NotebookInfo::of(&notebook)?;
    allow_assets(&app, &path);
    state.open(&app, notebook)?;
    crate::prefs::remember_notebook(&app, &path);
    Ok(info)
}

/// Lets the webview LOAD the images of this notebook, and only those.
///
/// A banner and an inline image are drawn by an `<img>`, and an `<img>` cannot
/// call a command — it needs a URL. Tauri's asset protocol is that URL
/// (`convertFileSrc`), and it answers only for paths in its scope. The scope
/// is empty in `tauri.conf.json` and filled HERE, at the moment a notebook is
/// opened, with one folder: `<notebook>/assets`. A notebook is a folder the
/// user picks at runtime, so a scope written in the config could only have
/// been `**` — every file on the machine reachable from a webview, to draw
/// pictures from one directory.
///
/// Not recursive: the library is flat by construction (`jott_core::assets`).
///
/// A failure here is not a reason to refuse the notebook: everything else in
/// the app works, and what breaks is images not drawing.
fn allow_assets<R: Runtime>(app: &AppHandle<R>, root: &std::path::Path) {
    use tauri::Manager;
    let dir = root.join(jott_core::ASSETS_DIR);
    if let Err(e) = app.asset_protocol_scope().allow_directory(&dir, false) {
        eprintln!("[jott] could not allow {}: {e}", dir.display());
    }
}

/// The notebook open when the app was last closed, so onboarding can reopen
/// it instead of asking for the folder every launch. `None` when there is
/// none, or when the folder is gone.
#[tauri::command]
pub fn last_notebook<R: Runtime>(app: AppHandle<R>) -> Option<PathBuf> {
    crate::prefs::last_notebook(&app)
}

/// The notebook currently open, if any.
#[tauri::command]
pub fn current_notebook(state: State<'_, AppState>) -> Option<NotebookInfo> {
    if !state.is_open() {
        return None;
    }
    state.with_notebook(NotebookInfo::of).ok()
}

/// Open task count per list, for the navigation. Empty when the user turned
/// the counters off — the frontend does not need to know the rule.
#[tauri::command]
pub fn list_counts(
    state: State<'_, AppState>,
) -> CommandResult<std::collections::BTreeMap<String, usize>> {
    state.with_notebook(counts_of)
}

/// The rule behind the counters, written once: off means empty, not absent —
/// the shape stays the same either way. Shared by `list_counts` and the
/// snapshot, so the two doors cannot drift.
fn counts_of(nb: &Notebook) -> CommandResult<std::collections::BTreeMap<String, usize>> {
    if !nb.config().show_list_counts {
        return Ok(Default::default());
    }
    Ok(nb.open_task_counts()?)
}

/// Which screen to open on launch.
///
/// `None` means "use the default" — either the user never left one, or the
/// notebook has `restoreLastScreen` off. The value itself is machine-local;
/// the preference to use it travels with the notebook.
#[tauri::command]
pub fn screen_to_restore<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> CommandResult<Option<String>> {
    state.with_notebook(|nb| {
        if !nb.config().restore_last_screen {
            return Ok(None);
        }
        Ok(crate::prefs::last_screen(&app))
    })
}

/// Records the current screen. No-op when the notebook has the preference off,
/// so turning it on later does not restore a screen from months ago.
#[tauri::command]
pub fn remember_screen<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    screen: String,
) -> CommandResult<()> {
    state.with_notebook(|nb| {
        if nb.config().restore_last_screen {
            crate::prefs::remember_screen(&app, &screen);
        }
        Ok(())
    })
}

/// How wide the sidebar was left last time, in CSS pixels — `None` when it was
/// never dragged. It needs no notebook: the panel is drawn before one is open.
#[tauri::command]
pub fn sidebar_width<R: Runtime>(app: AppHandle<R>) -> Option<f64> {
    crate::prefs::sidebar_width(&app)
}

/// Remembers it, once per drag.
#[tauri::command]
pub fn remember_sidebar_width<R: Runtime>(app: AppHandle<R>, width: f64) {
    crate::prefs::remember_sidebar_width(&app, width);
}

/// The same pair for the right panel — the inspector and the suggestions
/// share one width, because they share one panel.
#[tauri::command]
pub fn panel_width<R: Runtime>(app: AppHandle<R>) -> Option<f64> {
    crate::prefs::panel_width(&app)
}

#[tauri::command]
pub fn remember_panel_width<R: Runtime>(app: AppHandle<R>, width: f64) {
    crate::prefs::remember_panel_width(&app, width);
}

/// How far the interface is zoomed. The frontend clamps whatever it reads —
/// a value hand-edited to 40 must not make the app unusable with no way back.
#[tauri::command]
pub fn zoom<R: Runtime>(app: AppHandle<R>) -> Option<f64> {
    crate::prefs::zoom(&app)
}

#[tauri::command]
pub fn remember_zoom<R: Runtime>(app: AppHandle<R>, zoom: f64) {
    crate::prefs::remember_zoom(&app, zoom);
}

/// Whether the app may look for a new version by itself. The settings screen
/// explains the connection this implies and offers this switch to refuse it.
#[tauri::command]
pub fn auto_update_check<R: Runtime>(app: AppHandle<R>) -> bool {
    crate::prefs::auto_update_check(&app)
}

#[tauri::command]
pub fn remember_auto_update_check<R: Runtime>(app: AppHandle<R>, on: bool) {
    crate::prefs::remember_auto_update_check(&app, on);
}

/// When the last automatic check ran — an opaque timestamp the frontend
/// owns, only there to keep the check to once a day.
#[tauri::command]
pub fn last_update_check<R: Runtime>(app: AppHandle<R>) -> Option<String> {
    crate::prefs::last_update_check(&app)
}

#[tauri::command]
pub fn remember_last_update_check<R: Runtime>(app: AppHandle<R>, when: String) {
    crate::prefs::remember_last_update_check(&app, &when);
}

#[tauri::command]
pub fn notebook_settings(state: State<'_, AppState>) -> CommandResult<NotebookSettings> {
    state.with_notebook(|nb| {
        let config = nb.config();
        let rollover = config.rollover;
        Ok(NotebookSettings {
            daily_mode: Some(rollover.daily.mode.render().to_string()),
            daily_at: Some(rollover.daily.at.render()),
            weekly_mode: Some(rollover.weekly.mode.render().to_string()),
            weekly_at: Some(rollover.weekly.at.render()),
            week_starts_on: Some(rollover.weekly.starts_on.render().to_string()),
            restore_last_screen: Some(config.restore_last_screen),
            show_list_counts: Some(config.show_list_counts),
            dated_tasks_join_period: Some(config.dated_tasks_join_period),
            confirm_deletes: Some(config.confirm_deletes),
            confirm_image_downloads: Some(config.confirm_image_downloads),
            auto_urgent_by_date: Some(config.auto_urgent_by_date),
            date_display_format: Some(config.date_display_format.render().to_string()),
            accent_color: Some(config.accent_color.clone()),
            theme: Some(config.theme.clone()),
            heading_color: Some(config.heading_color.clone()),
            note_font_size: Some(config.note_font_size.clone()),
            close_inspector_on_click_away: Some(config.close_inspector_on_click_away),
            quick_note_folder: Some(config.quick_note_folder.clone()),
            completed_retention_days: Some(config.completed_retention_days),
            trash_retention_days: Some(config.trash_retention_days),
        })
    })
}

/// Saves the rollover preferences. Unparseable values fall back to the
/// defaults in the core, so the UI cannot write a broken config.
#[tauri::command]
pub fn set_notebook_settings(
    state: State<'_, AppState>,
    settings: NotebookSettings,
) -> CommandResult<()> {
    state.with_notebook_mut(|nb| {
        let mut config: Config = nb.config().clone();
        let r = &mut config.rollover;

        // A value that arrives unparseable falls back to the core's default,
        // so the UI cannot write a broken config; a value that does not arrive
        // at all is left exactly as it was.
        if let Some(v) = &settings.daily_mode {
            r.daily.mode = RolloverMode::parse_or_default(v);
        }
        if let Some(v) = &settings.daily_at {
            r.daily.at = TurnOffset::parse_or_default(v);
        }
        if let Some(v) = &settings.weekly_mode {
            r.weekly.mode = RolloverMode::parse_or_default(v);
        }
        if let Some(v) = &settings.weekly_at {
            r.weekly.at = TurnOffset::parse_or_default(v);
        }
        if let Some(v) = &settings.week_starts_on {
            r.weekly.starts_on = WeekStart::parse_or_default(v);
        }
        if let Some(v) = settings.restore_last_screen {
            config.restore_last_screen = v;
        }
        if let Some(v) = settings.show_list_counts {
            config.show_list_counts = v;
        }
        if let Some(v) = settings.dated_tasks_join_period {
            config.dated_tasks_join_period = v;
        }
        if let Some(v) = settings.confirm_deletes {
            config.confirm_deletes = v;
        }
        if let Some(v) = settings.confirm_image_downloads {
            config.confirm_image_downloads = v;
        }
        if let Some(v) = settings.auto_urgent_by_date {
            config.auto_urgent_by_date = v;
        }
        if let Some(v) = &settings.date_display_format {
            config.date_display_format = jott_core::config::DateFormat::parse_or_default(v);
        }
        // Not validated here: the seven colours and the list of themes are the
        // interface's, and a name this build does not know must round-trip
        // (core/src/config.rs).
        if let Some(v) = &settings.accent_color {
            config.accent_color = v.trim().to_string();
        }
        if let Some(v) = &settings.theme {
            config.theme = v.trim().to_string();
        }
        if let Some(v) = &settings.note_font_size {
            config.note_font_size = v.trim().to_string();
        }
        if let Some(v) = &settings.heading_color {
            config.heading_color = v.trim().to_string();
        }
        if let Some(v) = settings.close_inspector_on_click_away {
            config.close_inspector_on_click_away = v;
        }
        if let Some(v) = &settings.quick_note_folder {
            if !v.trim().is_empty() {
                config.quick_note_folder = v.clone();
            }
        }
        // A negative retention is meaningless; the core would drop it on the
        // next read anyway, so it never reaches the file.
        if let Some(v) = settings.completed_retention_days.filter(|d| *d >= 0) {
            config.completed_retention_days = v;
        }
        if let Some(v) = settings.trash_retention_days.filter(|d| *d >= 0) {
            config.trash_retention_days = v;
        }

        nb.set_config(config)?;
        Ok(())
    })
}

/// Records a manual order for a namespace (`"spaces"`, `"lists:<folder>"`),
/// written by dragging in the sidebar. An empty list clears it.
#[tauri::command]
pub fn set_order(
    state: State<'_, AppState>,
    namespace: String,
    names: Vec<String>,
) -> CommandResult<()> {
    state.with_notebook_mut(|nb| Ok(nb.set_order(&namespace, names)?))
}

// ------------------------------------------------------------------ lists

#[tauri::command]
pub fn list_names(state: State<'_, AppState>) -> CommandResult<Vec<jott_core::notebook::ListEntry>> {
    state.with_notebook(|nb| Ok(nb.lists()?))
}

/// Conflicting copies a sync tool left in the notebook.
///
/// The app reports them; resolving is the user's call, since guessing which
/// side to keep is how work gets lost.
#[tauri::command]
pub fn list_conflicts(state: State<'_, AppState>) -> CommandResult<Vec<Conflict>> {
    state.with_notebook(|nb| Ok(nb.conflicts()?))
}

#[tauri::command]
pub fn list_tasks(state: State<'_, AppState>, list: String) -> CommandResult<Vec<Task>> {
    state.with_notebook(|nb| Ok(nb.tasks_in(&list)?))
}

/// Creates a list inside `folder` (a root-relative space folder, e.g.
/// `Tasks` — the UI takes it from `layout.tasksFolder` until it is
/// space-aware).
#[tauri::command]
pub fn create_list(
    state: State<'_, AppState>,
    folder: String,
    name: String,
) -> CommandResult<()> {
    state.with_notebook(|nb| {
        nb.create_list(&folder, &name)?;
        Ok(())
    })
}

#[tauri::command]
pub fn rename_list(state: State<'_, AppState>, from: String, to: String) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.rename_list(&from, &to)?))
}

/// Deletes a list. Returns how many tasks were moved to the Inbox.
#[tauri::command]
pub fn delete_list(state: State<'_, AppState>, name: String) -> CommandResult<usize> {
    state.with_notebook(|nb| Ok(nb.delete_list(&name)?))
}

// ------------------------------------------------------------------ tasks

/// Creates a task and returns its **position** in the list, not an id.
///
/// A new task has no id: ids are handed out only when something needs to
/// address the task (see `ensure_task_id`), which is what keeps a plain
/// checklist free of comments.
#[tauri::command]
pub fn create_task(
    state: State<'_, AppState>,
    list: String,
    text: String,
) -> CommandResult<usize> {
    state.with_notebook(|nb| Ok(nb.create_task(&list, text)?))
}

/// Gives the task at `position` a stable id, and returns it.
///
/// The UI works with positions; the moment the user acts on a task — pulls it
/// into a period, completes it — it needs a name that survives reordering.
#[tauri::command]
pub fn ensure_task_id(
    state: State<'_, AppState>,
    list: String,
    position: usize,
) -> CommandResult<String> {
    state.with_notebook(|nb| Ok(nb.ensure_task_id(&list, position)?))
}

#[tauri::command]
pub fn edit_task_text(
    state: State<'_, AppState>,
    list: String,
    id: String,
    text: String,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.edit_task_text(&list, &id, text)?))
}

/// Pins a task to the top of its list, or unpins it (the card's bookmark).
#[tauri::command]
pub fn set_task_pinned(
    state: State<'_, AppState>,
    list: String,
    id: String,
    pinned: bool,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.set_task_pinned(&list, &id, pinned)?))
}

/// Edits any field of a task in one call.
///
/// One command instead of one per field: the UI edits a task in a panel and
/// saves it as a whole, and a half-applied edit would be worse than none.
/// What each field means — and every rule about it — is
/// [`jott_core::task::TaskFields`]'s, in the core, where a second frontend
/// can reach it.
#[tauri::command]
pub fn set_task_fields(
    state: State<'_, AppState>,
    list: String,
    id: String,
    fields: jott_core::task::TaskFields,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.set_task_fields(&list, &id, fields)?))
}

/// Reorders a task inside its list. Positions count tasks, not lines.
#[tauri::command]
pub fn move_task_to(
    state: State<'_, AppState>,
    list: String,
    from: usize,
    to: usize,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.move_task_to(&list, from, to)?))
}

/// Moves a task to another list. The task keeps its id; its origin is cleared,
/// because the move makes the target its home (undoing a completion is a
/// separate mechanism that does not go through here).
#[tauri::command]
pub fn move_task(
    state: State<'_, AppState>,
    from: String,
    id: String,
    to: String,
) -> CommandResult<Task> {
    state.with_notebook(|nb| Ok(nb.move_task(&id, &from, &to, OriginAction::Clear)?))
}

/// Inserts a copy of a task right after it, in the same list.
#[tauri::command]
pub fn duplicate_task(
    state: State<'_, AppState>,
    list: String,
    id: String,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.duplicate_task(&list, &id)?))
}

#[tauri::command]
pub fn complete_task(
    state: State<'_, AppState>,
    list: String,
    id: String,
) -> CommandResult<Task> {
    state.with_notebook(|nb| Ok(nb.complete_task(&list, &id)?))
}

/// Un-completes a task. `list` is the address of the Completed list it sits
/// in — with one Completed per space, the id alone cannot say which folder
/// to undo in.
#[tauri::command]
pub fn uncomplete_task(
    state: State<'_, AppState>,
    list: String,
    id: String,
) -> CommandResult<Task> {
    state.with_notebook(|nb| Ok(nb.uncomplete_task(&list, &id)?))
}

// ------------------------------------------------------------------ notes
//
// `folder` is always the root-relative address of a notes space (`Notes`);
// `path` is always relative to that space (`Inbox/ideia.md`). Two levels,
// because the space owns its subtree and the user organises freely inside
// it.

/// A note's content, for the editor.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteContent {
    pub path: String,
    pub title: String,
    /// The text WITHOUT the banner line: the editor edits prose, and the
    /// banner is drawn above it (`components/NoteBanner.svelte`). The core
    /// splits the two and puts them back together on every write, so a note
    /// being typed into never loses its head.
    pub body: String,
    pub pinned: bool,
    pub created: Option<String>,
    pub banner: Option<jott_core::Banner>,
}

/// Every note in a notes space, sorted for the board: pinned first, then
/// newest. An empty `query` returns all of them.
#[tauri::command]
pub fn list_notes(
    state: State<'_, AppState>,
    folder: String,
    query: Option<String>,
) -> CommandResult<Vec<jott_core::NoteEntry>> {
    state.with_notebook(|nb| {
        let notes = nb.note_folder(&folder)?;
        Ok(notes.search(query.as_deref().unwrap_or_default())?)
    })
}

/// The notes created today — what the Home shows. The Home owns no notes of
/// its own; this is a view of the inbox (spec 5).
#[tauri::command]
pub fn notes_created_today(
    state: State<'_, AppState>,
    folder: String,
) -> CommandResult<Vec<jott_core::NoteEntry>> {
    state.with_notebook(|nb| {
        let today = nb.today();
        Ok(nb.note_folder(&folder)?.created_on(today)?)
    })
}

/// Writes a note from one blob of text — the Home's quick capture. The first
/// line becomes the title.
#[tauri::command]
pub fn quick_capture_note(
    state: State<'_, AppState>,
    folder: String,
    in_folder: String,
    text: String,
) -> CommandResult<String> {
    state.with_notebook(|nb| Ok(nb.quick_capture_note(&folder, &in_folder, &text)?))
}

/// The folders of a notes space, each with the colour and the pin the space
/// remembers for it (2026-08-19).
#[tauri::command]
pub fn note_folders(
    state: State<'_, AppState>,
    folder: String,
) -> CommandResult<Vec<jott_core::NoteFolderEntry>> {
    state.with_notebook(|nb| Ok(nb.note_folder_entries(&folder)?))
}

/// The colour of a folder of notes — a palette NAME, or null for none.
#[tauri::command]
pub fn set_note_folder_color(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    color: Option<String>,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.set_note_folder(&folder, &path, |it| it.color = color)?))
}

/// Keeps a folder of notes at the top of the board, or stops.
#[tauri::command]
pub fn set_note_folder_pinned(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    pinned: bool,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.set_note_folder(&folder, &path, |it| it.pinned = pinned)?))
}

#[tauri::command]
pub fn read_note(
    state: State<'_, AppState>,
    folder: String,
    path: String,
) -> CommandResult<NoteContent> {
    state.with_notebook(|nb| {
        let note = nb.note_folder(&folder)?.read(&path)?;
        Ok(NoteContent {
            // The core's rule, not a second one: `trim_end_matches(".md")`
            // here used to strip REPEATED suffixes, so a note titled
            // `todo.md` (stored as `todo.md.md`) opened under a third name.
            title: jott_core::notefolder::title_of(&path),
            path,
            body: note.body,
            pinned: note.pinned,
            created: note.created.map(|d| d.to_string()),
            banner: note.banner,
        })
    })
}

/// Replaces a note's body. The core adopts today as its creation date if it
/// does not have one — the lazy frontmatter's one writing moment.
#[tauri::command]
pub fn write_note(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    body: String,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.write_note(&folder, &path, &body)?))
}

/// Creates a note and returns its address.
#[tauri::command]
pub fn create_note(
    state: State<'_, AppState>,
    folder: String,
    in_folder: String,
    title: String,
) -> CommandResult<String> {
    state.with_notebook(|nb| Ok(nb.create_note(&folder, &in_folder, &title)?))
}

#[tauri::command]
pub fn delete_note(
    state: State<'_, AppState>,
    folder: String,
    path: String,
) -> CommandResult<()> {
    // Routed through the notebook now, so it lands in the internal trash with
    // its origin recorded (reestruturação 2026-07-30), not the OS trash.
    state.with_notebook(|nb| Ok(nb.delete_note(&folder, &path)?))
}

/// Renames a note inside its folder. Returns the new address.
#[tauri::command]
pub fn rename_note(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    title: String,
) -> CommandResult<String> {
    // Through the notebook and not the folder: renaming a note now follows it
    // into every `[[link]]` in the whole notebook (2026-08-19).
    state.with_notebook(|nb| Ok(nb.rename_note(&folder, &path, &title)?))
}

/// Renames a file of the library, repointing every note and task that uses it.
#[tauri::command]
pub fn rename_asset(
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> CommandResult<String> {
    state.with_notebook(|nb| Ok(nb.rename_asset(&path, &name)?))
}

/// Moves a note to another folder inside the same space. Returns the new address.
#[tauri::command]
pub fn move_note(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    to_folder: String,
) -> CommandResult<String> {
    state.with_notebook(|nb| Ok(nb.move_note(&folder, &path, &to_folder)?))
}

#[tauri::command]
pub fn set_note_pinned(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    pinned: bool,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.set_note_pinned(&folder, &path, pinned)?))
}

/// Sets — or clears, with `None` — a note's banner.
///
/// The value is what the line carries: a colour name (`yellow`) or an asset
/// address (`assets/sunset.jpg`). Which of the two it is comes from the value
/// itself, in the core, so the interface never has to say.
#[tauri::command]
pub fn set_note_banner(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    banner: Option<String>,
) -> CommandResult<()> {
    let banner = banner.as_deref().and_then(jott_core::Banner::from_value);
    state.with_notebook(|nb| Ok(nb.set_note_banner(&folder, &path, banner)?))
}

/// Copies a note beside itself, returning the new address — the card's
/// "Duplicate".
#[tauri::command]
pub fn duplicate_note(
    state: State<'_, AppState>,
    folder: String,
    path: String,
) -> CommandResult<String> {
    state.with_notebook(|nb| Ok(nb.duplicate_note(&folder, &path)?))
}

/// Moves a note to another notes space (the bulk "move to" of the board).
/// Returns the new address, relative to the space it landed in.
#[tauri::command]
pub fn move_note_to_space(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    to_space: String,
    to_folder: String,
) -> CommandResult<String> {
    state.with_notebook(|nb| Ok(nb.move_note_to_space(&folder, &path, &to_space, &to_folder)?))
}

// ------------------------------------------------------------------ assets

/// Every image in the notebook's library, newest first.
#[tauri::command]
pub fn assets(state: State<'_, AppState>) -> CommandResult<Vec<jott_core::AssetEntry>> {
    state.with_notebook(|nb| Ok(nb.assets().list()?))
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
    state.with_notebook(|nb| Ok(nb.import_asset(&name, &bytes)?))
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
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let bytes = std::fs::read(&path)
        .map_err(|e| CommandError::new("io", format!("{}: {e}", path.display())))?;
    state.with_notebook(|nb| Ok(nb.import_asset(&name, &bytes)?))
}

/// Sends a file to the notebook's trash. Notes and tasks pointing at it keep
/// their address — the file is what came back, if it comes back.
#[tauri::command]
pub fn delete_asset(state: State<'_, AppState>, path: String) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.delete_asset(&path)?))
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
    let file = state.with_notebook(|nb| Ok(nb.asset_file(&path)?))?;
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
/// The request is fenced on four sides:
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
    state.with_notebook(|nb| Ok(nb.import_asset(&name, &bytes)?))
}

/// Ten megabytes. Larger than any picture a note wants and smaller than
/// anything that would hurt.
const MAX_IMAGE_BYTES: u64 = 10 * 1024 * 1024;

fn fetch_image(url: &str) -> CommandResult<(String, Vec<u8>)> {
    use std::io::Read;

    if !url.starts_with("https://") {
        return Err(CommandError::new("invalid", format!("{url} is not https")));
    }
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_connect(Some(std::time::Duration::from_secs(10)))
        .timeout_global(Some(std::time::Duration::from_secs(30)))
        .build()
        .into();

    let mut response = agent
        .get(url)
        .call()
        .map_err(|e| CommandError::new("io", format!("{url}: {e}")))?;

    let kind = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let Some(extension) = image_extension(&kind) else {
        return Err(CommandError::new(
            "invalid",
            format!("that address answered {kind:?}, which is not a picture"),
        ));
    };

    let mut bytes = Vec::new();
    response
        .body_mut()
        .as_reader()
        .take(MAX_IMAGE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| CommandError::new("io", e.to_string()))?;
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err(CommandError::new("invalid", "that picture is too large"));
    }

    Ok((format!("{}.{extension}", url_stem(url)), bytes))
}

/// The extension a picture of this content type is stored under. `None` for
/// anything the app cannot draw — the same closed list the core keeps, for
/// the same reason: an address the app wrote must be one it can show.
fn image_extension(content_type: &str) -> Option<&'static str> {
    // The two subtypes whose conventional extension is not the subtype
    // itself; everything else is answered by the core's closed list, so a
    // format added there is accepted here without a second list to update.
    let extension = match content_type.strip_prefix("image/")? {
        "jpeg" | "jpg" => "jpg",
        "svg+xml" => "svg",
        other => other,
    };
    jott_core::assets::IMAGE_EXTENSIONS
        .iter()
        .find(|known| **known == extension)
        .copied()
}

/// A name for the file, from the last readable piece of the address.
///
/// The query string is dropped and so is the extension the URL claims: the
/// content type decides that. `image` when there is nothing to go on — the
/// library suffixes a colliding name rather than overwriting it.
fn url_stem(url: &str) -> String {
    let path = url
        .trim_start_matches("https://")
        .split(['?', '#'])
        .next()
        .unwrap_or_default();
    let leaf = path.rsplit('/').find(|piece| !piece.is_empty()).unwrap_or("");
    let stem = leaf.rsplit_once('.').map(|(head, _)| head).unwrap_or(leaf);
    let cleaned: String = stem
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | ' '))
        .collect();
    let cleaned = cleaned.trim().to_string();
    if cleaned.is_empty() {
        "image".to_string()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod url_tests {
    use super::*;

    #[test]
    fn a_name_is_made_from_the_address_and_the_type() {
        // The real one from the user's clipboard, query string and all: the
        // extension comes from the content type, never from the URL.
        assert_eq!(
            url_stem("https://cdnb.artstation.com/p/assets/images/087/large/daoz-51.jpg?1747030361"),
            "daoz-51"
        );
        assert_eq!(url_stem("https://exemplo.com/foto"), "foto");
        assert_eq!(url_stem("https://exemplo.com/"), "exemplo");
        // Nothing usable at the end of the address: the library will suffix
        // a colliding `image.png` rather than overwrite one.
        assert_eq!(url_stem("https://exemplo.com/a/../"), "image");
    }

    #[test]
    fn only_what_the_app_can_draw_comes_back() {
        assert_eq!(image_extension("image/jpeg"), Some("jpg"));
        assert_eq!(image_extension("image/svg+xml"), Some("svg"));
        assert_eq!(image_extension("text/html"), None);
        assert_eq!(image_extension(""), None);
    }

    #[test]
    fn plaintext_is_refused_before_a_socket_is_opened() {
        assert!(fetch_image("http://exemplo.com/a.png").is_err());
        assert!(fetch_image("file:///etc/passwd").is_err());
    }
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

    // Nautilus writes `x-special/gnome-copied-files` as well — `copy\n` and
    // then the addresses — and it is the one some desktops fill when the
    // plain uri-list stays empty.
    let gnome = if uris.is_empty() {
        clipboard
            .wait_for_contents(&gdk::Atom::intern("x-special/gnome-copied-files"))
            .and_then(|data| data.data().to_vec().into())
            .map(|bytes| String::from_utf8_lossy(&bytes).to_string())
            .unwrap_or_default()
    } else {
        String::new()
    };

    if !uris.is_empty() {
        return Some(uris);
    }
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
    state.with_notebook(|nb| Ok(nb.asset_usage()?))
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

/// Renames a folder inside a notes space. Returns the new address.
#[tauri::command]
pub fn rename_note_folder(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    name: String,
) -> CommandResult<String> {
    // Through the notebook, not the folder: a folder's colour and pin live in
    // the space's config, and they have to travel with the rename.
    state.with_notebook(|nb| Ok(nb.rename_note_folder(&folder, &path, &name)?))
}

/// Deletes a folder, moving what was inside up to its parent. Returns how
/// many entries moved — the UI tells the user, the way deleting a list does.
#[tauri::command]
pub fn delete_note_folder(
    state: State<'_, AppState>,
    folder: String,
    path: String,
) -> CommandResult<usize> {
    state.with_notebook(|nb| Ok(nb.delete_note_folder(&folder, &path)?))
}

#[tauri::command]
pub fn create_note_folder(
    state: State<'_, AppState>,
    folder: String,
    path: String,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.create_note_folder(&folder, &path)?))
}

// --------------------------------------------------------- day and week

#[tauri::command]
pub fn pull_into_period(
    state: State<'_, AppState>,
    period: Period,
    list: String,
    id: String,
) -> CommandResult<bool> {
    state.with_notebook(|nb| Ok(nb.pull_into(period, &list, &id)?))
}

#[tauri::command]
pub fn remove_from_period(
    state: State<'_, AppState>,
    period: Period,
    list: String,
    id: String,
) -> CommandResult<bool> {
    state.with_notebook(|nb| Ok(nb.remove_from(period, &list, &id)?))
}

/// Creates a task straight from Today or This Week. It is written to the
/// Inbox — the periods only ever hold references.
#[tauri::command]
pub fn add_task_in_period(
    state: State<'_, AppState>,
    period: Period,
    text: String,
) -> CommandResult<String> {
    state.with_notebook(|nb| Ok(nb.add_task_in_period(period, text)?))
}

/// Records what the user said about a part of the app (`tasks`, `notes`, and
/// the task fields under them). `on: null` forgets the opinion — the interface
/// sends that when a switch returns to its default, so the file only carries
/// what differs from how the app ships. Nothing on disk changes either way:
/// this is about what the interface offers, never about the notebook.
#[tauri::command]
pub fn set_feature(
    state: State<'_, AppState>,
    key: String,
    on: Option<bool>,
) -> CommandResult<()> {
    state.with_notebook_mut(|nb| Ok(nb.set_feature(&key, on)?))
}

/// Binds a command to a chord, or unbinds it with `chord: null`.
///
/// Neither string is judged here or in the core: the registry of commands and
/// the spelling of a chord are the frontend's (`services/commands.js`,
/// `services/keys.js`), and a binding this build cannot honour is simply
/// ignored on the way in rather than destroyed on the way out.
#[tauri::command]
pub fn set_shortcut(
    state: State<'_, AppState>,
    id: String,
    chord: Option<String>,
) -> CommandResult<()> {
    state.with_notebook_mut(|nb| Ok(nb.set_shortcut(&id, chord)?))
}

/// Back to the table the app ships with.
#[tauri::command]
pub fn reset_shortcuts(state: State<'_, AppState>) -> CommandResult<()> {
    state.with_notebook_mut(|nb| Ok(nb.reset_shortcuts()?))
}

/// How the sidebar arranges the user's spaces: `name`, or the empty string
/// for the hand-dragged order.
#[tauri::command]
pub fn spaces_sort(state: State<'_, AppState>) -> CommandResult<String> {
    state.with_notebook(|nb| Ok(nb.spaces_sort().to_string()))
}

/// Sets it.
#[tauri::command]
pub fn set_spaces_sort(state: State<'_, AppState>, sort: String) -> CommandResult<()> {
    state.with_notebook_mut(|nb| Ok(nb.set_spaces_sort(&sort)?))
}

/// How the Day or the Week is arranged (`name` / `created` / `completed`), or
/// null for the order the tasks were pulled in.
#[tauri::command]
pub fn period_sort(state: State<'_, AppState>, period: Period) -> CommandResult<Option<String>> {
    state.with_notebook(|nb| Ok(nb.period_sort(period).map(str::to_string)))
}

/// Sets that arrangement. A period has no `.space.json`, so it lives in the
/// notebook config beside the manual `order`.
#[tauri::command]
pub fn set_period_sort(
    state: State<'_, AppState>,
    period: Period,
    sort: Option<String>,
) -> CommandResult<()> {
    state.with_notebook_mut(|nb| Ok(nb.set_period_sort(period, sort.as_deref())?))
}

/// Rearranges the period to the order the user dragged. The state file is the
/// day's list, so the hand-made order goes straight into it.
#[tauri::command]
pub fn set_period_order(
    state: State<'_, AppState>,
    period: Period,
    refs: Vec<jott_core::state::TaskRef>,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.set_period_order(period, &refs)?))
}

/// The tasks pulled into a period, resolved to the real thing.
#[tauri::command]
pub fn period_tasks(
    state: State<'_, AppState>,
    period: Period,
) -> CommandResult<Vec<ListedTask>> {
    state.with_notebook(|nb| Ok(nb.period_tasks(period)?))
}

/// What to offer pulling into a period, already in display order.
#[tauri::command]
pub fn period_suggestions(
    state: State<'_, AppState>,
    period: Period,
) -> CommandResult<Vec<ListedTask>> {
    state.with_notebook(|nb| Ok(nb.suggestions_for(period)?))
}

/// The current logical day and week, and when each turns next. The UI needs
/// this both to label the screens and to schedule the in-app rollover.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodClock {
    pub today: String,
    pub week_start: String,
    pub next_daily_turn: String,
    pub next_weekly_turn: String,
}

fn clock_of(nb: &Notebook) -> PeriodClock {
    PeriodClock {
        today: nb.today().to_string(),
        week_start: nb.current_week().to_string(),
        next_daily_turn: nb.next_turn_at(Period::Day).to_rfc3339(),
        next_weekly_turn: nb.next_turn_at(Period::Week).to_rfc3339(),
    }
}

#[tauri::command]
pub fn period_clock(state: State<'_, AppState>) -> CommandResult<PeriodClock> {
    state.with_notebook(|nb| Ok(clock_of(nb)))
}

/// Re-reads both period states, applying any rollover that came due while the
/// app was open. The frontend calls this when the scheduled turn arrives.
#[tauri::command]
pub fn refresh_periods(state: State<'_, AppState>) -> CommandResult<Vec<PeriodState>> {
    state.with_notebook(|nb| {
        Ok(vec![
            nb.open_state(Period::Day)?.state,
            nb.open_state(Period::Week)?.state,
        ])
    })
}

/// A space as the navigation shows it.
///
/// `kind` is whatever the config says — an unknown one is delivered, not
/// dropped, so the UI can show its "unsupported" card and the folder stays
/// untouched (spec 3.5).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceInfo {
    /// The folder — the stable identity; renaming the folder renames the
    /// space.
    pub folder_name: String,
    /// The space's root-relative path (`Clients` at the root,
    /// `Design/Clients` inside a group) — what list addresses start with.
    pub path: String,
    /// What the user reads (config `name`, falling back to the folder).
    pub name: String,
    /// The space's single function: `tasks`, `notes`, `home`, or an
    /// unknown type this build keeps but cannot render.
    pub kind: String,
    pub known: bool,
    /// One of the three the app creates and recreates (Home, Tasks, Notes).
    pub fixed: bool,
    pub read_only: bool,
    /// The space's accent colour, if it set one (`.space.json` `color`).
    pub color: Option<String>,
    /// The space's icon name, if it set one (`.space.json` `icon`).
    pub icon: Option<String>,
    /// The ordering the space declares (`name` / `created` / `completed` /
    /// `custom`), and the hand-dragged arrangement `custom` reads.
    pub sort: Option<String>,
    pub order: Vec<String>,
}

/// Sets a space's display name (empty clears it, back to the folder name).
#[tauri::command]
pub fn rename_space(
    state: State<'_, AppState>,
    folder: String,
    name: String,
) -> CommandResult<()> {
    state.with_notebook_mut(|nb| Ok(nb.rename_space(&folder, &name)?))
}

/// Sets a space's accent colour and icon (either empty clears it).
#[tauri::command]
pub fn set_space_appearance(
    state: State<'_, AppState>,
    folder: String,
    color: Option<String>,
    icon: Option<String>,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.set_space_appearance(&folder, color, icon)?))
}

/// Sends a user space to the trash (never a fixed one).
#[tauri::command]
pub fn delete_space(state: State<'_, AppState>, folder: String) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.delete_space(&folder)?))
}

/// Sets how a space orders its items (`name` / `created` / `completed` /
/// `custom`; null = the file order).
#[tauri::command]
pub fn set_space_sort(
    state: State<'_, AppState>,
    space: String,
    sort: Option<String>,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.set_space_sort(&space, sort.as_deref())?))
}

/// Saves the hand-dragged arrangement in the space's `.space.json`
/// and switches it to the custom ordering.
#[tauri::command]
pub fn set_space_order(
    state: State<'_, AppState>,
    space: String,
    order: Vec<String>,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.set_space_order(&space, order)?))
}

// ---- groups (reestruturação 2026-07-30) ----

/// A group of spaces, as the sidebar shows it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupInfo {
    pub folder: String,
    /// The group this one sits in; null at the root (groups nest).
    pub parent: Option<String>,
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    /// The leaf names of the spaces it holds directly, in the notebook's
    /// own order — the order the user dragged.
    pub spaces: Vec<String>,
}

fn groups_of(nb: &Notebook) -> CommandResult<Vec<GroupInfo>> {
    let mut out = Vec::new();
    for g in nb.groups()? {
        out.push(GroupInfo {
            // The FOLDER is the name (2026-08-13), for a group exactly as for
            // a space: no second copy in the marker to drift away from it,
            // and renaming the folder outside the app renames the group here.
            name: g.folder.clone(),
            color: g.config.color.clone(),
            icon: g.config.icon.clone(),
            folder: g.folder,
            parent: g.parent,
            spaces: g.spaces,
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn groups(state: State<'_, AppState>) -> CommandResult<Vec<GroupInfo>> {
    state.with_notebook(groups_of)
}

/// Creates a group at the root, or inside another group when `group` is given.
#[tauri::command]
pub fn create_group(
    state: State<'_, AppState>,
    name: String,
    group: Option<String>,
) -> CommandResult<String> {
    state.with_notebook(|nb| Ok(nb.create_group(&name, group.as_deref())?))
}

/// Moves a group — with everything under it — into another group, or back to
/// the root when `into_group` is null.
#[tauri::command]
pub fn move_group(
    state: State<'_, AppState>,
    name: String,
    into_group: Option<String>,
) -> CommandResult<()> {
    state.with_notebook_mut(|nb| Ok(nb.move_group(&name, into_group.as_deref())?))
}

#[tauri::command]
pub fn rename_group(state: State<'_, AppState>, folder: String, name: String) -> CommandResult<()> {
    state.with_notebook_mut(|nb| Ok(nb.rename_group(&folder, &name)?))
}

#[tauri::command]
pub fn set_group_appearance(
    state: State<'_, AppState>,
    folder: String,
    color: Option<String>,
    icon: Option<String>,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.set_group_appearance(&folder, color, icon)?))
}

#[tauri::command]
pub fn delete_group(state: State<'_, AppState>, folder: String) -> CommandResult<()> {
    state.with_notebook_mut(|nb| Ok(nb.delete_group(&folder)?))
}

#[tauri::command]
pub fn move_space(
    state: State<'_, AppState>,
    name: String,
    into_group: Option<String>,
) -> CommandResult<()> {
    state.with_notebook_mut(|nb| Ok(nb.move_space(&name, into_group.as_deref())?))
}

#[tauri::command]
pub fn create_space_in(
    state: State<'_, AppState>,
    name: String,
    kind: String,
    group: Option<String>,
) -> CommandResult<String> {
    state.with_notebook(|nb| Ok(nb.create_space_in(&name, &kind, group.as_deref())?))
}

// ---- trash ----

/// A trashed item awaiting restore or expiry.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashEntryInfo {
    pub id: String,
    /// `"file"` or `"task"`.
    pub kind: String,
    pub origin: String,
    pub label: String,
    pub deleted: String,
}

#[tauri::command]
pub fn trash_entries(state: State<'_, AppState>) -> CommandResult<Vec<TrashEntryInfo>> {
    state.with_notebook(|nb| {
        Ok(nb
            .trash_entries()
            .into_iter()
            .map(|e| TrashEntryInfo {
                id: e.id,
                kind: match e.kind {
                    jott_core::trash::TrashKind::File => "file".to_string(),
                    jott_core::trash::TrashKind::Task => "task".to_string(),
                },
                origin: e.origin,
                label: e.label,
                deleted: e.deleted,
            })
            .collect())
    })
}

#[tauri::command]
pub fn restore_from_trash(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.restore_from_trash(&id)?))
}

/// Deletes a single task (sends it to the internal trash).
#[tauri::command]
pub fn delete_task(state: State<'_, AppState>, list: String, id: String) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.delete_task(&list, &id)?))
}

// ---- tags ----

/// A user tag with its colour.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagInfo {
    pub name: String,
    pub color: Option<String>,
}

fn tags_of(nb: &Notebook) -> Vec<TagInfo> {
    nb.tags()
        .tags()
        .iter()
        .map(|t| TagInfo {
            name: t.name.clone(),
            color: t.color.clone(),
        })
        .collect()
}

#[tauri::command]
pub fn tags(state: State<'_, AppState>) -> CommandResult<Vec<TagInfo>> {
    state.with_notebook(|nb| Ok(tags_of(nb)))
}

#[tauri::command]
pub fn set_tag(
    state: State<'_, AppState>,
    name: String,
    color: Option<String>,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.set_tag(&name, color)?))
}

#[tauri::command]
pub fn remove_tag(state: State<'_, AppState>, name: String) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.remove_tag(&name)?))
}

// ---- search ----

/// Everything in the notebook matching `query`, as two answers (tasks, notes).
///
/// `limit` is optional: the screen that opens the box does not have an opinion
/// about how many hits fit, and the core's own default is the answer when it
/// says nothing.
///
/// `scope` narrows the question to one space, by its root-relative path — what
/// the ⋮ of a screen asks (2026-08-17). Absent (or empty) is the whole
/// notebook, which is what Ctrl+F asks.
#[tauri::command]
pub fn search(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
    scope: Option<String>,
) -> CommandResult<jott_core::SearchResults> {
    let limit = limit.unwrap_or(jott_core::search::DEFAULT_LIMIT);
    let scope = scope.filter(|s| !s.is_empty());
    state.with_notebook(|nb| Ok(nb.search_in(&query, limit, scope.as_deref())?))
}

// ---- the notebook as folders on disk ----

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
    let target = state.with_notebook(|nb| folder_to_open(nb.root(), path.as_deref()))?;
    open_path(&target)
}

/// Which folder an address resolves to, without touching the desktop — the
/// half of [`open_in_file_manager`] that can be tested.
fn folder_to_open(root: &Path, path: Option<&str>) -> CommandResult<PathBuf> {
    let root = root.to_path_buf();
    let Some(relative) = path.map(str::trim).filter(|p| !p.is_empty()) else {
        return Ok(root);
    };
    // The address comes from the frontend, which got it from a config file:
    // it is checked here exactly like every other address the app takes, so
    // nothing can point outside the notebook.
    let joined = jott_core::relpath::safe_join(&root, relative)
        .ok_or_else(|| CommandError::new("invalidNotePath", format!("bad address: {relative}")))?;
    // A file address opens the folder around it. `is_dir` is a question about
    // disk; an address that names nothing at all still resolves to the folder
    // it would have been in, which is the honest answer for a notebook edited
    // by other tools.
    Ok(if joined.is_dir() {
        joined
    } else {
        joined.parent().map(Path::to_path_buf).unwrap_or(root)
    })
}

/// Hands a folder to the desktop's file manager.
///
/// One process per platform, spawned and left alone — waiting for a file
/// manager to exit would block the command for as long as the window stays
/// open. A failure to even start it is reported: the menu promised something.
/// Hands a path to the desktop. Both doors end here: the file manager on a
/// folder, and the system's own app on an attachment.
fn open_path(target: &Path) -> CommandResult<()> {
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
        std::process::Command::new(program)
            .arg(target)
            .spawn()
            .map(|_| ())
            .map_err(|e| {
                eprintln!("[jott] could not open {}: {e}", target.display());
                CommandError::new("io", format!("could not open it: {e}"))
            })
    }
}

// ---- completed (aggregated across spaces) ----

#[tauri::command]
pub fn completed_tasks(
    state: State<'_, AppState>,
) -> CommandResult<Vec<jott_core::notebook::ListedTask>> {
    state.with_notebook(|nb| Ok(nb.completed_all()?))
}

fn spaces_of(nb: &Notebook) -> CommandResult<Vec<SpaceInfo>> {
    let mut out = Vec::new();
    for space in nb.spaces()? {
        let path = space
            .root()
            .strip_prefix(nb.root())
            .unwrap_or(space.root())
            .to_string_lossy()
            .replace('\\', "/");
        out.push(SpaceInfo {
            folder_name: space.folder_name().to_string(),
            path,
            name: space.display_name().to_string(),
            kind: space.kind().to_string(),
            known: space.config.is_known(),
            // The core's rule, not a second list: it is also what enforces
            // the protection this flag lets the UI draw (greyed-out delete).
            fixed: Notebook::is_fixed_space(space.folder_name()),
            read_only: space.config.is_read_only(),
            color: space.config.color.clone(),
            icon: space.config.icon.clone(),
            sort: space.config.sort.clone(),
            order: space.config.order.clone(),
        });
    }
    Ok(out)
}

/// Everything the shell of the UI needs after any change, in one round trip.
///
/// Every action used to fan out into four `invoke()`s (info, clock, counts,
/// conflicts) — and the auto-save fires that cascade on every pause in
/// typing. One command keeps the cost flat as notebooks grow. This is
/// consolidation of round trips only: nothing is cached, the files stay the
/// source of truth, and each call re-reads them.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookSnapshot {
    pub info: NotebookInfo,
    pub clock: PeriodClock,
    /// Empty when the user turned the counters off.
    pub counts: std::collections::BTreeMap<String, usize>,
    pub conflicts: Vec<Conflict>,
    pub spaces: Vec<SpaceInfo>,
    /// The groups of spaces in the sidebar (reestruturação 2026-07-30).
    pub groups: Vec<GroupInfo>,
    /// The user's tag catalogue (name + colour), for the card pills.
    pub tags: Vec<TagInfo>,
    /// What is pulled into the Day, as references. Every screen that draws a
    /// card marks the ones that are in today (2026-08-06), and asking per
    /// screen is exactly the fan-out this snapshot exists to avoid.
    pub day: Vec<jott_core::state::TaskRef>,
}

#[tauri::command]
pub fn notebook_snapshot(state: State<'_, AppState>) -> CommandResult<NotebookSnapshot> {
    state.with_notebook(|nb| {
        Ok(NotebookSnapshot {
            info: NotebookInfo::of(nb)?,
            clock: clock_of(nb),
            counts: counts_of(nb)?,
            conflicts: nb.conflicts()?,
            spaces: spaces_of(nb)?,
            groups: groups_of(nb)?,
            tags: tags_of(nb),
            day: nb.open_state(Period::Day)?.state.items,
        })
    })
}

/// Suggestions with the reason each one is being offered, so the UI can group
/// them without re-deriving the rule.
#[tauri::command]
pub fn grouped_suggestions(
    state: State<'_, AppState>,
    period: Period,
) -> CommandResult<Vec<jott_core::notebook::Suggestion>> {
    state.with_notebook(|nb| Ok(nb.grouped_suggestions(period)?))
}



// ----------------------------------------------------------------- update

/// The version this binary was built as. Shown in the settings screen, and
/// the "current" side of the update check.
#[tauri::command]
pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Where the published manifest lives. `latest.json` is generated by the
/// release pipeline next to the installers, and `releases/latest` only
/// resolves once a release is PUBLISHED — which is exactly right, a draft is
/// not an update.
const UPDATE_MANIFEST_URL: &str =
    "https://github.com/Gustavo-Tondin/jott-app/releases/latest/download/latest.json";
/// The page the notice's button opens where the app cannot replace itself.
const RELEASE_PAGE_URL: &str = "https://github.com/Gustavo-Tondin/jott-app/releases/latest";
/// Points the check somewhere else — a local server in a test, a manifest of
/// lies while developing the notice. The one door through which the https
/// fence below is not enforced.
const UPDATE_URL_ENV: &str = "JOTT_UPDATE_URL";
/// More than enough for a manifest that names one version and four installers.
const MAX_MANIFEST_BYTES: u64 = 64 * 1024;

/// What the frontend hears back from a check.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    /// The version running right now.
    pub current: String,
    /// The version the manifest names.
    pub latest: String,
    /// Whether `latest` is strictly newer — the only bit the notice needs.
    pub newer: bool,
    /// Whether THIS install can replace itself (the AppImage, the Windows
    /// build). A .deb/.rpm/pacman install belongs to the package manager and
    /// an APK to Android's installer — there the notice offers `url` instead.
    pub can_install: bool,
    /// The release page, for the installs that cannot.
    pub url: String,
}

/// Asks the release feed for the newest published version.
///
/// The second thing this app does that leaves the machine, after
/// `import_asset_from_url`, and fenced the same way: https only, timeouts on
/// both ends, a size ceiling. Consent is handled a level up — the automatic
/// check is a machine preference the settings screen explains and switches
/// off, so this command only runs because that switch (or a click on
/// "check now") said so.
#[tauri::command]
pub async fn check_for_update() -> CommandResult<UpdateCheck> {
    let (url, overridden) = match std::env::var(UPDATE_URL_ENV) {
        Ok(url) if !url.trim().is_empty() => (url, true),
        _ => (UPDATE_MANIFEST_URL.to_string(), false),
    };
    let latest =
        tauri::async_runtime::spawn_blocking(move || fetch_latest_version(&url, overridden))
            .await
            .map_err(|e| CommandError::new("io", e.to_string()))??;

    let current = env!("CARGO_PKG_VERSION");
    Ok(UpdateCheck {
        current: current.to_string(),
        newer: jott_core::version::is_newer(&latest, current),
        latest,
        can_install: cfg!(windows) || std::env::var_os("APPIMAGE").is_some(),
        url: RELEASE_PAGE_URL.to_string(),
    })
}

fn fetch_latest_version(url: &str, overridden: bool) -> CommandResult<String> {
    use std::io::Read;

    if !overridden && !url.starts_with("https://") {
        return Err(CommandError::new("invalid", format!("{url} is not https")));
    }
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_connect(Some(std::time::Duration::from_secs(10)))
        .timeout_global(Some(std::time::Duration::from_secs(30)))
        .build()
        .into();

    let mut response = agent
        .get(url)
        .call()
        .map_err(|e| CommandError::new("io", format!("{url}: {e}")))?;

    let mut text = String::new();
    response
        .body_mut()
        .as_reader()
        .take(MAX_MANIFEST_BYTES)
        .read_to_string(&mut text)
        .map_err(|e| CommandError::new("io", e.to_string()))?;

    let manifest: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| CommandError::new("invalid", format!("that manifest is not JSON: {e}")))?;
    manifest
        .get("version")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| CommandError::new("invalid", "that manifest names no version"))
}


#[cfg(test)]
mod tests {
    use super::*;

    /// The folder browser Android needs (2026-08-19). Its rules are the ones a
    /// path from the UI makes necessary: it may not walk out of the root, and
    /// a typed name may not be a path.
    mod folder_browser {
        use super::*;

        fn tree() -> tempfile::TempDir {
            let dir = tempfile::tempdir().unwrap();
            std::fs::create_dir_all(dir.path().join("Documents/Jott/.jott")).unwrap();
            std::fs::create_dir(dir.path().join("Documents/Photos")).unwrap();
            std::fs::create_dir(dir.path().join("Documents/.thumbnails")).unwrap();
            std::fs::write(dir.path().join("Documents/note.md"), "x").unwrap();
            dir
        }

        #[test]
        fn lists_folders_only_and_marks_the_ones_holding_a_notebook() {
            let dir = tree();
            let at = dir.path().join("Documents");
            let listing = listing_in(dir.path(), Some(at.to_string_lossy().into_owned())).unwrap();

            let names: Vec<&str> = listing.folders.iter().map(|f| f.name.as_str()).collect();
            // Sorted, no files, and no dot-folders — `.thumbnails` is another
            // tool's business and `note.md` is not an answer to "which folder?".
            assert_eq!(names, ["Jott", "Photos"]);
            assert!(listing.folders[0].notebook, "Jott/ holds a .jott");
            assert!(!listing.folders[1].notebook);
            assert_eq!(listing.name, "Documents");
        }

        #[test]
        fn the_root_has_no_way_up_and_everything_below_it_does() {
            let dir = tree();
            assert_eq!(listing_in(dir.path(), None).unwrap().parent, None);

            let at = dir.path().join("Documents");
            let listing = listing_in(dir.path(), Some(at.to_string_lossy().into_owned())).unwrap();
            assert_eq!(listing.parent.as_deref(), dir.path().to_str());
        }

        #[test]
        fn a_path_outside_the_root_lands_on_the_root_instead_of_erroring() {
            let dir = tree();
            let outside = dir.path().join("Documents/../../..");

            // Not an error: the browser has to land somewhere the user can act
            // on, and "that path is not allowed" is not a folder.
            let listing =
                listing_in(dir.path(), Some(outside.to_string_lossy().into_owned())).unwrap();
            assert_eq!(listing.path, dir.path().to_string_lossy());
        }

        #[test]
        fn a_missing_folder_is_an_empty_one() {
            // `fsio::dir_paths`' rule, which matters here because a folder can
            // be deleted by another app between the listing and the tap.
            let dir = tree();
            let gone = dir.path().join("Documents/gone");
            let listing = listing_in(dir.path(), Some(gone.to_string_lossy().into_owned())).unwrap();
            assert!(listing.folders.is_empty());
        }

        #[test]
        fn creates_a_folder_and_refuses_a_name_that_is_a_path() {
            let dir = tree();
            let at = dir.path().join("Documents").to_string_lossy().into_owned();

            let made = create_folder_in(dir.path(), at.clone(), " Notebook ").unwrap();
            assert!(dir.path().join("Documents/Notebook").is_dir());
            assert_eq!(made, dir.path().join("Documents/Notebook").to_string_lossy());

            for bad in ["../escaped", "a/b", "..", ""] {
                let error = create_folder_in(dir.path(), at.clone(), bad).unwrap_err();
                assert_eq!(error.kind, "invalidName", "{bad} should be refused");
            }
            assert!(!dir.path().join("escaped").exists());
        }
    }

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

    #[test]
    fn the_file_manager_is_only_ever_pointed_inside_the_notebook() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("Design/Clients")).unwrap();
        std::fs::write(root.join("Design/Clients/task-list.md"), "").unwrap();

        // No address: the notebook itself.
        assert_eq!(folder_to_open(root, None).unwrap(), root);
        assert_eq!(folder_to_open(root, Some("  ")).unwrap(), root);

        // A space: its folder.
        assert_eq!(
            folder_to_open(root, Some("Design/Clients")).unwrap(),
            root.join("Design/Clients")
        );

        // A file: the folder around it — the menu opens folders, never
        // documents.
        assert_eq!(
            folder_to_open(root, Some("Design/Clients/task-list.md")).unwrap(),
            root.join("Design/Clients")
        );

        // Anything that climbs out is refused, the same as every other address
        // the app takes.
        for hostile in ["../..", "/etc", "Design/../../etc", "a\0b"] {
            assert!(
                folder_to_open(root, Some(hostile)).is_err(),
                "{hostile:?} devia ser recusado"
            );
        }
    }

    /// The update check against a real HTTP exchange — a local server, so the
    /// parsing, the ceiling and the error paths are measured on actual bytes
    /// and not on a hand-built context.
    #[test]
    fn update_manifest_is_read_and_judged() {
        use std::io::{Read, Write};

        // One tiny HTTP/1.1 server per body, answering exactly one request.
        fn serve(body: &'static str) -> String {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let port = listener.local_addr().unwrap().port();
            std::thread::spawn(move || {
                if let Ok((mut stream, _)) = listener.accept() {
                    let mut buf = [0u8; 2048];
                    let _ = stream.read(&mut buf);
                    let _ = stream.write_all(
                        format!(
                            "HTTP/1.1 200 OK\r\ncontent-length: {}\r\n\r\n{}",
                            body.len(),
                            body
                        )
                        .as_bytes(),
                    );
                }
            });
            format!("http://127.0.0.1:{port}/latest.json")
        }

        // A good manifest: the version comes out.
        let url = serve(r#"{"version": "9.9.9", "platforms": {}}"#);
        assert_eq!(fetch_latest_version(&url, true).unwrap(), "9.9.9");

        // A manifest that is not JSON, and one that names no version: both
        // are "invalid", neither is a phantom update.
        let url = serve("<html>rate limited</html>");
        assert_eq!(fetch_latest_version(&url, true).unwrap_err().kind, "invalid");
        let url = serve(r#"{"notes": "no version here"}"#);
        assert_eq!(fetch_latest_version(&url, true).unwrap_err().kind, "invalid");

        // Off the override door, plain http is refused before any request.
        assert_eq!(
            fetch_latest_version("http://example.com/latest.json", false)
                .unwrap_err()
                .kind,
            "invalid"
        );
    }
}
