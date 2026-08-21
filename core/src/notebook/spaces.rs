//! Spaces: the folders that hold the user's content, and the primitives that
//! move any marked folder around.
//!
//! A space is a folder carrying a `.space.json` with its type — `tasks` or
//! `notes`, chosen at creation and never changed (spec 3.5). Its identity is
//! its **root-relative path**, not its leaf name: two groups may each hold a
//! `Tasks/`, which is an arrangement a user builds on purpose (2026-08-13).
//!
//! [`Notebook::create_marked_folder`], [`Notebook::relocate`] and
//! [`Notebook::parent_group_of`] serve groups too (see [`super::groups`]): a
//! group is the same kind of marked folder, under a different marker.

use std::path::{Path, PathBuf};

use crate::error::{Error, IoContext, Result};
use crate::{COMPLETED_LIST, NOTES_DIR, TASKS_DIR};

use super::*;

impl Notebook {
    /// The spaces of this notebook: every first-level folder carrying a
    /// `.space.json`, alphabetically by folder name.
    ///
    /// Folders without the marker are ignored on purpose — a stray folder
    /// dropped into the notebook (downloads, an attachments dir, whatever a
    /// sync tool leaves) must never turn into interface on its own.
    pub fn spaces(&self) -> Result<Vec<crate::space::Space>> {
        // Spaces live at the root and inside groups, and groups nest (spec
        // 3.5), so `group_dirs` walks the whole tree. A space's identity is
        // its ROOT-RELATIVE PATH, never the leaf name: `Design/Tasks` and
        // `Personal/Tasks` are two legitimate spaces (see `open_space`).
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
        // `name` sorts by what the user READS, which is not the folder name a
        // space was created under (2026-08-06). Anything else — including
        // the default — is the hand-dragged order; fixed spaces are not
        // named in it and simply keep their place.
        if self.config.spaces_sort == "name" {
            found.sort_by(|a, b| {
                a.display_name()
                    .to_lowercase()
                    .cmp(&b.display_name().to_lowercase())
            });
        } else {
            let keys: Vec<String> = found.iter().map(path_of).collect();
            let mut zipped: Vec<(String, crate::space::Space)> =
                keys.into_iter().zip(found.drain(..)).collect();
            self.config
                .apply_order("spaces", &mut zipped, |entry| &entry.0);
            found = zipped.into_iter().map(|(_, sp)| sp).collect();
        }
        Ok(found)
    }

