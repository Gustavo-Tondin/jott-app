//! The lists of a tasks space.
//!
//! Every tasks space has the same two files — `task-list.md` and
//! `completed.md` — and what tells two `Inbox`es apart is the FOLDER. So a
//! list is addressed by its root-relative path, never by a bare name.

use jott_core::{Conflict, Task};
use tauri::State;

use crate::error::CommandResult;
use crate::state::AppState;

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

#[tauri::command]
pub fn completed_tasks(
    state: State<'_, AppState>,
) -> CommandResult<Vec<jott_core::notebook::ListedTask>> {
    state.with_notebook(|nb| Ok(nb.completed_all()?))
}
