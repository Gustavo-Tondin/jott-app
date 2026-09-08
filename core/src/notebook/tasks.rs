//! What happens to a single task: moving it between lists, completing it,
//! undoing that, and deleting it. [`Notebook::transfer`] is the primitive
//! under all of them — target written before source, so a crash between the
//! two writes duplicates a task instead of losing one.

use crate::error::{Error, Result};
use crate::list::TaskList;
use crate::task::Task;
use crate::COMPLETED_LIST;

use super::*;

impl Notebook {
    /// Opens the list at `path`, lets `change` edit it, and saves it — the one
    /// shape under every single-list edit. The guard comes first on purpose:
    /// `ensure_writable` lives on the notebook, so a caller holding a bare
    /// `TaskList` writes into a read-only notebook without noticing.
    fn with_list<T>(&self, path: &str, change: impl FnOnce(&mut TaskList) -> Result<T>) -> Result<T> {
        self.ensure_writable()?;
        let mut list = self.open_list(path)?;
        let out = change(&mut list)?;
        list.save()?;
        Ok(out)
    }

    /// Moves a task between lists (addressed by path), preserving its id.
    pub fn move_task(
        &self,
        id: &str,
        from: &str,
        to: &str,
        origin: OriginAction,
    ) -> Result<Task> {
        self.transfer(id, from, to, origin, None)
    }

    /// Inserts a copy of a task right after it, in the same list. The copy
    /// carries the task's fields but no id and no origin — it is a new task.
    pub fn duplicate_task(&self, path: &str, id: &str) -> Result<()> {
        self.with_list(path, |list| list.duplicate(id))
    }

    /// Pins a task to the top of its list, or unpins it. Filing, not a
    /// label: it rides in the hidden comment, so no `#pinned` tag appears.
    pub fn set_task_pinned(&self, path: &str, id: &str, pinned: bool) -> Result<()> {
        self.with_list(path, |list| {
            list.task_mut(id)?.pinned = pinned;
            Ok(())
        })
    }

    /// Replaces a task's text, keeping everything else.
    pub fn edit_task_text(&self, path: &str, id: &str, text: String) -> Result<()> {
        self.with_list(path, |list| list.edit_text(id, text))
    }

    /// Edits any field of a task in one call: the panel saves the task as a
    /// whole, and a half-applied edit would be worse than none.
    pub fn set_task_fields(&self, path: &str, id: &str, fields: crate::task::TaskFields) -> Result<()> {
        self.with_list(path, |list| {
            fields.apply_to(list.task_mut(id)?);
            Ok(())
        })
    }

    /// Reorders a task inside its list. Positions count tasks, not lines.
    pub fn move_task_to(&self, path: &str, from: usize, to: usize) -> Result<()> {
        self.with_list(path, |list| list.move_task_to(from, to))
    }

    /// The move primitive. `done` optionally flips the checkbox in the same
    /// write. A recorded origin is the source's **name**, not its path:
    /// origins resolve only inside the same folder, keeping it portable.
    fn transfer(
        &self,
        id: &str,
        from: &str,
        to: &str,
        origin: OriginAction,
        done: Option<bool>,
    ) -> Result<Task> {
        self.ensure_writable()?;
        let (_, from_name) = self.resolve_list(from)?;
        let mut source = self.open_list(from)?;
        let mut target = self.open_list(to)?;

        let mut task = source.remove(id)?;
        match origin {
            OriginAction::Record => task.origin = Some(from_name),
            OriginAction::Clear => task.origin = None,
            OriginAction::Keep => {}
        }
        if let Some(done) = done {
            task.done = done;
            // Completing stamps the civil date (same wall-clock stamp the
            // trash uses); undoing clears it — "when was this completed" is
            // meaningless on a task that is open again.
            task.completed = done.then(crate::clock::civil_today);
        }

        let fallback = task.clone();
        let position = target.add(task);
        // `add` re-issues an id that the destination already uses, so the task
        // may not have arrived under the name it left with.
        let moved = target.tasks().nth(position).cloned().unwrap_or(fallback);
        let settled = moved.id.clone();

        // Target first: a crash between the two writes duplicates the task
        // instead of losing it, and a duplicate is recoverable by hand.
        target.save()?;
        source.save()?;

        // Today and the plan reference the *task*, not the place: it stays
        // pulled wherever it goes, including into the folder's Completed.
        if let Some(settled) = settled {
            self.update_states(|state| state.repoint(from, id, to, &settled))?;
        }
        // The log follows a task by its id, so the line carries the id it
        // ARRIVED with; when `add` had to re-issue one, the next sweep is
        // what reconciles the two.
        self.logged_task_moved(Some(id), from, to);
        Ok(moved)
    }

