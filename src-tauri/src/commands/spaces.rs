//! Spaces, and the groups that hold them.
//!
//! A space has one function only — it is a list of tasks or a notebook of
//! notes — and a group has none: it holds spaces and other groups in the
//! sidebar and owns no content of its own (spec 3.5).

use jott_core::Notebook;
use serde::Serialize;
use tauri::{Runtime, State};

use crate::error::CommandResult;
use crate::state::AppState;

/// A space as the navigation shows it.
///
/// `kind` is whatever the config says — an unknown one is delivered, not
/// dropped, so the UI can show its "unsupported" card and the folder stays
/// untouched (spec 3.5).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceInfo {
    /// The folder — the stable identity; renaming the folder renames the
    /// space.
    pub folder_name: String,
    /// The space's root-relative path (`Clients` at the root,
    /// `Design/Clients` inside a group) — what list addresses start with.
    pub path: String,
    /// What the user reads (config `name`, falling back to the folder).
    pub name: String,
    /// The space's single function: `tasks`, `notes`, `home`, or an
    /// unknown type this build keeps but cannot render.
    pub kind: String,
    pub known: bool,
    /// One of the three the app creates and recreates (Home, Tasks, Notes).
    pub fixed: bool,
    pub read_only: bool,
    /// The space's accent colour, if it set one (`.space.json` `color`).
    pub color: Option<String>,
    /// The space's icon name, if it set one (`.space.json` `icon`).
    pub icon: Option<String>,
    /// The ordering the space declares (`name` / `created` / `due` /
    /// `custom`…), which way it runs (`up` turns it over), and the
    /// hand-dragged arrangement `custom` puts back.
    pub sort: Option<String>,
    pub sort_direction: Option<String>,
    pub order: Vec<String>,
    /// How a notes space draws its board (`grid` / `tree`); null follows
    /// the notebook's default (`NotebookLayout::note_layout`).
    pub note_layout: Option<String>,
}

/// Sets a space's display name (empty clears it, back to the folder name).
#[tauri::command]
pub fn rename_space<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    name: String,
) -> CommandResult<()> {
    state.record(window.label(), "rename_space", |nb| nb.rename_space(&folder, &name))
}

/// Sets a space's accent colour and icon (either empty clears it).
#[tauri::command]
pub fn set_space_appearance<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    color: Option<String>,
    icon: Option<String>,
) -> CommandResult<()> {
    state.record(window.label(), "set_space_appearance", |nb| nb.set_space_appearance(&folder, color, icon))
}

/// Sends a user space to the trash (never a fixed one).
#[tauri::command]
pub fn delete_space<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, folder: String) -> CommandResult<()> {
    state.record(window.label(), "delete_space", |nb| nb.delete_space(&folder))
}

/// Sets how a space orders its items and, when `direction` is given, which
/// way (`up` / `down`); a tasks space's lists are rewritten in that order.
#[tauri::command]
pub fn set_space_sort<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    space: String,
    sort: Option<String>,
    direction: Option<String>,
) -> CommandResult<()> {
    state.record(window.label(), "set_space_sort", |nb| {
        nb.set_space_sort(&space, sort.as_deref(), direction.as_deref())
    })
}

/// Sets how a notes space draws its board (`grid` / `tree`; null = the
/// notebook's default).
#[tauri::command]
pub fn set_space_note_layout<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    space: String,
    layout: Option<String>,
) -> CommandResult<()> {
    state.record(window.label(), "set_space_note_layout", |nb| nb.set_space_note_layout(&space, layout.as_deref()))
}

/// Saves the hand-dragged arrangement in the space's `.space.json`
/// and switches it to the custom ordering.
#[tauri::command]
pub fn set_space_order<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    space: String,
    order: Vec<String>,
) -> CommandResult<()> {
    state.record(window.label(), "set_space_order", |nb| nb.set_space_order(&space, order))
}

// ---- groups (reestruturação 2026-07-30) ----

/// A group of spaces, as the sidebar shows it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupInfo {
    pub folder: String,
    /// The group this one sits in; null at the root (groups nest).
    pub parent: Option<String>,
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    /// The leaf names of the spaces it holds directly, in the notebook's
    /// own order — the order the user dragged.
    pub spaces: Vec<String>,
}

pub(crate) fn groups_of(nb: &Notebook) -> CommandResult<Vec<GroupInfo>> {
    let mut out = Vec::new();
    for g in nb.groups()? {
        out.push(GroupInfo {
            // The FOLDER is the name (2026-08-13), for a group exactly as for
            // a space: no second copy in the marker to drift away from it,
            // and renaming the folder outside the app renames the group here.
            name: g.folder.clone(),
            color: g.config.color.clone(),
            icon: g.config.icon.clone(),
            folder: g.folder,
            parent: g.parent,
            spaces: g.spaces,
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn groups<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>,) -> CommandResult<Vec<GroupInfo>> {
    state.with_notebook(window.label(), groups_of)
}

/// Creates a group at the root, or inside another group when `group` is given.
#[tauri::command]
pub fn create_group<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    name: String,
    group: Option<String>,
) -> CommandResult<String> {
    state.record(window.label(), "create_group", |nb| nb.create_group(&name, group.as_deref()))
}

/// Moves a group — with everything under it — into another group, or back to
/// the root when `into_group` is null.
#[tauri::command]
pub fn move_group<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    name: String,
    into_group: Option<String>,
) -> CommandResult<()> {
    state.record(window.label(), "move_group", |nb| nb.move_group(&name, into_group.as_deref()))
}

#[tauri::command]
pub fn rename_group<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, folder: String, name: String) -> CommandResult<()> {
    state.record(window.label(), "rename_group", |nb| nb.rename_group(&folder, &name))
}

#[tauri::command]
pub fn set_group_appearance<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    folder: String,
    color: Option<String>,
    icon: Option<String>,
) -> CommandResult<()> {
    state.record(window.label(), "set_group_appearance", |nb| nb.set_group_appearance(&folder, color, icon))
}

#[tauri::command]
pub fn delete_group<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, folder: String) -> CommandResult<()> {
    state.record(window.label(), "delete_group", |nb| nb.delete_group(&folder))
}

#[tauri::command]
pub fn move_space<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    name: String,
    into_group: Option<String>,
) -> CommandResult<()> {
    state.record(window.label(), "move_space", |nb| nb.move_space(&name, into_group.as_deref()))
}

#[tauri::command]
pub fn create_space_in<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    name: String,
    kind: String,
    group: Option<String>,
) -> CommandResult<String> {
    state.record(window.label(), "create_space_in", |nb| nb.create_space_in(&name, &kind, group.as_deref()))
}

pub(crate) fn spaces_of(nb: &Notebook) -> CommandResult<Vec<SpaceInfo>> {
    let mut out = Vec::new();
    for space in nb.spaces()? {
        let path = jott_core::relpath::relative_slash(nb.root(), space.root());
        out.push(SpaceInfo {
            folder_name: space.folder_name().to_string(),
            path,
            name: space.display_name().to_string(),
            kind: space.kind().to_string(),
            known: space.config.is_known(),
            // The core's rule, not a second list: it is also what enforces
            // the protection this flag lets the UI draw (greyed-out delete).
            fixed: Notebook::is_fixed_space(space.folder_name()),
            read_only: space.config.is_read_only(),
            color: space.config.color.clone(),
            icon: space.config.icon.clone(),
            sort: space.config.sort.clone(),
            sort_direction: space.config.sort_direction.clone(),
            order: space.config.order.clone(),
            note_layout: space.config.note_layout.clone(),
        });
    }
    Ok(out)
}
