//! The day's state — `.jott/daily-state.json`.
//!
//! The file holds *references* to tasks (list + id), never the task text.
//! The `.md` file in the list stays the single source of truth: a task pulled
//! into today exists in exactly one place on disk, so editing it in Obsidian
//! and seeing it in the app can never disagree.
//!
//! `date` is the logical day this state belongs to. Rollover works by
//! comparing that field to the current logical day (see [`crate::rollover`]).
//! Days that have not come yet live in a file of their own, the plan
//! (`crate::plan`); the two share [`TaskRefs`], so whatever follows a task
//! around — a move, a rename, a delete — reaches both without a second loop.
//!
//! Until 2026-09-04 there was a `weekly-state.json` beside this one: the
//! week as a period of its own. The calendar on the Home replaced it — any
//! day ahead can be planned, so a week-sized bucket had nothing left to
//! hold — and a notebook that still carries the file loses it on open.

use std::path::{Path, PathBuf};

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::fsio::write_atomically;

/// The day's file, inside `.jott/`.
pub const DAILY_STATE_FILE: &str = "daily-state.json";
/// The week's file, from before the calendar. Removed on open; never read.
pub const LEGACY_WEEKLY_STATE_FILE: &str = "weekly-state.json";

/// A pointer to a task that lives in a list.
///
/// `path` is the list's file, **relative to the notebook root**
/// (`Tasks/Inbox.md`) — never a bare name. With more than one folder of
/// tasks there are two lists called `Inbox`, and a name stops identifying
/// anything (phase 7). The states live in `.jott/`, which stays with the
/// notebook, so the notebook root is the natural anchor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TaskRef {
    pub path: String,
    pub id: String,
}

impl TaskRef {
    pub fn new(path: impl Into<String>, id: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            id: id.into(),
        }
    }
}

/// How many departures a state remembers. A short memory on purpose: this
/// answers "what did I just take out of the day", not "what did I ever plan".
pub const RECENT_LIMIT: usize = 20;

/// What every holder of task references must be able to do when a task
/// moves, when its list is renamed, or when it is deleted. The day's state
/// and the plan both hold references; `Notebook::update_states` reaches
/// them through this, so a fourth holder would be a third `impl` and not a
/// fourth loop.
pub trait TaskRefs {
    /// Removes a reference. Returns whether anything changed.
    fn remove(&mut self, path: &str, id: &str) -> bool;
    /// Follows **one task** to another list, keeping it referenced.
    ///
    /// The reference is to a task, not to a place: moving a task between lists
    /// — including into the folder's `Completed.md` when it is ticked — must
    /// not drop it out of Today. Completing used to `remove` here instead, and
    /// that is why a task ticked in Today simply vanished from the screen
    /// rather than sliding into its "Completed N" section (2026-08-06).
    ///
    /// `to_id` is passed separately because the destination list re-issues an
    /// id on collision, so the task may not arrive under the name it left with.
    /// Returns whether anything changed.
    fn repoint(&mut self, from: &str, id: &str, to: &str, to_id: &str) -> bool;
    /// Repoints references after a list is renamed or its tasks moved.
    fn rename_path(&mut self, from: &str, to: &str) -> bool;
    /// Reparents every reference that lives under `from` (a folder, without the
    /// trailing slash) to the same place under `to`. Used when a whole folder
    /// moves — a space changing group — where the lists keep their names
    /// but their addresses change.
    fn rename_prefix(&mut self, from: &str, to: &str) -> bool;
}

/// The four operations over one list of references — what both holders
/// delegate to, so the rule is written once.
pub(crate) mod refs {
    use super::TaskRef;

    pub fn remove(items: &mut Vec<TaskRef>, path: &str, id: &str) -> bool {
        let before = items.len();
        items.retain(|r| !(r.path == path && r.id == id));
        before != items.len()
    }

