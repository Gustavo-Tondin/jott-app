//! What the user chose — the two drawers of the Settings screen.
//!
//! **The rule of the split is the SECTION, not the key: Display is this
//! machine, every other section is the notebook** (2026-08-20). Both halves of
//! that rule live in `jott_core::settings`, which is also where the two merge
//! policies are; this module is the door to them, plus the machine
//! preferences that never had a notebook side at all (the panel widths, the
//! zoom, the screen to reopen).

use jott_core::settings::{Display, NotebookSettings};
use jott_core::Notebook;
use tauri::{AppHandle, Runtime, State};

use crate::error::CommandResult;
use crate::state::AppState;

/// The display choices in force, machine over notebook.
///
/// One function, because four doors answer with these values — the layout, the
/// settings screen, the sidebar's counters and the screen to restore — and
/// they must not drift about which side wins. WHICH side wins is
/// `jott_core::settings::Display`; what this side adds is where the machine's
/// half is kept.
pub(crate) fn display_of<R: Runtime>(app: &AppHandle<R>, notebook: &Notebook) -> Display {
    // The machine's half is kept PER NOTEBOOK since 2026-08-24 — the work
    // notebook can be the dark one here without dragging the personal one into
    // the dark with it. Which side wins is still the core's.
    Display::resolve(&crate::prefs::display(app, notebook.root()), notebook.config())
}

/// Which screen to open on launch.
///
/// `None` means "use the default" — either the user never left one, or the
/// notebook has `restoreLastScreen` off. The value itself is machine-local;
/// the preference to use it travels with the notebook.
#[tauri::command]
pub fn screen_to_restore<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<Option<String>> {
    state.with_notebook(window.label(), |nb| {
        if !display_of(&app, nb).restore_last_screen {
            return Ok(None);
        }
        Ok(crate::prefs::last_screen(&app))
    })
}

/// Records the current screen. No-op when the notebook has the preference off,
/// so turning it on later does not restore a screen from months ago.
#[tauri::command]
pub fn remember_screen<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    screen: String,
) -> CommandResult<()> {
    state.with_notebook(window.label(), |nb| {
        if display_of(&app, nb).restore_last_screen {
            crate::prefs::remember_screen(&app, &screen);
        }
        Ok(())
    })
}

/// How wide the sidebar was left last time, in CSS pixels — `None` when it was
/// never dragged. It needs no notebook: the panel is drawn before one is open.
#[tauri::command]
pub fn sidebar_width<R: Runtime>(app: AppHandle<R>) -> Option<f64> {
    crate::prefs::sidebar_width(&app)
}

/// Remembers it, once per drag.
#[tauri::command]
pub fn remember_sidebar_width<R: Runtime>(app: AppHandle<R>, width: f64) {
    crate::prefs::remember_sidebar_width(&app, width);
}

/// The same pair for the right panel — the inspector and the suggestions
/// share one width, because they share one panel.
#[tauri::command]
pub fn panel_width<R: Runtime>(app: AppHandle<R>) -> Option<f64> {
    crate::prefs::panel_width(&app)
}

#[tauri::command]
pub fn remember_panel_width<R: Runtime>(app: AppHandle<R>, width: f64) {
    crate::prefs::remember_panel_width(&app, width);
}

/// How far the interface is zoomed. The frontend clamps whatever it reads —
/// a value hand-edited to 40 must not make the app unusable with no way back.
#[tauri::command]
pub fn zoom<R: Runtime>(app: AppHandle<R>) -> Option<f64> {
    crate::prefs::zoom(&app)
}

#[tauri::command]
pub fn remember_zoom<R: Runtime>(app: AppHandle<R>, zoom: f64) {
    crate::prefs::remember_zoom(&app, zoom);
}

/// Every notebook preference in force, for the settings screen to draw. The
/// Display half comes back from the MACHINE — see the module header.
#[tauri::command]
pub fn notebook_settings<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<NotebookSettings> {
    state.with_notebook(window.label(), |nb| Ok(NotebookSettings::of(nb.config(), &display_of(&app, nb))))
}

/// Saves one or more Display choices, on this machine and FOR THIS NOTEBOOK
/// (2026-08-20, scoped to a notebook 2026-08-24).
///
/// It goes nowhere near the notebook's own files, which is why it needs no
/// `ensure_writable` and why a read-only notebook does not stop it — the same
/// reasoning the update check is written under. What it does need is to know
/// WHICH notebook it is dressing, and that is the asking window's.
///
/// Every field is optional on the way in: the screen sends the one key that
/// changed.
#[tauri::command]
pub fn set_machine_display<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    display: crate::prefs::DisplayPrefs,
) -> CommandResult<()> {
    let root = state.with_notebook(window.label(), |nb| Ok(nb.root().to_path_buf()))?;
    crate::prefs::set_display(&app, &root, display);
    Ok(())
}

/// Saves the notebook's preferences. What each value means on the way in —
/// unparseable falls back to the core's default, absent is left exactly as it
/// was — is `jott_core::settings::NotebookSettings::apply_to`, so a second
/// frontend writes this file under the same rules.
#[tauri::command]
pub fn set_notebook_settings<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    settings: NotebookSettings,
) -> CommandResult<()> {
    state.write(window.label(), |nb| {
        let mut config = nb.config().clone();
        settings.apply_to(&mut config);
        nb.set_config(config)
    })
}

/// Records a manual order for a namespace (`"spaces"`, `"lists:<folder>"`),
/// written by dragging in the sidebar. An empty list clears it.
#[tauri::command]
pub fn set_order<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    namespace: String,
    names: Vec<String>,
) -> CommandResult<()> {
    state.write(window.label(), |nb| nb.set_order(&namespace, names))
}

/// Records what the user said about a part of the app (`tasks`, `notes`, and
/// the task fields under them). `on: null` forgets the opinion — the interface
/// sends that when a switch returns to its default, so the file only carries
/// what differs from how the app ships. Nothing on disk changes either way:
/// this is about what the interface offers, never about the notebook.
#[tauri::command]
pub fn set_feature<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    key: String,
    on: Option<bool>,
) -> CommandResult<()> {
    state.write(window.label(), |nb| nb.set_feature(&key, on))
}

/// Binds a command to a chord, or unbinds it with `chord: null`.
///
/// Neither string is judged here or in the core: the registry of commands and
/// the spelling of a chord are the frontend's (`services/commands.js`,
/// `services/keys.js`), and a binding this build cannot honour is simply
/// ignored on the way in rather than destroyed on the way out.
#[tauri::command]
pub fn set_shortcut<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    id: String,
    chord: Option<String>,
) -> CommandResult<()> {
    state.write(window.label(), |nb| nb.set_shortcut(&id, chord))
}

/// Back to the table the app ships with.
#[tauri::command]
pub fn reset_shortcuts<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>,) -> CommandResult<()> {
    state.write(window.label(), |nb| nb.reset_shortcuts())
}

/// How the sidebar arranges the user's spaces: `name`, or the empty string
/// for the hand-dragged order.
#[tauri::command]
pub fn spaces_sort<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>,) -> CommandResult<String> {
    state.with_notebook(window.label(), |nb| Ok(nb.spaces_sort().to_string()))
}

/// Sets it.
#[tauri::command]
pub fn set_spaces_sort<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, sort: String) -> CommandResult<()> {
    state.write(window.label(), |nb| nb.set_spaces_sort(&sort))
}
