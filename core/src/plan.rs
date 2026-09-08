//! The plan — `.jott/plan.json`: tasks chosen for days that have not come.
//! References (list + id), never text, keyed by day, each day in the order
//! the user dragged; a day with nothing planned is not written. Nothing here
//! reads the clock: `Notebook::open_state` calls `take_due`, which also pours
//! a day that went by while the app was closed into today.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::fsio::write_atomically;
use crate::state::{refs, TaskRef, TaskRefs};

/// The plan's file, inside `.jott/`.
pub const PLAN_FILE: &str = "plan.json";

/// What is planned, by day.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Plan {
    #[serde(default)]
    pub days: BTreeMap<NaiveDate, Vec<TaskRef>>,
}

impl Plan {
    /// The references planned for `day`, in the order the user arranged.
    pub fn of(&self, day: NaiveDate) -> &[TaskRef] {
        self.days.get(&day).map(Vec::as_slice).unwrap_or(&[])
    }

    pub fn contains(&self, day: NaiveDate, path: &str, id: &str) -> bool {
        self.of(day).iter().any(|r| r.path == path && r.id == id)
    }

    /// Whether any day has anything planned.
    pub fn is_empty(&self) -> bool {
        self.days.values().all(Vec::is_empty)
    }

    /// Plans a task for `day`. Idempotent, like the day's `add`: the same
    /// task twice on one day is a no-op. A task can be planned for two
    /// different days — two days are two choices. Returns whether anything
    /// changed.
    pub fn add(&mut self, day: NaiveDate, path: impl Into<String>, id: impl Into<String>) -> bool {
        let reference = TaskRef::new(path, id);
        let items = self.days.entry(day).or_default();
        if items.contains(&reference) {
            return false;
        }
        items.push(reference);
        true
    }

    /// Takes a task out of one day's plan. Returns whether anything changed.
    pub fn remove_from(&mut self, day: NaiveDate, path: &str, id: &str) -> bool {
        let Some(items) = self.days.get_mut(&day) else {
            return false;
        };
        let changed = refs::remove(items, path, id);
        self.prune();
        changed
    }

    /// Rearranges one day to match `refs` — the order the user dragged.
    /// Stable: a reference the caller did not mention keeps its place at the
    /// end, so a plan that changed under the drag loses nothing.
    pub fn set_order(&mut self, day: NaiveDate, refs: &[TaskRef]) {
        if let Some(items) = self.days.get_mut(&day) {
            crate::config::by_rank(items, |item| refs.iter().position(|r| r == item));
        }
    }

    /// Drains every day up to and including `today`, earliest day first,
    /// each day in its own order — what `Notebook::open_state` pours into
    /// the day's state when a planned day arrives.
    pub fn take_due(&mut self, today: NaiveDate) -> Vec<TaskRef> {
        let due: Vec<NaiveDate> = self.days.range(..=today).map(|(day, _)| *day).collect();
        let mut out = Vec::new();
        for day in due {
            if let Some(items) = self.days.remove(&day) {
                out.extend(items);
            }
        }
        out
    }

    /// Drops the days left with nothing, so the file says only what is planned.
    fn prune(&mut self) {
        self.days.retain(|_, items| !items.is_empty());
    }
}

impl TaskRefs for Plan {
    fn remove(&mut self, path: &str, id: &str) -> bool {
        let mut changed = false;
        for items in self.days.values_mut() {
            changed |= refs::remove(items, path, id);
        }
        if changed {
            self.prune();
        }
        changed
    }

    fn repoint(&mut self, from: &str, id: &str, to: &str, to_id: &str) -> bool {
        let mut changed = false;
        for items in self.days.values_mut() {
            changed |= refs::repoint(items, from, id, to, to_id);
        }
        changed
    }

    fn rename_path(&mut self, from: &str, to: &str) -> bool {
        let mut changed = false;
        for items in self.days.values_mut() {
            changed |= refs::rename_path(items, from, to);
        }
        changed
    }

    fn rename_prefix(&mut self, from: &str, to: &str) -> bool {
        let mut changed = false;
        for items in self.days.values_mut() {
            changed |= refs::rename_prefix(items, from, to);
        }
        changed
    }
}

/// The plan file on disk.
#[derive(Debug, Clone)]
pub struct PlanFile {
    path: PathBuf,
    pub plan: Plan,
}

