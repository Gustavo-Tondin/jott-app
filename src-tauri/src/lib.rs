//! Tauri shell — thin layer only.
//!
//! No business logic here: every command delegates to `jott_core`. The shell
//! owns exactly two things the core cannot: which notebook is open right now,
//! and the bridge to the frontend (commands in, events out).

pub mod base64;
pub mod commands;
pub mod error;
pub mod net;
pub mod prefs;
pub mod state;
#[cfg(desktop)]
pub mod tray;

/// The icon name the desktop knows the app by — `packaging/linux/jott.desktop`
/// installs it under this name, and a notification asks for it by name.
pub const APP_ICON_NAME: &str = "jott";

use state::AppState;

/// Applies the app's configuration to a builder.
///
/// Split out so the integration tests drive the *same* set of commands the
/// real app registers — a command that exists only in production is a
/// command nothing tests.
pub fn configure<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState::default())
        // A window that closes takes its notebook — and the watcher THREAD
        // watching it — with it (2026-08-24). Without this the state map only
        // ever grows, and every window the user ever opened leaves a thread
        // polling a folder nobody is looking at.
        .on_window_event(|window, event| {
            use tauri::Manager;
            match event {
                tauri::WindowEvent::Destroyed => {
                    window.state::<AppState>().close(window.label());
                }
                // With the tray on, the close button hides the window and
                // keeps its notebook — reminders go on ringing (`tray.rs`).
                #[cfg(desktop)]
                tauri::WindowEvent::CloseRequested { api, .. } if tray::intercept_close(window) => {
                    api.prevent_close();
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::shell::platform,
            commands::shell::window_button_layout,
            commands::shell::system_fonts,
            commands::notebook::notebook_snapshot,
            commands::notebook::undo,
            commands::notebook::redo,
            commands::notebook::notebook_contents,
            commands::timeline::timeline,
            commands::timeline::timeline_years,
            commands::timeline::forget_from_timeline,
            commands::spaces::rename_space,
            commands::spaces::set_space_appearance,
            commands::spaces::delete_space,
            commands::settings::set_feature,
            commands::settings::set_shortcut,
            commands::settings::reset_shortcuts,
            commands::settings::spaces_sort,
            commands::settings::set_spaces_sort,
            commands::settings::user_themes,
            commands::settings::user_theme_css,
            commands::settings::create_user_theme,
            commands::settings::reset_settings,
            commands::settings::reset_machine_display,
            commands::day::day_sort,
            commands::day::set_day_sort,
            commands::day::set_day_order,
            commands::spaces::set_space_sort,
            commands::spaces::set_space_note_layout,
            commands::spaces::set_space_order,
            // groups (reestruturação 2026-07-30)
            commands::spaces::groups,
            commands::spaces::create_group,
            commands::spaces::rename_group,
            commands::spaces::set_group_appearance,
            commands::spaces::delete_group,
            commands::spaces::move_space,
            commands::spaces::move_group,
            commands::spaces::create_space_in,
            // trash + tags + completed
            commands::notebook::trash_entries,
            commands::notebook::restore_from_trash,
            commands::notebook::purge_from_trash,
            commands::notebook::empty_trash,
            commands::tasks::delete_task,
            commands::notebook::tags,
            commands::notebook::tag_usage,
            commands::notebook::set_tag,
            commands::notebook::remove_tag,
            commands::lists::completed_tasks,
            commands::notebook::search,
            // notebook
            commands::shell::pick_notebook_folder,
            commands::shell::default_notebook_folder,
            commands::shell::list_folders,
            commands::shell::create_folder,
            commands::notebook::open_notebook,
            commands::notebook::current_notebook,
            commands::notebook::last_notebook,
            // the picker (2026-08-24)
            commands::notebook::recent_notebooks,
            commands::notebook::forget_notebook,
            commands::notebook::rename_notebook,
            commands::notebook::move_notebook,
            commands::shell::reveal_notebook,
            commands::shell::open_window,
            commands::shell::picker_closes,
            commands::shell::remember_picker_closes,
            commands::shell::opens_on_picker,
            commands::shell::remember_opens_on_picker,
            commands::settings::notebook_settings,
            commands::settings::set_notebook_settings,
            commands::settings::set_machine_display,
            commands::settings::screen_to_restore,
            commands::settings::remember_screen,
            commands::settings::sidebar_width,
            commands::settings::remember_sidebar_width,
            commands::settings::panel_width,
            commands::settings::remember_panel_width,
            commands::settings::zoom,
            commands::settings::remember_zoom,
            // update (2026-08-19)
            commands::update::app_version,
            commands::update::check_for_update,
            commands::update::auto_update_check,
            commands::update::remember_auto_update_check,
            commands::update::last_update_check,
            commands::update::remember_last_update_check,
            commands::update::desktop_entry_state,
            commands::update::set_desktop_entry,
            commands::update::dismiss_desktop_entry,
            commands::shell::open_in_file_manager,
            commands::notebook::list_counts,
            // lists
            commands::lists::list_names,
            commands::lists::list_conflicts,
            commands::lists::list_tasks,
            commands::lists::create_list,
            commands::lists::rename_list,
            commands::lists::delete_list,
            // tasks
            commands::tasks::create_task,
            commands::tasks::ensure_task_id,
            commands::tasks::edit_task_text,
            commands::tasks::set_task_fields,
            commands::tasks::set_task_pinned,
            commands::tasks::move_task_to,
            commands::tasks::move_task,
            commands::tasks::duplicate_task,
            commands::settings::set_order,
            commands::tasks::complete_task,
            commands::tasks::uncomplete_task,
            // notes
            commands::notes::list_notes,
            commands::notes::note_folders,
            commands::notes::notes_created_today,
            commands::notes::inbox_notes,
            commands::notes::quick_capture_note,
            commands::notes::read_note,
            commands::notes::write_note,
            commands::notes::create_note,
            commands::notes::delete_note,
            commands::notes::rename_note,
            commands::notes::move_note,
            commands::notes::set_note_pinned,
            commands::notes::set_note_tags,
            commands::notes::set_note_banner,
            commands::notes::duplicate_note,
            commands::notes::set_note_folder_color,
            commands::notes::set_note_folder_pinned,
            commands::notes::move_note_to_space,
            commands::notes::create_note_folder,
            commands::notes::rename_note_folder,
            commands::notes::delete_note_folder,
            // assets (the notebook's image library, 2026-08-18)
            commands::assets::assets,
            commands::assets::import_asset,
            commands::assets::import_asset_from_path,
            commands::assets::clipboard_files,
            commands::assets::import_asset_from_url,
            commands::assets::rename_asset,
            commands::assets::delete_asset,
            commands::assets::open_asset,
            commands::assets::file_icon,
            commands::assets::asset_usage,
            // the day, and the days ahead (2026-09-04)
            commands::day::day_tasks,
            commands::day::grouped_suggestions,
            commands::day::day_clock,
            commands::day::pull_into_day,
            commands::day::remove_from_day,
            commands::day::refresh_day,
            commands::tasks::all_tasks,
            // reminders (2026-08-25)
            commands::reminders::reminders,
            commands::reminders::reminded_until,
            commands::reminders::remember_reminded_until,
            commands::reminders::notify_reminder,
            commands::reminders::close_to_tray,
            commands::reminders::remember_close_to_tray,
            commands::reminders::autostart,
            commands::reminders::set_autostart,
            commands::reminders::quit_app,
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
    let builder = configure(tauri::Builder::default());
    // In-place updates only exist where the installed file can replace
    // itself (the AppImage, the Windows build); the plugins are not even
    // compiled on mobile — see Cargo.toml. Registered here and not in
    // `configure` because the updater reads its pubkey and endpoint from
    // tauri.conf.json, which the tests' mock context does not carry — there
    // the registration itself would fail, taking every test with it.
    // `process` is what relaunches the app after an update installs.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Started by the session, the app comes up in the tray and not on
        // the screen: `--hidden` is what the autostart entry passes, and the
        // setup below honours it.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .setup(|app| {
            use tauri::Manager;
            if let Err(e) = tray::install(app.handle()) {
                eprintln!("[jott] no tray icon: {e}");
            }
            if std::env::args().any(|arg| arg == "--hidden") {
                for window in app.webview_windows().values() {
                    let _ = window.hide();
                }
            }
            Ok(())
        });
    builder
        .run(tauri::generate_context!())
        .expect("error while running Jott");
}
