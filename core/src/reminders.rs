//! Reminders: when a task should ring. One source — the task's own `remind:`
//! moment ([`crate::task::Task::remind`]), asked for task by task. Nothing
//! rings a task that did not ask; what the notebook offers instead is the
//! day summary (`Config::day_summary`), which is a notification about the
//! DAY, not about a task. Who rings is the shell; this module answers
//! "what, and when".

use chrono::NaiveTime;
use serde::{Deserialize, Serialize};

use crate::task::{render_datetime, Task};

/// A time of day the notebook holds: the hour the inspector's reminder
/// presets ("tomorrow morning", "on the due date") land on, and the hour the
/// day summary is announced at.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ReminderTime(NaiveTime);

impl Default for ReminderTime {
    fn default() -> Self {
        Self(NaiveTime::from_hms_opt(9, 0, 0).expect("09:00 is a valid time"))
    }
}

impl ReminderTime {
    /// `HH:MM`, 24-hour. Anything else is refused.
    pub fn parse(text: &str) -> Option<Self> {
        NaiveTime::parse_from_str(text.trim(), "%H:%M").ok().map(Self)
    }

    pub fn parse_or_default(text: &str) -> Self {
        Self::parse(text).unwrap_or_default()
    }

    pub fn render(self) -> String {
        self.0.format("%H:%M").to_string()
    }

    pub fn time(self) -> NaiveTime {
        self.0
    }
}

/// One thing to ring about, ready for a shell to schedule.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    /// Root-relative address of the list the task lives in.
    pub list: String,
    /// The task's id, when it has one. A plain checklist task rings just the
    /// same; the shell then opens the list rather than the task.
    pub id: Option<String>,
    /// The task's position in its list — the address a task without an id
    /// still has, and what `ensure_task_id` takes.
    pub position: usize,
    pub text: String,
    /// The moment, as the task file writes it (`2026-07-25T09:00`, local).
    pub at: String,
}

/// The reminder of one task: the moment it asked for, or nothing. A done
/// task never rings, and a date alone never does — a task rings because
/// someone set `remind:` on it.
pub fn reminder_of(list: &str, position: usize, task: &Task) -> Option<Reminder> {
    if task.done {
        return None;
    }
    task.remind.map(|at| Reminder {
        list: list.to_string(),
        id: task.id.clone(),
        position,
        text: task.text.clone(),
        at: render_datetime(at),
    })
}

/// Sorts soonest first; ties keep list order, which is the order they came in.
pub fn sort(reminders: &mut [Reminder]) {
    reminders.sort_by(|a, b| a.at.cmp(&b.at));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::task::parse_datetime;
    use chrono::NaiveDate;

    fn dated(day: &str) -> Task {
        let mut task = Task::new("Pagar aluguel");
        task.due = NaiveDate::parse_from_str(day, "%Y-%m-%d").ok();
        task
    }

    #[test]
    fn a_task_rings_at_the_moment_it_asked_for() {
        let mut task = dated("2026-07-25");
        task.remind = parse_datetime("2026-07-24T18:00");
        let r = reminder_of("Tasks/task-list.md", 3, &task).unwrap();
        assert_eq!(r.at, "2026-07-24T18:00");
        assert_eq!(r.position, 3);
    }

    #[test]
    fn a_date_alone_never_rings() {
        // Dated tasks are announced by the day summary, one notification for
        // the whole day — not by a bell each.
        assert_eq!(reminder_of("L", 0, &dated("2026-07-25")), None);
    }

    #[test]
    fn a_done_task_never_rings() {
        let mut task = dated("2026-07-25");
        task.done = true;
        task.remind = parse_datetime("2026-07-24T18:00");
        assert_eq!(reminder_of("L", 0, &task), None);
    }

    #[test]
    fn config_values_round_trip_and_refuse_nonsense() {
        assert_eq!(ReminderTime::parse("18:05").unwrap().render(), "18:05");
        assert_eq!(ReminderTime::parse("9:00").unwrap().render(), "09:00");
        assert_eq!(ReminderTime::parse("25:00"), None);
        assert_eq!(ReminderTime::parse("nine"), None);
        assert_eq!(ReminderTime::parse_or_default("nine").render(), "09:00");
    }

    #[test]
    fn sorting_is_by_moment_soonest_first() {
        let mk = |at: &str| Reminder {
            list: "L".into(),
            id: None,
            position: 0,
            text: String::new(),
            at: at.into(),
        };
        let mut list = vec![mk("2026-07-25T09:00"), mk("2026-07-24T18:00"), mk("2026-07-25T08:00")];
        sort(&mut list);
        let ats: Vec<_> = list.iter().map(|r| r.at.as_str()).collect();
        assert_eq!(ats, ["2026-07-24T18:00", "2026-07-25T08:00", "2026-07-25T09:00"]);
    }
}
