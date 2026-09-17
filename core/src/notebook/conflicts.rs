//! Conflicting copies a sync tool left behind, and what the app does with
//! them. Three answers, in order of how much the app knows: a copy holding
//! exactly what the original holds is noise and goes to the trash; a copy of
//! a file the app can MERGE against the last content the devices had in
//! common ([`crate::base`]) is merged, and the copy goes to the trash; the
//! rest is reported, and the user decides.
//!
//! What is merged: the day's state and the plan (sets of references, with no
//! field to fight over), a task list (task by task, field by field —
//! [`crate::merge`]) and a note (line by line — [`crate::textmerge`]). What
//! is NOT merged is what both devices moved to different places: there the
//! copy stays, and the notice says what differs.

use std::path::{Path, PathBuf};

use crate::base::Base;
use crate::conflict::{Conflict, Difference, FileKind, Version};
use crate::error::{Error, Result};
use crate::merge::{self, Departed, Mode};
use crate::plan::{Plan, PLAN_FILE};
use crate::state::{DayState, StateFile, DAILY_STATE_FILE};
use crate::textmerge::{self, TextMerge};
use crate::trash::TRASH_DIR;
use crate::{COMPLETED_LIST, NOTEBOOK_CONFIG_DIR};

/// One file a merge settled, as the interface reports it.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Merged {
    /// The file that was merged, root-relative.
    pub path: String,
    /// The file's stem. What a note is called; a list is named by the
    /// interface, which reads the main list of every space as Inbox.
    pub name: String,
    /// Which of the app's files it is — the interface says nothing about the
    /// day's state being put together, and names a list its own way.
    pub kind: FileKind,
    /// How much of the other device's version had to be carried over.
    pub changes: usize,
}

/// A file the app knows how to merge, and how. Everything else in the
/// notebook is content the app does not read (an asset, a marker, a theme).
enum Mergeable {
    /// `.jott/daily-state.json`.
    State,
    /// `.jott/plan.json`.
    Plan,
    /// A task list, by its root-relative address.
    List(String),
    /// A note of a notes space.
    Note,
    /// `.jott/trash/trash.json`, entry by entry.
    Trash,
}

/// The index the Completed screen reads (`refresh_completed_index`): rebuilt
/// from the `completed.md` files on every open, so a copy of it holds no
/// decision — it goes to the trash unasked.
const COMPLETED_INDEX: &str = "completed.json";

