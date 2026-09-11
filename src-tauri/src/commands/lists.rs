//! The lists of a tasks space.
//!
//! Every tasks space has the same two files — `task-list.md` and
//! `completed.md` — and what tells two `Inbox`es apart is the FOLDER. So a
//! list is addressed by its root-relative path, never by a bare name.

use jott_core::{Conflict, Task};
use tauri::{Runtime, State};

use crate::error::CommandResult;
use crate::state::AppState;

#[tauri::command]
pub async fn list_names<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<Vec<jott_core::notebook::ListEntry>> {
    state.read(window.label(), |nb| nb.lists())
}

/// Conflicting copies a sync tool left in the notebook.
///
/// The app reports them; resolving is the user's call, since guessing which
/// side to keep is how work gets lost.
#[tauri::command]
pub async fn list_conflicts<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<Vec<Conflict>> {
    state.read(window.label(), |nb| nb.conflicts())
}

#[tauri::command]
pub async fn list_tasks<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    list: String,
) -> CommandResult<Vec<Task>> {
    state.read(window.label(), |nb| nb.tasks_in(&list))
}

/// Creates a list inside `folder` (a root-relative space folder, e.g.
/// `Tasks` — the UI takes it from `layout.tasksFolder` until it is
/// space-aware).
#[tauri::command]
pub async fn create_list<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    name: String,
) -> CommandResult<()> {
    state.record(window.label(), "create_list", |nb| {
        nb.create_list(&folder, &name)?;
        Ok(())
    })
}

#[tauri::command]
pub async fn rename_list<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    from: String,
    to: String,
) -> CommandResult<()> {
    state.record(window.label(), "rename_list", |nb| nb.rename_list(&from, &to))
}

/// Deletes a list. Returns how many tasks were moved to the Inbox.
#[tauri::command]
pub async fn delete_list<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    name: String,
) -> CommandResult<usize> {
    state.record(window.label(), "delete_list", |nb| nb.delete_list(&name))
}

#[tauri::command]
pub async fn completed_tasks<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<Vec<jott_core::notebook::ListedTask>> {
    state.read(window.label(), |nb| nb.completed_all())
}
