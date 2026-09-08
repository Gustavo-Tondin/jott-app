//! Machine preferences — the ones that must NOT travel with the notebook.
//! Which notebook was open last is a property of this computer; syncing it
//! would make two machines fight. Lives in the OS config folder, while the
//! notebook's own lives in `.jott/config.json`.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

const FILE_NAME: &str = "machine-prefs.json";

// What a machine may choose to look like, and how a patch is taken, are
// `jott_core::settings`' — a rule about the product, not about where a file
// is kept. This module knows only the file.
pub use jott_core::settings::DisplayPrefs;

/// A notebook this machine has opened, and when it last did. The picker's
/// whole list — a machine preference because paths on THIS computer say
/// nothing on another.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recent {
    pub path: PathBuf,
    /// RFC 3339, local — the stamp the card turns into "42 min ago".
    pub opened: String,
}

/// How many notebooks the picker remembers: the file is rewritten on every
/// open, and twenty is past the point where a list becomes a search.
const RECENTS_KEPT: usize = 20;

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MachinePrefs {
    last_notebook: Option<PathBuf>,
    /// Every notebook this machine has opened, newest first. Nothing is dropped
    /// for being unreachable — an unplugged drive is not a gone notebook; what
    /// cannot be summarized does not draw a card, and the ⋮ forgets on purpose.
    #[serde(default)]
    recent_notebooks: Vec<Recent>,
    /// The screen the user was on, as an opaque string the frontend owns
    /// (`today`, `list:Compras`…) — the shell has no business knowing what a
    /// screen is. Only used when `restoreLastScreen` (a display preference) is on.
    last_screen: Option<String>,
    /// What each NOTEBOOK looks like on this machine: per machine AND per
    /// notebook, so the work notebook can be the dark one without dragging the
    /// personal one along. Keyed by the notebook's absolute path, so it
    /// travels with a rename (`notebook_moved`) as the recents list does.
    #[serde(default)]
    notebook_display: std::collections::BTreeMap<PathBuf, DisplayPrefs>,
    /// The machine-wide choices from before they were scoped to a notebook.
    /// Read as the seed for a notebook with no entry of its own; never
    /// written to again.
    #[serde(default)]
    display: DisplayPrefs,
    /// How wide the user dragged the left sidebar, in CSS pixels. A machine
    /// preference: it answers to a monitor, not a notebook. Absent means the
    /// app's own width; the frontend clamps whatever it reads.
    sidebar_width: Option<f64>,
    /// The same, for the right panel (task inspector / suggestions).
    panel_width: Option<f64>,
    /// How far the interface is zoomed, as a multiplier of the base 16px. A
    /// machine preference (a monitor and a pair of eyes); the NOTE's font size
    /// is reading taste and travels with the notebook.
    zoom: Option<f64>,
    /// Whether the app may look for a new version by itself. Answers for this
    /// INSTALL: the same notebook on a phone and a desktop is served by two
    /// binaries. Absent means on — the check is explained in Settings.
    auto_update_check: Option<bool>,
    /// Closing the window keeps the app alive in the tray, so reminders still
    /// ring. `None` means on. Whether there IS a tray is a fact about this desktop.
    close_to_tray: Option<bool>,
    /// Up to what moment this machine has already rung a notebook's
    /// reminders, keyed by the notebook's absolute path. What stops a
    /// reminder from ringing again on every launch, and what makes the ones
    /// missed while the app was closed ring ONCE when it comes back.
    #[serde(default)]
    reminded_until: std::collections::BTreeMap<PathBuf, String>,
    /// When the last automatic check ran, as an ISO date-time the frontend
    /// owns. It is what keeps the check to once a day instead of once per
    /// launch.
    last_update_check: Option<String>,
    /// Whether the user waved away the offer to put Jott in the application
    /// menu. Answers for THIS install: an AppImage and a pacman package are
    /// two installs, and only one has a menu entry to write. Absent means
    /// never asked — the offer only appears where there is something to offer.
    desktop_entry_dismissed: Option<bool>,
    /// Whether the picker's window closes once it has opened a notebook, and
    /// whether the app opens on the picker rather than on the last notebook.
    /// Set in the picker's ⋮. About WINDOWS, so about this screen: the phone
    /// has no second window at all.
    picker_closes: Option<bool>,
    opens_on_picker: Option<bool>,
}