    /// Every space's root-relative path, mapped to the name the user
    /// reads. The one place that answers "what is this address called?" —
    /// the frontend used to derive it from the path, which put the folder on
    /// screen the moment the fixed folders gained their `jott.` prefix.
    pub(super) fn space_labels(&self) -> Result<std::collections::HashMap<String, String>> {
        Ok(self
            .spaces()?
            .into_iter()
            .map(|sp| {
                let path = crate::relpath::relative_slash(&self.root, sp.root());
                // The label is the space's READABLE ADDRESS, not just its
                // name (user call, 2026-08-13): `Design/Tasks` for one inside a
                // group, `Mercado` for a loose one. Two spaces called Tasks
                // in two different groups are a normal thing to have, and named
                // alone they were the same word twice in the same picker.
                //
                // Building it from the path costs nothing now that a group's
                // name IS its folder — there is no second name to look up. Only
                // the leaf can differ from its folder, and only for the app's
                // own `jott.*` spaces, so only the leaf is substituted.
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
    /// absolute dir). The walk behind `task_folders` and `note_folders` (in
    /// the `lists` and `notes` areas) — they
    /// differ only in the type they ask for and the folder value they build,
    /// so the walk itself is written once. A space is its own content
    /// folder now: the widget level between them was cut (2026-08-11).
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

    /// How the sidebar arranges spaces: `"name"` or the dragged order.
    pub fn spaces_sort(&self) -> &str {
        &self.config.spaces_sort
    }

    /// Sets it. Anything but `"name"` means the hand-dragged order, which is
    /// what an untouched notebook already does.
    pub fn set_spaces_sort(&mut self, sort: &str) -> Result<()> {
        self.ensure_writable()?;
        let mut config = self.config.clone();
        config.spaces_sort = if sort == "name" { sort.to_string() } else { String::new() };
        self.set_config(config)
    }

    /// The three spaces the app creates and recreates — never renamed,
    /// deleted, nor treated as user content. They carry the `jott.` prefix, so
    /// the plain names (`Tasks`, `Notes`, `Home`) are the user's to take.
    /// Public because the interface greys out what this refuses — a second
    /// copy of the three names in the bridge would drift from the rule that
    /// actually enforces them.
    pub fn is_fixed_space(folder: &str) -> bool {
        folder == crate::HOME_DIR || folder == TASKS_DIR || folder == NOTES_DIR
    }

    /// Validates a space folder name (user input): a safe single component,
    /// not hidden. Shared by create and open.
    pub(super) fn check_space_name(name: &str) -> Result<()> {
        if !crate::relpath::is_safe_leaf(name) {
            return Err(Error::InvalidSpaceName(name.to_string()));
        }
        // `assets/` is the notebook's image library (2026-08-18) and lives at
        // the root, so a space of that name would end up holding it. Refused
        // by NAME rather than only where it would actually collide, the same
        // way `completed` and `task-list` are: a word the app writes files
        // under is not a word the user gets to name a folder with, and a rule
        // that depends on where you are is a rule nobody can predict.
        if name.eq_ignore_ascii_case(crate::assets::ASSETS_DIR) {
            return Err(Error::InvalidSpaceName(format!("{name} is reserved")));
        }
        Ok(())
    }

    /// Creates a user space at the root: a folder carrying a
    /// `.space.json` with the chosen type (`tasks` or `notes`) — the
    /// space's single function, chosen at creation and never changed
    /// (spec 3.5). A space is born usable: `task-list.md` plus
    /// `completed.md` for tasks, the Inbox folder for notes. Returns the
    /// folder name.
    pub fn create_space(&self, name: &str, kind: &str) -> Result<String> {
        self.create_space_in(name, kind, None)
    }

    /// Creates a space at the root or inside a group. The folder name is
    /// the identity — unique across the notebook (spec 3.5), so a space
    /// in a group is addressed the same as one at the root. Returns the name.
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
        // Born usable, whichever kind: a tasks space gets its one list and the
        // Completed beside it, under the names every tasks space uses
        // (2026-08-13); a notes space gets its Inbox folder, where the app
        // files what is captured without a destination.
        let dir = self.resolve_space_path(&folder)?;
        if kind == "tasks" {
            crate::folder::TaskFolder::new(dir).ensure_default_lists()?;
        } else {
            crate::notefolder::NoteFolder::new(dir).ensure_default_folders()?;
        }
        Ok(folder)
    }

    /// Creates a folder that carries a marker — a space or a group.
    ///
    /// Creating either is the same act: a name that has to be a safe leaf, free
    /// across the whole notebook (spec 3.5 — the leaf name *is* the identity),
    /// on a folder that does not exist yet, plus the marker file that turns it
    /// into interface. Only the marker differs, so the marker (and its body)
    /// is a parameter.
    pub(super) fn create_marked_folder(
        &self,
        name: &str,
        parent: &Path,
        marker: &str,
        body: &str,
    ) -> Result<String> {
        let folder = name.trim();
        Self::check_space_name(folder)?;
        // A space called `completed` used to be refused, because its list
        // was named after its folder and would have collided with its own
        // `completed.md`. Fixed file names removed the collision, but the name
        // is still refused: a folder and a file called the same thing inside it
        // is a trap for whoever opens the notebook without the app.
        if Self::is_fixed_space(folder)
            || folder.eq_ignore_ascii_case(COMPLETED_LIST)
            || folder.eq_ignore_ascii_case(crate::MAIN_LIST)
        {
            return Err(Error::InvalidSpaceName(format!("{folder} is reserved")));
        }
        // Free HERE, not notebook-wide (2026-08-13). A name had to be unique
        // across the whole notebook while the leaf was the identity; now the
        // PATH is, so two groups may each hold a `Tasks/` — which is exactly
        // what a user builds on purpose. The only collision left is the real
        // one: a sibling of the same name.
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

    /// Persists how a space arranges its items (`name` / `created` /
    /// `completed` / `custom`, `None` = file order) in its `.space.json`.
    pub fn set_space_sort(&self, folder: &str, sort: Option<&str>) -> Result<()> {
        self.with_space_config(folder, |config| {
            config.sort = sort.map(str::to_string);
        })
    }

    /// Persists the hand-dragged arrangement (task ids / note paths) in the
    /// space's `.space.json` and switches it to the custom ordering —
    /// the order lives in the config, never in the content files.
    pub fn set_space_order(&self, folder: &str, order: Vec<String>) -> Result<()> {
        self.with_space_config(folder, |config| {
            config.sort = Some("custom".to_string());
            config.order = order;
        })
    }

    /// Opens a space by its **root-relative path** (`Mercado`,
    /// `Design/Tasks`).
    ///
    /// The path, not the leaf name (2026-08-13). The leaf used to be the
    /// identity, "unique across the notebook", and that invariant died the
    /// moment the folder became the name: two groups may each hold a `Tasks/`,
    /// which is exactly the arrangement a user builds on purpose. The old
    /// lookup searched the root and then every group for a matching leaf, so
    /// with two matches it silently opened the first — and the sidebar
    /// highlighted BOTH, because both answered to the same address (user
    /// report, screen recording 2026-08-13).
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

    /// Moves a space into a group (`Some`) or back to the root (`None`),
    /// renaming its folder. Identity is the root-relative PATH (2026-08-13),
    /// and the path is exactly what a move changes — so the states and the
    /// stored arrangements are repointed by `relocate`.
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

    /// Moves a marked folder under a new parent, keeping its name.
    ///
    /// Every list under it just changed address, so the Day/Week references
    /// follow — a reference left pointing at the old path reads as a task that
    /// vanished. (It is the same repointing a moved widget used to do; a moved
    /// space never did it, which is the bug this closes.)
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
        // stale one fails silently: the space just falls to the end of a
        // column the user arranged (services/sidebarOrder.js reads what is
        // stored, and what is stored no longer names anything).
        let mut config = self.config.clone();
        if config.relocate_orders(&from_rel, &to_rel) {
            self.set_config(config)?;
        }
        // The aggregated index holds paths too; it is reconstructible, so a
        // failure here must not fail the move.
        let _ = self.refresh_completed_index();
        Ok(())
    }

    /// The group a directory sits in, if it sits in one at all.
    pub(super) fn parent_group_of(&self, dir: &Path) -> Option<String> {
        dir.parent()
            .filter(|parent| *parent != self.root.as_path())
            .filter(|parent| crate::space::Group::is_group(parent))
            .map(|parent| crate::relpath::relative_slash(&self.root, parent))
    }

    /// Renames a space by renaming its **FOLDER** (user call, 2026-08-13).
    ///
    /// It used to write a `name` into the marker and leave the folder alone,
    /// which kept the identity stable but made the name a second copy of it —
    /// and the two drifted the moment anything was renamed. The folder is the
    /// name now, in both directions: rename it here and the disk follows;
    /// rename it in a file manager and the sidebar follows.
    ///
    /// The app's own `jott.*` spaces cannot take that route — their folder
    /// name is an identifier the app recreates — so those, and only those,
    /// still keep their label in the marker.
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
        // The marker's `name` is dead weight from here on: it is no longer
        // read for a user space, and leaving it would show up in a diff as
        // a name that disagrees with the folder.
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
        Ok(())
    }
}