    pub fn repoint(items: &mut Vec<TaskRef>, from: &str, id: &str, to: &str, to_id: &str) -> bool {
        let mut changed = false;
        for reference in items.iter_mut() {
            if reference.path == from && reference.id == id {
                reference.path = to.to_string();
                reference.id = to_id.to_string();
                changed = true;
            }
        }
        // A move that lands where an identical reference already sits would
        // leave the task listed twice.
        if changed {
            let mut seen = std::collections::HashSet::new();
            items.retain(|r| seen.insert((r.path.clone(), r.id.clone())));
        }
        changed
    }

    pub fn rename_path(items: &mut [TaskRef], from: &str, to: &str) -> bool {
        let mut changed = false;
        for reference in items.iter_mut() {
            if reference.path == from {
                reference.path = to.to_string();
                changed = true;
            }
        }
        changed
    }

    pub fn rename_prefix(items: &mut [TaskRef], from: &str, to: &str) -> bool {
        let prefix = format!("{from}/");
        let mut changed = false;
        for reference in items.iter_mut() {
            if let Some(rest) = reference.path.strip_prefix(&prefix) {
                reference.path = format!("{to}/{rest}");
                changed = true;
            }
        }
        changed
    }
}

/// The contents of the day's state file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DayState {
    /// Logical day this state belongs to.
    pub date: NaiveDate,
    #[serde(default)]
    pub items: Vec<TaskRef>,
    /// Tasks that WERE in this period and left it, newest first — taken out by
    /// hand, or dropped by a rollover that resets (2026-08-17). References
    /// only, exactly like `items`: the task itself is untouched in its list,
    /// and a stale entry here simply matches nothing.
    ///
    /// Skipped when empty so a notebook that never removed anything keeps the
    /// file it always had.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub recent: Vec<TaskRef>,
}