/// The three versions a merge reads, and the file the result is written to.
struct Versions {
    /// What the two devices last had in common.
    common: String,
    /// What is on disk here — the version the sync tool left under the name.
    ours: String,
    /// The conflicting copy.
    theirs: String,
    original: std::path::PathBuf,
}

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

    /// The files the app merges that are not content: the day's state, the
    /// plan and the trash's index, root-relative.
    fn state_files(&self) -> [String; 3] {
        [
            format!("{NOTEBOOK_CONFIG_DIR}/{DAILY_STATE_FILE}"),
            format!("{NOTEBOOK_CONFIG_DIR}/{PLAN_FILE}"),
            format!("{NOTEBOOK_CONFIG_DIR}/{TRASH_DIR}/{}", crate::trash::INDEX_FILE),
        ]
    }

    /// Whether the app keeps a base of `relative`. Cheap on purpose — this is
    /// asked for every file that arrives from outside, and a walk of the
    /// notebook to answer it would be paid on every sync.
    fn keeps_base(&self, relative: &str) -> bool {
        self.state_files().contains(&relative.to_string())
            || (relative.ends_with(".md")
                && !relative.starts_with(&format!("{NOTEBOOK_CONFIG_DIR}/")))
    }

    /// Every file the app keeps a base of, right now: the two above, every
    /// list of every tasks space, and every note of every notes space.
    fn base_files(&self) -> Vec<String> {
        let mut files: Vec<String> = self.state_files().into();
        if let Ok(lists) = self.list_paths() {
            files.extend(lists.into_iter().map(|list| list.path));
        }
        for (prefix, folder) in self.note_folders().unwrap_or_default() {
            if let Ok(paths) = folder.note_paths() {
                files.extend(paths.into_iter().map(|note| format!("{prefix}/{note}")));
            }
        }
        files
    }

    /// What kind of file `relative` is, for the merge. `None` for anything
    /// the app does not read as content.
    fn mergeable(&self, relative: &str) -> Option<Mergeable> {
        let [state, plan, trash] = self.state_files();
        if relative == state {
            return Some(Mergeable::State);
        }
        if relative == plan {
            return Some(Mergeable::Plan);
        }
        if relative == trash {
            return Some(Mergeable::Trash);
        }
        if !self.keeps_base(relative) {
            return None;
        }
        // The longest space folder the address sits in decides: spaces do not
        // nest, but a group's name is a prefix of everything inside it.
        let mut best: Option<Mergeable> = None;
        let mut longest = 0;
        for (prefix, _) in self.task_folders().unwrap_or_default() {
            if let Some(rest) = under(relative, &prefix) {
                // A list lives directly in its space; a `.md` deeper inside a
                // tasks space is not one.
                if !rest.contains('/') && prefix.len() > longest {
                    longest = prefix.len();
                    best = Some(Mergeable::List(relative.to_string()));
                }
            }
        }
        for (prefix, _) in self.note_folders().unwrap_or_default() {
            if under(relative, &prefix).is_some() && prefix.len() > longest {
                longest = prefix.len();
                best = Some(Mergeable::Note);
            }
        }
        best
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
        for relative in self.base_files() {
            // Asking first is what keeps an open cheap: after the first one,
            // nothing here is read and nothing is written.
            if base.has(&relative) {
                continue;
            }
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
        if !self.keeps_base(&relative) {
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
    /// copy going to the trash. Answers what it settled. What it cannot merge
    /// is left exactly as it was, for the banner: a file the app keeps no
    /// base of, one this device has never seen before, a version that will
    /// not parse, or a passage both devices rewrote. Deterministic on
    /// purpose — both devices merge the same pair into the same bytes, so the
    /// result does not bounce between them.
    pub fn merge_conflicts(&self) -> Result<Vec<Merged>> {
        if self.is_read_only() {
            return Ok(Vec::new());
        }
        // Needs no base: a copy of what the app rebuilds is never a merge.
        self.reap_derived_conflicts()?;
        if self.base.is_none() {
            return Ok(Vec::new());
        }
        let mut merged = Vec::new();
        for copy in self.conflict_paths()? {
            if let Some(done) = self.merge_conflict(&copy)? {
                merged.push(done);
            }
        }
        Ok(merged)
    }

    /// One copy. `None` when the app cannot merge this one — it is then left
    /// untouched, which is what every build before the merge did.
    fn merge_conflict(&self, copy: &Path) -> Result<Option<Merged>> {
        let Some((relative, versions)) = self.versions_of(copy) else {
            return Ok(None);
        };
        let Some(kind) = self.mergeable(&relative) else {
            return Ok(None);
        };
        let (kind, changes) = match kind {
            Mergeable::State => (FileKind::State, self.merge_day_state(&versions)?),
            Mergeable::Plan => (FileKind::State, self.merge_plan(&versions)?),
            Mergeable::List(path) => (FileKind::List, self.merge_list(&path, &versions)?),
            Mergeable::Note => (FileKind::Note, self.merge_note(&versions)?),
            Mergeable::Trash => (FileKind::State, self.merge_trash(&versions)?),
        };
        let Some(changes) = changes else {
            return Ok(None);
        };
        self.trash_path(copy)?;
        // The base is NOT moved here. A merge is this device's own write, and
        // the result is only common if the other device computed the same one
        // — where it did not, a base taken from our own result has the two
        // devices handing each other the file for ever (each reading the
        // other's version as the change). Left where it is, the next round
        // measures from the same place on both and converges.
        let leaf = crate::relpath::leaf_of(&relative);
        Ok(Some(Merged {
            name: leaf.rsplit_once('.').map_or(leaf, |(stem, _)| stem).to_string(),
            path: relative,
            kind,
            changes,
        }))
    }

    /// The three versions a merge needs, for the file `copy` belongs to:
    /// what the devices had in common, what is on disk here, and the copy.
    /// `None` when any of them is missing — without the common one there is
    /// nothing to measure from, and guessing is how work is lost.
    fn versions_of(&self, copy: &Path) -> Option<(String, Versions)> {
        let original = crate::conflict::describe(copy).and_then(|c| c.original)?;
        let relative = crate::relpath::relative_slash(self.root(), &original);
        let common = String::from_utf8(self.base.as_ref()?.of(&relative)?).ok()?;
        Some((
            relative,
            Versions {
                common,
                ours: std::fs::read_to_string(&original).ok()?,
                theirs: std::fs::read_to_string(copy).ok()?,
                original,
            },
        ))
    }

    /// The day's state: sets of references, so there is no field to fight
    /// over. Written through the file, so the merge and every other save
    /// spell the same JSON — two devices writing different bytes for one
    /// result would hand each other a conflict for ever.
    fn merge_day_state(&self, versions: &Versions) -> Result<Option<usize>> {
        let (Some(common), Some(ours), Some(theirs)) = (
            DayState::parse(&versions.common),
            DayState::parse(&versions.ours),
            DayState::parse(&versions.theirs),
        ) else {
            return Ok(None);
        };
        let merged = DayState::merge(&common, &ours, &theirs);
        let changes = merged.items.len().abs_diff(ours.items.len());
        let mut file = StateFile::load(&versions.original, merged.date);
        file.state = merged;
        file.save()?;
        Ok(Some(changes))
    }

    fn merge_plan(&self, versions: &Versions) -> Result<Option<usize>> {
        let (Some(common), Some(ours), Some(theirs)) = (
            Plan::parse(&versions.common),
            Plan::parse(&versions.ours),
            Plan::parse(&versions.theirs),
        ) else {
            return Ok(None);
        };
        let merged = Plan::merge(&common, &ours, &theirs);
        let changes = usize::from(merged != ours);
        let mut file = crate::plan::PlanFile::load(&versions.original);
        file.plan = merged;
        file.save()?;
        Ok(Some(changes))
    }

    /// A task list, task by task. A disagreement is not a reason to leave the
    /// copy: the other device's version of that one task lands right under
    /// ours, marked, where the decision is a tap instead of a file name.
    fn merge_list(&self, path: &str, versions: &Versions) -> Result<Option<usize>> {
        let mut list = self.open_list(path)?;
        let is_log = crate::relpath::leaf_of(path).trim_end_matches(".md") == COMPLETED_LIST;
        let gone = if is_log {
            Departed::default()
        } else {
            self.departed_from(path)
        };
        let merged = merge::merge_lists(
            crate::list::TaskList::from_text(&versions.common).lines(),
            crate::list::TaskList::from_text(&versions.ours).lines(),
            crate::list::TaskList::from_text(&versions.theirs).lines(),
            &gone,
            if is_log { Mode::Log } else { Mode::List },
        );
        // An edit to a task this device already ticked belongs to the file
        // the task is in now, not back in the list it left.
        let mut carried = 0;
        if !merged.completed_elsewhere.is_empty() {
            carried = self.carry_into_completed(path, &merged.completed_elsewhere)?;
        }
        list.replace_lines(merged.lines);
        list.save()?;
        Ok(Some(merged.changes + carried))
    }

    /// What the notebook knows about tasks that left the list at `path`: the
    /// ones ticked into the space's Completed, and the ones in the trash.
    /// Both files travel with the notebook, so the other device reads the
    /// same answer — which is what lets a merge remove a task at all.
    fn departed_from(&self, path: &str) -> Departed {
        let completed = Self::completed_path_of(path)
            .ok()
            .and_then(|completed| self.open_list(&completed).ok())
            .map(|list| list.tasks().filter_map(|task| task.id.clone()).collect())
            .unwrap_or_default();
        let trashed = self
            .trash()
            .entries()
            .iter()
            .filter(|entry| entry.origin == path)
            .filter_map(|entry| entry.content.as_ref()?.first().cloned())
            .filter_map(|line| crate::task::Task::parse(&line)?.id)
            .collect();
        Departed { completed, trashed }
    }

    /// Applies what the other device changed about tasks this one completed,
    /// where those tasks now live. Answers how many lines moved.
    fn carry_into_completed(
        &self,
        path: &str,
        edits: &[(crate::task::Task, crate::task::Task)],
    ) -> Result<usize> {
        let Ok(completed_path) = Self::completed_path_of(path) else {
            return Ok(0);
        };
        let Ok(mut completed) = self.open_list(&completed_path) else {
            return Ok(0);
        };
        let mut moved = 0;
        for (common, theirs) in edits {
            let Some(id) = theirs.id.as_deref() else { continue };
            let Some(ours) = completed.find(id).cloned() else { continue };
            // A task that was ticked here is done; only what the other device
            // said ABOUT it is carried, and a disagreement keeps ours.
            let Some(mut settled) = merge::merge_task(common, &ours, theirs) else {
                continue;
            };
            settled.done = ours.done;
            settled.completed = ours.completed;
            settled.origin = ours.origin.clone();
            if settled != ours {
                *completed.task_mut(id)? = settled;
                moved += 1;
            }
        }
        if moved > 0 {
            completed.save()?;
        }
        Ok(moved)
    }

    /// The trash's index, entry by entry ([`crate::trash::merge_indexes`]).
    fn merge_trash(&self, versions: &Versions) -> Result<Option<usize>> {
        let Some((text, changes)) =
            crate::trash::merge_indexes(&versions.common, &versions.ours, &versions.theirs)
        else {
            return Ok(None);
        };
        crate::fsio::write_atomically(&versions.original, text.as_bytes())?;
        Ok(Some(changes))
    }

    /// A note, line by line. A passage both devices rewrote is never settled
    /// here: conflict markers written into somebody's note would be the app
    /// corrupting the file it was asked to protect.
    fn merge_note(&self, versions: &Versions) -> Result<Option<usize>> {
        match textmerge::merge_text(&versions.common, &versions.ours, &versions.theirs) {
            TextMerge::Clash { .. } => Ok(None),
            TextMerge::Merged(text) => {
                crate::fsio::write_atomically(&versions.original, text.as_bytes())?;
                Ok(Some(textmerge::changed_lines(&versions.ours, &text)))
            }
        }
    }

    /// Every conflict copy sitting in the notebook, wherever it may be: the
    /// config folder, every tasks space's folder, and every notes space at
    /// any depth. The one walk behind [`Notebook::conflicts`] and the reaper,
    /// so the two cannot disagree about which copies exist.
    fn conflict_paths(&self) -> Result<Vec<PathBuf>> {
        let mut dirs = vec![self.config_dir(), self.config_dir().join(TRASH_DIR)];
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
                if is_identical_copy(&conflict) || self.is_derived_copy(&path) {
                    continue;
                }
                conflict.kept = conflict.original.as_deref().and_then(Version::of);
                conflict.copy = Version::of(&path);
                conflict.relative = Some(crate::relpath::relative_slash(self.root(), &path));
                conflict.differs = self.difference(&path);
                conflict.kind = self.kind_of_copy(&path);
                found.push(conflict);
            }
        }
        found.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(found)
    }

    /// What the two versions of a copy still on the table disagree about —
    /// the one thing the banner can say that a file name cannot. Read here
    /// and not kept: a copy is rare, and an answer held would go stale the
    /// moment either version is written.
    fn difference(&self, copy: &Path) -> Option<Difference> {
        let (relative, versions) = match self.versions_of(copy) {
            Some(found) => found,
            // No base: this device never saw the file before the copy landed.
            None if self.base.is_some() => return Some(Difference::Unseen),
            None => return None,
        };
        match self.mergeable(&relative)? {
            Mergeable::Note => match textmerge::merge_text(
                &versions.common,
                &versions.ours,
                &versions.theirs,
            ) {
                TextMerge::Clash { lines } => Some(Difference::Lines { count: lines }),
                TextMerge::Merged(_) => None,
            },
            Mergeable::List(path) => {
                let merged = merge::merge_lists(
                    crate::list::TaskList::from_text(&versions.common).lines(),
                    crate::list::TaskList::from_text(&versions.ours).lines(),
                    crate::list::TaskList::from_text(&versions.theirs).lines(),
                    &self.departed_from(&path),
                    Mode::List,
                );
                let first = merged.clashes.first()?.clone();
                Some(Difference::Tasks {
                    count: merged.clashes.len(),
                    first,
                })
            }
            _ => None,
        }
    }

    /// Which of the app's files a copy belongs to, by the file it is a copy
    /// OF — a copy is never a list of its own.
    fn kind_of_copy(&self, copy: &Path) -> Option<FileKind> {
        let original = crate::conflict::describe(copy)?.original?;
        let relative = crate::relpath::relative_slash(self.root(), &original);
        let settings = format!("{NOTEBOOK_CONFIG_DIR}/config.json");
        let tags = format!("{NOTEBOOK_CONFIG_DIR}/tags.json");
        if relative == settings {
            return Some(FileKind::Settings);
        }
        if relative == tags {
            return Some(FileKind::Tags);
        }
        Some(match self.mergeable(&relative)? {
            Mergeable::State | Mergeable::Plan => FileKind::State,
            Mergeable::Trash => FileKind::Trash,
            Mergeable::List(_) => FileKind::List,
            Mergeable::Note => FileKind::Note,
        })
    }

    /// Sends those copies to the trash — nothing is destroyed, and the same
    /// deletion reaches the other device through the sync tool, so the notice
    /// goes away on both. Derived work, run on open.
    pub(super) fn reap_identical_conflicts(&self) -> Result<usize> {
        let mut gone = self.reap_derived_conflicts()?;
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

    /// Whether `copy` is a copy of a file the app rebuilds on its own, so
    /// there is nothing in it to choose.
    fn is_derived_copy(&self, copy: &Path) -> bool {
        crate::conflict::describe(copy)
            .and_then(|conflict| conflict.original.or_else(|| original_name_of(copy)))
            .is_some_and(|original| original == self.config_dir().join(COMPLETED_INDEX))
    }

    /// The copies no one has to decide about and no merge needs a base for:
    /// the Completed index's, and the log's (folded into the year's file by
    /// [`crate::timeline::fold_conflict_copies`]). All go to the trash.
    fn reap_derived_conflicts(&self) -> Result<usize> {
        let mut gone = 0;
        for path in self.conflict_paths()? {
            if self.is_derived_copy(&path) {
                self.trash_path(&path)?;
                gone += 1;
            }
        }
        for copy in crate::timeline::fold_conflict_copies(self.config_dir())? {
            self.trash_path(&copy)?;
            gone += 1;
        }
        Ok(gone)
    }

    /// A conflict copy by its root-relative address, checked to be one the
    /// notebook lists: the two doors below take user input and must not reach
    /// any other file. Matched against the walk rather than `safe_join`, which
    /// refuses the hidden `.jott/` where half of the copies live.
    fn conflict_file(&self, relative: &str) -> Result<PathBuf> {
        self.conflict_paths()?
            .into_iter()
            .find(|path| crate::relpath::relative_slash(self.root(), path) == relative)
            .ok_or_else(|| Error::InvalidNotePath(relative.to_string()))
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

/// The rest of `relative` when it sits inside the folder `prefix`, `None`
/// when it does not — the one place a space address is matched against a file
/// address, so neither is ever split by hand.
fn under<'a>(relative: &'a str, prefix: &str) -> Option<&'a str> {
    relative.strip_prefix(prefix)?.strip_prefix('/')
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
