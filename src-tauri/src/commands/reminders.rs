//! Reminders — what should ring.
//!
//! What rings and when is the core's (`jott_core::reminders`). On desktop the
//! process rings (`crate::ringer`): the window only nudges it when what it
//! reads changed. Android rings through the system's alarm service, and so
//! still asks for the list and acknowledges a tapped reminder itself. Staying
//! alive in the tray after the window closes is `commands::tray`.

use tauri::{Runtime, State};

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

/// Tells the ringer of the window's notebook to look again — a reminder, the
/// day summary or the Remind switch changed. `reminders` is that switch: its
/// default lives in the interface, so the window says it.
#[tauri::command]
pub async fn nudge_reminders<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    reminders: bool,
) -> CommandResult<()> {
    state.nudge_ringer(window.label(), Some(reminders));
    Ok(())
}

/// What the phone's notification buttons need to act with the app closed:
/// the notebook's folder and this device's name, carried by every alarm
/// (`crate::reminder_actions`).
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderScope {
    pub root: std::path::PathBuf,
    pub device: Option<String>,
}

#[tauri::command]
pub async fn reminder_scope<R: Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<ReminderScope> {
    Ok(ReminderScope {
        root: state.root_of(window.label())?,
        device: crate::prefs::device_id(&app),
    })
}
