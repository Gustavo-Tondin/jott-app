//! The open notebook, as a whole.
//!
//! What it is (`NotebookInfo`), everything the shell needs about it in one
//! round trip (`NotebookSnapshot`), and the three catalogues that are the
//! notebook's rather than any one space's: its search, its trash and its tags.

use std::path::PathBuf;

use jott_core::settings::Display;
use jott_core::{Conflict, Notebook};
use serde::Serialize;
use tauri::{AppHandle, Runtime, State};

use crate::error::CommandResult;
use crate::state::AppState;

use super::day::{clock_of, DayClock};
use super::settings::display_of;
use super::spaces::{groups_of, spaces_of, GroupInfo, SpaceInfo};

/// The theme the app ships with — `styles/themes/jott.css` in the front-end,
/// which is the file that has to end up in `.jott/themes/jott.css`
/// byte for byte (`jott_core::themes::ensure_default`).
const FACTORY_THEME_CSS: &str = include_str!("../../../src/styles/themes/jott.css");

/// The addresses the core creates, so the frontend never hard-codes them —
/// coming over the bridge, a rename reaches every screen at once. These are
/// **paths**, not names: `Tasks/Inbox.md`.
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
    /// space has one, and the UI must not hard-code it.
    pub completed_name: String,
    /// The fixed Notes space's folder, and the folder loose notes land in.
    pub notes_folder: String,
    pub notes_inbox: String,
    /// Preferences the screens need on every render, so they do not each ask
    /// for the settings separately: how to draw a date, whether clicking away
    /// closes the task panel, and where the quick capture writes.
    pub date_display_format: String,
    /// `HH:MM` — the hour the inspector's reminder presets land on (the
    /// notebook's `reminderTime`).
    pub reminder_time: String,
    pub close_inspector_on_click_away: bool,
    pub quick_note_folder: String,
    /// The capture target — a path-like string the front resolves
    /// (services/noteTargets.js and its tasks mirror); empty is the default.
    pub quick_task_list: String,
    /// Whether the fixed Tasks screen shows every list, arranged by space,
    /// instead of the Inbox alone.
    pub tasks_show_all: bool,
    /// Whether the task panel offers the task fields that are off
    /// (`Config::offer_task_fields`).
    pub offer_task_fields: bool,
    /// The board layout of a notes space that never chose one (`grid` /
    /// `tree`); empty means the app's own.
    pub note_layout: String,
    /// How a table sits in a note (`""` squeezed to fit / `scroll`).
    pub table_layout: String,
    /// Whether the Timeline names deleted tasks, and deleted notes.
    pub timeline_ghost_tasks: bool,
    pub timeline_ghost_notes: bool,
    /// The two questions a dialog can be told to stop asking — deleting, and
    /// fetching a picture off the web. They ride here because the shell installs
    /// the confirm POLICY from the layout on every render (`setConfirmPolicy`,
    /// services/dialog.js); left out, "don't ask again" is never read back.
    pub confirm_deletes: bool,
    pub confirm_image_downloads: bool,
    /// Whether the sidebar wears the rainbow — each entry the next of the
    /// seven from the accent on (services/spaceColors.js does the dealing).
    /// Resolved like the accent: this machine's answer over the notebook's.
    pub auto_space_colors: bool,
    /// Which of the seven the app is accented with, by name. Rides in the
    /// layout because the shell needs it on the FIRST paint (an attribute on
    /// the document root); a second round trip would flash the wrong colours.
    /// Empty means what the app ships as.
    pub accent_color: String,
    /// The mode (`jott`/`light`/`dark`) and the theme (the palette's name).
    pub mode: String,
    pub theme: String,
    /// Whether headings take the accent or plain ink. Rides here for the same
    /// reason: an attribute on the document root, wanted on the first paint.
    pub heading_color: String,
    pub note_font_size: String,
    /// How tall a note card on the board may grow (`short` / `medium` /
    /// `tall`); empty is the app's own. An attribute on the document root,
    /// so it rides here for the reason the accent does.
    pub card_height: String,
    /// The three faces the app is read in, by family name; empty is the one
    /// the app carries. Custom properties on the document root, so they ride
    /// here for the reason the accent does.
    pub interface_font: String,
    pub note_font: String,
    pub mono_font: String,
    /// When the note's floating formatting bar shows, and which side it hugs.
    /// Rides here for the reason the accent does: the bar is drawn as soon as
    /// a note opens.
    pub format_bar: String,
    pub format_bar_side: String,
    pub shortcuts: serde_json::Map<String, serde_json::Value>,
    /// Which parts of the app are switched on. Only what was switched OFF is
    /// listed; the frontend's `services/features.js` reads a missing key as
    /// on, and applies a child's parent for it.
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
    /// `display` is resolved by the caller, because the snapshot needs the
    /// same answer for its counters and must not read `machine-prefs.json`
    /// twice for it.
    fn of(notebook: &Notebook, display: Display) -> CommandResult<Self> {
        Ok(Self {
            path: notebook.root().to_path_buf(),
            name: jott_core::fsio::file_name_of(notebook.root()),
            read_only: notebook.is_read_only(),
            lists: notebook.lists()?,
            layout: NotebookLayout {
                inbox: Notebook::inbox_path(),
                completed: Notebook::completed_path_of(&Notebook::inbox_path())?,
                // A space owns its files directly: tasks land in the fixed
                // `Tasks/` space, loose notes in `Notes/`.
                tasks_folder: jott_core::TASKS_DIR.to_string(),
                completed_name: jott_core::COMPLETED_LIST.to_string(),
                notes_folder: jott_core::NOTES_DIR.to_string(),
                // The core's name, never a mirror of it: a "" here sends every
                // note the Home creates into the space's ROOT, not the Inbox.
                notes_inbox: jott_core::notefolder::NOTES_INBOX.to_string(),
                date_display_format: display.date_display_format,
                reminder_time: notebook.config().reminder_time.render(),
                close_inspector_on_click_away: display.close_inspector_on_click_away,
                quick_note_folder: notebook.config().quick_note_folder.clone(),
                quick_task_list: notebook.config().quick_task_list.clone(),
                tasks_show_all: notebook.config().tasks_show_all,
                offer_task_fields: notebook.config().offer_task_fields,
                note_layout: notebook.config().note_layout.clone(),
                table_layout: notebook.config().table_layout.clone(),
                timeline_ghost_tasks: notebook.config().timeline_ghost_tasks,
                timeline_ghost_notes: notebook.config().timeline_ghost_notes,
                confirm_deletes: notebook.config().confirm_deletes,
                confirm_image_downloads: notebook.config().confirm_image_downloads,
                auto_space_colors: display.auto_space_colors,
                accent_color: display.accent_color,
                mode: display.mode,
                theme: display.theme,
                heading_color: display.heading_color,
                note_font_size: display.note_font_size,
                card_height: display.card_height,
                interface_font: display.interface_font,
                note_font: display.note_font,
                mono_font: display.mono_font,
                format_bar: display.format_bar,
                format_bar_side: display.format_bar_side,
                shortcuts: notebook.config().shortcuts.clone(),
                features: notebook.config().features.clone(),
            },
        })
    }
}

