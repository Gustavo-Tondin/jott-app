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
    /// widget has one, and the UI must not hard-code it (the names.js lesson).
    pub completed_name: String,
    /// The fixed Notes widget's folder, and the folder loose notes land in.
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
                notes_inbox: String::new(),
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

#[tauri::command]
pub fn core_version() -> String {
    jott_core::version().to_string()
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

/// The folder to use when the user has no folder to choose — `None` when
/// choosing is the right thing to ask for.
///
/// On desktop this is always `None`: the notebook is the user's, it lives
/// wherever they keep their files, and picking it is the first thing the app
/// asks. On Android there is nothing to ask. Scoped storage means an app
/// cannot open an arbitrary folder: the picker there returns a `content://`
/// URI from the Storage Access Framework, and `std::fs` — which is all the
/// core speaks — cannot open one. So the app writes inside its own external
/// container, which needs no permission and is still a real directory of real
/// `.md` files: reachable over USB, and reachable by a sync client such as
/// Syncthing pointed at it.
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

/// Opens a notebook, creating one in that folder if it is not one yet.
#[tauri::command]
pub fn open_notebook<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    path: PathBuf,
) -> CommandResult<NotebookInfo> {
    let notebook = Notebook::open_or_init(&path)?;
    let info = NotebookInfo::of(&notebook)?;
    state.open(&app, notebook)?;
    crate::prefs::remember_notebook(&app, &path);
    Ok(info)
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
    state.with_notebook(|nb| NotebookInfo::of(nb)).ok()
}

/// Open task count per list, for the navigation. Empty when the user turned
/// the counters off — the frontend does not need to know the rule.
#[tauri::command]
pub fn list_counts(
    state: State<'_, AppState>,
) -> CommandResult<std::collections::BTreeMap<String, usize>> {
    state.with_notebook(|nb| {
        if !nb.config().show_list_counts {
            return Ok(Default::default());
        }
        Ok(nb.open_task_counts()?)
    })
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
    state.with_notebook(|nb| {
        let mut tasks = nb.open_list(&list)?;
        tasks.edit_text(&id, text)?;
        tasks.save()?;
        Ok(())
    })
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

/// The editable fields of a task, all optional.
///
/// Absent means "leave alone"; present-but-null means "clear". Without that
/// distinction there would be no way to remove a due date.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TaskFields {
    pub text: Option<String>,
    #[serde(deserialize_with = "present_or_absent")]
    pub due: Option<Option<String>>,
    #[serde(deserialize_with = "present_or_absent")]
    pub priority: Option<Option<u8>>,
    pub tags: Option<Vec<String>>,
    pub description: Option<Vec<String>>,
    #[serde(deserialize_with = "present_or_absent")]
    pub repeat: Option<Option<String>>,
    pub subtasks: Option<Vec<SubtaskInput>>,
}

/// Tells "field absent" apart from "field sent as null".
///
/// By default serde collapses both into `None`, which would make clearing a
/// due date impossible: the UI has no other way to say "remove this".
fn present_or_absent<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::deserialize(deserializer).map(Some)
}

#[derive(Debug, Deserialize)]
pub struct SubtaskInput {
    pub text: String,
    pub done: bool,
}

/// Edits any field of a task in one call.
///
/// One command instead of one per field: the UI edits a task in a panel and
/// saves it as a whole, and a half-applied edit would be worse than none.
#[tauri::command]
pub fn set_task_fields(
    state: State<'_, AppState>,
    list: String,
    id: String,
    fields: TaskFields,
) -> CommandResult<()> {
    state.with_notebook(|nb| {
        let mut tasks = nb.open_list(&list)?;
        let task = tasks.task_mut(&id)?;

        if let Some(text) = fields.text {
            task.text = jott_core::task::single_line(&text);
        }
        if let Some(due) = fields.due {
            // An unparseable date clears it rather than being stored wrong.
            task.due = due.as_deref().and_then(jott_core::task::parse_date);
        }
        if let Some(priority) = fields.priority {
            task.priority = priority.filter(|p| (1..=3).contains(p));
        }
        if let Some(tags) = fields.tags {
            // Normalised by the core: a spaced tag would silently turn the
            // whole metadata line into description on the next read.
            let mut cleaned: Vec<String> = Vec::new();
            for tag in &tags {
                if let Some(tag) = jott_core::task::normalize_tag(tag) {
                    if !cleaned.contains(&tag) {
                        cleaned.push(tag);
                    }
                }
            }
            task.tags = cleaned;
        }
        if let Some(description) = fields.description {
            // An embedded newline becomes a further line; a blank line would
            // end the task's block in the file and cut the description short.
            task.description = description
                .iter()
                .flat_map(|entry| entry.lines())
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(str::to_string)
                .collect();
        }
        if let Some(repeat) = fields.repeat {
            task.repeat = repeat.as_deref().and_then(jott_core::task::Repeat::parse);
        }
        if let Some(subtasks) = fields.subtasks {
            task.subtasks = subtasks
                .into_iter()
                .map(|s| jott_core::task::Subtask {
                    text: jott_core::task::single_line(&s.text),
                    done: s.done,
                })
                .collect();
        }

        tasks.save()?;
        Ok(())
    })
}

/// Reorders a task inside its list. Positions count tasks, not lines.
#[tauri::command]
pub fn move_task_to(
    state: State<'_, AppState>,
    list: String,
    from: usize,
    to: usize,
) -> CommandResult<()> {
    state.with_notebook(|nb| {
        let mut tasks = nb.open_list(&list)?;
        tasks.move_task_to(from, to)?;
        tasks.save()?;
        Ok(())
    })
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
/// in — with one Completed per widget, the id alone cannot say which folder
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
// `folder` is always the root-relative address of a notes widget (`Notes`);
// `path` is always relative to that widget (`Inbox/ideia.md`). Two levels,
// because the widget owns its subtree and the user organises freely inside
// it.

/// A note's content, for the editor.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteContent {
    pub path: String,
    pub title: String,
    pub body: String,
    pub pinned: bool,
    pub created: Option<String>,
}

