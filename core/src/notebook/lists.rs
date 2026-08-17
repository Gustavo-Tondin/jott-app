//! The notebook's task lists: where they live, how they are read, and
//! the three that change them (create, rename, delete).
//!
//! A list is addressed by its **root-relative path** (`jott.tasks/task-list.md`)
//! since phase 7; [`super::split_list_path`] is the one place that takes such an
//! address apart, because the address arrives from user input.

use std::collections::BTreeMap;
use std::path::PathBuf;

use crate::conflict::Conflict;
use crate::error::{Error, IoContext, Result};
use crate::list::TaskList;
use crate::task::Task;
use crate::{COMPLETED_LIST, TASKS_DIR};

use super::*;

impl Notebook {
    /// The root-relative address of the fixed Tasks space's list — where
    /// quick-captured tasks land.
    pub fn inbox_path() -> String {
        format!("{TASKS_DIR}/{}.md", crate::MAIN_LIST)
    }

    /// The address of the Completed list that serves `list_path` — the one in
    /// the **same folder** (spec 3.5: one Completed per tasks space, so a
    /// completed task never leaves the space it lived in).
    pub fn completed_path_of(list_path: &str) -> Result<String> {
        let (dir, _) = split_list_path(list_path)?;
        Ok(format!("{dir}/{COMPLETED_LIST}.md"))
    }

    /// Resolves a root-relative list address (`Tasks/Compras.md`) into the
    /// folder that owns it and the list name. Every operation that receives a
    /// list goes through here — the address is user input, exactly like a
    /// list name used to be.
    pub(super) fn resolve_list(&self, path: &str) -> Result<(crate::folder::TaskFolder, String)> {
        let (dir, name) = split_list_path(path)?;
        Ok((self.task_folder(self.root.join(dir)), name.to_string()))
    }

    /// A tasks folder for `dir`. Every one of them is the same shape now
    /// (2026-08-13): `task-list.md` beside `completed.md`, whatever the folder
    /// is called. The fixed Tasks space used to be the exception — it
    /// lives in `jott.tasks/` and had to be TOLD its list was `Tasks.md`,
    /// because the folder name could not say it.
    pub(super) fn task_folder(&self, dir: PathBuf) -> crate::folder::TaskFolder {
        crate::folder::TaskFolder::new(dir)
    }

    /// Every tasks space's folder in the notebook, with its root-relative
    /// prefix. This is the walk behind lists, counts, conflicts and
    /// suggestions — one definition of "where tasks live", not four.
    pub(super) fn task_folders(&self) -> Result<Vec<(String, crate::folder::TaskFolder)>> {
        Ok(self
            .typed_space_dirs("tasks")?
            .into_iter()
            .map(|(prefix, dir)| (prefix, self.task_folder(dir)))
            .collect())
    }

    /// The lists of the notebook, across every tasks space.
    /// Sorted by name, which is what a sidebar shows.
    pub fn lists(&self) -> Result<Vec<ListEntry>> {
        let labels = self.space_labels()?;
        let mut entries: Vec<ListEntry> = Vec::new();
        for (prefix, folder) in self.task_folders()? {
            let space = labels
                .get(&prefix)
                .cloned()
                .unwrap_or_else(|| prefix.clone());
            for name in folder.list_names()? {
                entries.push(ListEntry {
                    path: format!("{prefix}/{name}.md"),
                    name,
                    space: space.clone(),
                });
            }
        }
        // Manual order lives per folder — the sidebar reorders one folder's
        // lists at a time. So: group by folder and sort by name first, then let
        // the stored order rearrange each folder's run. Anything the order does
        // not mention (Inbox, Completed, a freshly created list) keeps its
        // alphabetical place, after the named ones.
        let folder_of = |path: &str| -> String {
            path.rsplit_once('/')
                .map(|(folder, _)| folder.to_string())
                .unwrap_or_default()
        };
        entries.sort_by(|a, b| {
            folder_of(&a.path)
                .cmp(&folder_of(&b.path))
                .then_with(|| a.name.cmp(&b.name))
        });
        // The same helper the spaces go through — the "manual order lives in
        // the config" rule has one implementation, applied here once per folder.
        for run in entries.chunk_by_mut(|a, b| folder_of(&a.path) == folder_of(&b.path)) {
            let namespace = format!("lists:{}", folder_of(&run[0].path));
            self.config.apply_order(&namespace, run, |entry| &entry.name);
        }
        Ok(entries)
    }

