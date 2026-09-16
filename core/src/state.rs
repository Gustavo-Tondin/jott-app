//! The day's state — `.jott/daily-state.json`: references to tasks (list +
//! id), never task text; the `.md` stays the single source of truth. `date`
//! is the logical day, compared against today by [`crate::rollover`]. Days
//! ahead live in the plan (`crate::plan`); both share [`TaskRefs`] so what
//! follows a task around reaches both. The legacy weekly file is removed on open.

use std::path::{Path, PathBuf};

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::fsio::write_atomically;

/// The day's file, inside `.jott/`.
pub const DAILY_STATE_FILE: &str = "daily-state.json";
/// The week's file, from before the calendar. Removed on open; never read.
pub const LEGACY_WEEKLY_STATE_FILE: &str = "weekly-state.json";

/// A pointer to a task that lives in a list. `path` is the list's file,
/// relative to the notebook root (`Tasks/Inbox.md`) — never a bare name,
/// which two folders with an `Inbox` would make ambiguous.
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

/// What every holder of task references must do when a task moves, its list
/// is renamed, or it is deleted. The day's state and the plan both hold
/// references; `Notebook::update_states` reaches them through this.
pub trait TaskRefs {
    /// Removes a reference. Returns whether anything changed.
    fn remove(&mut self, path: &str, id: &str) -> bool;
    /// Follows ONE task to another list, keeping it referenced: moving —
    /// including into `Completed.md` when ticked — must not drop it out of
    /// Today. `to_id` is separate because the destination re-issues an id on
    /// collision. Returns whether anything changed.
    fn repoint(&mut self, from: &str, id: &str, to: &str, to_id: &str) -> bool;
    /// Repoints references after a list is renamed or its tasks moved.
    fn rename_path(&mut self, from: &str, to: &str) -> bool;
    /// Reparents every reference under `from` (a folder, no trailing slash)
    /// to the same place under `to` — a whole folder moving.
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

    /// Three-way merge of one list of references — the rule both holders
    /// share, and the only one either of them needs: these are SETS, so
    /// there is no field to fight over. A reference is in the result when
    /// both sides have it, or when one side has it and the base did not (an
    /// addition); it is out when the base had it and a side dropped it (a
    /// removal). Removal beats the other side keeping it: a task taken out
    /// of the day on one device is a decision, and the task itself is
    /// untouched in its `.md`.
    ///
    /// Order is A's, with B's additions after it: position is not worth a
    /// conflict, and both devices merge the same pair the same way.
    pub fn merge(base: &[TaskRef], a: &[TaskRef], b: &[TaskRef]) -> Vec<TaskRef> {
        let has = |items: &[TaskRef], r: &TaskRef| items.contains(r);
        let keep = |r: &TaskRef| {
            matches!(
                (has(base, r), has(a, r), has(b, r)),
                (_, true, true) | (false, true, false) | (false, false, true)
            )
        };
        let mut out: Vec<TaskRef> = a.iter().filter(|r| keep(r)).cloned().collect();
        for reference in b {
            if keep(reference) && !out.contains(reference) {
                out.push(reference.clone());
            }
        }
        out
    }
}

/// The contents of the day's state file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DayState {
    /// Logical day this state belongs to.
    pub date: NaiveDate,
    #[serde(default)]
    pub items: Vec<TaskRef>,
    /// Tasks that left this period, newest first — taken out by hand, or
    /// dropped by a resetting rollover. References only, like `items`: a
    /// stale entry matches nothing. Skipped when empty.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub recent: Vec<TaskRef>,
    /// Tasks pinned to the top of TODAY — a pin of the day, not of the task:
    /// the list's own pin lives in the `.md`. Independent of `items`, so a
    /// task that joined the day by its date pins too; the turn of the day
    /// clears it ([`crate::rollover`]). Skipped when empty.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pinned: Vec<TaskRef>,
}

