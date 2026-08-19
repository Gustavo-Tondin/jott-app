//! A task list file (`jott.tasks/task-list.md` and friends).
//!
//! A list is read as a sequence of lines, not as a bag of tasks: anything that
//! is not a task — headings, notes, blank lines — is kept verbatim and written
//! back untouched. The file belongs to the user, and the app is only one of
//! the tools that edit it.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::error::{Error, Result};
use crate::id;
use crate::task::Task;

/// One line of a list file.
///
/// A `Task` is far bigger than a `Raw`, so every line of a file costs what a
/// task costs. Boxing it would save that, and is deliberately not done: a list
/// is read to be shown, so most lines ARE tasks, and the pointer chase would be
/// paid on the common case to save memory on the rare one.
#[allow(clippy::large_enum_variant)]
#[derive(Debug, Clone, PartialEq)]
pub enum Line {
    Task(Task),
    /// Any line that is not a task, preserved exactly as found.
    Raw(String),
}

/// An in-memory list file. Changes only reach the disk on [`TaskList::save`].
#[derive(Debug, Clone)]
pub struct TaskList {
    path: PathBuf,
    lines: Vec<Line>,
    /// Whether the file ended with a newline, so saving does not silently
    /// change a byte the user did not ask us to change.
    trailing_newline: bool,
}