    /// How many open tasks each list has, keyed by address, across every
    /// tasks space.
    pub fn open_task_counts(&self) -> Result<BTreeMap<String, usize>> {
        let mut counts = BTreeMap::new();
        for (prefix, folder) in self.task_folders()? {
            for (name, count) in folder.open_task_counts()? {
                counts.insert(format!("{prefix}/{name}.md"), count);
            }
        }
        Ok(counts)
    }

    /// Conflicting copies sitting in the notebook right now.
    ///
    /// Scans the config folder and every tasks space's folder, which is where
    /// sync tools leave them. Reporting is all this does — the user decides
    /// what to keep.
    pub fn conflicts(&self) -> Result<Vec<Conflict>> {
        let mut found = Vec::new();
        let mut dirs = vec![self.config_dir()];
        for (_, folder) in self.task_folders()? {
            dirs.push(folder.dir().to_path_buf());
        }
        for dir in dirs {
            for path in crate::fsio::dir_paths(&dir)? {
                if let Some(conflict) = crate::conflict::describe(&path) {
                    found.push(conflict);
                }
            }
        }
        found.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(found)
    }

    /// Opens a list by its root-relative address (`Tasks/Compras.md`).
    pub fn open_list(&self, path: &str) -> Result<TaskList> {
        let (folder, name) = self.resolve_list(path)?;
        folder.open_list(&name)
    }

    /// Tasks of a list, ready to show.
    ///
    /// Reading does **not** hand out ids: a task only gets one when something
    /// needs to address it (see [`Notebook::ensure_task_id`]). Opening a list
    /// therefore leaves a hand-written file exactly as it was.
    ///
    /// The one thing reading does fix is a *duplicated* id, because that makes
    /// two lines indistinguishable to every later operation. That is rare, so
    /// the file is only rewritten when it actually happens.
    pub fn tasks_in(&self, path: &str) -> Result<Vec<Task>> {
        let mut tasks = self.open_list(path)?;
        if !self.is_read_only() && tasks.dedupe_ids() > 0 {
            tasks.save()?;
        }
        Ok(tasks.tasks().cloned().collect())
    }

    /// Gives the task at `position` in the list at `path` an id, and returns
    /// it.
    ///
    /// The frontend shows tasks by position; the moment the user acts on one
    /// — pulls it into a period, completes it — it needs a stable name. This
    /// is where a task earns one.
    pub fn ensure_task_id(&self, path: &str, position: usize) -> Result<String> {
        self.ensure_writable()?;
        let mut tasks = self.open_list(path)?;

        let existing = tasks
            .tasks()
            .nth(position)
            .ok_or_else(|| Error::TaskNotFound(format!("{path}[{position}]")))?
            .id
            .clone();
        if let Some(id) = existing {
            return Ok(id);
        }

        let id = tasks
            .ensure_id_at(position)
            .ok_or_else(|| Error::TaskNotFound(format!("{path}[{position}]")))?;
        tasks.save()?;
        Ok(id)
    }

    /// The fixed space's inbox.
    pub fn inbox(&self) -> Result<TaskList> {
        self.open_list(&Self::inbox_path())
    }

    /// Whether a list is one the app protects: the folder's main list (the
    /// space *is* that list, spec 3.5) and its Completed. Both come back
    /// on every open, and neither can be renamed or deleted.
    fn is_protected_list(folder: &crate::folder::TaskFolder, name: &str) -> bool {
        name == COMPLETED_LIST || name == folder.main_list_name()
    }

