//! Ends a startup sequence the desktop opened on our behalf. GNOME opens one
//! for every button pressed on a notification (the `ActivationToken` signal)
//! and shows a busy cursor until a window takes it, or for 15 s. A button
//! that brings no window has to end it by hand: `gtk_shell1.set_startup_id`,
//! which Mutter completes the sequence on. GTK's own call is a no-op where
//! xdg-activation exists. A launch from the desktop while the app already
//! runs opens one too: the token travels to the running instance
//! (`hand_over_launch`) and its window takes it (`activate`).
//! See docs/platform-gotchas.md#ambiente

use wayland_client::globals::{registry_queue_init, GlobalListContents};
use wayland_client::protocol::wl_registry;
use wayland_client::{Connection, Dispatch, QueueHandle};

#[allow(dead_code, non_camel_case_types, non_upper_case_globals, clippy::all)]
mod protocol {
    use wayland_client;

    pub mod __interfaces {
        wayland_scanner::generate_interfaces!("protocols/gtk-shell.xml");
    }
    use self::__interfaces::*;

    wayland_scanner::generate_client_code!("protocols/gtk-shell.xml");
}

use protocol::gtk_shell1::GtkShell1;

struct Quiet;

impl Dispatch<wl_registry::WlRegistry, GlobalListContents> for Quiet {
    fn event(_: &mut Self, _: &wl_registry::WlRegistry, _: wl_registry::Event, _: &GlobalListContents, _: &Connection, _: &QueueHandle<Self>) {}
}

impl Dispatch<GtkShell1, ()> for Quiet {
    fn event(_: &mut Self, _: &GtkShell1, _: protocol::gtk_shell1::Event, _: &(), _: &Connection, _: &QueueHandle<Self>) {}
}

/// Completes the startup sequence named `token`. Answers `Ok(false)` where
/// there is nothing to tell — no Wayland session, or a compositor without
/// `gtk_shell1` (anything but Mutter) — and an error only when talking failed.
pub fn complete(token: &str) -> Result<bool, String> {
    if std::env::var_os("WAYLAND_DISPLAY").is_none() {
        return Ok(false);
    }
    let connection = Connection::connect_to_env().map_err(|e| e.to_string())?;
    let (globals, mut queue) = registry_queue_init::<Quiet>(&connection).map_err(|e| e.to_string())?;
    let Ok(shell) = globals.bind::<GtkShell1, _, _>(&queue.handle(), 1..=1, ()) else {
        return Ok(false);
    };
    shell.set_startup_id(Some(token.to_string()));
    queue.roundtrip(&mut Quiet).map_err(|e| e.to_string())?;
    Ok(true)
}

/// The argument a launch token rides on from a second instance to the first.
const TOKEN_ARG: &str = "--activation-token=";

/// The token the desktop gave this launch, if any.
fn launch_token() -> Option<String> {
    ["XDG_ACTIVATION_TOKEN", "DESKTOP_STARTUP_ID"]
        .iter()
        .filter_map(|name| std::env::var(name).ok())
        .find(|token| !token.is_empty())
}

/// A launch that carries a token, while another instance runs, hands argv and
/// token to that instance and exits: the single-instance plugin would pass
/// only argv, and the sequence would spin until its timeout. Mirrors the
/// plugin's D-Bus call (name, path, `ExecuteCallback`); returns when there is
/// no token or nobody to hand it to, and the plugin carries on as before.
pub fn hand_over_launch(identifier: &str) {
    let Some(token) = launch_token() else { return };
    let name = format!("{identifier}.SingleInstance");
    let path = format!("/{}", name.replace('.', "/").replace('-', "_"));
    let Ok(connection) = zbus::blocking::Connection::session() else { return };
    let mut argv: Vec<String> = std::env::args().collect();
    argv.push(format!("{TOKEN_ARG}{token}"));
    let cwd = std::env::current_dir().unwrap_or_default().to_string_lossy().into_owned();
    let handed = connection.call_method(
        Some(name.as_str()),
        path.as_str(),
        Some("org.SingleInstance.DBus"),
        "ExecuteCallback",
        &(argv, cwd),
    );
    if handed.is_ok() {
        std::process::exit(0);
    }
}

/// The token a second instance handed over in its argv.
pub fn token_in(args: &[String]) -> Option<&str> {
    args.iter()
        .find_map(|arg| arg.strip_prefix(TOKEN_ARG))
        .filter(|token| !token.is_empty())
}

/// Presents the windows with the launch's token: Mutter activates the window
/// and completes the sequence (`xdg_activation_v1.activate`, through GTK).
pub fn activate<R: tauri::Runtime>(app: &tauri::AppHandle<R>, token: &str) {
    use gtk::prelude::GtkWindowExt;
    use tauri::Manager;
    let windows = app.webview_windows();
    let token = token.to_string();
    let _ = app.run_on_main_thread(move || {
        for window in windows.values() {
            if let Ok(gtk_window) = window.gtk_window() {
                gtk_window.set_startup_id(&token);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_handed_over_token_is_read_back_from_argv() {
        let args = ["jott".to_string(), format!("{TOKEN_ARG}abc_TIME0")];
        assert_eq!(token_in(&args), Some("abc_TIME0"));
        assert_eq!(token_in(&["jott".to_string(), "--hidden".to_string()]), None);
        assert_eq!(token_in(&[TOKEN_ARG.to_string()]), None);
    }
}