/// Opens a notebook. `create` says which door the user came through: false is
/// "Open" and the folder must already be a notebook (refused with the core's
/// words otherwise); true is "Create", still `open_or_init`, since a folder
/// that already holds a notebook is the same intention by the other road.
#[tauri::command]
pub fn open_notebook<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    path: PathBuf,
    create: Option<bool>,
) -> CommandResult<NotebookInfo> {
    let notebook = if create.unwrap_or(false) {
        Notebook::open_or_init(&path)?
    } else {
        Notebook::open(&path)?
    };
    // The factory palette, written once into every notebook opened here:
    // derived, so failing to write it is not a failure to open.
    let _ = notebook.ensure_default_theme(FACTORY_THEME_CSS);
    let info = NotebookInfo::of(&notebook, display_of(&app, &notebook))?;
    allow_assets(&app, &path);
    state.open(&app, window.label(), notebook)?;
    crate::prefs::remember_notebook(&app, &path);
    Ok(info)
}

/// Lets the webview LOAD the images of this notebook, and only those: Tauri's
/// asset protocol (`convertFileSrc`) answers only inside its scope, empty in
/// `tauri.conf.json` and filled HERE with `<notebook>/assets` (flat). A failure
/// only stops images drawing. See docs/platform-gotchas.md#ponte-e-empacotamento
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

// ---- the picker ----

/// One card on the notebooks screen: the notebook, plus when this machine
/// last opened it. Flattened, because a card is one thing.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentNotebook {
    #[serde(flatten)]
    pub notebook: jott_core::NotebookSummary,
    /// RFC 3339, local. The desktop draws it as "42 min ago"; the phone does
    /// not draw it at all.
    pub opened: String,
}

