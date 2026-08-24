//! Tasks — one line of a list each.
//!
//! What every field of a task MEANS is `jott_core::task::TaskFields`', in the
//! core, where a second frontend can reach it. This module only carries the
//! arguments across.

use jott_core::{OriginAction, Task};
use tauri::{Runtime, State};

use crate::error::CommandResult;
use crate::state::AppState;

/// Creates a task and returns its **position** in the list, not an id.
///
/// A new task has no id: ids are handed out only when something needs to
/// address the task (see `ensure_task_id`), which is what keeps a plain
/// checklist free of comments.
#[tauri::command]
pub fn create_task<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    list: String,
    text: String,
) -> CommandResult<usize> {
    state.record(window.label(), "create_task", |nb| nb.create_task(&list, text))
}

/// Gives the task at `position` a stable id, and returns it.
///
/// The UI works with positions; the moment the user acts on a task — pulls it
/// into a period, completes it — it needs a name that survives reordering.
#[tauri::command]
pub fn ensure_task_id<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    list: String,
    position: usize,
) -> CommandResult<String> {
    state.quiet(window.label(), |nb| nb.ensure_task_id(&list, position))
}

#[tauri::command]
pub fn edit_task_text<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    list: String,
    id: String,
    text: String,
) -> CommandResult<()> {
    state.record(window.label(), "edit_task_text", |nb| nb.edit_task_text(&list, &id, text))
}

/// Pins a task to the top of its list, or unpins it (the card's bookmark).
#[tauri::command]
pub fn set_task_pinned<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    list: String,
    id: String,
    pinned: bool,
) -> CommandResult<()> {
    state.record(window.label(), "set_task_pinned", |nb| nb.set_task_pinned(&list, &id, pinned))
}

/// Edits any field of a task in one call.
///
/// One command instead of one per field: the UI edits a task in a panel and
/// saves it as a whole, and a half-applied edit would be worse than none.
/// What each field means — and every rule about it — is
/// [`jott_core::task::TaskFields`]'s, in the core, where a second frontend
/// can reach it.
#[tauri::command]
pub fn set_task_fields<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    list: String,
    id: String,
    fields: jott_core::task::TaskFields,
) -> CommandResult<()> {
    state.quiet(window.label(), |nb| nb.set_task_fields(&list, &id, fields))
}

/// Reorders a task inside its list. Positions count tasks, not lines.
#[tauri::command]
pub fn move_task_to<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    list: String,
    from: usize,
    to: usize,
) -> CommandResult<()> {
    state.record(window.label(), "move_task_to", |nb| nb.move_task_to(&list, from, to))
}

/// Moves a task to another list. The task keeps its id; its origin is cleared,
/// because the move makes the target its home (undoing a completion is a
/// separate mechanism that does not go through here).
#[tauri::command]
pub fn move_task<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    from: String,
    id: String,
    to: String,
) -> CommandResult<Task> {
    state.record(window.label(), "move_task", |nb| nb.move_task(&id, &from, &to, OriginAction::Clear))
}

/// Inserts a copy of a task right after it, in the same list.
#[tauri::command]
pub fn duplicate_task<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    list: String,
    id: String,
) -> CommandResult<()> {
    state.record(window.label(), "duplicate_task", |nb| nb.duplicate_task(&list, &id))
}

#[tauri::command]
pub fn complete_task<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    list: String,
    id: String,
) -> CommandResult<Task> {
    state.record(window.label(), "complete_task", |nb| nb.complete_task(&list, &id))
}

/// Un-completes a task. `list` is the address of the Completed list it sits
/// in — with one Completed per space, the id alone cannot say which folder
/// to undo in.
#[tauri::command]
pub fn uncomplete_task<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    list: String,
    id: String,
) -> CommandResult<Task> {
    state.record(window.label(), "uncomplete_task", |nb| nb.uncomplete_task(&list, &id))
}

/// Deletes a single task (sends it to the internal trash).
#[tauri::command]
pub fn delete_task<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, list: String, id: String) -> CommandResult<()> {
    state.record(window.label(), "delete_task", |nb| nb.delete_task(&list, &id))
}