impl DayState {
    pub fn new(date: NaiveDate) -> Self {
        Self {
            date,
            items: Vec::new(),
            recent: Vec::new(),
            pinned: Vec::new(),
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
        self.add_placed(path, id, false)
    }

    /// `add`, at the top of the day when `on_top` — the `newTasksOnTop`
    /// setting, which a day obeys like any list.
    pub fn add_placed(&mut self, path: impl Into<String>, id: impl Into<String>, on_top: bool) -> bool {
        let reference = TaskRef::new(path, id);
        // Back in the period, it is no longer something that left it.
        self.recent.retain(|r| r != &reference);
        if self.items.contains(&reference) {
            return false;
        }
        if on_top {
            self.items.insert(0, reference);
        } else {
            self.items.push(reference);
        }
        true
    }

    pub fn is_pinned(&self, path: &str, id: &str) -> bool {
        self.pinned.iter().any(|r| r.path == path && r.id == id)
    }

    /// Pins or unpins a task for the day. Idempotent, like `add`. Returns
    /// whether anything changed.
    pub fn set_pinned(&mut self, path: impl Into<String>, id: impl Into<String>, pinned: bool) -> bool {
        let reference = TaskRef::new(path, id);
        let there = self.pinned.contains(&reference);
        if pinned == there {
            return false;
        }
        if pinned {
            self.pinned.push(reference);
        } else {
            self.pinned.retain(|r| r != &reference);
        }
        true
    }

    /// Remembers references that left the period, newest first, deduplicated
    /// and capped at [`RECENT_LIMIT`]; leaving twice moves it to the front.
    pub fn recall(&mut self, gone: impl IntoIterator<Item = TaskRef>) {
        for reference in gone {
            self.recent.retain(|r| r != &reference);
            self.recent.insert(0, reference);
        }
        self.recent.truncate(RECENT_LIMIT);
    }

    /// Reads a state from JSON, or `None` when the text is not one. Strict
    /// where [`StateFile::load`] is forgiving: a merge reading a half-written
    /// file as an empty day would call every reference a removal.
    pub fn parse(text: &str) -> Option<Self> {
        serde_json::from_str(text).ok()
    }

    /// Merges two versions of the day against the last content the devices
    /// had in common. Whoever's day is NEWER wins outright: a state still on
    /// yesterday never rolled over, and pouring it into today would bring
    /// back a day that is done. On the same day it is [`refs::merge`], the
    /// set rule, over what the day holds and over what left it.
    pub fn merge(base: &Self, a: &Self, b: &Self) -> Self {
        if a.date != b.date {
            return if a.date > b.date { a.clone() } else { b.clone() };
        }
        // A base from another day says nothing about this one; without it
        // every reference reads as an addition, which is the safe way round.
        let empty = Vec::new();
        let common = |pick: fn(&Self) -> &Vec<TaskRef>| -> &Vec<TaskRef> {
            if base.date == a.date {
                pick(base)
            } else {
                &empty
            }
        };

        let items = refs::merge(common(|s| &s.items), &a.items, &b.items);
        let mut recent = refs::merge(common(|s| &s.recent), &a.recent, &b.recent);
        // What is back in the day is no longer something that left it.
        recent.retain(|r| !items.contains(r));
        recent.truncate(RECENT_LIMIT);
        let pinned = refs::merge(common(|s| &s.pinned), &a.pinned, &b.pinned);
        Self {
            date: a.date,
            items,
            recent,
            pinned,
        }
    }
}

// The day's pins follow a task exactly as its reference does: a pin left
// behind on a moved task would be a stale one, and one on a deleted task
// would come back pinned with it. Non-short-circuiting `|`: both must run.
impl TaskRefs for DayState {
    fn remove(&mut self, path: &str, id: &str) -> bool {
        refs::remove(&mut self.items, path, id) | refs::remove(&mut self.pinned, path, id)
    }

    fn repoint(&mut self, from: &str, id: &str, to: &str, to_id: &str) -> bool {
        refs::repoint(&mut self.items, from, id, to, to_id)
            | refs::repoint(&mut self.pinned, from, id, to, to_id)
    }