/// Every notebook this machine has opened, newest first. One that cannot be
/// summarized is LEFT OUT, not reported: an unplugged drive must not cost the
/// whole screen, and it stays in prefs so the card returns with the drive.
/// Reading only — `Notebook::open` would recreate spaces and reap trash.
#[tauri::command]
pub fn recent_notebooks<R: Runtime>(app: AppHandle<R>) -> Vec<RecentNotebook> {
    crate::prefs::recent_notebooks(&app)
        .into_iter()
        .filter_map(|entry| {
            let mut notebook = Notebook::summarize(&entry.path).ok()?;
            // The colour the card wears is the one this machine DRESSES the
            // notebook in (Display is per machine and per notebook), not only
            // the one written inside it. `summarize` answers what is IN the
            // notebook; the override is this side's, as in `display_of`.
            if let Some(chosen) = crate::prefs::display(&app, &entry.path).accent_color {
                notebook.accent_color = chosen;
            }
            Some(RecentNotebook {
                notebook,
                opened: entry.opened,
            })
        })
        .collect()
}

/// Takes a notebook off the picker's list. Nothing on disk is touched.
#[tauri::command]
pub fn forget_notebook<R: Runtime>(app: AppHandle<R>, path: PathBuf) {
    crate::prefs::forget_notebook(&app, &path);
}

/// Renames a notebook from the picker, by renaming its folder. The rule and
/// the refusals are the core's (`Notebook::rename_at`); this side guards and
/// does the bookkeeping. Answers the new path, which the screen reloads around.
#[tauri::command]
pub fn rename_notebook<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    path: PathBuf,
    name: String,
) -> CommandResult<PathBuf> {
    ensure_closed(&state, &path)?;
    let moved = Notebook::rename_at(&path, &name)?;
    crate::prefs::notebook_moved(&app, &path, &moved);
    Ok(moved)
}

/// Moves a notebook from the picker into another folder of the machine. Same
/// shape as the rename above, and the same guard.
#[tauri::command]
pub fn move_notebook<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    path: PathBuf,
    into: PathBuf,
) -> CommandResult<PathBuf> {
    ensure_closed(&state, &path)?;
    let moved = Notebook::move_at(&path, &into)?;
    crate::prefs::notebook_moved(&app, &path, &moved);
    Ok(moved)
}

/// Refuses to move the folder out from under a notebook the app is working
/// in. The picker only shows with nothing open, so this should never fire —
/// which is why it is checked rather than trusted: the path comes from the
/// frontend, and being wrong leaves every open handle at a dead address.
fn ensure_closed(state: &State<'_, AppState>, path: &std::path::Path) -> CommandResult<()> {
    if state.holds(path) {
        return Err(crate::error::CommandError::new(
            "notebook",
            "close this notebook before renaming or moving it",
        ));
    }
    Ok(())
}

/// The notebook THIS window has open, if any.
#[tauri::command]
pub fn current_notebook<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> Option<NotebookInfo> {
    state
        .with_notebook(window.label(), |nb| {
            NotebookInfo::of(nb, display_of(&app, nb))
        })
        .ok()
}

/// What the open notebook holds — notes, open tasks, files, bytes — for the
/// line under Notebook → Keeping. Counted on demand: the screen asks when
/// the section opens, not on every render.
#[tauri::command]
pub fn notebook_contents<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<jott_core::NotebookContents> {
    state.read(window.label(), |nb| nb.contents())
}

/// Open task count per list, for the navigation. Empty when the user turned
/// the counters off — the frontend does not need to know the rule.
#[tauri::command]
pub fn list_counts<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<std::collections::BTreeMap<String, usize>> {
    state.with_notebook(window.label(), |nb| counts_of(nb, &display_of(&app, nb)))
}

/// The rule behind the counters, written once: off means empty, not absent —
/// the shape stays the same either way. Shared by `list_counts` and the
/// snapshot, so the two doors cannot drift.
pub(crate) fn counts_of(
    nb: &Notebook,
    display: &Display,
) -> CommandResult<std::collections::BTreeMap<String, usize>> {
    if !display.show_list_counts {
        return Ok(Default::default());
    }
    Ok(nb.open_task_counts()?)
}

/// Everything in the notebook matching `query`, as two answers (tasks, notes).
/// `limit` absent takes the core's default. `scope` narrows the question to
/// one space by its root-relative path (a screen's ⋮); absent or empty is the
/// whole notebook (Ctrl+F).
#[tauri::command]
pub fn search<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    query: String,
    limit: Option<usize>,
    scope: Option<String>,
) -> CommandResult<jott_core::SearchResults> {
    let limit = limit.unwrap_or(jott_core::search::DEFAULT_LIMIT);
    let scope = scope.filter(|s| !s.is_empty());
    state.read(window.label(), |nb| nb.search_in(&query, limit, scope.as_deref()))
}

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
    /// Days until the reaper clears it; `None` = kept forever.
    pub days_left: Option<i64>,
}

