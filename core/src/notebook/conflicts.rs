//! Conflicting copies a sync tool left behind, and what the app does with
//! them. Three answers, in order of how much the app knows: a copy holding
//! exactly what the original holds is noise and goes to the trash; a copy of
//! a file the app can MERGE against the last content the devices had in
//! common ([`crate::base`]) is merged, and the copy goes to the trash; the
//! rest is reported, and the user decides.
//!
//! What is merged today is the day's state and the plan — sets of references,
//! where there is no field to fight over. Lists and notes are step 6.

use std::path::{Path, PathBuf};

use crate::base::Base;
use crate::conflict::Conflict;
use crate::error::{Error, Result};
use crate::plan::{Plan, PLAN_FILE};
use crate::state::{DayState, StateFile, DAILY_STATE_FILE};
use crate::NOTEBOOK_CONFIG_DIR;

use super::*;

impl Notebook {
    /// Gives the notebook somewhere to keep its merge base — `dir` belongs to
    /// the MACHINE, outside the notebook, and the caller owns it (the shell
    /// hands in its app folder, a test a tempdir). Does the work an open can
    /// only do once it has one: merges what it can, then takes note of every
    /// file it had never seen. Without this, nothing is ever merged.
    pub fn with_base_dir(mut self, dir: impl AsRef<Path>) -> Self {
        self.base = Some(Base::new(dir, &self.root));
        if !self.is_read_only() {
            // Derived work, like everything `open` runs: a failure must not
            // cost the notebook.
            let _ = self.merge_conflicts();
            self.settle_base();
        }
        self
    }

    /// The files the app merges, root-relative — and so the only ones it
    /// keeps a base of. Lists and notes join in step 6.
    fn merged_files(&self) -> [String; 2] {
        [
            format!("{NOTEBOOK_CONFIG_DIR}/{DAILY_STATE_FILE}"),
            format!("{NOTEBOOK_CONFIG_DIR}/{PLAN_FILE}"),
        ]
    }

    /// Takes note of what this device has never seen, and forgets what the
    /// notebook no longer holds. Only what is ABSENT is recorded: writing on
    /// every open would make the base our own last session, and a merge
    /// measuring from our own version hands every field to the other device.
    fn settle_base(&self) {
        let Some(base) = &self.base else {
            return;
        };
        base.prune(|relative| self.root().join(relative).exists());
        for relative in self.merged_files() {
            let path = self.root().join(&relative);
            // A file with a copy beside it is in conflict, and neither of its
            // two versions is what the devices had in common.
            if has_conflict_copy(&path) {
                continue;
            }
            if let Ok(bytes) = std::fs::read(&path) {
                let _ = base.record_if_absent(&relative, &bytes);
            }
        }
    }

    /// Somebody else's version of `path` landed: when the app keeps a base of
    /// that file and nothing is in conflict, this version IS the new common
    /// content. Called once the arrival burst has SETTLED, so a conflict copy
    /// landing beside the file has already arrived — advancing the base to
    /// either version of a file in conflict destroys the one thing the merge
    /// needs.
    pub fn note_external_change(&self, path: &Path) {
        if has_conflict_copy(path) {
            return;
        }
        self.advance_base(path);
    }

    /// Files `path` as the new common content — what a decision already taken
    /// leaves behind: a merge, an Adopt, a Discard, or a version that arrived
    /// with nothing to argue with.
    fn advance_base(&self, path: &Path) {
        let Some(base) = &self.base else {
            return;
        };
        let relative = crate::relpath::relative_slash(self.root(), path);
        if !self.merged_files().contains(&relative) {
            return;
        }
        match std::fs::read(path) {
            Ok(bytes) => {
                let _ = base.record(&relative, &bytes);
            }
            Err(_) => base.forget(&relative),
        }
    }