/// Every note in a notes widget, sorted for the board: pinned first, then
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
    state.with_notebook(|nb| {
        let today = nb.today();
        Ok(nb.note_folder(&folder)?.quick_capture(&in_folder, &text, today)?)
    })
}

/// The folders inside a notes widget, for the tree view.
#[tauri::command]
pub fn note_folders(state: State<'_, AppState>, folder: String) -> CommandResult<Vec<String>> {
    state.with_notebook(|nb| Ok(nb.note_folder(&folder)?.folders()?))
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
            title: path
                .rsplit('/')
                .next()
                .unwrap_or(&path)
                .trim_end_matches(".md")
                .to_string(),
            path,
            body: note.body,
            pinned: note.pinned,
            created: note.created.map(|d| d.to_string()),
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
    state.with_notebook(|nb| {
        let today = nb.today();
        Ok(nb.note_folder(&folder)?.write(&path, &body, today)?)
    })
}

/// Creates a note and returns its address.
#[tauri::command]
pub fn create_note(
    state: State<'_, AppState>,
    folder: String,
    in_folder: String,
    title: String,
) -> CommandResult<String> {
    state.with_notebook(|nb| {
        let today = nb.today();
        Ok(nb.note_folder(&folder)?.create(&in_folder, &title, today)?)
    })
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
    state.with_notebook(|nb| Ok(nb.note_folder(&folder)?.rename(&path, &title)?))
}

/// Moves a note to another folder inside the widget. Returns the new address.
#[tauri::command]
pub fn move_note(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    to_folder: String,
) -> CommandResult<String> {
    state.with_notebook(|nb| Ok(nb.note_folder(&folder)?.move_to(&path, &to_folder)?))
}

#[tauri::command]
pub fn set_note_pinned(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    pinned: bool,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.note_folder(&folder)?.set_pinned(&path, pinned)?))
}

/// Renames a folder inside a notes widget. Returns the new address.
#[tauri::command]
pub fn rename_note_folder(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    name: String,
) -> CommandResult<String> {
    state.with_notebook(|nb| Ok(nb.note_folder(&folder)?.rename_folder(&path, &name)?))
}

/// Deletes a folder, moving what was inside up to its parent. Returns how
/// many entries moved — the UI tells the user, the way deleting a list does.
#[tauri::command]
pub fn delete_note_folder(
    state: State<'_, AppState>,
    folder: String,
    path: String,
) -> CommandResult<usize> {
    state.with_notebook(|nb| Ok(nb.note_folder(&folder)?.delete_folder(&path)?))
}

#[tauri::command]
pub fn create_note_folder(
    state: State<'_, AppState>,
    folder: String,
    path: String,
) -> CommandResult<()> {
    state.with_notebook(|nb| Ok(nb.note_folder(&folder)?.create_folder(&path)?))
}

// --------------------------------------------------------- day and week

/// The state of Today or This Week, with any pending rollover applied.
#[tauri::command]
pub fn period_state(
    state: State<'_, AppState>,
    period: Period,
) -> CommandResult<PeriodState> {
    state.with_notebook(|nb| Ok(nb.open_state(period)?.state))
}

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

/// Kept from phase 0 so the frontend can prove the bridge is alive.
#[tauri::command]
pub fn is_notebook_open(state: State<'_, AppState>) -> bool {
    state.is_open()
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

/// The spaces of the notebook, ready to render.
#[tauri::command]
pub fn spaces(state: State<'_, AppState>) -> CommandResult<Vec<SpaceInfo>> {
    state.with_notebook(|nb| Ok(spaces_of(nb)?))
}

/// Creates a user space of the given type (`tasks` / `notes`). Returns
/// the folder name.
#[tauri::command]
pub fn create_space(
    state: State<'_, AppState>,
    name: String,
    kind: String,
) -> CommandResult<String> {
    state.with_notebook(|nb| Ok(nb.create_space(&name, &kind)?))
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
    state.with_notebook(|nb| Ok(groups_of(nb)?))
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
    open_folder(&target)
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
fn open_folder(folder: &Path) -> CommandResult<()> {
    #[cfg(target_os = "linux")]
    let program = "xdg-open";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = folder;
        return Err(CommandError::new(
            "io",
            "this platform has no file manager to open",
        ));
    }

    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    {
        std::process::Command::new(program)
            .arg(folder)
            .spawn()
            .map(|_| ())
            .map_err(|e| {
                eprintln!("[jott] could not open {}: {e}", folder.display());
                CommandError::new("io", format!("could not open the file manager: {e}"))
            })
    }
}

// ---- completed (aggregated across widgets) ----

#[tauri::command]
pub fn completed_tasks(
    state: State<'_, AppState>,
) -> CommandResult<Vec<jott_core::notebook::ListedTask>> {
    state.with_notebook(|nb| Ok(nb.completed_all()?))
}

fn spaces_of(nb: &Notebook) -> CommandResult<Vec<SpaceInfo>> {
    const FIXED: [&str; 3] = [jott_core::HOME_DIR, jott_core::TASKS_DIR, jott_core::NOTES_DIR];

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
            fixed: FIXED.contains(&space.folder_name()),
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
            counts: if nb.config().show_list_counts {
                nb.open_task_counts()?
            } else {
                Default::default()
            },
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
}