impl DayState {
    pub fn new(date: NaiveDate) -> Self {
        Self {
            date,
            items: Vec::new(),
            recent: Vec::new(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn contains(&self, path: &str, id: &str) -> bool {
        self.items.iter().any(|r| r.path == path && r.id == id)
    }

    /// Pulls a task into the period. Idempotent: pulling twice is a no-op
    /// rather than a duplicate, since the UI can fire the same action twice.
    /// Returns whether anything changed.
    pub fn add(&mut self, path: impl Into<String>, id: impl Into<String>) -> bool {
        let reference = TaskRef::new(path, id);
        // Back in the period means it is no longer something that left it:
        // offering it under "recently pulled" while it sits on the screen
        // would be the panel arguing with itself.
        self.recent.retain(|r| r != &reference);
        if self.items.contains(&reference) {
            return false;
        }
        self.items.push(reference);
        true
    }

    /// Remembers references that left the period, newest first.
    ///
    /// Only what the user can still act on is worth keeping, so the list is
    /// deduplicated and capped at [`RECENT_LIMIT`]; a task that leaves twice
    /// moves to the front instead of being listed twice.
    pub fn recall(&mut self, gone: impl IntoIterator<Item = TaskRef>) {
        for reference in gone {
            self.recent.retain(|r| r != &reference);
            self.recent.insert(0, reference);
        }
        self.recent.truncate(RECENT_LIMIT);
    }

}

impl TaskRefs for DayState {
    fn remove(&mut self, path: &str, id: &str) -> bool {
        refs::remove(&mut self.items, path, id)
    }

    fn repoint(&mut self, from: &str, id: &str, to: &str, to_id: &str) -> bool {
        refs::repoint(&mut self.items, from, id, to, to_id)
    }

    fn rename_path(&mut self, from: &str, to: &str) -> bool {
        refs::rename_path(&mut self.items, from, to)
    }

    fn rename_prefix(&mut self, from: &str, to: &str) -> bool {
        refs::rename_prefix(&mut self.items, from, to)
    }
}

/// The day's state file on disk.
#[derive(Debug, Clone)]
pub struct StateFile {
    path: PathBuf,
    pub state: DayState,
}

impl StateFile {
    /// Reads a state file. A missing or corrupt file yields an empty state for
    /// `fallback_date` — the same forgiveness the config gets, for the same
    /// reason: state is a convenience, and losing it must never block opening
    /// the notebook. The tasks themselves are safe in their `.md` files.
    pub fn load(path: impl AsRef<Path>, fallback_date: NaiveDate) -> Self {
        let path = path.as_ref().to_path_buf();
        let state = std::fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<DayState>(&text).ok())
            .unwrap_or_else(|| DayState::new(fallback_date));
        Self { path, state }
    }

    pub fn save(&self) -> Result<()> {
        let mut text = serde_json::to_string_pretty(&self.state)
            .expect("DayState always serializes");
        text.push('\n');
        write_atomically(&self.path, text.as_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ymd(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    #[test]
    fn file_names_match_the_spec() {
        assert_eq!(DAILY_STATE_FILE, "daily-state.json");
        assert_eq!(LEGACY_WEEKLY_STATE_FILE, "weekly-state.json");
    }

    #[test]
    fn repoint_follows_one_task_and_never_duplicates_it() {
        let mut state = DayState::new(ymd(2026, 8, 6));
        state.add("Tasks/Inbox/Inbox.md", "a");
        state.add("Tasks/Inbox/Inbox.md", "b");
        state.add("Tasks/Inbox/Completed.md", "z");

        assert!(state.repoint("Tasks/Inbox/Inbox.md", "a", "Tasks/Inbox/Completed.md", "a"));
        assert!(state.contains("Tasks/Inbox/Completed.md", "a"));
        // Its neighbour stayed where it was.
        assert!(state.contains("Tasks/Inbox/Inbox.md", "b"));

        // The destination re-issued the id: the reference follows the new one.
        assert!(state.repoint("Tasks/Inbox/Inbox.md", "b", "Tasks/Inbox/Completed.md", "b9"));
        assert!(state.contains("Tasks/Inbox/Completed.md", "b9"));
        assert!(!state.contains("Tasks/Inbox/Completed.md", "b"));

        // Landing on a reference that already exists must not list it twice.
        state.add("Tasks/Inbox/Inbox.md", "z");
        state.repoint("Tasks/Inbox/Inbox.md", "z", "Tasks/Inbox/Completed.md", "z");
        assert_eq!(state.len(), 3);

        // A task that is not there changes nothing.
        assert!(!state.repoint("Tasks/Inbox/Inbox.md", "nope", "x.md", "nope"));
    }

    #[test]
    fn adds_and_removes_references() {
        let mut state = DayState::new(ymd(2026, 7, 20));

        assert!(state.add("Tasks/Compras.md", "g7h8i9"));
        assert!(state.contains("Tasks/Compras.md", "g7h8i9"));
        assert_eq!(state.len(), 1);

        assert!(state.remove("Tasks/Compras.md", "g7h8i9"));
        assert!(state.is_empty());
        assert!(!state.remove("Tasks/Compras.md", "g7h8i9"));
    }

    #[test]
    fn pulling_the_same_task_twice_does_not_duplicate_it() {
        let mut state = DayState::new(ymd(2026, 7, 20));
        assert!(state.add("Tasks/Inbox.md", "abc123"));
        assert!(!state.add("Tasks/Inbox.md", "abc123"));
        assert_eq!(state.len(), 1);
    }

    #[test]
    fn the_same_id_in_two_lists_is_two_references() {
        // Ids are unique per file, not globally — the format lets a hand-copied
        // line carry the same id into another list.
        let mut state = DayState::new(ymd(2026, 7, 20));
        state.add("Tasks/Inbox.md", "abc123");
        state.add("Tasks/Compras.md", "abc123");
        assert_eq!(state.len(), 2);

        assert!(state.remove("Tasks/Inbox.md", "abc123"));
        assert_eq!(state.len(), 1);
    }

    #[test]
    fn renaming_a_list_repoints_its_references() {
        let mut state = DayState::new(ymd(2026, 7, 20));
        state.add("Tasks/Compras.md", "a");
        state.add("Tasks/Inbox.md", "b");

        assert!(state.rename_path("Tasks/Compras.md", "Tasks/Mercado.md"));
        assert!(state.contains("Tasks/Mercado.md", "a"));
        assert!(state.contains("Tasks/Inbox.md", "b"));
        assert!(!state.rename_path("Tasks/Compras.md", "Tasks/Mercado.md"));
    }

    #[test]
    fn what_leaves_the_period_is_remembered_until_it_is_pulled_back() {
        let mut state = DayState::new(ymd(2026, 8, 17));
        state.add("Tasks/Inbox.md", "a");
        state.remove("Tasks/Inbox.md", "a");
        state.recall([TaskRef::new("Tasks/Inbox.md", "a")]);

        assert_eq!(state.recent, vec![TaskRef::new("Tasks/Inbox.md", "a")]);

        // Pulled back in: it is on screen again, so it stops being something
        // that left.
        state.add("Tasks/Inbox.md", "a");
        assert!(state.recent.is_empty());
    }

    #[test]
    fn the_memory_of_departures_is_newest_first_deduplicated_and_capped() {
        let mut state = DayState::new(ymd(2026, 8, 17));
        for n in 0..RECENT_LIMIT + 5 {
            state.recall([TaskRef::new("Tasks/Inbox.md", n.to_string())]);
        }

        assert_eq!(state.recent.len(), RECENT_LIMIT);
        // The last one to leave is the first one offered back.
        assert_eq!(state.recent[0].id, (RECENT_LIMIT + 4).to_string());

        // Leaving twice moves it to the front instead of listing it twice.
        state.recall([TaskRef::new("Tasks/Inbox.md", "5")]);
        assert_eq!(state.recent[0].id, "5");
        assert_eq!(
            state.recent.iter().filter(|r| r.id == "5").count(),
            1,
            "a mesma tarefa listada duas vezes"
        );
    }

    #[test]
    fn round_trips_through_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DAILY_STATE_FILE);

        let mut file = StateFile::load(&path, ymd(2026, 7, 20));
        file.state.add("Tasks/Compras.md", "g7h8i9");
        file.save().unwrap();

        let reloaded = StateFile::load(&path, ymd(1970, 1, 1));
        assert_eq!(reloaded.state.date, ymd(2026, 7, 20));
        assert_eq!(reloaded.state.items, vec![TaskRef::new("Tasks/Compras.md", "g7h8i9")]);
    }

    #[test]
    fn serializes_in_the_documented_shape() {
        let mut state = DayState::new(ymd(2026, 7, 17));
        state.add("Tasks/Compras.md", "g7h8i9");

        let json: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&state).unwrap()).unwrap();

        assert_eq!(
            json,
            serde_json::json!({
                "date": "2026-07-17",
                "items": [{ "path": "Tasks/Compras.md", "id": "g7h8i9" }]
            })
        );
    }

    #[test]
    fn a_missing_or_corrupt_file_yields_an_empty_state() {
        let dir = tempfile::tempdir().unwrap();

        let absent = StateFile::load(dir.path().join("absent.json"), ymd(2026, 7, 20));
        assert!(absent.state.is_empty());
        assert_eq!(absent.state.date, ymd(2026, 7, 20));

        let corrupt_path = dir.path().join("corrupt.json");
        std::fs::write(&corrupt_path, "{ not json").unwrap();
        let corrupt = StateFile::load(&corrupt_path, ymd(2026, 7, 20));
        assert!(corrupt.state.is_empty());
        assert_eq!(corrupt.state.date, ymd(2026, 7, 20));
    }
}