    /// Merges every conflict copy the app knows how to merge, each merged
    /// copy going to the trash. Answers how many were settled. What it cannot
    /// merge is left exactly as it was, for the banner: a file the app keeps
    /// no base of, one this device has never seen before, or a version that
    /// will not parse. Deterministic on purpose — both devices merge the same
    /// pair into the same bytes, so the result does not bounce between them.
    pub fn merge_conflicts(&self) -> Result<usize> {
        if self.base.is_none() || self.is_read_only() {
            return Ok(0);
        }
        let mut merged = 0;
        for copy in self.conflict_paths()? {
            if self.merge_conflict(&copy)? {
                merged += 1;
            }
        }
        Ok(merged)
    }

    /// One copy. `false` when the app cannot merge this one — it is then left
    /// untouched, which is what every build before the merge did.
    fn merge_conflict(&self, copy: &Path) -> Result<bool> {
        let Some(base) = &self.base else {
            return Ok(false);
        };
        let Some(original) = crate::conflict::describe(copy).and_then(|c| c.original) else {
            return Ok(false);
        };
        let relative = crate::relpath::relative_slash(self.root(), &original);
        let Some(common) = base.of(&relative).and_then(|b| String::from_utf8(b).ok()) else {
            return Ok(false);
        };
        let (Ok(ours), Ok(theirs)) = (
            std::fs::read_to_string(&original),
            std::fs::read_to_string(copy),
        ) else {
            return Ok(false);
        };
        let [state, plan] = self.merged_files();

        if relative == state {
            let (Some(common), Some(ours), Some(theirs)) = (
                DayState::parse(&common),
                DayState::parse(&ours),
                DayState::parse(&theirs),
            ) else {
                return Ok(false);
            };
            let merged = DayState::merge(&common, &ours, &theirs);
            // Through the file, so the merge and every other save spell the
            // same JSON — two devices writing different bytes for one result
            // would hand each other a conflict for ever.
            let mut file = StateFile::load(&original, merged.date);
            file.state = merged;
            file.save()?;
        } else if relative == plan {
            let (Some(common), Some(ours), Some(theirs)) = (
                Plan::parse(&common),
                Plan::parse(&ours),
                Plan::parse(&theirs),
            ) else {
                return Ok(false);
            };
            let mut file = crate::plan::PlanFile::load(&original);
            file.plan = Plan::merge(&common, &ours, &theirs);
            file.save()?;
        } else {
            return Ok(false);
        }

        self.trash_path(copy)?;
        self.advance_base(&original);
        Ok(true)
    }

    /// Every conflict copy sitting in the notebook, wherever it may be: the
    /// config folder, every tasks space's folder, and every notes space at
    /// any depth. The one walk behind [`Notebook::conflicts`] and the reaper,
    /// so the two cannot disagree about which copies exist.
    fn conflict_paths(&self) -> Result<Vec<PathBuf>> {
        let mut dirs = vec![self.config_dir()];
        for (_, folder) in self.task_folders()? {
            dirs.push(folder.dir().to_path_buf());
        }
        let mut files = Vec::new();
        for dir in dirs {
            for path in crate::fsio::dir_paths(&dir)? {
                if crate::conflict::is_conflict_file(&path) && path.is_file() {
                    files.push(path);
                }
            }
        }
        // Notes nest in folders, and the walk of `NoteFolder` skips conflict
        // copies on purpose (they are not notes) — so they are looked for here.
        for (_, folder) in self.note_folders()? {
            conflict_files_under(folder.dir(), &mut files)?;
        }
        Ok(files)
    }

    /// Conflicting copies waiting for a decision. Reporting only — the user
    /// decides what to keep. A copy identical to its original is not one of
    /// them: it holds no decision, and the open already trashed it.
    pub fn conflicts(&self) -> Result<Vec<Conflict>> {
        let mut found = Vec::new();
        for path in self.conflict_paths()? {
            if let Some(mut conflict) = crate::conflict::describe(&path) {
                if is_identical_copy(&conflict) {
                    continue;
                }
                conflict.relative = Some(crate::relpath::relative_slash(self.root(), &path));
                found.push(conflict);
            }
        }
        found.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(found)
    }