impl PlanFile {
    /// Reads the plan. A missing or corrupt file yields an empty plan.
    pub fn load(path: impl AsRef<Path>) -> Self {
        let path = path.as_ref().to_path_buf();
        let plan = std::fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<Plan>(&text).ok())
            .unwrap_or_default();
        Self { path, plan }
    }

    pub fn save(&self) -> Result<()> {
        let mut text = serde_json::to_string_pretty(&self.plan).expect("Plan always serializes");
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
    fn plans_a_task_for_a_day_once() {
        let mut plan = Plan::default();
        assert!(plan.add(ymd(2026, 9, 5), "jott.tasks/task-list.md", "a"));
        assert!(!plan.add(ymd(2026, 9, 5), "jott.tasks/task-list.md", "a"));
        assert!(plan.contains(ymd(2026, 9, 5), "jott.tasks/task-list.md", "a"));
        assert_eq!(plan.of(ymd(2026, 9, 5)).len(), 1);
        // Another day is another choice.
        assert!(plan.add(ymd(2026, 9, 6), "jott.tasks/task-list.md", "a"));
        assert_eq!(plan.days.keys().copied().collect::<Vec<_>>(), vec![ymd(2026, 9, 5), ymd(2026, 9, 6)]);
    }

    #[test]
    fn a_day_emptied_by_hand_leaves_the_file() {
        let mut plan = Plan::default();
        plan.add(ymd(2026, 9, 5), "jott.tasks/task-list.md", "a");
        assert!(plan.remove_from(ymd(2026, 9, 5), "jott.tasks/task-list.md", "a"));
        assert!(!plan.remove_from(ymd(2026, 9, 5), "jott.tasks/task-list.md", "a"));
        assert!(plan.days.is_empty(), "the empty day should be pruned");
        assert!(plan.is_empty());
    }

    #[test]
    fn days_that_arrived_are_taken_earliest_first_in_their_own_order() {
        let mut plan = Plan::default();
        plan.add(ymd(2026, 9, 6), "l.md", "later");
        plan.add(ymd(2026, 9, 4), "l.md", "b");
        plan.add(ymd(2026, 9, 4), "l.md", "a");
        plan.add(ymd(2026, 9, 2), "l.md", "old");

        let due = plan.take_due(ymd(2026, 9, 4));
        let ids: Vec<&str> = due.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(ids, vec!["old", "b", "a"]);
        // Only what is still ahead stays.
        assert_eq!(plan.days.keys().copied().collect::<Vec<_>>(), vec![ymd(2026, 9, 6)]);
        // And nothing is due twice.
        assert!(plan.take_due(ymd(2026, 9, 4)).is_empty());
    }

    #[test]
    fn a_task_that_moves_or_goes_is_followed_on_every_day() {
        let mut plan = Plan::default();
        plan.add(ymd(2026, 9, 5), "jott.tasks/Compras.md", "a");
        plan.add(ymd(2026, 9, 9), "jott.tasks/Compras.md", "a");
        plan.add(ymd(2026, 9, 9), "jott.tasks/Compras.md", "b");

        assert!(plan.rename_path("jott.tasks/Compras.md", "jott.tasks/Mercado.md"));
        assert!(plan.contains(ymd(2026, 9, 5), "jott.tasks/Mercado.md", "a"));
        assert!(plan.contains(ymd(2026, 9, 9), "jott.tasks/Mercado.md", "b"));

        assert!(plan.repoint("jott.tasks/Mercado.md", "a", "jott.tasks/completed.md", "a9"));
        assert!(plan.contains(ymd(2026, 9, 9), "jott.tasks/completed.md", "a9"));

        assert!(plan.rename_prefix("jott.tasks", "Design/Tasks"));
        assert!(plan.contains(ymd(2026, 9, 9), "Design/Tasks/Mercado.md", "b"));

        assert!(TaskRefs::remove(&mut plan, "Design/Tasks/completed.md", "a9"));
        assert_eq!(plan.days.keys().copied().collect::<Vec<_>>(), vec![ymd(2026, 9, 9)]);
        assert_eq!(plan.of(ymd(2026, 9, 9)).len(), 1);
    }

    #[test]
    fn the_dragged_order_is_kept_and_the_unmentioned_stay_at_the_end() {
        let mut plan = Plan::default();
        for id in ["a", "b", "c"] {
            plan.add(ymd(2026, 9, 5), "l.md", id);
        }
        plan.set_order(ymd(2026, 9, 5), &[TaskRef::new("l.md", "c"), TaskRef::new("l.md", "a")]);
        let ids: Vec<&str> = plan.of(ymd(2026, 9, 5)).iter().map(|r| r.id.as_str()).collect();
        assert_eq!(ids, vec!["c", "a", "b"]);
    }

    #[test]
    fn round_trips_through_disk_in_the_documented_shape() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(PLAN_FILE);

        let mut file = PlanFile::load(&path);
        file.plan.add(ymd(2026, 9, 5), "jott.tasks/task-list.md", "a1b2c3");
        file.save().unwrap();

        let json: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "days": { "2026-09-05": [ { "path": "jott.tasks/task-list.md", "id": "a1b2c3" } ] }
            })
        );

        let reloaded = PlanFile::load(&path);
        assert_eq!(reloaded.plan, file.plan);

        std::fs::write(&path, "{ not json").unwrap();
        assert!(PlanFile::load(&path).plan.is_empty());
    }
}
