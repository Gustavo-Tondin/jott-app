//! Spaces: the folders that hold the user's content, and the primitives that
//! move any marked folder around. A space carries a `.space.json` with its
//! type (`tasks` or `notes`, fixed at creation); its identity is its
//! **root-relative path**, not its leaf. `create_marked_folder`, `relocate`
//! and `parent_group_of` serve groups too (`super::groups`).

use std::path::{Path, PathBuf};

use crate::arrange::{Arrangement, CUSTOM_SORT, REVERSED};
use crate::error::{Error, IoContext, Result};
use crate::{COMPLETED_LIST, NOTES_DIR, TASKS_DIR};

use super::*;

/// Where a function sits under the `type` sort: lists first, notepads
/// after, and a type this build cannot read at the end. Home is fixed and
/// is not named in the dragged order either, so it keeps the front.
fn type_rank(kind: &str) -> u8 {
    match kind {
        "home" => 0,
        "tasks" => 1,
        "notes" => 2,
        _ => 3,
    }
}

impl Notebook {
    /// The spaces of this notebook: every folder carrying a `.space.json`,
    /// at the root or inside a group. Folders without the marker are ignored:
    /// a stray folder must never turn into interface on its own.
    pub fn spaces(&self) -> Result<Vec<crate::space::Space>> {
        // Groups nest, so `group_dirs` walks the whole tree. A space's
        // identity is its ROOT-RELATIVE PATH, never the leaf (see `open_space`).
        let mut found = Vec::new();
        self.collect_spaces(&self.root, &mut found)?;
        for group_dir in self.group_dirs()? {
            self.collect_spaces(&group_dir, &mut found)?;
        }
        // By PATH, so a space sorts under the group it belongs to and two
        // spaces sharing a leaf name are two different entries.
        let path_of = |sp: &crate::space::Space| {
            crate::relpath::relative_slash(&self.root, sp.root())
        };
        found.sort_by_key(path_of);
        // `name` sorts by what the user READS, not the folder. Anything else,
        // including the default, is the hand-dragged order; fixed spaces are
        // not named in it and keep their place.
        let by_name = |a: &crate::space::Space, b: &crate::space::Space| {
            a.display_name()
                .to_lowercase()
                .cmp(&b.display_name().to_lowercase())
        };
        match self.config.spaces_sort.as_str() {
            "name" => found.sort_by(by_name),
            // `type` puts every list before every notepad, by name inside
            // each half, so the arrangement is stable under a rename.
            "type" => found.sort_by(|a, b| {
                type_rank(a.kind())
                    .cmp(&type_rank(b.kind()))
                    .then_with(|| by_name(a, b))
            }),
            _ => {
            let keys: Vec<String> = found.iter().map(path_of).collect();
            let mut zipped: Vec<(String, crate::space::Space)> =
                keys.into_iter().zip(found.drain(..)).collect();
            self.config
                .apply_order("spaces", &mut zipped, |entry| &entry.0);
            found = zipped.into_iter().map(|(_, sp)| sp).collect();
            }
        }
        Ok(found)
    }

    /// Every space's root-relative path, mapped to the name the user reads —
    /// the one place that answers "what is this address called?".
    pub(super) fn space_labels(&self) -> Result<std::collections::HashMap<String, String>> {
        Ok(self
            .spaces()?
            .into_iter()
            .map(|sp| {
                let path = crate::relpath::relative_slash(&self.root, sp.root());
                // The label is the space's READABLE ADDRESS, not just its
                // name: `Design/Tasks` inside a group, `Mercado` when loose —
                // two spaces called Tasks in two groups are normal. A group's
                // name IS its folder; only the leaf can differ (`jott.*`).
                let mut parts: Vec<&str> = path.split('/').collect();
                if let Some(last) = parts.last_mut() {
                    *last = sp.display_name();
                }
                (path.clone(), parts.join("/"))
            })
            .collect())
    }

