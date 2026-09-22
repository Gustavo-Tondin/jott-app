//! The tray icon: where the app lives once its window is closed. Closing
//! HIDES the window — notebook, watcher and the shell's reminder timer stay
//! alive — and the tray is the door back in and the only "Quit". GNOME
//! shows no tray without the AppIndicator extension: process and reminders
//! still live; Settings says so beside the switch that turns this off.

use jott_core::lang::Lang;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime};

pub const TRAY_ID: &str = "jott";

/// The menu's two words — the only strings the tray draws.
pub fn labels(lang: Lang) -> (&'static str, &'static str) {
    match lang {
        Lang::En => ("Open Jott", "Quit"),
        Lang::PtBr => ("Abrir o Jott", "Sair"),
    }
}

fn menu<R: Runtime>(app: &AppHandle<R>, lang: Lang) -> tauri::Result<Menu<R>> {
    let (open, quit) = labels(lang);
    let open = MenuItem::with_id(app, "open", open, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    Menu::with_items(app, &[&open, &quit])
}

/// Redraws the menu in `lang`; the ids — and so the handler — stay put.
pub fn relabel<R: Runtime>(app: &AppHandle<R>, lang: Lang) -> tauri::Result<()> {
    match app.tray_by_id(TRAY_ID) {
        Some(tray) => tray.set_menu(Some(menu(app, lang)?)),
        None => Ok(()),
    }
}

pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = menu(app, crate::prefs::lang(app))?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("Jott")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => reveal(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                reveal(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Brings every window back. Hidden windows are the normal case; a minimised
/// one is unminimised for the same reason.
pub fn reveal<R: Runtime>(app: &AppHandle<R>) {
    for window in app.webview_windows().values() {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// What the close button does with the tray on: hide, and keep everything.
/// Returns whether the close was taken over.
pub fn intercept_close<R: Runtime>(window: &tauri::Window<R>) -> bool {
    if !crate::prefs::close_to_tray(window.app_handle()) {
        return false;
    }
    window.hide().is_ok()
}
