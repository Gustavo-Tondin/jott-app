//! Machine preferences — the ones that must NOT travel with the notebook.
//!
//! Which notebook was open last is a property of this computer, not of the
//! notebook: syncing it would make two machines fight over which notebook is
//! "the" one. So it lives in the OS config folder, while everything about the
//! notebook itself lives in `.jott/config.json` (spec 3.4).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

const FILE_NAME: &str = "machine-prefs.json";

/// The Display choices, which answer to a SCREEN and not to a notebook
/// (2026-08-20, user call: "no meu celular quero tema escuro e no desktop tema
/// Jott").
///
/// This is the whole of the Settings screen's Display section, which is what
/// makes the split a rule instead of a list to remember: **Display is this
/// machine, every other section is the notebook.** The two choices that used
/// to sit there and are NOT about a screen moved to the section they belong to
/// rather than becoming exceptions — where a quick note lands is the
/// notebook's (Notebook), and whether an overdue task counts as urgent is a
/// rule about tasks (Day and week).
///
/// Every field is optional, and absent is not "off": it means **this machine
/// has no answer, so the notebook's is used**. That fallback is what keeps the
/// look travelling — a notebook opened on a machine that never chose comes up
/// dressed the way it was left, and diverges the moment something is picked
/// here. It is also why nothing has to be migrated: a notebook written before
/// the split keeps its values in `.jott/config.json`, they keep being read,
/// and another version of Jott still finds them where it left them.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DisplayPrefs {
    pub theme: Option<String>,
    pub accent_color: Option<String>,
    pub heading_color: Option<String>,
    pub note_font_size: Option<String>,
    pub date_display_format: Option<String>,
    pub show_list_counts: Option<bool>,
    pub restore_last_screen: Option<bool>,
    pub close_inspector_on_click_away: Option<bool>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MachinePrefs {
    last_notebook: Option<PathBuf>,
    /// The screen the user was on, as an opaque string the frontend owns
    /// (`today`, `week`, `list:Compras`…).
    ///
    /// Deliberately opaque: the shell has no business knowing what a screen
    /// is, and the frontend can add screens without touching Rust. Only used
    /// when `restoreLastScreen` is on — which since 2026-08-20 is a display
    /// preference of this machine too, so the switch and the value it governs
    /// finally answer to the same thing.
    last_screen: Option<String>,
    /// What this machine chose to look like. See `DisplayPrefs`.
    #[serde(default)]
    display: DisplayPrefs,
    /// How wide the user dragged the left sidebar, in CSS pixels
    /// (2026-08-17).
    ///
    /// A machine preference for the same reason the last screen is one: it is
    /// answering to a monitor, not to a notebook. Syncing it would make a
    /// 27-inch desktop dictate the layout of a laptop. Absent means the
    /// app's own width, and the frontend clamps whatever it reads — a value
    /// hand-edited to 3000 must not push every panel off screen.
    sidebar_width: Option<f64>,
    /// The same, for the right panel (task inspector / suggestions).
    panel_width: Option<f64>,
    /// How far the interface is zoomed, as a multiplier of the base 16px
    /// (2026-08-18).
    ///
    /// A machine preference for the same reason the two widths are: it
    /// answers to a monitor and a pair of eyes. The NOTE's own font size is
    /// the opposite case — that is reading taste, it travels with the
    /// notebook, and it lives in `.jott/config.json`.
    zoom: Option<f64>,
    /// Whether the app may look for a new version by itself (2026-08-19).
    ///
    /// A machine preference because it answers for this INSTALL, not for the
    /// notebook: the same notebook synced to a phone and a desktop is served
    /// by two different binaries, updated two different ways. Absent means
    /// on — the check is the one connection the app makes, it is explained
    /// in the settings screen, and this switch is how it is refused.
    auto_update_check: Option<bool>,
    /// When the last automatic check ran, as an ISO date-time the frontend
    /// owns. It is what keeps the check to once a day instead of once per
    /// launch.
    last_update_check: Option<String>,
    /// Whether the user waved away the offer to put Jott in the application
    /// menu (2026-08-21).
    ///
    /// A machine preference for the same reason the update switch is one: it
    /// answers for THIS install. The same notebook opened from an AppImage
    /// here and a pacman package there is one notebook and two installs, and
    /// only one of them has a menu entry to write. Absent means never asked —
    /// the offer only appears where there is something to offer, so the
    /// default costs nothing on a packaged install.
    desktop_entry_dismissed: Option<bool>,
}

/// Overrides where machine preferences are stored.
///
/// Lets someone keep the app's config somewhere else (a portable install, a
/// different XDG layout), and lets the tests point each case at its own
/// folder — these preferences are global to the machine, so tests running in
/// parallel would otherwise fight over one file.
const CONFIG_DIR_ENV: &str = "JOTT_CONFIG_DIR";

fn path_of<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os(CONFIG_DIR_ENV) {
        return Some(PathBuf::from(dir).join(FILE_NAME));
    }
    app.path().app_config_dir().ok().map(|d| d.join(FILE_NAME))
}

fn load<R: Runtime>(app: &AppHandle<R>) -> MachinePrefs {
    // Losing this file costs the user one folder pick, so every failure path
    // degrades to the default instead of surfacing an error.
    path_of(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// The notebook open when the app was last closed, if it still exists.
pub fn last_notebook<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    load(app)
        .last_notebook
        .filter(|path| jott_core::Notebook::is_notebook(path))
}

/// The screen the app was on when it last closed.
pub fn last_screen<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    load(app).last_screen
}

