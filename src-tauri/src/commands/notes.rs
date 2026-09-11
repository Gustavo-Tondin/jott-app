//! Notes, and the folders a notes space organises them in.
//!
//! `folder` is always the root-relative address of a notes space (`Notes`);
//! `path` is always relative to that space (`Inbox/ideia.md`). Two levels,
//! because the space owns its subtree and the user organises freely inside
//! it.

use serde::Serialize;
use tauri::{Runtime, State};

use crate::error::CommandResult;
use crate::state::AppState;

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
    /// The note's subjects — the `tags:` property (2026-08-26).
    pub tags: Vec<String>,
    pub banner: Option<jott_core::Banner>,
}

/// Every note in a notes space, sorted for the board: pinned first, then
/// newest. An empty `query` returns all of them.
#[tauri::command]
pub fn list_notes<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    query: Option<String>,
) -> CommandResult<Vec<jott_core::NoteEntry>> {
    state.read(window.label(), |nb| {
        nb.notes_in(&folder, query.as_deref().unwrap_or_default())
    })
}

/// Every note of the Inbox — the Home's widened view, behind the notebook's
/// `homeShowsAllInboxNotes` (2026-08-24). A view like `notes_created_today`:
/// nothing is moved or written.
#[tauri::command]
pub fn inbox_notes<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
) -> CommandResult<Vec<jott_core::NoteEntry>> {
    state.read(window.label(), |nb| nb.inbox_notes_in(&folder))
}

/// The notes created today — what the Home shows, from EVERY notes space
/// (each answer says which one). The Home owns no notes of its own; this is
/// a view filtered by `created` (spec 5), so nothing is moved or written.
#[tauri::command]
pub fn notes_created_today<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<Vec<jott_core::ListedNote>> {
    state.read(window.label(), |nb| nb.notes_created_today())
}

/// Writes a note from one blob of text — the Home's quick capture. The first
/// line becomes the title.
#[tauri::command]
pub fn quick_capture_note<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    in_folder: String,
    text: String,
) -> CommandResult<String> {
    state.record(window.label(), "quick_capture_note", |nb| nb.quick_capture_note(&folder, &in_folder, &text))
}

/// The folders of a notes space, each with the colour and the pin the space
/// remembers for it (2026-08-19).
#[tauri::command]
pub async fn note_folders<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
) -> CommandResult<Vec<jott_core::NoteFolderEntry>> {
    state.read(window.label(), |nb| nb.note_folder_entries(&folder))
}

/// The colour of a folder of notes — a palette NAME, or null for none. An
/// action like the space's own appearance: recorded, and attributed, so the
/// `.space.json` it rewrites does not echo back as somebody else's change.
#[tauri::command]
pub fn set_note_folder_color<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
    color: Option<String>,
) -> CommandResult<()> {
    state.record(window.label(), "set_note_folder_color", |nb| {
        nb.set_note_folder(&folder, &path, |it| it.color = color)
    })
}

/// Keeps a folder of notes at the top of the board, or stops.
#[tauri::command]
pub fn set_note_folder_pinned<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
    pinned: bool,
) -> CommandResult<()> {
    state.record(window.label(), "set_note_folder_pinned", |nb| {
        nb.set_note_folder(&folder, &path, |it| it.pinned = pinned)
    })
}

#[tauri::command]
pub fn read_note<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
) -> CommandResult<NoteContent> {
    state.with_notebook(window.label(), |nb| {
        let note = nb.note_folder(&folder)?.read(&path)?;
        // Opening a note is the moment the time axis calls "seen" (spec 3.6).
        // Here and not in the core, because only this side knows the read was
        // a person opening the note rather than a scan walking past it — and
        // this is the ONE command the editor uses to open one. Best effort:
        // an index that could not be written must not keep the note shut.
        let _ = nb.mark_note_seen(&folder, &path);
        Ok(NoteContent {
            // The core's rule, not a second one: `trim_end_matches(".md")`
            // here used to strip REPEATED suffixes, so a note titled
            // `todo.md` (stored as `todo.md.md`) opened under a third name.
            title: jott_core::notefolder::title_of(&path),
            path,
            body: note.body,
            pinned: note.pinned,
            created: note.created.map(|d| d.to_string()),
            tags: note.tags,
            banner: note.banner,
        })
    })
}

/// Replaces a note's body. The core adopts today as its creation date if it
/// does not have one — the lazy frontmatter's one writing moment.
/// `async` so the write leaves the main thread: on Android the notebook sits
/// on FUSE-backed storage and the main thread is the one that draws, so a
/// save that ran there held back the letters typed right after it.
#[tauri::command]
pub async fn write_note<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
    body: String,
) -> CommandResult<()> {
    state.quiet(window.label(), |nb| nb.write_note(&folder, &path, &body))
}