    /// Collects the space subfolders directly inside `dir`.
    pub(super) fn collect_spaces(
        &self,
        dir: &std::path::Path,
        out: &mut Vec<crate::space::Space>,
    ) -> Result<()> {
        for path in
            crate::space::marker_dirs(dir, crate::space::SPACE_CONFIG_FILE)?
        {
            out.push(crate::space::Space::open(path)?);
        }
        Ok(())
    }

    /// Every space folder of a given type, as (root-relative prefix,
    /// absolute dir): the walk behind `task_folders` and `note_folders`.
    pub(super) fn typed_space_dirs(&self, kind: &str) -> Result<Vec<(String, PathBuf)>> {
        let mut found = Vec::new();
        for space in self.spaces()? {
            if space.kind() != kind {
                continue;
            }
            let dir = space.root().to_path_buf();
            found.push((crate::relpath::relative_slash(&self.root, &dir), dir));
        }
        Ok(found)
    }

    /// How the sidebar arranges spaces: `"name"`, `"type"` or the dragged
    /// order (empty).
    pub fn spaces_sort(&self) -> &str {
        &self.config.spaces_sort
    }

    /// Sets it. Anything but `"name"` or `"type"` means the hand-dragged
    /// order, which is what an untouched notebook already does — and the
    /// dragged order is never touched by a sort, so going back restores it.
    pub fn set_spaces_sort(&mut self, sort: &str) -> Result<()> {
        self.edit_config(|config| {
            config.spaces_sort = match sort {
                "name" | "type" => sort.to_string(),
                _ => String::new(),
            };
        })
    }

    /// The three spaces the app creates and recreates — never renamed,
    /// deleted, nor treated as user content. Public because the interface
    /// greys out what this refuses, from this rule and not a copy of it.
    pub fn is_fixed_space(folder: &str) -> bool {
        folder == crate::HOME_DIR || folder == TASKS_DIR || folder == NOTES_DIR
    }

    /// Validates a space folder name (user input): a safe single component,
    /// not hidden. Shared by create and open.
    pub(super) fn check_space_name(name: &str) -> Result<()> {
        if !crate::relpath::is_safe_leaf(name) {
            return Err(Error::InvalidSpaceName(name.to_string()));
        }
        // `assets/` is the notebook's image library at the root. Refused by
        // NAME wherever the space would go, like `completed` and `task-list`:
        // a word the app writes files under is not a folder name.
        if name.eq_ignore_ascii_case(crate::assets::ASSETS_DIR) {
            return Err(Error::InvalidSpaceName(format!("{name} is reserved")));
        }
        Ok(())
    }

    /// Creates a user space at the root: a folder carrying a `.space.json`
    /// with the chosen type (`tasks` or `notes`), born usable (`task-list.md`
    /// plus `completed.md`, or the Inbox folder). Returns the folder name.
    pub fn create_space(&self, name: &str, kind: &str) -> Result<String> {
        self.create_space_in(name, kind, None)
    }

    /// Creates a space at the root or inside a group; returns its
    /// root-relative path, the address it is opened by.
    pub fn create_space_in(
        &self,
        name: &str,
        kind: &str,
        into_group: Option<&str>,
    ) -> Result<String> {
        self.ensure_writable()?;
        if !["tasks", "notes"].contains(&kind) {
            return Err(Error::InvalidSpaceName(format!(
                "unknown space type {kind:?}"
            )));
        }
        let parent = match into_group {
            Some(group) => self.open_group(group)?.0,
            None => self.root.clone(),
        };
        let config = crate::space::SpaceConfig::new(kind);
        let folder = self.create_marked_folder(
            name,
            &parent,
            crate::space::SPACE_CONFIG_FILE,
            &config.render(),
        )?;
        // Born usable: a tasks space gets its list and Completed; a notes
        // space gets its Inbox folder.
        let dir = self.resolve_space_path(&folder)?;
        if kind == "tasks" {
            crate::folder::TaskFolder::new(dir).ensure_default_lists()?;
        } else {
            crate::notefolder::NoteFolder::new(dir).ensure_default_folders()?;
        }
        Ok(folder)
    }

