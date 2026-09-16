//! Reminders — what should ring, and the ringing itself.
//!
//! What rings and when is the core's (`jott_core::reminders`). This module
//! carries the list across, keeps THIS MACHINE's memory of what has already
//! rung (and the notebook's, shared between devices, through `ack_reminder`),
//! and shows the system's notification. Staying alive in the tray after the
//! window closes is `commands::tray`.

use tauri::{AppHandle, Manager, Runtime, State};

use crate::error::CommandResult;
use crate::state::AppState;

/// Every reminder of the window's notebook, soonest first, past ones
/// included. Walks every list: asked when the notebook changed, not on a
/// render.
#[tauri::command]
pub async fn reminders<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<Vec<jott_core::reminders::Reminder>> {
    state.read(window.label(), |nb| nb.reminders())
}

/// Records that a reminder was shown and dealt with HERE, so the next
/// device to sync the notebook keeps quiet about it. `at` is the moment the
/// task asked for, exactly as the core rendered it — never "now": see
/// `Notebook::ack_reminder`. A task with no id cannot be named across
/// devices and is not acknowledged at all.
#[tauri::command]
pub async fn ack_reminder<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    list: String,
    id: String,
    at: String,
) -> CommandResult<()> {
    let at = jott_core::task::parse_datetime(&at).ok_or_else(|| {
        crate::error::CommandError::new("invalid", format!("{at:?} is not a moment"))
    })?;
    state.quiet(window.label(), |nb| nb.ack_reminder(&list, &id, at))
}

/// Up to what moment this machine has rung the window's notebook. `None`
/// means never — a first launch rings nothing from the past.
#[tauri::command]
pub async fn reminded_until<R: Runtime>(
    state: State<'_, AppState>,
    app: AppHandle<R>,
    window: tauri::Window<R>,
) -> CommandResult<Option<String>> {
    let root = state.root_of(window.label())?;
    Ok(crate::prefs::reminded_until(&app, &root))
}

#[tauri::command]
pub async fn remember_reminded_until<R: Runtime>(
    state: State<'_, AppState>,
    app: AppHandle<R>,
    window: tauri::Window<R>,
    until: String,
) -> CommandResult<()> {
    let root = state.root_of(window.label())?;
    crate::prefs::remember_reminded_until(&app, &root, &until);
    Ok(())
}

/// The last day this machine announced the window's notebook summary
/// (`2026-09-08`), or `None` when it never has.
#[tauri::command]
pub async fn day_summarized_on<R: Runtime>(
    state: State<'_, AppState>,
    app: AppHandle<R>,
    window: tauri::Window<R>,
) -> CommandResult<Option<String>> {
    let root = state.root_of(window.label())?;
    Ok(crate::prefs::summarized_on(&app, &root))
}

#[tauri::command]
pub async fn remember_day_summarized_on<R: Runtime>(
    state: State<'_, AppState>,
    app: AppHandle<R>,
    window: tauri::Window<R>,
    day: String,
) -> CommandResult<()> {
    let root = state.root_of(window.label())?;
    crate::prefs::remember_summarized_on(&app, &root, &day);
    Ok(())
}

/// What a notification carries back when it is clicked: enough to open the
/// task. Emitted to the window as `reminder://open`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderTarget {
    pub list: String,
    pub id: Option<String>,
}

/// The event a clicked reminder sends to its window.
pub const REMINDER_OPEN_EVENT: &str = "reminder://open";

/// Shows the system's notification for one reminder, on desktop.
///
/// Android does not come through here: there the frontend hands the whole
/// schedule to the notification plugin, which rings with the app dead. On
/// desktop the shell keeps the timer and this is the bell.
#[tauri::command]
pub async fn notify_reminder<R: Runtime>(
    app: AppHandle<R>,
    window: tauri::Window<R>,
    title: String,
    body: String,
    target: ReminderTarget,
) -> CommandResult<()> {
    let label = window.label().to_string();
    // `show` is a D-Bus round trip on Linux: off the runtime's workers too.
    tauri::async_runtime::spawn_blocking(move || show_notification(&app, &label, title, body, target))
        .await
        .map_err(|e| crate::error::CommandError::new("io", e.to_string()))?
}

/// Linux: D-Bus notifications can be clicked, and the click is what opens the
/// task. `wait_for_action` blocks until the notification is acted on or goes
/// away, so it waits on its own thread.
#[cfg(target_os = "linux")]
fn show_notification<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    title: String,
    body: String,
    target: ReminderTarget,
) -> CommandResult<()> {
    let handle = notify_rust::Notification::new()
        .appname("Jott")
        .summary(&title)
        .body(&body)
        .icon(crate::APP_ICON_NAME)
        .action("default", "Open")
        .show()
        .map_err(|e| crate::error::CommandError::new("io", e.to_string()))?;
    let app = app.clone();
    let label = label.to_string();
    std::thread::spawn(move || {
        handle.wait_for_action(|action| {
            if action == "default" {
                open_target(&app, &label, &target);
            }
        });
    });
    Ok(())
}

/// Everywhere else the plugin shows it; a click is the system's business.
#[cfg(not(target_os = "linux"))]
fn show_notification<R: Runtime>(
    app: &AppHandle<R>,
    _label: &str,
    title: String,
    body: String,
    _target: ReminderTarget,
) -> CommandResult<()> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| crate::error::CommandError::new("io", e.to_string()))?;
    Ok(())
}

/// Brings the window back (it may be hidden in the tray) and tells it which
/// task to open.
pub fn open_target<R: Runtime>(app: &AppHandle<R>, label: &str, target: &ReminderTarget) {
    use tauri::Emitter;
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        // Only desktop windows minimise; the method does not exist on mobile.
        #[cfg(desktop)]
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit(REMINDER_OPEN_EVENT, target.clone());
    }
}