    /// A fresh task stamped with today's civil date — every task the app
    /// creates goes through here.
    pub(super) fn stamped_task(text: impl Into<String>) -> Task {
        let mut task = Task::new(text);
        task.created = Some(crate::clock::civil_today());
        task
    }

    /// Creates a task in `path` and returns its **position**. Born WITH an
    /// id: the Timeline follows a task by its id, and it tracks everything.
    pub fn create_task(&self, path: &str, text: impl Into<String>) -> Result<usize> {
        let on_top = self.config.new_tasks_on_top;
        let (position, id, created) = self.with_list(path, |list| {
            let position = list.add_placed(Self::stamped_task(text), on_top);
            let id = list.ensure_id_at(position);
            let created = list.tasks().nth(position).and_then(|task| task.created);
            Ok((position, id, created))
        })?;
        if let (Some(id), Some(created)) = (&id, created) {
            let text = self
                .open_list(path)
                .ok()
                .and_then(|list| list.find(id).map(|task| task.text.clone()))
                .unwrap_or_default();
            self.log_timeline(vec![crate::timeline::Record::created(
                crate::clock::civil_now(),
                crate::timeline::Kind::Task,
                path,
                created,
                text,
            )
            .with_id(id)]);
        }
        Ok(position)
    }

    // ------------------------------------------------------- complete / undo

    /// Completes a task: it moves to the **same folder's** Completed with its
    /// origin recorded. A repeating task leaves its next occurrence in the
    /// same list, born **with an id** that the completed copy records as
    /// `spawned:<id>`; re-completing a restored occurrence spawns nothing new.
    pub fn complete_task(&self, path: &str, id: &str) -> Result<Task> {
        self.ensure_writable()?;
        let completed = Self::completed_path_of(path)?;

        let mut source = self.open_list(path)?;
        let planned = source
            .find(id)
            .cloned()
            .map(|task| (crate::recurrence::respawn(&task), task));
        if let Some((Some(next), task)) = planned {
            match self.find_spawned(&source, &completed, &task, &next) {
                // The chain already has this occurrence: just (re)point at it.
                Some(existing) => {
                    if existing != task.spawned {
                        if let Ok(t) = source.task_mut(id) {
                            t.spawned = existing;
                        }
                        source.save()?;
                    }
                }
                // Schedule it, id first — the pointer needs a target.
                None => {
                    let position = source.add(next);
                    let spawn_id = source.ensure_id_at(position);
                    if let Ok(t) = source.task_mut(id) {
                        t.spawned = spawn_id;
                    }
                    source.save()?;
                }
            }
        }

        // The Day references FOLLOW the task into the Completed (inside
        // `transfer`); removing them here would make a ticked task vanish.
        let task = self.transfer(id, path, &completed, OriginAction::Record, Some(true))?;
        // The log follows the task under the id it ARRIVED with (see
        // `transfer`); the day is the one `transfer` just stamped.
        if let (Some(settled), Some(on)) = (task.id.as_deref(), task.completed) {
            self.logged_task_completed(settled, &completed, on);
        }

        // Keep the aggregated Completed index in step (best effort — a failed
        // index write must not fail the completion itself).
        let _ = self.refresh_completed_index();
        Ok(task)
    }

