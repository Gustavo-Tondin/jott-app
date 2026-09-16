//! Ends a startup sequence the desktop opened on our behalf. GNOME opens one
//! for every button pressed on a notification (the `ActivationToken` signal)
//! and shows a busy cursor until a window takes it, or for 15 s. A button
//! that brings no window has to end it by hand: `gtk_shell1.set_startup_id`,
//! which Mutter completes the sequence on. GTK's own call is a no-op where
//! xdg-activation exists. See docs/platform-gotchas.md#ambiente

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
