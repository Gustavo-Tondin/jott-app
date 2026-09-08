//! The notebook's task lists: where they live, how they are read, and the
//! three that change them (create, rename, delete). A list is addressed by
//! its root-relative path (`jott.tasks/task-list.md`); [`super::split_list_path`]
//! is the one place that takes such an address apart — it is user input.

use std::collections::BTreeMap;

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
    /// the SAME folder: a completed task never leaves its space.
    pub fn completed_path_of(list_path: &str) -> Result<String> {
        let (dir, _) = split_list_path(list_path)?;
        Ok(format!("{dir}/{COMPLETED_LIST}.md"))
    }

    /// Resolves a root-relative list address (`Tasks/Compras.md`) into the
    /// folder that owns it and the list name. Every operation that receives
    /// a list goes through here — the address is user input.
    pub(super) fn resolve_list(&self, path: &str) -> Result<(crate::folder::TaskFolder, String)> {
        let (dir, name) = split_list_path(path)?;
        Ok((
            crate::folder::TaskFolder::new(self.root.join(dir)),
            name.to_string(),
        ))
    }

    /// Every tasks space's folder, with its root-relative prefix — the one
    /// definition of "where tasks live" behind lists, counts and conflicts.
    pub(super) fn task_folders(&self) -> Result<Vec<(String, crate::folder::TaskFolder)>> {
        Ok(self
            .typed_space_dirs("tasks")?
            .into_iter()
            .map(|(prefix, dir)| (prefix, crate::folder::TaskFolder::new(dir)))
            .collect())
    }

    /// Every list address across every tasks space — the flat form of
    /// `task_folders`, for callers that want addresses, not folder handles.
    pub(super) fn list_paths(&self) -> Result<Vec<ListAddress>> {
        let mut out = Vec::new();
        for (prefix, folder) in self.task_folders()? {
            for name in folder.list_names()? {
                out.push(ListAddress {
                    path: format!("{prefix}/{name}.md"),
                    prefix: prefix.clone(),
                    name,
                });
            }
        }
        Ok(out)
    }

    /// The lists of the notebook, across every tasks space.
    /// Sorted by name, which is what a sidebar shows.
    pub fn lists(&self) -> Result<Vec<ListEntry>> {
        let labels = self.space_labels()?;
        let mut entries: Vec<ListEntry> = Vec::new();
        for list in self.list_paths()? {
            entries.push(ListEntry {
                space: space_label_of(&labels, &list.prefix),
                path: list.path,
                name: list.name,
            });
        }
        // Manual order lives per folder: group by folder, sort by name, then
        // let the stored order rearrange each run. Anything unmentioned keeps
        // its alphabetical place after the named ones.
        entries.sort_by(|a, b| {
            list_dir_of(&a.path)
                .cmp(list_dir_of(&b.path))
                .then_with(|| a.name.cmp(&b.name))
        });
        // The same helper the spaces go through, once per folder.
        for run in entries.chunk_by_mut(|a, b| list_dir_of(&a.path) == list_dir_of(&b.path)) {
            let namespace = format!("lists:{}", list_dir_of(&run[0].path));
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

    /// Conflicting copies sitting in the notebook right now: the config
    /// folder and every tasks space's folder. Reporting only — the user
    /// decides what to keep.
    pub fn conflicts(&self) -> Result<Vec<Conflict>> {
        let mut found = Vec::new();
        let mut dirs = vec![self.config_dir()];
        for (_, folder) in self.task_folders()? {
            dirs.push(folder.dir().to_path_buf());
        }
        for dir in dirs {
            for path in crate::fsio::dir_paths(&dir)? {
                if let Some(mut conflict) = crate::conflict::describe(&path) {
                    conflict.relative =
                        Some(crate::relpath::relative_slash(self.root(), &path));
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

    /// Tasks of a list, ready to show. Reading does NOT hand out ids
    /// ([`Notebook::ensure_task_id`] does), so a hand-written file stays as
    /// it was; the one fix on read is a DUPLICATED id, which makes two lines
    /// indistinguishable, and the file is rewritten only then.
    pub fn tasks_in(&self, path: &str) -> Result<Vec<Task>> {
        let mut tasks = self.open_list(path)?;
        if !self.is_read_only() && tasks.dedupe_ids() > 0 {
            tasks.save()?;
        }
        let mut out: Vec<Task> = tasks.tasks().cloned().collect();
        // Age is stamped where the task LEAVES the notebook, never where it is
        // parsed: a `TaskList` is the file (`notebook::age`).
        self.stamp_tasks(out.iter_mut());
        Ok(out)
    }

    /// Gives the task at `position` in the list at `path` an id, and returns
    /// it. The frontend shows tasks by position; the moment the user acts on
    /// one it needs a stable name, and this is where it earns one.
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

    /// Whether a list is one the app protects: the folder's main list and its
    /// Completed. Both come back on every open; neither is renamed or deleted.
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

    /// Renames a user list (by path) to a new NAME in the same folder — never
    /// across spaces. Repoints the `origin` of completed tasks in the
    /// folder's Completed (undo must not send them to a gone list) and the
    /// day states.
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

        // Origins live in the folder's own Completed and hold bare names,
        // relative to the space, so the folder stays portable.
        let mut completed = folder.open_list(COMPLETED_LIST)?;
        if completed.repoint_origin(&from_name, to_name) > 0 {
            completed.save()?;
        }

        let (dir, _) = split_list_path(from)?;
        let to_path = format!("{dir}/{to_name}.md");
        self.update_states(|state| state.rename_path(from, &to_path))
    }

    /// Deletes a user list, moving whatever was still in it to the SAME
    /// folder's Inbox: deleting a list is a filing decision, not a decision
    /// to throw work away.
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
        let mut inbox = folder.open_list(main_list)?;
        for task in &rescued {
            inbox.add(task.clone());
        }

        // Inbox first, then the file goes away: a crash in between leaves a
        // duplicate, never a hole. To the trash, not gone: the rescue carries
        // only the tasks, and the file may hold the user's prose too.
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