/// Overrides where machine preferences are stored — a portable install, a
/// different XDG layout, and each test pointed at its own folder (these are
/// global to the machine, so parallel tests would fight over one file).
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

/// Remembers a notebook as the last one opened, and moves it to the top of
/// the picker's list. Best effort: failing to write must never stop the
/// notebook from opening.
pub fn remember_notebook<R: Runtime>(app: &AppHandle<R>, notebook: &Path) {
    let opened = chrono::Local::now().to_rfc3339();
    update(app, |prefs| {
        prefs.last_notebook = Some(notebook.to_path_buf());
        // Opened again, not opened twice: the entry moves to the front rather
        // than joining a second copy of itself further down.
        prefs.recent_notebooks.retain(|entry| entry.path != notebook);
        prefs.recent_notebooks.insert(
            0,
            Recent {
                path: notebook.to_path_buf(),
                opened,
            },
        );
        prefs.recent_notebooks.truncate(RECENTS_KEPT);
    });
}

/// Every notebook this machine has opened, newest first.
pub fn recent_notebooks<R: Runtime>(app: &AppHandle<R>) -> Vec<Recent> {
    load(app).recent_notebooks
}

/// Drops one from the list. The folder is not touched — this is the machine
/// forgetting a notebook, which is the only thing a picker may do to one
/// without being asked twice.
pub fn forget_notebook<R: Runtime>(app: &AppHandle<R>, notebook: &Path) {
    update(app, |prefs| {
        prefs.recent_notebooks.retain(|entry| entry.path != notebook);
        if prefs.last_notebook.as_deref() == Some(notebook) {
            prefs.last_notebook = None;
        }
    });
}

/// Follows a notebook that was renamed or moved: every path here is absolute,
/// so a folder that travels would leave a card pointing nowhere. Called by
/// whoever did the moving, with the path the core answered.
pub fn notebook_moved<R: Runtime>(app: &AppHandle<R>, from: &Path, to: &Path) {
    update(app, |prefs| {
        for entry in &mut prefs.recent_notebooks {
            if entry.path == from {
                entry.path = to.to_path_buf();
            }
        }
        if let Some(until) = prefs.reminded_until.remove(from) {
            prefs.reminded_until.insert(to.to_path_buf(), until);
        }
        if prefs.last_notebook.as_deref() == Some(from) {
            prefs.last_notebook = Some(to.to_path_buf());
        }
        // Its appearance is filed under the same absolute path and moves with it.
        if let Some(look) = prefs.notebook_display.remove(from) {
            prefs.notebook_display.insert(to.to_path_buf(), look);
        }
    });
}

/// Remembers the current screen, so the next launch can return to it.
pub fn remember_screen<R: Runtime>(app: &AppHandle<R>, screen: &str) {
    update(app, |prefs| prefs.last_screen = Some(screen.to_string()));
}

/// A width worth keeping: finite and above zero. Anything else — a NaN from
/// a broken drag, a hand-edited `-1` — is treated as never set, on the way in
/// and on the way out alike.
fn positive(value: f64) -> Option<f64> {
    (value.is_finite() && value > 0.0).then_some(value)
}

/// How wide the sidebar was left, if it was ever dragged.
pub fn sidebar_width<R: Runtime>(app: &AppHandle<R>) -> Option<f64> {
    load(app).sidebar_width.and_then(positive)
}

/// Remembers the sidebar's width. Written once per drag, on release — not on
/// every pointer move.
pub fn remember_sidebar_width<R: Runtime>(app: &AppHandle<R>, width: f64) {
    let Some(width) = positive(width) else { return };
    update(app, |prefs| prefs.sidebar_width = Some(width));
}

/// How far the interface is zoomed, if it was ever changed. Not validated
/// here: the frontend clamps whatever it reads, so a hand-edited 40 is
/// brought back into range rather than dropped.
pub fn zoom<R: Runtime>(app: &AppHandle<R>) -> Option<f64> {
    load(app).zoom
}

pub fn remember_zoom<R: Runtime>(app: &AppHandle<R>, zoom: f64) {
    update(app, |prefs| prefs.zoom = Some(zoom));
}

/// How wide the right panel was left, if it was ever dragged.
pub fn panel_width<R: Runtime>(app: &AppHandle<R>) -> Option<f64> {
    load(app).panel_width.and_then(positive)
}

