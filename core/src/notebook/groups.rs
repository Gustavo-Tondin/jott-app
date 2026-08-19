//! Groups: folders that arrange spaces in the sidebar and hold no content of
//! their own.
//!
//! They nest (2026-08-11), and they carry the very same [`crate::space::SpaceConfig`]
//! a space does, under `.group.json` instead of `.space.json` — which is why
//! creating, moving and renaming one go through the primitives in
//! [`super::spaces`] rather than through a second copy of them.

use std::path::PathBuf;

use crate::error::{Error, Result};

use super::*;

impl Notebook {
    /// Creates an empty group (a folder with a `.group.json`) at the root. The
    /// folder name is the identity — a safe single component, unique in the
    /// notebook. Returns the folder name.
    pub fn create_group(&self, name: &str, into_group: Option<&str>) -> Result<String> {
        self.ensure_writable()?;
        let parent = match into_group {
            Some(group) => self.open_group(group)?.0,
            None => self.root.clone(),
        };
        self.create_marked_folder(
            name,
            &parent,
            crate::space::GROUP_CONFIG_FILE,
            "{\n  \"schemaVersion\": 1\n}\n",
        )
    }

    /// Renames a group by renaming its FOLDER — the same rule as a space
    /// (2026-08-13). Everything under it moves with it, so the Day/Week
    /// references and the stored arrangements are repointed by `relocate`.
    pub fn rename_group(&mut self, folder: &str, new_name: &str) -> Result<()> {
        self.ensure_writable()?;
        let name = new_name.trim();
        Self::check_space_name(name)?;
        let (from, _) = self.open_group(folder)?;
        let parent = from.parent().unwrap_or(&self.root).to_path_buf();
        self.relocate(&from, &parent, name)?;
        let moved = parent.join(name).join(crate::space::GROUP_CONFIG_FILE);
        edit_marked_config(moved, |config| config.name = None)
    }

    /// Sets a group's accent colour and icon; an empty string clears each.
    pub fn set_group_appearance(
        &self,
        folder: &str,
        color: Option<String>,
        icon: Option<String>,
    ) -> Result<()> {
        let path = self.group_config_path(folder)?;
        self.set_marked_appearance(path, color, icon)
    }

    /// Where a group's config lives.
    fn group_config_path(&self, folder: &str) -> Result<PathBuf> {
        Ok(self
            .open_group(folder)?
            .0
            .join(crate::space::GROUP_CONFIG_FILE))
    }

    /// Sends a group to the trash after handing what it held to its own parent
    /// (the root, or the group it sat in), so nothing is ever lost with it.
    pub fn delete_group(&mut self, folder: &str) -> Result<()> {
        self.ensure_writable()?;
        let (dir, _) = self.open_group(folder)?;
        let parent = self.parent_group_of(&dir);

        // Members first: a space still inside when the folder goes to the
        // trash would go with it.
        let mut members = Vec::new();
        self.collect_spaces(&dir, &mut members)?;
        for sp in members {
            let path = crate::relpath::relative_slash(&self.root, sp.root());
            self.move_space(&path, parent.as_deref())?;
        }
        // Child groups the same way — deleting a group is not deleting a branch.
        for child in crate::space::marker_dirs(&dir, crate::space::GROUP_CONFIG_FILE)? {
            let path = crate::relpath::relative_slash(&self.root, &child);
            self.move_group(&path, parent.as_deref())?;
        }
        self.trash_path(&dir)?;
        Ok(())
    }

    /// Moves a group — with everything under it — into another group (`Some`)
    /// or back to the root (`None`).
    pub fn move_group(&mut self, name: &str, into_group: Option<&str>) -> Result<()> {
        self.ensure_writable()?;
        let (from, _) = self.open_group(name)?;
        let target_parent = match into_group {
            Some(group) => {
                let (dir, _) = self.open_group(group)?;
                if dir == from {
                    return Err(Error::InvalidSpaceName(format!(
                        "{name} cannot hold itself"
                    )));
                }
                // A group cannot move inside its own subtree: the branch would
                // be carrying itself, and everything under it would leave the
                // notebook with the move.
                if dir.starts_with(&from) {
                    return Err(Error::InvalidSpaceName(format!(
                        "{group} is inside {name}"
                    )));
                }
                dir
            }
            None => self.root.clone(),
        };
        let leaf = crate::fsio::file_name_of(&from);
        self.relocate(&from, &target_parent, &leaf)
    }

    /// Opens a group by folder name — at the root or nested in another group —
    /// returning its dir and config.
    pub(super) fn open_group(&self, path: &str) -> Result<(PathBuf, crate::space::SpaceConfig)> {
        let wanted = self.resolve_space_path(path)?;
        let dir = self
            .group_dirs()?
            .into_iter()
            .find(|dir| *dir == wanted)
            .ok_or_else(|| Error::InvalidSpaceName(format!("{path} is not a group")))?;
        let config = crate::space::SpaceConfig::load(
            dir.join(crate::space::GROUP_CONFIG_FILE),
        );
        Ok((dir, config))
    }

    /// The absolute directory of every group, at any depth.
    ///
    /// Groups nest (2026-08-11): a group is a folder carrying a `.group.json`,
    /// inside the root or inside another group. The walk goes down from the
    /// root through the groups it finds — a space's own subfolders are its
    /// content and are never entered.
    pub(super) fn group_dirs(&self) -> Result<Vec<PathBuf>> {
        let mut found = Vec::new();
        let mut pending = vec![self.root.clone()];
        while let Some(dir) = pending.pop() {
            for child in
                crate::space::marker_dirs(&dir, crate::space::GROUP_CONFIG_FILE)?
            {
                pending.push(child.clone());
                found.push(child);
            }
        }
        found.sort();
        Ok(found)
    }

    /// The groups of the notebook, each with the group it sits in (if any) and
    /// the **root-relative paths** of the spaces it holds directly — a
    /// space in a child group belongs to that child, not to this one.
    ///
    /// Paths, not leaf names, since 2026-08-13: two groups may each hold a
    /// `Tasks/`, and by leaf they were indistinguishable.
    ///
    /// The members come out in the notebook's own space order, not
    /// alphabetically: the sidebar reads a group's place off its members, and
    /// sorting them here would quietly discard the order the user dragged
    /// (user report, 2026-08-11).
    pub fn groups(&self) -> Result<Vec<crate::space::GroupEntry>> {
        let ordered = self.spaces()?;
        let mut groups = Vec::new();
        for dir in self.group_dirs()? {
            let folder = crate::relpath::relative_slash(&self.root, &dir);
            let config = crate::space::SpaceConfig::load(
                dir.join(crate::space::GROUP_CONFIG_FILE),
            );
            let spaces: Vec<String> = ordered
                .iter()
                .filter(|sp| sp.root().parent() == Some(dir.as_path()))
                .map(|sp| crate::relpath::relative_slash(&self.root, sp.root()))
                .collect();
            groups.push(crate::space::GroupEntry {
                folder,
                parent: self.parent_group_of(&dir),
                config,
                spaces,
            });
        }
        groups.sort_by(|a, b| a.folder.cmp(&b.folder));
        Ok(groups)
    }
}
