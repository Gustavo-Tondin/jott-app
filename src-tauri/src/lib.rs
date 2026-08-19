//! Tauri shell — thin layer only.
//!
//! No business logic here: every command delegates to `jott_core`. The shell
//! owns exactly two things the core cannot: which notebook is open right now,
//! and the bridge to the frontend (commands in, events out).

pub mod base64;
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
            commands::platform,
            commands::window_button_layout,
            commands::is_notebook_open,
            commands::notebook_snapshot,
            commands::spaces,
            commands::create_space,
            commands::rename_space,
            commands::set_space_appearance,
            commands::delete_space,
            commands::set_feature,
            commands::set_shortcut,
            commands::reset_shortcuts,
            commands::spaces_sort,
            commands::set_spaces_sort,
            commands::period_sort,
            commands::set_period_sort,
            commands::set_period_order,
            commands::set_space_sort,
            commands::set_space_order,
            // groups (reestruturação 2026-07-30)
            commands::groups,
            commands::create_group,
            commands::rename_group,
            commands::set_group_appearance,
            commands::delete_group,
            commands::move_space,
            commands::move_group,
            commands::create_space_in,
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
            commands::default_notebook_folder,
            commands::open_notebook,
            commands::current_notebook,
            commands::last_notebook,
            commands::notebook_settings,
            commands::set_notebook_settings,
            commands::screen_to_restore,
            commands::remember_screen,
            commands::sidebar_width,
            commands::remember_sidebar_width,
            commands::panel_width,
            commands::remember_panel_width,
            commands::zoom,
            commands::remember_zoom,
            commands::open_in_file_manager,
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
            commands::set_note_banner,
            commands::duplicate_note,
            commands::move_note_to_space,
            commands::create_note_folder,
            commands::rename_note_folder,
            commands::delete_note_folder,
            // assets (the notebook's image library, 2026-08-18)
            commands::assets,
            commands::import_asset,
            commands::import_asset_from_path,
            commands::clipboard_files,
            commands::import_asset_from_url,
            commands::rename_asset,
            commands::delete_asset,
            commands::open_asset,
            commands::file_icon,
            commands::asset_usage,
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

/// Starts the app.
///
/// On desktop `main.rs` calls this. On mobile there is no `main`: Android
/// loads this crate as a shared library and calls in through a symbol the
/// `mobile_entry_point` macro exports. Without the attribute the library
/// builds perfectly and then fails to be assembled into an APK with "does not
/// include required runtime symbols" — the code is fine, nothing is there to
/// call it.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure(tauri::Builder::default())
        .run(tauri::generate_context!())
        .expect("error while running Jott");
}
