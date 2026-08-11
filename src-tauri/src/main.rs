// Prevents an extra console window from opening on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's DMABUF renderer crashes the Wayland connection on several
    // drivers ("Gdk-Message: Error 71 dispatching to Wayland display"), which
    // kills the window before it is drawn. Retested 2026-07-27: still crashes
    // on GNOME/Wayland here, so the fallback renderer stays forced. Its cost:
    // it never clears the alpha buffer between repaints, so any large
    // semi-transparent area darkens a little on every interaction — which is
    // why the frameless window draws NO shadow and keeps transparency down to
    // the 1px antialiasing of its rounded corners. Disabling must happen
    // before GTK initializes; honour the value if the user already set one.
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    jott_lib::run()
}
