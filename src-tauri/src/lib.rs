//! Tauri shell — thin layer only.
//!
//! No business logic here: every command delegates to `jott_core`. The shell
//! owns exactly two things the core cannot: which notebook is open right now,
//! and the bridge to the frontend (commands in, events out).

pub mod commands;
pub mod error;
pub mod prefs;
pub mod state;

use state::AppState;

/// Applies the app's configuration to a builder.
///
/// Split out so the integration tests drive the *same* set of commands the
/// real app registers — a command that exists only in production is a
/// command nothing tests.
pub fn configure<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::core_version,
            commands::window_button_layout,
            commands::is_notebook_open,
            commands::notebook_snapshot,
            commands::workspaces,
            commands::create_workspace,
            commands::rename_workspace,
            commands::set_workspace_appearance,
            commands::delete_workspace,
            commands::set_feature,
            commands::workspaces_sort,
            commands::set_workspaces_sort,
            commands::period_sort,
            commands::set_period_sort,
            commands::set_period_order,
            commands::set_workspace_sort,
            commands::set_workspace_order,
            // groups (reestruturação 2026-07-30)
            commands::groups,
            commands::create_group,
            commands::rename_group,
            commands::set_group_appearance,
            commands::delete_group,
            commands::move_workspace,
            commands::move_group,
            commands::create_workspace_in,
            // trash + tags + completed
            commands::trash_entries,
            commands::restore_from_trash,
            commands::delete_task,
            commands::tags,
            commands::set_tag,
            commands::remove_tag,
            commands::completed_tasks,
            commands::search,
            // notebook
            commands::pick_notebook_folder,
            commands::open_notebook,
            commands::current_notebook,
            commands::last_notebook,
            commands::notebook_settings,
            commands::set_notebook_settings,
            commands::screen_to_restore,
            commands::remember_screen,
            commands::list_counts,
            // lists
            commands::list_names,
            commands::list_conflicts,
            commands::list_tasks,
            commands::create_list,
            commands::rename_list,
            commands::delete_list,
            // tasks
            commands::create_task,
            commands::ensure_task_id,
            commands::edit_task_text,
            commands::set_task_fields,
            commands::set_task_pinned,
            commands::move_task_to,
            commands::move_task,
            commands::duplicate_task,
            commands::set_order,
            commands::complete_task,
            commands::uncomplete_task,
            // notes
            commands::list_notes,
            commands::note_folders,
            commands::notes_created_today,
            commands::quick_capture_note,
            commands::read_note,
            commands::write_note,
            commands::create_note,
            commands::delete_note,
            commands::rename_note,
            commands::move_note,
            commands::set_note_pinned,
            commands::create_note_folder,
            commands::rename_note_folder,
            commands::delete_note_folder,
            // day and week
            commands::period_state,
            commands::period_tasks,
            commands::period_suggestions,
            commands::grouped_suggestions,
            commands::period_clock,
            commands::pull_into_period,
            commands::remove_from_period,
            commands::add_task_in_period,
            commands::refresh_periods,
        ])
}

pub fn run() {
    configure(tauri::Builder::default())
        .run(tauri::generate_context!())
        .expect("error while running Jott");
}
