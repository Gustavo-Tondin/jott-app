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

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MachinePrefs {
    last_notebook: Option<PathBuf>,
    /// The screen the user was on, as an opaque string the frontend owns
    /// (`today`, `week`, `list:Compras`…).
    ///
    /// Deliberately opaque: the shell has no business knowing what a screen
    /// is, and the frontend can add screens without touching Rust. Only used
    /// when the notebook has `restoreLastScreen` on — the preference travels
    /// with the notebook, the value stays on this machine.
    last_screen: Option<String>,
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
