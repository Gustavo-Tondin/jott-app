//! What the user chose — the two drawers of the Settings screen. The rule of
//! the split is the SECTION, not the key: Display is this machine, every other
//! section is the notebook. Both halves live in `jott_core::settings`; this
//! module is the door, plus the machine preferences with no notebook side.

use jott_core::settings::{Display, NotebookSettings};
use jott_core::Notebook;
use tauri::{AppHandle, Runtime, State};

use crate::error::{CommandError, CommandResult};
use crate::state::AppState;

/// The display choices in force, machine over notebook. One function, because
/// four doors answer with these values and must not drift. WHICH side wins is
/// `jott_core::settings::Display`; this side adds where the machine's half is.
pub(crate) fn display_of<R: Runtime>(app: &AppHandle<R>, notebook: &Notebook) -> Display {
    // The machine's half is kept PER NOTEBOOK; which side wins is the core's.
    Display::resolve(&crate::prefs::display(app, notebook.root()), notebook.config())
}

/// Which screen to open on launch. `None` means the default — the user never
/// left one, or `restoreLastScreen` is off. The value is machine-local; the
/// preference to use it travels with the notebook.
#[tauri::command]
pub async fn screen_to_restore<R: Runtime>(
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

/// "Reset this section" on a notebook page. The core says which keys a page
/// holds; an unknown page is refused rather than quietly doing nothing, so a
/// renamed section shows up as an error and not as a dead button.
#[tauri::command]
pub fn reset_settings<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    section: String,
) -> CommandResult<()> {
    let known = state.record(window.label(), "reset_settings", |nb| nb.reset_settings(&section))?;
    if !known {
        return Err(CommandError::new(
            "settings",
            format!("{section} is not a section this notebook can reset"),
        ));
    }
    Ok(())
}

/// "Reset this section" on Display: this machine stops answering for the
/// notebook, and every Display value falls back to the notebook's own.
#[tauri::command]
pub fn reset_machine_display<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<()> {
    let root = state.root_of(window.label())?;
    crate::prefs::clear_display(&app, &root);
    Ok(())
}

/// Saves one or more Display choices, on this machine and FOR THIS NOTEBOOK —
/// the asking window's. Never touches the notebook's files, so a read-only
/// notebook does not stop it. Every field is optional: the screen sends the
/// one key that changed.
#[tauri::command]
pub fn set_machine_display<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    display: crate::prefs::DisplayPrefs,
) -> CommandResult<()> {
    let root = state.root_of(window.label())?;
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
    state.record(window.label(), "set_notebook_settings", |nb| {
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
    state.record(window.label(), "set_order", |nb| nb.set_order(&namespace, names))
}

/// Records what the user said about a part of the app (`tasks`, `notes`, the
/// task fields). `on: null` forgets the opinion — sent when a switch returns
/// to its default, so the file only carries what differs from how the app
/// ships. Nothing on disk changes: this is about what the interface offers.
#[tauri::command]
pub fn set_feature<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    key: String,
    on: Option<bool>,
) -> CommandResult<()> {
    state.record(window.label(), "set_feature", |nb| nb.set_feature(&key, on))
}

/// Binds a command to a chord, or unbinds it with `chord: null`. Neither
/// string is judged here or in the core (`services/commands.js` and
/// `services/keys.js` own them); a binding this build cannot honour is
/// ignored on the way in rather than destroyed on the way out.
#[tauri::command]
pub fn set_shortcut<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    id: String,
    chord: Option<String>,
) -> CommandResult<()> {
    state.record(window.label(), "set_shortcut", |nb| nb.set_shortcut(&id, chord))
}

/// Back to the table the app ships with.
#[tauri::command]
pub fn reset_shortcuts<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>,) -> CommandResult<()> {
    state.record(window.label(), "reset_shortcuts", |nb| nb.reset_shortcuts())
}

/// How the sidebar arranges the user's spaces: `name`, or the empty string
/// for the hand-dragged order.
#[tauri::command]
pub async fn spaces_sort<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>,) -> CommandResult<String> {
    state.with_notebook(window.label(), |nb| Ok(nb.spaces_sort().to_string()))
}

/// Sets it.
#[tauri::command]
pub fn set_spaces_sort<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, sort: String) -> CommandResult<()> {
    state.record(window.label(), "set_spaces_sort", |nb| nb.set_spaces_sort(&sort))
}

/// The themes the open notebook carries (`.jott/themes/`). Read on demand,
/// never per render — it walks a folder. The app's version is handed to the
/// core because `CARGO_PKG_VERSION` is a fact about the binary, not the library.
#[tauri::command]
pub async fn user_themes<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<Vec<jott_core::themes::UserTheme>> {
    state.with_notebook(window.label(), |nb| {
        Ok(nb.themes(env!("CARGO_PKG_VERSION")))
    })
}

/// One theme's stylesheet, for the frontend to put in the document. The bytes
/// cross the bridge rather than being loaded by the page: the core has already
/// refused anything past the size cap and neutralised every outbound reference.
#[tauri::command]
pub fn user_theme_css<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    name: String,
) -> CommandResult<jott_core::themes::Stylesheet> {
    state.with_notebook(window.label(), |nb| Ok(nb.theme_css(&name)?))
}

/// Writes a new theme into the notebook, seeded with the stylesheet the
/// frontend hands over — the one the app is wearing, which lives in the
/// bundle (`src/styles/themes/*.css`) and not here.
#[tauri::command]
pub fn create_user_theme<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    name: String,
    css: String,
) -> CommandResult<jott_core::themes::UserTheme> {
    state.record(window.label(), "create_user_theme", |nb| {
        nb.create_theme(&name, &css)
    })
}
