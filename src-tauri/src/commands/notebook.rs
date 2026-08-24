//! The open notebook, as a whole.
//!
//! What it is (`NotebookInfo`), everything the shell needs about it in one
//! round trip (`NotebookSnapshot`), and the three catalogues that are the
//! notebook's rather than any one space's: its search, its trash and its tags.

use std::path::PathBuf;

use jott_core::settings::Display;
use jott_core::state::Period;
use jott_core::{Conflict, Notebook};
use serde::Serialize;
use tauri::{AppHandle, Runtime, State};

use crate::error::CommandResult;
use crate::state::AppState;

use super::period::{clock_of, PeriodClock};
use super::settings::display_of;
use super::spaces::{groups_of, spaces_of, GroupInfo, SpaceInfo};

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
    /// The capture targets and Home sources of 2026-08-24 — path-like
    /// strings the front resolves (services/noteTargets.js and its tasks
    /// mirror); empty is each one's default.
    pub quick_task_list: String,
    pub home_tasks_source: String,
    pub home_notes_source: String,
    /// The board layout of a notes space that never chose one (`grid` /
    /// `tree`); empty means the app's own.
    pub note_layout: String,
    /// Whether the sidebar wears the rainbow — each entry the next of the
    /// seven from the accent on (services/spaceColors.js does the dealing).
    /// Resolved like the accent: this machine's answer over the notebook's.
    pub auto_space_colors: bool,
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
    /// When the note's floating formatting bar shows, and which side it hugs
    /// (2026-08-21). It rides in the layout for the same reason the accent
    /// does: the bar is drawn as soon as a note opens, and asking for the
    /// settings separately would show it in the wrong place first.
    pub format_bar: String,
    pub format_bar_side: String,
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
                date_display_format: display.date_display_format,
                close_inspector_on_click_away: display.close_inspector_on_click_away,
                quick_note_folder: notebook.config().quick_note_folder.clone(),
                quick_task_list: notebook.config().quick_task_list.clone(),
                home_tasks_source: notebook.config().home_tasks_source.clone(),
                home_notes_source: notebook.config().home_notes_source.clone(),
                note_layout: notebook.config().note_layout.clone(),
                auto_space_colors: display.auto_space_colors,
                accent_color: display.accent_color,
                theme: display.theme,
                heading_color: display.heading_color,
                note_font_size: display.note_font_size,
                format_bar: display.format_bar,
                format_bar_side: display.format_bar_side,
                shortcuts: notebook.config().shortcuts.clone(),
                features: notebook.config().features.clone(),
            },
        })
    }
}

/// Opens a notebook.
///
/// `create` says which QUESTION the user was asked (2026-08-24). The picker
/// offers two doors — "Create a new notebook" and "Open a notebook" — and
/// until they meant different things here, both did the same: a folder that
/// was not a notebook silently became one, so a mistyped path under "open"
/// scattered `.jott/` and three spaces into whatever folder was picked, and
/// the app then reported success.
///
/// With `create` false the folder has to be a notebook already, and is refused
/// with the core's own words when it is not. True is the create door, and is
/// still `open_or_init`: picking a folder that already holds a notebook is not
/// a mistake there, it is the same intention arriving by the other road.
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
    let info = NotebookInfo::of(&notebook, display_of(&app, &notebook))?;
    allow_assets(&app, &path);
    state.open(&app, window.label(), notebook)?;
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

// ---- the picker (2026-08-24) ----

/// One card on the notebooks screen: the notebook, plus when this machine
/// last opened it.
///
/// Flattened rather than nested, because a card is one thing: the frontend
/// reads `entry.name` and `entry.opened` side by side, and a `summary.`
/// prefix on half of them would only say which side of the bridge each field
/// came from.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentNotebook {
    #[serde(flatten)]
    pub notebook: jott_core::NotebookSummary,
    /// RFC 3339, local. The desktop draws it as "42 min ago"; the phone does
    /// not draw it at all (the wireframes, 2026-08-24).
    pub opened: String,
}

/// Every notebook this machine has opened, newest first, each with the two
/// numbers and the colour its card wears.
///
/// **A notebook that cannot be summarized is left out rather than reported.**
/// The list is paths remembered from earlier runs: a folder may have been
/// deleted, renamed outside the app, or be sitting on a drive that is not
/// plugged in. None of that is an error the user can act on from a picker, and
/// one unreachable folder must not cost them the whole screen. It stays in the
/// preferences file, so the day the drive comes back the card does too
/// (`prefs::recent_notebooks`).
///
/// Reading, never writing: `Notebook::summarize` is the door precisely because
/// `Notebook::open` would recreate spaces and reap trash in every notebook on
/// the screen.
#[tauri::command]
pub fn recent_notebooks<R: Runtime>(app: AppHandle<R>) -> Vec<RecentNotebook> {
    crate::prefs::recent_notebooks(&app)
        .into_iter()
        .filter_map(|entry| {
            let mut notebook = Notebook::summarize(&entry.path).ok()?;
            // The colour the card wears is the one that notebook is DRESSED
            // in on this machine, not only the one written inside it: since
            // 2026-08-24 the Display choices are kept per machine and per
            // notebook, and the accent picked in Settings lands there. A card
            // reading the notebook's own value alone showed the app's default
            // blue for every notebook whose colour had ever been chosen —
            // which is every notebook (user report, same day).
            //
            // The core stays out of it: `summarize` answers what is IN the
            // notebook, and where this machine keeps its overrides is this
            // side's business, exactly as `display_of` has it.
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

/// Renames a notebook from the picker, by renaming its folder.
///
/// The rule and the refusals are the core's (`Notebook::rename_at`); what is
/// this side's is the guard below and the bookkeeping after. Answers with the
/// new path, which is what the screen reloads around.
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

/// Refuses to move the folder out from under the notebook the app is working
/// in.
///
/// The picker only shows with nothing open, so this should never fire — which
/// is exactly why it is here rather than trusted: the two commands take a path
/// from the frontend, and the cost of being wrong is every open file handle
/// pointing at a directory that no longer exists at that address.
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
///
/// `limit` is optional: the screen that opens the box does not have an opinion
/// about how many hits fit, and the core's own default is the answer when it
/// says nothing.
///
/// `scope` narrows the question to one space, by its root-relative path — what
/// the ⋮ of a screen asks (2026-08-17). Absent (or empty) is the whole
/// notebook, which is what Ctrl+F asks.
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

#[tauri::command]
pub fn restore_from_trash<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, id: String) -> CommandResult<()> {
    state.read(window.label(), |nb| nb.restore_from_trash(&id))
}

#[tauri::command]
pub fn purge_from_trash<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, id: String) -> CommandResult<()> {
    state.read(window.label(), |nb| nb.purge_from_trash(&id))
}

#[tauri::command]
pub fn empty_trash<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>,) -> CommandResult<usize> {
    state.read(window.label(), |nb| nb.empty_trash())
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
    state.read(window.label(), |nb| nb.set_tag(&name, color))
}

#[tauri::command]
pub fn remove_tag<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, name: String) -> CommandResult<()> {
    state.read(window.label(), |nb| nb.remove_tag(&name))
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
            day: nb.open_state(Period::Day)?.state.items,
        })
    })
}
