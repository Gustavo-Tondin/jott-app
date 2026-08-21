//! Notes, and the folders a notes space organises them in.
//!
//! `folder` is always the root-relative address of a notes space (`Notes`);
//! `path` is always relative to that space (`Inbox/ideia.md`). Two levels,
//! because the space owns its subtree and the user organises freely inside
//! it.

use serde::Serialize;
use tauri::State;

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
    state.read(|nb| {
        let notes = nb.note_folder(&folder)?;
        notes.search(query.as_deref().unwrap_or_default())
    })
}

/// The notes created today — what the Home shows. The Home owns no notes of
/// its own; this is a view of the inbox (spec 5).
#[tauri::command]
pub fn notes_created_today(
    state: State<'_, AppState>,
    folder: String,
) -> CommandResult<Vec<jott_core::NoteEntry>> {
    state.read(|nb| {
        let today = nb.today();
        nb.note_folder(&folder)?.created_on(today)
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
    state.read(|nb| nb.quick_capture_note(&folder, &in_folder, &text))
}

/// The folders of a notes space, each with the colour and the pin the space
/// remembers for it (2026-08-19).
#[tauri::command]
pub fn note_folders(
    state: State<'_, AppState>,
    folder: String,
) -> CommandResult<Vec<jott_core::NoteFolderEntry>> {
    state.read(|nb| nb.note_folder_entries(&folder))
}

/// The colour of a folder of notes — a palette NAME, or null for none.
#[tauri::command]
pub fn set_note_folder_color(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    color: Option<String>,
) -> CommandResult<()> {
    state.read(|nb| nb.set_note_folder(&folder, &path, |it| it.color = color))
}

/// Keeps a folder of notes at the top of the board, or stops.
#[tauri::command]
pub fn set_note_folder_pinned(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    pinned: bool,
) -> CommandResult<()> {
    state.read(|nb| nb.set_note_folder(&folder, &path, |it| it.pinned = pinned))
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
    state.read(|nb| nb.write_note(&folder, &path, &body))
}

/// Creates a note and returns its address.
#[tauri::command]
pub fn create_note(
    state: State<'_, AppState>,
    folder: String,
    in_folder: String,
    title: String,
) -> CommandResult<String> {
    state.read(|nb| nb.create_note(&folder, &in_folder, &title))
}

#[tauri::command]
pub fn delete_note(
    state: State<'_, AppState>,
    folder: String,
    path: String,
) -> CommandResult<()> {
    // Routed through the notebook now, so it lands in the internal trash with
    // its origin recorded (reestruturação 2026-07-30), not the OS trash.
    state.read(|nb| nb.delete_note(&folder, &path))
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
    state.read(|nb| nb.rename_note(&folder, &path, &title))
}

/// Moves a note to another folder inside the same space. Returns the new address.
#[tauri::command]
pub fn move_note(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    to_folder: String,
) -> CommandResult<String> {
    state.read(|nb| nb.move_note(&folder, &path, &to_folder))
}

#[tauri::command]
pub fn set_note_pinned(
    state: State<'_, AppState>,
    folder: String,
    path: String,
    pinned: bool,
) -> CommandResult<()> {
    state.read(|nb| nb.set_note_pinned(&folder, &path, pinned))
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
    state.read(|nb| nb.set_note_banner(&folder, &path, banner))
}

/// Copies a note beside itself, returning the new address — the card's
/// "Duplicate".
#[tauri::command]
pub fn duplicate_note(
    state: State<'_, AppState>,
    folder: String,
    path: String,
) -> CommandResult<String> {
    state.read(|nb| nb.duplicate_note(&folder, &path))
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
    state.read(|nb| nb.move_note_to_space(&folder, &path, &to_space, &to_folder))
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
    state.read(|nb| nb.rename_note_folder(&folder, &path, &name))
}

/// Deletes a folder, moving what was inside up to its parent. Returns how
/// many entries moved — the UI tells the user, the way deleting a list does.
#[tauri::command]
pub fn delete_note_folder(
    state: State<'_, AppState>,
    folder: String,
    path: String,
) -> CommandResult<usize> {
    state.read(|nb| nb.delete_note_folder(&folder, &path))
}

#[tauri::command]
pub fn create_note_folder(
    state: State<'_, AppState>,
    folder: String,
    path: String,
) -> CommandResult<()> {
    state.read(|nb| nb.create_note_folder(&folder, &path))
}