    fn rename_path(&mut self, from: &str, to: &str) -> bool {
        refs::rename_path(&mut self.items, from, to) | refs::rename_path(&mut self.pinned, from, to)
    }

    fn rename_prefix(&mut self, from: &str, to: &str) -> bool {
        refs::rename_prefix(&mut self.items, from, to)
            | refs::rename_prefix(&mut self.pinned, from, to)
    }
}

/// The day's state file on disk.
#[derive(Debug, Clone)]
pub struct StateFile {
    path: PathBuf,
    pub state: DayState,
}

impl StateFile {
    /// Reads a state file. A missing or corrupt file yields an empty state
    /// for `fallback_date`: losing state must never block opening the
    /// notebook — the tasks are safe in their `.md` files.
    pub fn load(path: impl AsRef<Path>, fallback_date: NaiveDate) -> Self {
        let path = path.as_ref().to_path_buf();
        let state = std::fs::read_to_string(&path)
            .ok()
            .and_then(|text| DayState::parse(&text))
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
    fn a_pin_of_the_day_is_idempotent_and_follows_the_task() {
        let mut state = DayState::new(ymd(2026, 9, 16));
        assert!(state.set_pinned("jott.tasks/task-list.md", "a", true));
        assert!(!state.set_pinned("jott.tasks/task-list.md", "a", true));
        assert!(state.is_pinned("jott.tasks/task-list.md", "a"));

        // Ticked: the reference moves into Completed, and the pin with it.
        assert!(state.repoint("jott.tasks/task-list.md", "a", "jott.tasks/completed.md", "a"));
        assert!(state.is_pinned("jott.tasks/completed.md", "a"));

        // Removed from the notebook: no pin is left behind for it.
        assert!(state.remove("jott.tasks/completed.md", "a"));
        assert!(state.pinned.is_empty());

        state.set_pinned("Casa/task-list.md", "b", true);
        assert!(state.rename_prefix("Casa", "Lar"));
        assert!(state.is_pinned("Lar/task-list.md", "b"));
        assert!(state.set_pinned("Lar/task-list.md", "b", false));
        assert!(!state.set_pinned("Lar/task-list.md", "b", false));
    }

    #[test]
    fn pins_of_the_day_merge_by_the_set_rule() {
        let today = ymd(2026, 9, 16);
        let pin = |ids: &[&str]| {
            let mut state = DayState::new(today);
            for id in ids {
                state.set_pinned("jott.tasks/task-list.md", *id, true);
            }
            state
        };
        let merged = DayState::merge(&pin(&["x"]), &pin(&["x", "a"]), &pin(&["b"]));
        assert_eq!(ids_of(&merged.pinned), vec!["a", "b"]);
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

        let mut file = reloaded;
        file.state.set_pinned("Tasks/Compras.md", "g7h8i9", true);
        file.save().unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        let json: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(json["pinned"], serde_json::json!([{ "path": "Tasks/Compras.md", "id": "g7h8i9" }]));
        assert!(StateFile::load(&path, ymd(1970, 1, 1)).state.is_pinned("Tasks/Compras.md", "g7h8i9"));
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

    /// One line of a merge table: the ids in the base, in A, in B, and the
    /// ids the merge has to leave.
    type Row<'a> = (&'a [&'a str], &'a [&'a str], &'a [&'a str], &'a [&'a str]);

    /// A day holding exactly these ids, all out of one list.
    fn day(date: NaiveDate, ids: &[&str]) -> DayState {
        let mut state = DayState::new(date);
        for id in ids {
            state.add("jott.tasks/task-list.md", *id);
        }
        state
    }

    fn ids_of(items: &[TaskRef]) -> Vec<&str> {
        items.iter().map(|r| r.id.as_str()).collect()
    }

    #[test]
    fn the_day_merges_by_the_set_rule_line_by_line() {
        let today = ymd(2026, 9, 14);
        // base | A | B | in the result?
        let table: &[Row] = &[
            // untouched on both sides
            (&["a"], &["a"], &["a"], &["a"]),
            // one side added
            (&[], &["a"], &[], &["a"]),
            (&[], &[], &["a"], &["a"]),
            // both added the same task
            (&[], &["a"], &["a"], &["a"]),
            // one side took it out of the day
            (&["a"], &[], &["a"], &[]),
            (&["a"], &["a"], &[], &[]),
            // taken out on both
            (&["a"], &[], &[], &[]),
            // each side pulled a different task in
            (&[], &["a"], &["b"], &["a", "b"]),
            // one pulled in while the other took another out
            (&["x"], &["x", "a"], &[], &["a"]),
        ];
        for (base, a, b, expected) in table {
            let merged = DayState::merge(&day(today, base), &day(today, a), &day(today, b));
            assert_eq!(
                ids_of(&merged.items),
                expected.to_vec(),
                "base {base:?}, A {a:?}, B {b:?}"
            );
        }
    }

    #[test]
    fn merging_the_day_is_the_same_whichever_side_is_asked_first() {
        // Both devices merge the SAME pair, and the result has to be the same
        // bytes on each — otherwise they write over each other for ever.
        let today = ymd(2026, 9, 14);
        let base = day(today, &["x"]);
        let a = day(today, &["x", "a"]);
        let b = day(today, &["b"]);

        let one = DayState::merge(&base, &a, &b);
        let other = DayState::merge(&base, &b, &a);

        let sorted = |state: &DayState| {
            let mut ids: Vec<String> = state.items.iter().map(|r| r.id.clone()).collect();
            ids.sort();
            ids
        };
        assert_eq!(sorted(&one), sorted(&other));
        assert_eq!(sorted(&one), vec!["a".to_string(), "b".to_string()]);
    }

    #[test]
    fn a_state_still_on_yesterday_does_not_pour_back_into_today() {
        // The other device never rolled over. Its day is done, and merging it
        // in would put yesterday's leftovers back on screen.
        let base = day(ymd(2026, 9, 13), &["ontem"]);
        let stale = day(ymd(2026, 9, 13), &["ontem", "outra"]);
        let fresh = day(ymd(2026, 9, 14), &["hoje"]);

        let merged = DayState::merge(&base, &stale, &fresh);
        assert_eq!(merged.date, ymd(2026, 9, 14));
        assert_eq!(ids_of(&merged.items), vec!["hoje"]);

        // And the same the other way round.
        let merged = DayState::merge(&base, &fresh, &stale);
        assert_eq!(merged.date, ymd(2026, 9, 14));
        assert_eq!(ids_of(&merged.items), vec!["hoje"]);
    }

    #[test]
    fn a_base_from_another_day_is_no_base_at_all() {
        // Same day on both sides, but the common content is older: every
        // reference reads as an addition, so nothing is dropped.
        let base = day(ymd(2026, 9, 13), &["velha"]);
        let a = day(ymd(2026, 9, 14), &["a"]);
        let b = day(ymd(2026, 9, 14), &["b"]);

        let merged = DayState::merge(&base, &a, &b);
        assert_eq!(ids_of(&merged.items), vec!["a", "b"]);
    }

    #[test]
    fn what_left_the_day_merges_too_and_never_shadows_what_is_in_it() {
        let today = ymd(2026, 9, 14);
        let base = DayState::new(today);
        let mut a = day(today, &["a"]);
        a.recall([TaskRef::new("jott.tasks/task-list.md", "saiu")]);
        let mut b = DayState::new(today);
        b.recall([TaskRef::new("jott.tasks/task-list.md", "a")]);

        let merged = DayState::merge(&base, &a, &b);

        assert_eq!(ids_of(&merged.items), vec!["a"]);
        assert_eq!(
            ids_of(&merged.recent),
            vec!["saiu"],
            "the one the other device pulled back in is not listed as gone"
        );
    }

    #[test]
    fn a_corrupt_state_is_not_read_as_an_empty_day() {
        assert_eq!(DayState::parse("{ not json"), None);
        assert_eq!(DayState::parse("{\"date\":\"2026-09-14\"}").unwrap().date, ymd(2026, 9, 14));
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