    /// Creates a folder that carries a marker — a space or a group: a safe
    /// leaf, free among its siblings, plus the marker file that turns it into
    /// interface. Only the marker (and its body) differs.
    pub(super) fn create_marked_folder(
        &self,
        name: &str,
        parent: &Path,
        marker: &str,
        body: &str,
    ) -> Result<String> {
        let folder = name.trim();
        Self::check_space_name(folder)?;
        // `completed` and `task-list` are refused by name: a folder and a
        // file called the same thing inside it is a trap outside the app.
        if Self::is_fixed_space(folder)
            || folder.eq_ignore_ascii_case(COMPLETED_LIST)
            || folder.eq_ignore_ascii_case(crate::MAIN_LIST)
        {
            return Err(Error::InvalidSpaceName(format!("{folder} is reserved")));
        }
        // Free HERE, not notebook-wide: the PATH is the identity, so two
        // groups may each hold a `Tasks/`. The only collision is a sibling.
        let dir = parent.join(folder);
        if dir.exists() {
            return Err(Error::InvalidSpaceName(format!("{folder} already exists")));
        }
        std::fs::create_dir_all(&dir).ctx(&dir)?;
        crate::fsio::write_atomically(dir.join(marker), body.as_bytes())?;
        // The PATH, not the leaf: it is the address the caller will open the
        // new space by, and inside a group the leaf is not enough.
        Ok(crate::relpath::relative_slash(&self.root, &dir))
    }

    /// Changes a space's own `.space.json`, through the same tolerant
    /// config type discovery reads.
    pub(super) fn with_space_config(
        &self,
        folder: &str,
        change: impl FnOnce(&mut crate::space::SpaceConfig),
    ) -> Result<()> {
        self.ensure_writable()?;
        let sp = self.open_space(folder)?;
        let path = sp.config_path();
        let mut config = sp.config;
        change(&mut config);
        config.save(path)
    }

    /// Sets how a space arranges its items and, when `direction` is given,
    /// which way (`up` turns it over; anything else is the default). A tasks
    /// space then REWRITES its lists in that order — the `.md` is the order —
    /// and `custom` (or nothing) puts back the saved one, `order`.
    pub fn set_space_sort(
        &self,
        folder: &str,
        sort: Option<&str>,
        direction: Option<&str>,
    ) -> Result<()> {
        self.with_space_config(folder, |config| {
            config.sort = sort.map(str::to_string);
            if let Some(direction) = direction {
                config.sort_direction = (direction == REVERSED).then(|| REVERSED.to_string());
            }
        })?;
        self.rearrange_space(folder)
    }

    /// Rewrites every open list of a tasks space in its arrangement: the sort,
    /// or the saved order when it is `custom`. A list already in order is not
    /// written; a notes space has no file to rewrite.
    fn rearrange_space(&self, folder: &str) -> Result<()> {
        let space = self.open_space(folder)?;
        if space.kind() != "tasks" {
            return Ok(());
        }
        let custom = !Arrangement::of(&space.config).is_by_field();
        for path in self.space_list_paths(folder)? {
            let mut list = self.open_list(&path)?;
            let before = list.render();
            if custom {
                list.apply_order(&space.config.order);
            }
            list.settle();
            if list.render() != before {
                list.save()?;
            }
        }
        Ok(())
    }

    /// The open lists of a tasks space by address — every one but Completed.
    fn space_list_paths(&self, folder: &str) -> Result<Vec<String>> {
        let dir = self.resolve_space_path(folder)?;
        Ok(crate::folder::TaskFolder::new(dir)
            .list_names()?
            .into_iter()
            .filter(|name| name != COMPLETED_LIST)
            .map(|name| format!("{folder}/{name}.md"))
            .collect())
    }