/// Remembers a notebook as the last one opened. Best effort: failing to
/// write must never stop the notebook from opening.
pub fn remember_notebook<R: Runtime>(app: &AppHandle<R>, notebook: &Path) {
    update(app, |prefs| {
        prefs.last_notebook = Some(notebook.to_path_buf());
    });
}

/// Remembers the current screen, so the next launch can return to it.
pub fn remember_screen<R: Runtime>(app: &AppHandle<R>, screen: &str) {
    update(app, |prefs| prefs.last_screen = Some(screen.to_string()));
}

/// How wide the sidebar was left, if it was ever dragged.
pub fn sidebar_width<R: Runtime>(app: &AppHandle<R>) -> Option<f64> {
    load(app).sidebar_width.filter(|w| w.is_finite() && *w > 0.0)
}

/// Remembers the sidebar's width. Written once per drag, on release — not on
/// every pointer move.
pub fn remember_sidebar_width<R: Runtime>(app: &AppHandle<R>, width: f64) {
    if !width.is_finite() || width <= 0.0 {
        return;
    }
    update(app, |prefs| prefs.sidebar_width = Some(width));
}

/// How wide the right panel was left, if it was ever dragged.
pub fn zoom<R: Runtime>(app: &AppHandle<R>) -> Option<f64> {
    load(app).zoom
}

pub fn remember_zoom<R: Runtime>(app: &AppHandle<R>, zoom: f64) {
    update(app, |prefs| prefs.zoom = Some(zoom));
}

pub fn panel_width<R: Runtime>(app: &AppHandle<R>) -> Option<f64> {
    load(app).panel_width.filter(|w| w.is_finite() && *w > 0.0)
}

/// Remembers it, on release.
pub fn remember_panel_width<R: Runtime>(app: &AppHandle<R>, width: f64) {
    if !width.is_finite() || width <= 0.0 {
        return;
    }
    update(app, |prefs| prefs.panel_width = Some(width));
}

/// What this machine chose to look like — every field `None` until something
/// is picked in Settings.
pub fn display<R: Runtime>(app: &AppHandle<R>) -> DisplayPrefs {
    load(app).display
}

/// Records one or more display choices. Everything the patch leaves out is
/// kept, so the settings screen can send one key at a time — the same pact
/// `set_notebook_settings` makes about the notebook's own preferences.
pub fn set_display<R: Runtime>(app: &AppHandle<R>, patch: DisplayPrefs) {
    update(app, |prefs| {
        let d = &mut prefs.display;
        if patch.theme.is_some() {
            d.theme = patch.theme;
        }
        if patch.accent_color.is_some() {
            d.accent_color = patch.accent_color;
        }
        if patch.heading_color.is_some() {
            d.heading_color = patch.heading_color;
        }
        if patch.note_font_size.is_some() {
            d.note_font_size = patch.note_font_size;
        }
        if patch.date_display_format.is_some() {
            d.date_display_format = patch.date_display_format;
        }
        if patch.show_list_counts.is_some() {
            d.show_list_counts = patch.show_list_counts;
        }
        if patch.restore_last_screen.is_some() {
            d.restore_last_screen = patch.restore_last_screen;
        }
        if patch.close_inspector_on_click_away.is_some() {
            d.close_inspector_on_click_away = patch.close_inspector_on_click_away;
        }
    });
}

/// Whether the app may check for a new version by itself. Absent means yes.
pub fn auto_update_check<R: Runtime>(app: &AppHandle<R>) -> bool {
    load(app).auto_update_check.unwrap_or(true)
}

pub fn remember_auto_update_check<R: Runtime>(app: &AppHandle<R>, on: bool) {
    update(app, |prefs| prefs.auto_update_check = Some(on));
}

/// When the last automatic check ran, if one ever did.
pub fn last_update_check<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    load(app).last_update_check
}

pub fn remember_last_update_check<R: Runtime>(app: &AppHandle<R>, when: &str) {
    update(app, |prefs| prefs.last_update_check = Some(when.to_string()));
}

/// Whether the menu-entry offer was already waved away. Absent means no.
pub fn desktop_entry_dismissed<R: Runtime>(app: &AppHandle<R>) -> bool {
    load(app).desktop_entry_dismissed.unwrap_or(false)
}

pub fn remember_desktop_entry_dismissed<R: Runtime>(app: &AppHandle<R>, dismissed: bool) {
    update(app, |prefs| {
        prefs.desktop_entry_dismissed = Some(dismissed);
    });
}

/// Reads, changes and writes the preferences. Every failure path is silent on
/// purpose: losing these costs the user one click, and none of it is worth
/// interrupting them over.
fn update<R: Runtime>(app: &AppHandle<R>, change: impl FnOnce(&mut MachinePrefs)) {
    let Some(path) = path_of(app) else { return };

    let mut prefs = load(app);
    change(&mut prefs);

    let Ok(text) = serde_json::to_string_pretty(&prefs) else {
        return;
    };
    if let Some(parent) = path.parent() {
        if std::fs::create_dir_all(parent).is_err() {
            return;
        }
    }
    if let Err(e) = std::fs::write(&path, text) {
        eprintln!("[jott] could not save machine preferences: {e}");
    }
}