    /// Creates a new list inside `folder` (a root-relative space folder,
    /// e.g. `Tasks`). Fails if one with that name already exists.
    pub fn create_list(&self, folder: &str, name: &str) -> Result<TaskList> {
        self.ensure_writable()?;
        // A list name is a leaf: a `/` here would silently create a nested
        // folder instead of a list called "sub/lista".
        if name.contains('/') {
            return Err(Error::InvalidListName(name.to_string()));
        }
        // Validate folder and name in one go by resolving the would-be path.
        let address = format!("{folder}/{name}.md");
        let (task_folder, name) = self.resolve_list(&address)?;
        let path = task_folder.list_path(&name)?;
        if path.exists() {
            return Err(Error::InvalidListName(format!("{name} already exists")));
        }
        crate::fsio::write_atomically(&path, b"")?;
        TaskList::load(path)
    }

    /// Renames a user list (addressed by path) to a new **name**, in the same
    /// folder — a rename never moves a list between spaces. Repoints
    /// everything that referred to it: the `origin` of completed tasks in the
    /// folder's own Completed (otherwise undo would send them to a list that
    /// no longer exists) and the day/week states.
    pub fn rename_list(&self, from: &str, to_name: &str) -> Result<()> {
        self.ensure_writable()?;
        let (folder, from_name) = self.resolve_list(from)?;
        if Self::is_protected_list(&folder, &from_name) {
            return Err(Error::Protected(from_name));
        }
        if to_name == COMPLETED_LIST {
            return Err(Error::InvalidListName(to_name.to_string()));
        }

        let source = folder.list_path(&from_name)?;
        let target = folder.list_path(to_name)?;
        if !source.exists() {
            return Err(Error::InvalidListName(format!("{from} does not exist")));
        }
        if target.exists() {
            return Err(Error::InvalidListName(format!("{to_name} already exists")));
        }

        std::fs::rename(&source, &target).ctx(&target)?;

        // Origins live in the folder's own Completed and hold bare names —
        // relative to the space, so the folder stays portable (spec 3.5).
        let mut completed = folder.open_list(COMPLETED_LIST)?;
        if completed.repoint_origin(&from_name, to_name) > 0 {
            completed.save()?;
        }

        let (dir, _) = split_list_path(from)?;
        let to_path = format!("{dir}/{to_name}.md");
        self.update_states(|state| state.rename_path(from, &to_path))
    }

    /// Deletes a user list, moving whatever was still in it to the **same
    /// folder's** Inbox.
    ///
    /// Deleting a list is a filing decision, not a decision to throw work
    /// away — principle 2, the data is the user's. An empty list disappears
    /// silently; one with tasks leaves them in the folder's Inbox.
    pub fn delete_list(&self, path: &str) -> Result<usize> {
        self.ensure_writable()?;
        let (folder, name) = self.resolve_list(path)?;
        if Self::is_protected_list(&folder, &name) {
            return Err(Error::Protected(name));
        }

        let file = folder.list_path(&name)?;
        if !file.exists() {
            return Err(Error::InvalidListName(format!("{path} does not exist")));
        }

        // Every task moves, not just the ones that happen to have an id —
        // most tasks never earn one, and losing them here would be silent.
        let list = TaskList::load(&file)?;
        let rescued: Vec<Task> = list.tasks().cloned().collect();

        let main_list = folder.main_list_name();
        let mut inbox = folder.open_list(&main_list)?;
        for task in &rescued {
            inbox.add(task.clone());
        }

        // Inbox first, then the file goes away: a crash in between leaves a
        // duplicate, never a hole.
        //
        // To the trash rather than gone: the rescue above only carries the
        // *tasks*, and a list file may also hold a heading, a note to self,
        // whatever prose the user wrote around them. That is theirs too.
        inbox.save()?;
        self.trash_path(&file)?;
        let rescued = rescued.len();

        let (dir, _) = split_list_path(path)?;
        let inbox_path = format!("{dir}/{main_list}.md");
        // References now point at the main-list copies, which carry the same
        // ids; repointing keeps a pulled task pulled.
        self.update_states(|state| state.rename_path(path, &inbox_path))?;
        Ok(rescued)
    }
}