    /// Gives a sort BY FIELD up when a space's lists no longer follow it —
    /// someone reordered a file outside the app (an editor, a sync) — and the
    /// file order becomes the space's custom order. Only the `.space.json` is
    /// written. `changed` narrows the check to the spaces holding those files
    /// (absolute paths, as the watcher reports them); `None` checks every
    /// tasks space. Answers the spaces that gave way.
    pub fn yield_to_file_order(&self, changed: Option<&[PathBuf]>) -> Result<Vec<String>> {
        if self.is_read_only() {
            return Ok(Vec::new());
        }
        let folders: Vec<String> = match changed {
            None => self
                .typed_space_dirs("tasks")?
                .into_iter()
                .map(|(folder, _)| folder)
                .collect(),
            Some(paths) => {
                let mut found: Vec<String> = paths
                    .iter()
                    .filter_map(|path| {
                        let dir = path.parent()?;
                        let relative = dir.strip_prefix(&self.root).ok()?;
                        let marked = dir.join(crate::space::SPACE_CONFIG_FILE).is_file();
                        (marked && !relative.as_os_str().is_empty())
                            .then(|| relative.to_string_lossy().replace('\\', "/"))
                    })
                    .collect();
                found.sort();
                found.dedup();
                found
            }
        };

        let mut yielded = Vec::new();
        for folder in folders {
            let Ok(space) = self.open_space(&folder) else {
                continue;
            };
            let arrangement = Arrangement::of(&space.config);
            if space.kind() != "tasks" || !arrangement.is_by_field() {
                continue;
            }
            let lists = self
                .space_list_paths(&folder)?
                .iter()
                .map(|path| self.open_list(path))
                .collect::<Result<Vec<_>>>()?;
            if lists.iter().all(|list| list.is_arranged(&arrangement)) {
                continue;
            }
            let order = lists
                .iter()
                .flat_map(|list| list.tasks().filter_map(|task| task.id.clone()))
                .collect();
            self.with_space_config(&folder, |config| {
                config.sort = Some(CUSTOM_SORT.to_string());
                config.order = order;
            })?;
            yielded.push(folder);
        }
        Ok(yielded)
    }

    /// Persists how a notes space draws its board (`grid` / `tree`, `None` =
    /// the notebook's default) in its `.space.json` — next to `sort`, because
    /// it is the same kind of fact: a view preference of THIS place.
    pub fn set_space_note_layout(&self, folder: &str, layout: Option<&str>) -> Result<()> {
        self.with_space_config(folder, |config| {
            config.note_layout = layout.map(str::to_string);
        })
    }

    /// Saves a hand-dragged arrangement (task ids / note paths) as the space's
    /// custom order and switches it to `custom`, whatever sort was on. A tasks
    /// space's lists are rewritten in it.
    pub fn set_space_order(&self, folder: &str, order: Vec<String>) -> Result<()> {
        self.with_space_config(folder, |config| {
            config.sort = Some(CUSTOM_SORT.to_string());
            config.order = order;
        })?;
        self.rearrange_space(folder)
    }

    /// Opens a space by its **root-relative path** (`Mercado`,
    /// `Design/Tasks`) — the path, not the leaf: two groups may each hold a
    /// `Tasks/`, and a leaf lookup would open the first and highlight both.
    pub(super) fn open_space(&self, path: &str) -> Result<crate::space::Space> {
        let dir = self.resolve_space_path(path)?;
        crate::space::Space::open(dir)
    }

    /// A root-relative path resolved against the notebook, refusing anything
    /// that climbs, hides, or is not a single safe run of components.
    pub(super) fn resolve_space_path(&self, path: &str) -> Result<PathBuf> {
        crate::relpath::safe_join(&self.root, path)
            .ok_or_else(|| Error::InvalidSpaceName(path.to_string()))
    }

    /// Moves a space into a group (`Some`) or back to the root (`None`). The
    /// path is the identity and is what a move changes, so the states and
    /// the stored arrangements are repointed by `relocate`.
    pub fn move_space(&mut self, name: &str, into_group: Option<&str>) -> Result<()> {
        self.ensure_writable()?;
        if Self::is_fixed_space(name) {
            return Err(Error::Protected(name.to_string()));
        }
        let sp = self.open_space(name)?;
        let from = sp.root().to_path_buf();
        let target_parent = match into_group {
            Some(group) => self.open_group(group)?.0,
            None => self.root.clone(),
        };
        // `relocate` is told the LEAF to land under; `name` is a path now.
        let leaf = crate::fsio::file_name_of(&from);
        self.relocate(&from, &target_parent, &leaf)
    }