/// Keeps the note as it is on disk as a conflict copy beside it: the editor
/// is about to write over a version somebody else left while it was typing.
/// Quiet, and `async` like every write (the phone's storage is slow).
#[tauri::command]
pub async fn keep_note_conflict_copy<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
) -> CommandResult<Option<String>> {
    state.quiet(window.label(), |nb| nb.keep_note_conflict_copy(&folder, &path))
}

/// Creates a note and returns its address.
#[tauri::command]
pub fn create_note<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    in_folder: String,
    title: String,
) -> CommandResult<String> {
    state.record(window.label(), "create_note", |nb| nb.create_note(&folder, &in_folder, &title))
}

#[tauri::command]
pub fn delete_note<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
) -> CommandResult<()> {
    // Routed through the notebook now, so it lands in the internal trash with
    // its origin recorded (reestruturação 2026-07-30), not the OS trash.
    state.record(window.label(), "delete_note", |nb| nb.delete_note(&folder, &path))
}

/// Renames a note inside its folder. Returns the new address.
#[tauri::command]
pub fn rename_note<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
    title: String,
) -> CommandResult<String> {
    // Through the notebook and not the folder: renaming a note now follows it
    // into every `[[link]]` in the whole notebook (2026-08-19).
    state.record(window.label(), "rename_note", |nb| nb.rename_note(&folder, &path, &title))
}

/// Moves a note to another folder inside the same space. Returns the new address.
#[tauri::command]
pub fn move_note<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
    to_folder: String,
) -> CommandResult<String> {
    state.record(window.label(), "move_note", |nb| nb.move_note(&folder, &path, &to_folder))
}

#[tauri::command]
pub fn set_note_pinned<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
    pinned: bool,
) -> CommandResult<()> {
    state.record(window.label(), "set_note_pinned", |nb| nb.set_note_pinned(&folder, &path, pinned))
}

/// Replaces a note's tags — its subjects, the `tags:` property. The names
/// are normalised in the core like a task's; an empty list takes the
/// property out of the file.
#[tauri::command]
pub fn set_note_tags<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
    tags: Vec<String>,
) -> CommandResult<()> {
    state.record(window.label(), "set_note_tags", |nb| nb.set_note_tags(&folder, &path, &tags))
}

/// Sets — or clears, with `None` — a note's banner.
///
/// The value is what the line carries: a colour name (`yellow`) or an asset
/// address (`assets/sunset.jpg`). Which of the two it is comes from the value
/// itself, in the core, so the interface never has to say.
#[tauri::command]
pub fn set_note_banner<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
    banner: Option<String>,
) -> CommandResult<()> {
    let banner = banner.as_deref().and_then(jott_core::Banner::from_value);
    state.record(window.label(), "set_note_banner", |nb| nb.set_note_banner(&folder, &path, banner))
}

/// Copies a note beside itself, returning the new address — the card's
/// "Duplicate".
#[tauri::command]
pub fn duplicate_note<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
) -> CommandResult<String> {
    state.record(window.label(), "duplicate_note", |nb| nb.duplicate_note(&folder, &path))
}

/// Moves a note to another notes space (the bulk "move to" of the board).
/// Returns the new address, relative to the space it landed in.
#[tauri::command]
pub fn move_note_to_space<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
    to_space: String,
    to_folder: String,
) -> CommandResult<String> {
    state.record(window.label(), "move_note_to_space", |nb| nb.move_note_to_space(&folder, &path, &to_space, &to_folder))
}

/// Renames a folder inside a notes space. Returns the new address.
#[tauri::command]
pub fn rename_note_folder<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
    name: String,
) -> CommandResult<String> {
    // Through the notebook, not the folder: a folder's colour and pin live in
    // the space's config, and they have to travel with the rename.
    state.record(window.label(), "rename_note_folder", |nb| nb.rename_note_folder(&folder, &path, &name))
}

/// Deletes a folder, moving what was inside up to its parent. Returns how
/// many entries moved — the UI tells the user, the way deleting a list does.
#[tauri::command]
pub fn delete_note_folder<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
) -> CommandResult<usize> {
    state.record(window.label(), "delete_note_folder", |nb| nb.delete_note_folder(&folder, &path))
}

#[tauri::command]
pub fn create_note_folder<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    path: String,
) -> CommandResult<()> {
    state.record(window.label(), "create_note_folder", |nb| nb.create_note_folder(&folder, &path))
}