/// Remembers it, on release.
pub fn remember_panel_width<R: Runtime>(app: &AppHandle<R>, width: f64) {
    let Some(width) = positive(width) else { return };
    update(app, |prefs| prefs.panel_width = Some(width));
}

/// What this machine chose THIS NOTEBOOK to look like — every field `None`
/// until something is picked in Settings, and then the notebook's own value
/// answers (`jott_core::settings::Display::resolve`).
pub fn display<R: Runtime>(app: &AppHandle<R>, notebook: &Path) -> DisplayPrefs {
    let prefs = load(app);
    prefs
        .notebook_display
        .get(notebook)
        .cloned()
        // No entry of its own: the choices this file held before they were
        // scoped, so nobody's theme is lost by the scoping.
        .unwrap_or(prefs.display)
}

/// Records one or more display choices for one notebook. Everything the patch
/// leaves out is kept, so the settings screen can send one key at a time — the
/// same pact `set_notebook_settings` makes about the notebook's own
/// preferences.
pub fn set_display<R: Runtime>(app: &AppHandle<R>, notebook: &Path, patch: DisplayPrefs) {
    update(app, |prefs| {
        // A notebook being dressed for the first time starts from what the
        // machine already looked like, not from nothing — otherwise the first
        // click in Settings would also reset the theme.
        let seed = prefs.display.clone();
        prefs
            .notebook_display
            .entry(notebook.to_path_buf())
            .or_insert(seed)
            .patch(patch);
    });
}

/// This machine stops answering for `notebook`'s looks: an entry of its own
/// with every field `None`, so the notebook's config decides — not the
/// machine-wide `display`, which is what a MISSING entry falls back to.
pub fn clear_display<R: Runtime>(app: &AppHandle<R>, notebook: &Path) {
    update(app, |prefs| {
        prefs
            .notebook_display
            .insert(notebook.to_path_buf(), DisplayPrefs::default());
    });
}

/// Whether the app may check for a new version by itself. Absent means yes.
pub fn auto_update_check<R: Runtime>(app: &AppHandle<R>) -> bool {
    load(app).auto_update_check.unwrap_or(true)
}

pub fn remember_auto_update_check<R: Runtime>(app: &AppHandle<R>, on: bool) {
    update(app, |prefs| prefs.auto_update_check = Some(on));
}

pub fn close_to_tray<R: Runtime>(app: &AppHandle<R>) -> bool {
    load(app).close_to_tray.unwrap_or(true)
}

pub fn remember_close_to_tray<R: Runtime>(app: &AppHandle<R>, on: bool) {
    update(app, |prefs| prefs.close_to_tray = Some(on));
}

/// The moment up to which `notebook`'s reminders have rung on this machine,
/// as the task file writes it (`2026-07-25T09:00`). `None` = never.
pub fn reminded_until<R: Runtime>(app: &AppHandle<R>, notebook: &Path) -> Option<String> {
    load(app).reminded_until.get(notebook).cloned()
}

pub fn remember_reminded_until<R: Runtime>(app: &AppHandle<R>, notebook: &Path, until: &str) {
    update(app, |prefs| {
        prefs.reminded_until.insert(notebook.to_path_buf(), until.to_string());
    });
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

/// Whether the picker's window closes once it has opened a notebook.
/// Absent means it does — see `commands::shell::picker_closes` for why.
pub fn picker_closes<R: Runtime>(app: &AppHandle<R>) -> bool {
    load(app).picker_closes.unwrap_or(true)
}

pub fn remember_picker_closes<R: Runtime>(app: &AppHandle<R>, closes: bool) {
    update(app, |prefs| prefs.picker_closes = Some(closes));
}

/// Whether the app opens on the picker instead of on the last notebook.
/// Absent means the last notebook.
pub fn opens_on_picker<R: Runtime>(app: &AppHandle<R>) -> bool {
    load(app).opens_on_picker.unwrap_or(false)
}

pub fn remember_opens_on_picker<R: Runtime>(app: &AppHandle<R>, on: bool) {
    update(app, |prefs| prefs.opens_on_picker = Some(on));
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
    if let Err(e) = jott_core::fsio::write_atomically(&path, text.as_bytes()) {
        eprintln!("[jott] could not save machine preferences: {e}");
    }
}