    /// Whether the chain already carries the occurrence `task` would generate:
    /// `Some(id)` means it exists (`None` inside when the twin has no id);
    /// `None` means generate. The `spawned:` pointer is authoritative while it
    /// resolves; a dangling one, or a task from before it existed, falls back to an exact twin.
    fn find_spawned(
        &self,
        source: &TaskList,
        completed_path: &str,
        task: &Task,
        next: &Task,
    ) -> Option<Option<String>> {
        let done_list = self.open_list(completed_path).ok();

        if let Some(sid) = &task.spawned {
            let alive = source.find(sid).is_some()
                || done_list
                    .as_ref()
                    .is_some_and(|done| done.find(sid).is_some());
            if alive {
                return Some(Some(sid.clone()));
            }
        }

        let is_twin =
            |t: &&Task| t.text == next.text && t.repeat == next.repeat && t.due == next.due;
        if let Some(twin) = source.tasks().filter(|t| !t.done).find(is_twin) {
            return Some(twin.id.clone());
        }
        if let Some(twin) = done_list.as_ref().and_then(|done| done.tasks().find(is_twin)) {
            return Some(twin.id.clone());
        }
        None
    }

    /// Un-completes a task, sending it back to the list it came from.
    /// `completed` addresses the Completed holding it (one per space). The
    /// origin is a bare name resolved **inside that folder**, recreated if
    /// gone; without a usable one the task lands in the main list, never nowhere.
    pub fn uncomplete_task(&self, completed: &str, id: &str) -> Result<Task> {
        self.ensure_writable()?;
        let (folder, _) = self.resolve_list(completed)?;
        let list = self.open_list(completed)?;
        let task = list
            .find(id)
            .ok_or_else(|| Error::TaskNotFound(id.to_string()))?;

        let target_name = match task.origin.as_deref() {
            Some(origin) if folder.list_path(origin).is_ok() => origin.to_string(),
            // No usable origin: the folder's own list, never nowhere.
            _ => folder.main_list_name().to_string(),
        };
        let (dir, _) = split_list_path(completed)?;
        let target = format!("{dir}/{target_name}.md");

        // The restore keeps `spawned:`: the occurrence stays where it is, and
        // the pointer is what stops a re-completion from generating it again.
        let task = self.transfer(id, completed, &target, OriginAction::Clear, Some(false))?;
        if let Some(settled) = task.id.as_deref() {
            self.logged_task_reopened(settled, &target);
        }

        let _ = self.refresh_completed_index();
        Ok(task)
    }

    // -------------------------------------------------------- completed index

    /// Every completed task across all tasks spaces, aggregated for the
    /// Completed screen. The per-space `completed.md` files are the source of
    /// truth; this just gathers them (spec 3.5 — a reconstructible index).
    pub fn completed_all(&self) -> Result<Vec<ListedTask>> {
        let mut out = Vec::new();
        for (prefix, folder) in self.task_folders()? {
            let path = format!("{prefix}/{COMPLETED_LIST}.md");
            if let Ok(list) = folder.open_list(COMPLETED_LIST) {
                for task in list.tasks() {
                    out.push(ListedTask {
                        path: path.clone(),
                        task: task.clone(),
                    });
                }
            }
        }
        // A completed task ages by its `created` like any other (spec 3.6):
        // it leaves the sweep, not the calendar.
        self.stamp_tasks(out.iter_mut().map(|listed| &mut listed.task));
        Ok(out)
    }

    /// Every open task of the notebook, arranged by space — the fixed Tasks
    /// screen's "all lists" view (`Config::tasks_show_all`). Order is the
    /// sidebar's: fixed Tasks first, then the user's spaces as arranged, then
    /// each space's lists. Walks every list: ask on open, never per render.
    pub fn all_tasks(&self) -> Result<Vec<ListedTask>> {
        let mut rank: std::collections::HashMap<String, usize> = self
            .spaces()?
            .iter()
            .enumerate()
            .map(|(rank, sp)| (crate::relpath::relative_slash(&self.root, sp.root()), rank + 1))
            .collect();
        rank.insert(crate::TASKS_DIR.to_string(), 0);
        let mut lists = self.lists()?;
        // Stable: inside one space the order `lists()` gave stays.
        lists.sort_by_key(|entry| rank.get(list_dir_of(&entry.path)).copied().unwrap_or(usize::MAX));

        let mut out = Vec::new();
        for entry in lists {
            if entry.name == COMPLETED_LIST {
                continue;
            }
            for task in self.tasks_in(&entry.path)? {
                if task.done {
                    continue;
                }
                out.push(ListedTask {
                    path: entry.path.clone(),
                    task,
                });
            }
        }
        Ok(out)
    }

