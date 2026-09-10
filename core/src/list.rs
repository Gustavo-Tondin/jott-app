//! A task list file (`jott.tasks/task-list.md` and friends), read as a
//! sequence of lines, not a bag of tasks: anything that is not a task is kept
//! verbatim and written back untouched — the file belongs to the user.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::arrange::Arrangement;
use crate::error::{Error, Result};
use crate::id;
use crate::space::SpaceConfig;
use crate::task::Task;

/// One line of a list file. `Task` is deliberately not boxed: most lines ARE
/// tasks, and the pointer chase would be paid on the common case.
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
    /// The `.space.json` whose arrangement this list follows: the `.md` IS
    /// the order, so every save puts the tasks back in it. `None` is a list
    /// that only grows by appending (Completed), or has no space behind it.
    space_config: Option<PathBuf>,
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
            space_config: None,
        }
    }

    /// Follows the arrangement of the space whose marker is `config` from now
    /// on: every save rewrites the tasks in that order.
    pub(crate) fn arranged_by(mut self, config: PathBuf) -> Self {
        self.space_config = Some(config);
        self
    }

    pub fn tasks(&self) -> impl Iterator<Item = &Task> {
        self.lines.iter().filter_map(|line| match line {
            Line::Task(task) => Some(task),
            Line::Raw(_) => None,
        })
    }

    /// Every task, to be changed in place — for a rewrite that touches all of
    /// them rather than one by id (a renamed file).
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

    /// Appends a task and returns its position among the tasks. No id is
    /// assigned ([`TaskList::ensure_id_at`] does, on demand). An incoming id
    /// already taken in this file is REPLACED, not dropped: ids are unique
    /// per file, and a task that had one must stay addressable.
    pub fn add(&mut self, task: Task) -> usize {
        self.insert_line_at(self.lines.len(), task);
        self.tasks().count() - 1
    }

    /// Adds a task **above the first one** — the `newTasksOnTop` setting.
    /// Whatever the user wrote above the checklist (a heading, a note to self)
    /// stays above it: the insertion point is the first task line, not line 0.
    /// With no task yet, it lands where `add` would. Returns position 0.
    pub fn add_first(&mut self, task: Task) -> usize {
        let at = self
            .lines
            .iter()
            .position(|line| matches!(line, Line::Task(_)))
            .unwrap_or(self.lines.len());
        self.insert_line_at(at, task);
        0
    }

    /// `add` or `add_first`, by the setting — the one place the two meet.
    pub fn add_placed(&mut self, task: Task, on_top: bool) -> usize {
        if on_top {
            self.add_first(task)
        } else {
            self.add(task)
        }
    }

    /// Adds a task where the list's arrangement puts it and returns its final
    /// position: the top or the bottom by `on_top` — which is also what breaks
    /// a tie under a sort — then the sort itself. A list with no arrangement
    /// (Completed) appends: it is the log of what was ticked, in that order.
    pub fn add_arriving(&mut self, task: Task, on_top: bool) -> usize {
        if self.space_config.is_none() {
            return self.add(task);
        }
        let at = self.add_placed(task, on_top);
        self.settle()
            .iter()
            .position(|&from| from == at)
            .unwrap_or(at)
    }

    /// Puts a task back at line `index` (lines, not tasks — the index the
    /// trash recorded), so a restored task lands where it was. An index past
    /// the end appends.
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

    /// Puts a non-task line back at `index`, exactly as it was — the other
    /// half of restoring.
    pub fn insert_raw_at(&mut self, index: usize, line: String) {
        self.lines.insert(index.min(self.lines.len()), Line::Raw(line));
    }

    /// Adds a task from its text alone — the common case.
    pub fn add_text(&mut self, text: impl Into<String>) -> usize {
        self.add(Task::new(text))
    }

    /// Adds a task and gives it an id immediately, for callers that reference
    /// it right away. Prefer [`TaskList::add_text`] when the id is not needed.
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

    /// Gives the task at `position` an id, if it has none, and returns it.
    /// The doorway to every operation that addresses a task; reading a list
    /// never calls it, which keeps untouched files clean.
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
        self.task_mut(id)?.text = crate::task::single_line(&text.into());
        Ok(())
    }

    /// Marks a task done or undone in place, without moving it between files.
    pub fn set_done(&mut self, id: &str, done: bool) -> Result<()> {
        self.task_mut(id)?.done = done;
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
    /// The file's order IS the order the user sees; there is no separate one.
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

    /// Puts the tasks in the order `positions` names — positions among the
    /// tasks, each exactly once. Only the TASKS move: every other line (a
    /// heading, a note above the checklist, a blank line) keeps its place, and
    /// a task carries its own child lines along. Anything that is not such a
    /// permutation is refused, and the list stays as it was.
    pub fn reorder(&mut self, positions: &[usize]) {
        let slots: Vec<usize> = self
            .lines
            .iter()
            .enumerate()
            .filter(|(_, line)| matches!(line, Line::Task(_)))
            .map(|(index, _)| index)
            .collect();
        let mut named = vec![false; slots.len()];
        let permutation = positions.len() == slots.len()
            && positions
                .iter()
                .all(|&p| p < named.len() && !std::mem::replace(&mut named[p], true));
        if !permutation || is_identity(positions) {
            return;
        }
        let mut taken: Vec<Option<Line>> = slots
            .iter()
            .map(|&slot| Some(std::mem::replace(&mut self.lines[slot], Line::Raw(String::new()))))
            .collect();
        for (&slot, &from) in slots.iter().zip(positions) {
            self.lines[slot] = taken[from].take().expect("a permutation names each task once");
        }
    }

    /// Rewrites the list in `arrangement`; answers the positions applied.
    pub fn arrange(&mut self, arrangement: &Arrangement) -> Vec<usize> {
        let positions = arrangement.positions(&self.tasks().collect::<Vec<_>>());
        self.reorder(&positions);
        positions
    }

    /// Whether the tasks already stand in `arrangement` — false once someone
    /// reordered the file outside the app.
    pub fn is_arranged(&self, arrangement: &Arrangement) -> bool {
        is_identity(&arrangement.positions(&self.tasks().collect::<Vec<_>>()))
    }

    /// Rewrites the list in a saved custom order (`arrange::by_saved_order`).
    pub fn apply_order(&mut self, order: &[String]) {
        let positions = crate::arrange::by_saved_order(&self.tasks().collect::<Vec<_>>(), order);
        self.reorder(&positions);
    }

    /// Puts the tasks back in their space's arrangement, read from its
    /// `.space.json` NOW — it may have changed since the list was opened.
    /// Answers the positions applied (`0..n` when nothing moved).
    pub fn settle(&mut self) -> Vec<usize> {
        let Some(config) = self.space_config.clone() else {
            return (0..self.tasks().count()).collect();
        };
        self.arrange(&Arrangement::of(&SpaceConfig::load(config)))
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

    /// Repoints the `origin` of every task that came from `from` to `to` (a
    /// renamed list: undo must not send a task back to a list that is gone).
    /// Returns how many changed, so the caller can skip a pointless write.
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

    /// Gives a fresh id to any task repeating an id used earlier in the file
    /// (a line copy-pasted with its comment); id-less tasks stay id-less.
    /// The FIRST occurrence keeps the id, so stored references still point at
    /// the same task. Returns how many lines changed.
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
    /// A list that follows a space is settled first — the one place every
    /// write passes, so no caller can leave the file out of its order.
    pub fn save(&mut self) -> Result<()> {
        self.settle();
        crate::fsio::write_atomically(&self.path, self.render().as_bytes())
    }
}

fn is_identity(positions: &[usize]) -> bool {
    positions.iter().enumerate().all(|(i, &p)| i == p)
}
