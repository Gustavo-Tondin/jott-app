//! The tray and the session — whether closing the window keeps the app
//! alive, whether it starts with the session, and the way out. The icon
//! itself is `crate::tray`.

use tauri::{AppHandle, Runtime};

use crate::error::CommandResult;

/// Whether closing the window keeps the app in the tray. On by default.
#[tauri::command]
pub async fn close_to_tray<R: Runtime>(app: AppHandle<R>) -> bool {
    crate::prefs::close_to_tray(&app)
}

#[tauri::command]
pub async fn remember_close_to_tray<R: Runtime>(app: AppHandle<R>, on: bool) {
    crate::prefs::remember_close_to_tray(&app, on);
}

/// Whether the app starts with the session. Only the desktop plugin can
/// answer; elsewhere it is simply "no".
#[tauri::command]
pub async fn autostart<R: Runtime>(app: AppHandle<R>) -> bool {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        app.autolaunch().is_enabled().unwrap_or(false)
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        false
    }
}

#[tauri::command]
pub async fn set_autostart<R: Runtime>(app: AppHandle<R>, on: bool) -> CommandResult<()> {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        let launcher = app.autolaunch();
        let result = if on { launcher.enable() } else { launcher.disable() };
        result.map_err(|e| crate::error::CommandError::new("io", e.to_string()))?;
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, on);
    }
    Ok(())
}

/// Ends the process — the tray's "Quit", and the one way out once closing
/// the window only hides it.
#[tauri::command]
pub fn quit_app<R: Runtime>(app: AppHandle<R>) {
    app.exit(0);
}