    /// Gives every task a `created:` date and an `id:`, on open; only ever
    /// ADDS fields, and lists with nothing missing are not rewritten. An open
    /// task gets today; one in `completed.md` gets its `completed:` date, so
    /// creation never postdates completion. Returns how many were touched.
    pub fn adopt_task_identity(&self) -> Result<usize> {
        self.ensure_writable()?;
        let today = crate::clock::civil_today();
        let mut stamped = 0;
        for address in self.list_paths()? {
            let mut list = self.open_list(&address.path)?;
            let mut changed = 0;
            for task in list.tasks_mut().filter(|task| task.created.is_none()) {
                task.created = Some(task.completed.unwrap_or(today));
                changed += 1;
            }
            let missing: Vec<usize> = list
                .tasks()
                .enumerate()
                .filter(|(_, task)| task.id.is_none())
                .map(|(position, _)| position)
                .collect();
            for position in missing {
                if list.ensure_id_at(position).is_some() {
                    changed += 1;
                }
            }
            if changed > 0 {
                list.save()?;
                stamped += changed;
            }
        }
        Ok(stamped)
    }

    /// Rewrites `.jott/completed.json` from the current `Completed.md` files —
    /// the index the Completed screen reads. Reconstructible: this *is* the
    /// rebuild, run on open and after each completion change.
    pub(super) fn refresh_completed_index(&self) -> Result<()> {
        let items: Vec<serde_json::Value> = self
            .completed_all()?
            .into_iter()
            .filter_map(|listed| {
                listed
                    .task
                    .id
                    .as_ref()
                    .map(|id| serde_json::json!({ "list": listed.path, "id": id }))
            })
            .collect();
        let doc = serde_json::json!({ "schemaVersion": 1, "items": items });
        crate::fsio::write_atomically(
            self.config_dir().join("completed.json"),
            crate::fsio::pretty_json(&doc).as_bytes(),
        )
    }

    /// Deletes a single task, sending its lines to the trash (never destroyed).
    pub fn delete_task(&self, path: &str, id: &str) -> Result<()> {
        self.ensure_writable()?;
        let mut list = self.open_list(path)?;
        let index = list
            .lines()
            .iter()
            .position(|line| matches!(line, crate::list::Line::Task(t) if t.id.as_deref() == Some(id)))
            .unwrap_or(0);
        let task = list.remove(id)?;
        let label = task.text.clone();
        let content = task.render();
        list.save()?;
        self.trash()
            .trash_task(path, index, content, &label, crate::clock::civil_today())?;
        self.logged_task_gone(id, path, crate::timeline::Event::Deleted);
        // A reference to a gone task would render as a ghost row.
        self.update_states(|state| state.remove(path, id))
    }

    /// Files away completed tasks older than `completedRetentionDays` into
    /// `.jott/trash/` (never destroyed), in every space's `completed.md`. Run
    /// on open. `0` days means never. A task with no `completed:` stamp is
    /// left alone: the app has no idea how old it is.
    pub fn reap_completed(&self) -> Result<usize> {
        self.ensure_writable()?;
        let days = self.config.completed_retention_days;
        if days <= 0 {
            return Ok(0);
        }
        let cutoff = crate::clock::civil_today() - chrono::Duration::days(days);

        let mut reaped = 0;
        for (prefix, _) in self.task_folders()? {
            let path = format!("{prefix}/{COMPLETED_LIST}.md");
            let Ok(list) = self.open_list(&path) else {
                continue;
            };
            let expired: Vec<String> = list
                .tasks()
                .filter(|task| matches!(task.completed, Some(day) if day < cutoff))
                .filter_map(|task| task.id.clone())
                .collect();
            for id in expired {
                // Through `delete_task`, so the trash entry, the reference
                // cleanup and the atomic write are the same ones a hand
                // deletion goes through.
                self.delete_task(&path, &id)?;
                reaped += 1;
            }
        }
        if reaped > 0 {
            let _ = self.refresh_completed_index();
        }
        Ok(reaped)
    }
}