    /// Sends those copies to the trash — nothing is destroyed, and the same
    /// deletion reaches the other device through the sync tool, so the notice
    /// goes away on both. Derived work, run on open.
    pub(super) fn reap_identical_conflicts(&self) -> Result<usize> {
        let mut gone = 0;
        for path in self.conflict_paths()? {
            let Some(conflict) = crate::conflict::describe(&path) else {
                continue;
            };
            if is_identical_copy(&conflict) {
                self.trash_path(&path)?;
                gone += 1;
            }
        }
        Ok(gone)
    }

    /// A conflict copy by its root-relative address, checked to be one: the
    /// two doors below take user input and must not reach any other file.
    fn conflict_file(&self, relative: &str) -> Result<PathBuf> {
        let path = crate::relpath::safe_join(self.root(), relative)
            .filter(|path| crate::conflict::is_conflict_file(path) && path.is_file())
            .ok_or_else(|| Error::InvalidNotePath(relative.to_string()))?;
        Ok(path)
    }

    /// Discards a conflict copy: it goes to the trash, the original stays.
    /// For the person who knows the version on screen is the one to keep.
    pub fn discard_conflict(&self, relative: &str) -> Result<()> {
        self.ensure_writable()?;
        let copy = self.conflict_file(relative)?;
        let original = crate::conflict::describe(&copy).and_then(|c| c.original);
        self.trash_path(&copy)?;
        // The version that stayed is what the other device will receive.
        if let Some(original) = original {
            self.advance_base(&original);
        }
        Ok(())
    }

    /// Keeps a conflict copy INSTEAD of the original: the original goes to
    /// the trash and the copy takes its name and place. An original already
    /// gone is simply given back its name.
    pub fn adopt_conflict(&self, relative: &str) -> Result<()> {
        self.ensure_writable()?;
        let copy = self.conflict_file(relative)?;
        let original = crate::conflict::describe(&copy)
            .and_then(|conflict| conflict.original.or_else(|| original_name_of(&copy)))
            .ok_or_else(|| Error::InvalidNotePath(relative.to_string()))?;
        if original.exists() {
            self.trash_path(&original)?;
        }
        crate::fsio::rename_recorded(&copy, &original)?;
        self.advance_base(&original);
        Ok(())
    }
}

/// A conflicting copy holding exactly what the original holds: both devices
/// wrote the same bytes, so there is no version to choose — whichever one is
/// "kept" leaves the same file behind. True for the user's text as much as for
/// the app's own files: identical is identical.
fn is_identical_copy(conflict: &Conflict) -> bool {
    let Some(original) = conflict.original.as_deref() else {
        return false;
    };
    match (std::fs::read(&conflict.path), std::fs::read(original)) {
        (Ok(copy), Ok(kept)) => copy == kept,
        _ => false,
    }
}

/// The name a conflict copy would have without the marker, beside itself —
/// `describe` answers the original only while it exists.
fn original_name_of(copy: &Path) -> Option<PathBuf> {
    let name = crate::fsio::file_name_of(copy);
    let (stem, _) = name.split_once(crate::conflict::MARKER)?;
    let ext = copy
        .extension()
        .map(|ext| format!(".{}", ext.to_string_lossy()))
        .unwrap_or_default();
    Some(copy.with_file_name(format!("{stem}{ext}")))
}

/// Whether a conflict copy of `path` is sitting beside it — the file has two
/// versions, and neither of them is what the devices had in common.
fn has_conflict_copy(path: &Path) -> bool {
    let Some(dir) = path.parent() else {
        return false;
    };
    crate::fsio::dir_paths(dir)
        .unwrap_or_default()
        .into_iter()
        .any(|candidate| {
            crate::conflict::describe(&candidate).is_some_and(|conflict| {
                conflict.original.as_deref() == Some(path)
            })
        })
}

/// Every conflict copy under `dir`, at any depth, hidden folders left out.
fn conflict_files_under(dir: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
    for path in crate::fsio::dir_paths(dir)? {
        if crate::fsio::is_hidden(&path) {
            continue;
        }
        if path.is_dir() {
            conflict_files_under(&path, out)?;
        } else if crate::conflict::is_conflict_file(&path) {
            out.push(path);
        }
    }
    Ok(())
}