#[tauri::command]
pub fn trash_entries<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>,) -> CommandResult<Vec<TrashEntryInfo>> {
    state.with_notebook(window.label(), |nb| {
        Ok(nb
            .trash_entries()
            .into_iter()
            .map(|e| TrashEntryInfo {
                days_left: nb.trash_days_left(&e),
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

/// `Ctrl+Z` — takes back the last action this window recorded (see
/// `AppState::record`). Answers the command's name, or `null` when there was
/// nothing to undo. A `stale` error means the files moved on since (a sync,
/// the other window) and the entry was dropped rather than written over them.
#[tauri::command]
pub fn undo<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<Option<String>> {
    state.undo(window.label())
}

/// `Ctrl+Shift+Z` — does the last undone action again. Same answers as `undo`.
#[tauri::command]
pub fn redo<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<Option<String>> {
    state.redo(window.label())
}

/// The name of the action `undo` would take back, or `null`. The floating
/// undo offer asks this before it acts: an action recorded since the offer
/// is not the one the user was shown.
#[tauri::command]
pub fn undoable<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<Option<String>> {
    state.undoable(window.label())
}

#[tauri::command]
pub fn restore_from_trash<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, id: String) -> CommandResult<()> {
    state.record(window.label(), "restore_from_trash", |nb| nb.restore_from_trash(&id))
}

#[tauri::command]
pub fn purge_from_trash<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, id: String) -> CommandResult<()> {
    state.record(window.label(), "purge_from_trash", |nb| nb.purge_from_trash(&id))
}

#[tauri::command]
pub fn empty_trash<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>,) -> CommandResult<usize> {
    state.record(window.label(), "empty_trash", |nb| nb.empty_trash())
}

// ---- tags ----

/// A user tag with its colour.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagInfo {
    pub name: String,
    pub color: Option<String>,
}

pub(crate) fn tags_of(nb: &Notebook) -> Vec<TagInfo> {
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
pub fn tags<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>,) -> CommandResult<Vec<TagInfo>> {
    state.with_notebook(window.label(), |nb| Ok(tags_of(nb)))
}

/// Every tag in use in the tasks, with its count — catalogued or not. Asked
/// when the Tags screen opens (it walks every list), never on a render.
#[tauri::command]
pub fn tag_usage<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>,) -> CommandResult<Vec<jott_core::tags::TagUsage>> {
    state.read(window.label(), |nb| nb.tag_usage())
}

#[tauri::command]
pub fn set_tag<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    name: String,
    color: Option<String>,
) -> CommandResult<()> {
    state.record(window.label(), "set_tag", |nb| nb.set_tag(&name, color))
}

#[tauri::command]
pub fn remove_tag<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, name: String) -> CommandResult<()> {
    state.record(window.label(), "remove_tag", |nb| nb.remove_tag(&name))
}

/// Everything the shell of the UI needs after any change, in one round trip
/// (the auto-save fires it on every pause in typing). Consolidation of round
/// trips only: nothing is cached, each call re-reads the files.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookSnapshot {
    pub info: NotebookInfo,
    pub clock: DayClock,
    /// Empty when the user turned the counters off.
    pub counts: std::collections::BTreeMap<String, usize>,
    pub conflicts: Vec<Conflict>,
    pub spaces: Vec<SpaceInfo>,
    /// The groups of spaces in the sidebar.
    pub groups: Vec<GroupInfo>,
    /// The user's tag catalogue (name + colour), for the card pills.
    pub tags: Vec<TagInfo>,
    /// What is pulled into the Day, as references. Every screen that draws a
    /// card marks the ones in today, and asking per screen is the fan-out
    /// this snapshot exists to avoid.
    pub day: Vec<jott_core::state::TaskRef>,
}

#[tauri::command]
pub fn notebook_snapshot<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<NotebookSnapshot> {
    state.with_notebook(window.label(), |nb| {
        // Once: the info and the counters read the same display choices, and
        // resolving them means reading `machine-prefs.json`.
        let display = display_of(&app, nb);
        Ok(NotebookSnapshot {
            counts: counts_of(nb, &display)?,
            info: NotebookInfo::of(nb, display)?,
            clock: clock_of(nb),
            conflicts: nb.conflicts()?,
            spaces: spaces_of(nb)?,
            groups: groups_of(nb)?,
            tags: tags_of(nb),
            day: nb.open_state()?.state.items,
        })
    })
}