impl TaskList {
    /// Reads a list from disk. A missing file is an empty list, not an error:
    /// lists are recreated on demand.
    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        let content = match std::fs::read_to_string(&path) {
            Ok(content) => content,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(e) => return Err(Error::Io { path, source: e }),
        };
        Ok(Self::from_content(path, &content))
    }

    /// Parses a list from text, with no file behind it. Saving one of these
    /// would write to an empty path, so it is for reading and for tests.
    pub fn from_text(content: &str) -> Self {
        Self::from_content(PathBuf::new(), content)
    }

    /// The lines as parsed, tasks and everything else.
    pub fn lines(&self) -> &[Line] {
        &self.lines
    }

    pub(crate) fn from_content(path: PathBuf, content: &str) -> Self {
        let trailing_newline = content.is_empty() || content.ends_with('\n');
        let mut lines: Vec<Line> = Vec::new();

        for raw in content.lines() {
            let indent = raw.len() - raw.trim_start().len();

            // A line indented further than the task above it belongs to that
            // task — its metadata, description or subtasks. This is what makes
            // one task span several lines.
            if let Some(Line::Task(open)) = lines.last_mut() {
                if !raw.trim().is_empty() && indent > open.indent.len() && open.absorb(raw) {
                    continue;
                }
            }

            match Task::parse(raw) {
                Some(task) => lines.push(Line::Task(task)),
                None => lines.push(Line::Raw(raw.to_string())),
            }
        }

        Self {
            path,
            lines,
            trailing_newline,
        }
    }

    pub fn tasks(&self) -> impl Iterator<Item = &Task> {
        self.lines.iter().filter_map(|line| match line {
            Line::Task(task) => Some(task),
            Line::Raw(_) => None,
        })
    }

    /// Every task, to be changed in place — for a rewrite that touches all of
    /// them rather than one by id (a renamed file, 2026-08-19).
    pub fn tasks_mut(&mut self) -> impl Iterator<Item = &mut Task> {
        self.lines.iter_mut().filter_map(|line| match line {
            Line::Task(task) => Some(task),
            Line::Raw(_) => None,
        })
    }

    pub fn is_empty(&self) -> bool {
        self.tasks().next().is_none()
    }

    pub fn find(&self, id: &str) -> Option<&Task> {
        self.tasks().find(|t| t.id.as_deref() == Some(id))
    }

    fn position_of(&self, id: &str) -> Option<usize> {
        self.lines.iter().position(|line| {
            matches!(line, Line::Task(task) if task.id.as_deref() == Some(id))
        })
    }

    fn taken_ids(&self) -> HashSet<String> {
        self.tasks().filter_map(|t| t.id.clone()).collect()
    }

    /// Appends a task and returns its position among the tasks.
    ///
    /// **No id is assigned.** An id only appears when the task needs to be
    /// addressed — see [`TaskList::ensure_id_at`] — so a plain checklist never
    /// grows comments the user did not ask for.
    ///
    /// An incoming id that is already taken in this file gets **replaced**,
    /// not dropped: ids are unique per file, not globally, so a task moving
    /// between lists can collide with one already living there. A task that
    /// already had an id was addressable, and must stay addressable —
    /// otherwise completing it would quietly break its undo.
    pub fn add(&mut self, task: Task) -> usize {
        self.insert_line_at(self.lines.len(), task);
        self.tasks().count() - 1
    }

    /// Puts a task back among the file's lines at `index`, counting lines and
    /// not tasks — the index the trash recorded when the task was removed.
    ///
    /// Restoring is why this exists: a task deleted from the middle of a list
    /// should come back where it was, not at the end. An index past the end
    /// appends, which is what a shorter file (edited by hand meanwhile) means.
    pub fn insert_line_at(&mut self, index: usize, mut task: Task) {
        // Same collision rule as `add`: ids are unique per file, and a task
        // coming back from the trash can land on one taken since.
        if let Some(id) = &task.id {
            let taken = self.taken_ids();
            if taken.contains(id) {
                task.id = Some(id::generate_unique(&taken));
            }
        }
        self.lines.insert(index.min(self.lines.len()), Line::Task(task));
    }

    /// Puts a non-task line back at `index`, exactly as it was. The other half
    /// of restoring: whatever the parser did not read as a task is still the
    /// user's text, and dropping it would lose it.
    pub fn insert_raw_at(&mut self, index: usize, line: String) {
        self.lines.insert(index.min(self.lines.len()), Line::Raw(line));
    }

    /// Adds a task from its text alone — the common case.
    pub fn add_text(&mut self, text: impl Into<String>) -> usize {
        self.add(Task::new(text))
    }

    /// Adds a task and gives it an id immediately, for callers that need to
    /// reference it right away — a state entry, a move between lists.
    ///
    /// Prefer plain [`TaskList::add_text`] when the id is not needed: an
    /// unreferenced task is better off without a comment on its line.
    pub fn add_text_with_id(&mut self, text: impl Into<String>) -> String {
        let position = self.add_text(text);
        self.ensure_id_at(position)
            .expect("the task was just added at this position")
    }

    /// Line index of the task at `position` among the tasks.
    fn line_of_task(&self, position: usize) -> Option<usize> {
        self.lines
            .iter()
            .enumerate()
            .filter(|(_, line)| matches!(line, Line::Task(_)))
            .nth(position)
            .map(|(index, _)| index)
    }

    /// Gives the task at `position` an id, if it does not have one, and
    /// returns it.
    ///
    /// This is the doorway to every operation that addresses a task: pulling
    /// it into a period, completing it, referring to it from anywhere. Reading
    /// a list never calls this, which is what keeps untouched files clean.
    pub fn ensure_id_at(&mut self, position: usize) -> Option<String> {
        let at = self.line_of_task(position)?;
        let taken = self.taken_ids();

        let Line::Task(task) = &mut self.lines[at] else {
            return None;
        };
        if task.id.is_none() {
            task.id = Some(id::generate_unique(&taken));
        }
        task.id.clone()
    }

    /// Replaces the text of an existing task, leaving everything else alone.
    /// The text is collapsed to a single line, like everything user-typed.
    pub fn edit_text(&mut self, id: &str, text: impl Into<String>) -> Result<()> {
        let at = self
            .position_of(id)
            .ok_or_else(|| Error::TaskNotFound(id.to_string()))?;
        if let Line::Task(task) = &mut self.lines[at] {
            task.text = crate::task::single_line(&text.into());
        }
        Ok(())
    }

    /// Marks a task done or undone in place, without moving it between files.
    pub fn set_done(&mut self, id: &str, done: bool) -> Result<()> {
        let at = self
            .position_of(id)
            .ok_or_else(|| Error::TaskNotFound(id.to_string()))?;
        if let Line::Task(task) = &mut self.lines[at] {
            task.done = done;
        }
        Ok(())
    }

    /// Hands out a mutable task, for callers that need to change more than
    /// its text — dates, tags, priority, description, subtasks.
    pub fn task_mut(&mut self, id: &str) -> Result<&mut Task> {
        let at = self
            .position_of(id)
            .ok_or_else(|| Error::TaskNotFound(id.to_string()))?;
        match &mut self.lines[at] {
            Line::Task(task) => Ok(task),
            Line::Raw(_) => unreachable!("position_of only matches task lines"),
        }
    }

    /// Moves the task at `from` (counting tasks, not lines) to position `to`.
    ///
    /// The order of tasks in the file is the order the user sees, so dragging
    /// a task in the app rewrites the file — there is no separate ordering to
    /// keep in sync.
    pub fn move_task_to(&mut self, from: usize, to: usize) -> Result<()> {
        let count = self.tasks().count();
        if from >= count || to >= count {
            return Err(Error::TaskNotFound(format!("position {from} -> {to}")));
        }
        if from == to {
            return Ok(());
        }

        let from_line = self.line_of_task(from).expect("checked above");
        let line = self.lines.remove(from_line);

        // After removing, positions shift: recompute against the new list.
        match self.line_of_task(to) {
            Some(target) => self.lines.insert(target, line),
            None => self.lines.push(line),
        }
        Ok(())
    }

    /// Inserts a copy of a task right after it. The copy is **id-less** (it
    /// earns its own the first time it is addressed, like any new task) and
    /// **origin-less** (a fresh copy is not "from" anywhere). Errors if the id
    /// is not in this list.
    pub fn duplicate(&mut self, id: &str) -> Result<()> {
        let src = self
            .tasks()
            .position(|t| t.id.as_deref() == Some(id))
            .ok_or_else(|| Error::TaskNotFound(id.to_string()))?;
        let mut copy = self.find(id).expect("position just found it").clone();
        copy.id = None;
        copy.origin = None;
        // A copy never completed anything — inheriting the pointer would make
        // the recurrence chain believe this new task already spawned.
        copy.spawned = None;
        let appended = self.add(copy);
        self.move_task_to(appended, src + 1)
    }

    /// Removes a task and hands it back, so the caller can put it elsewhere.
    pub fn remove(&mut self, id: &str) -> Result<Task> {
        let at = self
            .position_of(id)
            .ok_or_else(|| Error::TaskNotFound(id.to_string()))?;
        match self.lines.remove(at) {
            Line::Task(task) => Ok(task),
            Line::Raw(_) => unreachable!("position_of only matches task lines"),
        }
    }

    /// Repoints the `origin` of every task that came from `from` to `to`.
    /// Returns how many changed, so the caller can skip a pointless write.
    ///
    /// Used when a list is renamed: without this, undoing a completed task
    /// would try to send it back to a list that no longer exists.
    pub fn repoint_origin(&mut self, from: &str, to: &str) -> usize {
        let mut changed = 0;
        for line in &mut self.lines {
            if let Line::Task(task) = line {
                if task.origin.as_deref() == Some(from) {
                    task.origin = Some(to.to_string());
                    changed += 1;
                }
            }
        }
        changed
    }

    /// Gives a fresh id to any task whose id repeats one already used earlier
    /// in the file. Tasks without an id are left without one.
    ///
    /// Duplicated ids happen when a line is copy-pasted in an editor, comment
    /// and all. They are worse than missing ids: `find`, `edit_text`, `remove`
    /// and `set_done` all address the first match, so the second copy silently
    /// cannot be edited or completed, and any reference to that id becomes
    /// ambiguous.
    ///
    /// The first occurrence always keeps the id, so references already stored
    /// in a day/week state keep pointing at the same task.
    ///
    /// Returns how many lines changed, so the caller can skip a pointless save.
    pub fn dedupe_ids(&mut self) -> usize {
        let mut seen: HashSet<String> = HashSet::new();
        let mut changed = 0;

        for line in &mut self.lines {
            let Line::Task(task) = line else { continue };
            let Some(id) = task.id.clone() else { continue };

            if !seen.insert(id) {
                let new_id = id::generate_unique(&seen);
                seen.insert(new_id.clone());
                task.id = Some(new_id);
                changed += 1;
            }
        }
        changed
    }

    pub fn render(&self) -> String {
        let mut rendered: Vec<String> = Vec::new();
        for line in &self.lines {
            match line {
                Line::Task(task) => rendered.extend(task.render()),
                Line::Raw(raw) => rendered.push(raw.clone()),
            }
        }

        let mut out = rendered.join("\n");
        if self.trailing_newline && !out.is_empty() {
            out.push('\n');
        }
        out
    }

    /// Writes the list to disk atomically: a half-written list would be a
    /// corrupted notebook, and sync tools may read the file at any moment.
    pub fn save(&self) -> Result<()> {
        crate::fsio::write_atomically(&self.path, self.render().as_bytes())
    }
}