    /// Moves a marked folder under a new parent, keeping its name. Every
    /// list under it just changed address, so the day references follow.
    pub(super) fn relocate(&mut self, from: &Path, target_parent: &Path, name: &str) -> Result<()> {
        let to = target_parent.join(name);
        if from == to {
            return Ok(());
        }
        if to.exists() {
            return Err(Error::InvalidSpaceName(format!("{name} already exists")));
        }
        let from_rel = crate::relpath::relative_slash(&self.root, from);
        let to_rel = crate::relpath::relative_slash(&self.root, &to);

        std::fs::create_dir_all(target_parent).ctx(target_parent)?;
        std::fs::rename(from, &to).ctx(&to)?;

        self.update_states(|state| state.rename_prefix(&from_rel, &to_rel))?;
        // The hand-dragged arrangements are addressed by folder too, and a
        // stale one fails silently (the space falls to the end of the column).
        self.edit_config_if(|config| config.relocate_orders(&from_rel, &to_rel))?;
        // The aggregated index holds paths too; it is reconstructible, so a
        // failure here must not fail the move.
        let _ = self.refresh_completed_index();
        // So does the "last seen" index, keyed by root-relative address.
        self.seen_moved(&from_rel, &to_rel);
        // Every note and task under it just changed address; the log has no
        // folders, only things, so it takes a line each.
        self.logged_moved_under(&from_rel, &to_rel);
        Ok(())
    }

    /// The group a directory sits in, if it sits in one at all.
    pub(super) fn parent_group_of(&self, dir: &Path) -> Option<String> {
        dir.parent()
            .filter(|parent| *parent != self.root.as_path())
            .filter(|parent| crate::space::Group::is_group(parent))
            .map(|parent| crate::relpath::relative_slash(&self.root, parent))
    }

    /// Renames a space by renaming its **FOLDER**: the folder is the name in
    /// both directions (here, and in a file manager). The app's own `jott.*`
    /// spaces cannot take that route — their folder is an identifier the app
    /// recreates — so those, and only those, keep their label in the marker.
    pub fn rename_space(&mut self, folder: &str, new_name: &str) -> Result<()> {
        self.ensure_writable()?;
        let sp = self.open_space(folder)?;
        if crate::space::is_app_folder(folder) {
            return edit_marked_config(sp.config_path(), |config| {
                config.name = cleared_to_none(new_name)
            });
        }
        let name = new_name.trim();
        Self::check_space_name(name)?;
        let from = sp.root().to_path_buf();
        let parent = from.parent().unwrap_or(&self.root).to_path_buf();
        self.relocate(&from, &parent, name)?;
        // The marker's `name` is no longer read for a user space; left in
        // place it would disagree with the folder.
        let moved = parent.join(name).join(crate::space::SPACE_CONFIG_FILE);
        edit_marked_config(moved, |config| config.name = None)
    }

    /// Sets a space's accent colour and icon; an empty string clears each.
    pub fn set_space_appearance(
        &self,
        folder: &str,
        color: Option<String>,
        icon: Option<String>,
    ) -> Result<()> {
        let path = self.open_space(folder)?.config_path();
        self.set_marked_appearance(path, color, icon)
    }

    /// Sends a user space to the trash — never a fixed one, and never a
    /// permanent delete (the trash is the only door out).
    pub fn delete_space(&self, folder: &str) -> Result<()> {
        self.ensure_writable()?;
        if Self::is_fixed_space(folder) {
            return Err(Error::Protected(folder.to_string()));
        }
        let sp = self.open_space(folder)?;
        self.trash_path(sp.root())?;
        self.seen_gone(folder);
        self.logged_gone_under(folder);
        Ok(())
    }
}
