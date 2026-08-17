//! What happens to a single task: moving it between lists, completing it,
//! undoing that, and deleting it.
//!
//! [`Notebook::transfer`] is the primitive under all of them — one pass over
//! each file, target written before source, so a crash between the two writes
//! duplicates a task instead of losing one.

use crate::error::{Error, Result};
use crate::list::TaskList;
use crate::task::Task;
use crate::COMPLETED_LIST;

use super::*;

impl Notebook {
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
        self.ensure_writable()?;
        let mut list = self.open_list(path)?;
        list.duplicate(id)?;
        list.save()?;
        Ok(())
    }

    /// Pins a task to the top of its list, or unpins it (the card's bookmark).
    ///
    /// Filing, not a label: it rides in the hidden comment, so a pinned task
    /// reads the same to anyone opening the file in another editor and no
    /// `#pinned` tag turns up in the tag manager.
    pub fn set_task_pinned(&self, path: &str, id: &str, pinned: bool) -> Result<()> {
        self.ensure_writable()?;
        let mut list = self.open_list(path)?;
        list.task_mut(id)?.pinned = pinned;
        list.save()
    }

    /// The move primitive. `done` optionally flips the checkbox in the same
    /// write, so completing a task is one pass over each file instead of two.
    ///
    /// A recorded origin is the source's **name**, not its path: origins are
    /// only ever resolved inside the same folder (undo goes back to a sibling
    /// list), and a bare name keeps the folder portable as a template.
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

        // Today and This Week reference the *task*, not the place: it stays
        // pulled wherever it goes, including into the folder's Completed —
        // which is what puts a ticked task in the period's "Completed N"
        // section instead of making it vanish (2026-08-06).
        if let Some(settled) = settled {
            self.update_states(|state| state.repoint(from, id, to, &settled))?;
        }
        Ok(moved)
    }

    /// A fresh task stamped with today's civil date — every task the app
    /// creates goes through here, so the by-creation ordering always has a
    /// date to read (2026-08-04).
    pub(super) fn stamped_task(text: impl Into<String>) -> Task {
        let mut task = Task::new(text);
        task.created = Some(crate::clock::civil_today());
        task
    }

    /// Creates a task in `path` and returns its **position**, not an id — a
    /// new task has no id until something needs to address it.
    pub fn create_task(&self, path: &str, text: impl Into<String>) -> Result<usize> {
        self.ensure_writable()?;
        let mut list = self.open_list(path)?;
        let position = list.add(Self::stamped_task(text));
        list.save()?;
        Ok(position)
    }

    // ------------------------------------------------------- complete / undo

    /// Completes a task: it moves to the **same folder's** Completed with its
    /// origin recorded, and stops being pulled into Today and This Week.
    ///
    /// A repeating task leaves its next occurrence behind in the same list,
    /// so finishing it is also what schedules it — there is no scheduler.
    /// Every occurrence is its own item: the spawn is born **with an id**, and
    /// the completed copy records it as `spawned:<id>` — the chain's memory.
    /// Re-completing a restored occurrence finds its spawn still alive and
    /// does not generate another; only the newest occurrence (which never
    /// spawned) schedules the next (decision with the user, 2026-08-05,
    /// replacing the delete-the-spawn undo of 2026-08-04 that duplicated the
    /// chain whenever it had already moved on).
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

        // The task moves; the Day and Week references FOLLOW it into the
        // Completed (done inside `transfer`, for every move alike). Removing
        // them here is what used to make a task ticked in Today disappear from
        // the screen instead of sliding into its "Completed N" section.
        let task = self.transfer(id, path, &completed, OriginAction::Record, Some(true))?;

        // Keep the aggregated Completed index in step (best effort — a failed
        // index write must not fail the completion itself).
        let _ = self.refresh_completed_index();
        Ok(task)
    }

    /// Whether the chain already carries the occurrence `task` would generate
    /// on completion. `Some(id)` means it exists (and `id` is what `spawned:`
    /// should point at — `None` inside when the twin has no id to record);
    /// a `None` return means it truly is missing and should be generated.
    ///
    /// The `spawned:` pointer is authoritative while it resolves — in the
    /// task's own list or its Completed. A dangling pointer (the spawn was
    /// deleted) falls through to generating again. Tasks completed before the
    /// pointer existed fall back to an exact twin of the computed occurrence:
    /// same text, repeat and due date, open in the list or already completed.
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
    ///
    /// `completed` is the address of the Completed list holding the task —
    /// with one Completed per space (spec 3.5), the id alone cannot say
    /// which folder to undo in. The origin is a bare name resolved **inside
    /// that same folder**; a task with no usable origin — hand-written, or
    /// pointing at a name that is no longer valid — lands in the folder's
    /// Inbox rather than nowhere. The origin list is recreated when it no
    /// longer exists.
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
            _ => folder.main_list_name(),
        };
        let (dir, _) = split_list_path(completed)?;
        let target = format!("{dir}/{target_name}.md");

        // The restore keeps `spawned:` — the occurrence this completion
        // generated stays where it is (every occurrence is its own item), and
        // the pointer is exactly what stops a re-completion from generating
        // it again. Deleting the spawn here was the 2026-08-04 approach, and
        // it duplicated the chain whenever the spawn had already moved on.
        let task = self.transfer(id, completed, &target, OriginAction::Clear, Some(false))?;

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
        Ok(out)
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
        // A reference to a gone task would render as a ghost row.
        self.update_states(|state| state.remove(path, id))
    }

    /// Files away completed tasks older than `completedRetentionDays`, in every
    /// space's `completed.md`. Run on open, beside the trash reaper.
    ///
    /// Nothing is destroyed — each one goes to `.jott/trash/`, where the trash
    /// retention then applies, so a task is always recoverable for a while
    /// after it leaves the screen. `0` days means never (2026-08-06).
    ///
    /// A task with no `completed:` stamp is left alone: it was written by hand
    /// or by an older build, and the app has no idea how old it is.
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
