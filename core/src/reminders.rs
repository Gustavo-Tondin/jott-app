//! Reminders: when a task should ring.
//!
//! Two sources, one list. A task can carry its own `remind:` moment (see
//! [`crate::task::Task::remind`]), and the notebook can ask for an
//! **automatic** reminder for every dated task — the day of, or the day
//! before, at the notebook's reminder time. The automatic one is computed
//! here and never written to the task: it is a setting about the notebook,
//! not a fact about the task, and turning it off must not leave a trail in
//! a hundred files.
//!
//! Who rings is the shell (a timer while the app is open, the system's
//! alarm service on Android). This module only answers "what, and when".

use chrono::{Duration, NaiveDateTime, NaiveTime};
use serde::{Deserialize, Serialize};

use crate::task::{render_datetime, Task};

/// Whether dated tasks ring without being asked, and when.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AutoRemind {
    #[default]
    Off,
    /// On the due day, at the reminder time.
    DayOf,
    /// The day before, at the reminder time.
    DayBefore,
}

impl AutoRemind {
    pub fn parse(text: &str) -> Option<Self> {
        match text.trim() {
            "off" => Some(Self::Off),
            "dayOf" => Some(Self::DayOf),
            "dayBefore" => Some(Self::DayBefore),
            _ => None,
        }
    }

    /// Unknown falls back to the default, like every other config value.
    pub fn parse_or_default(text: &str) -> Self {
        Self::parse(text).unwrap_or_default()
    }

    pub fn render(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::DayOf => "dayOf",
            Self::DayBefore => "dayBefore",
        }
    }
}

/// The time of day an automatic reminder rings, and the hour the inspector's
/// presets ("tomorrow morning", "on the due date") land on.
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
    /// `true` when the notebook's automatic rule produced this, `false` when
    /// the task asked for it. A task that asked keeps its own and does not
    /// also get the automatic one.
    pub auto: bool,
}

/// The reminders of one task, under the notebook's rule. Zero or one.
///
/// A done task never rings. A task's own `remind:` wins over the automatic
/// one: someone who chose "the day before at 18:00" for one task does not
/// want a second ring at 09:00 the day of.
pub fn reminder_of(
    list: &str,
    position: usize,
    task: &Task,
    auto: AutoRemind,
    time: ReminderTime,
) -> Option<Reminder> {
    if task.done {
        return None;
    }
    let (at, is_auto) = match task.remind {
        Some(at) => (at, false),
        None => (automatic_moment(task, auto, time)?, true),
    };
    Some(Reminder {
        list: list.to_string(),
        id: task.id.clone(),
        position,
        text: task.text.clone(),
        at: render_datetime(at),
        auto: is_auto,
    })
}

fn automatic_moment(task: &Task, auto: AutoRemind, time: ReminderTime) -> Option<NaiveDateTime> {
    let due = task.due?;
    let day = match auto {
        AutoRemind::Off => return None,
        AutoRemind::DayOf => due,
        AutoRemind::DayBefore => due - Duration::days(1),
    };
    Some(day.and_time(time.time()))
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
    fn a_task_with_its_own_reminder_rings_then_and_only_then() {
        let mut task = dated("2026-07-25");
        task.remind = parse_datetime("2026-07-24T18:00");
        let r = reminder_of("Tasks/task-list.md", 3, &task, AutoRemind::DayOf, ReminderTime::default())
            .unwrap();
        assert_eq!(r.at, "2026-07-24T18:00");
        assert!(!r.auto, "its own reminder, not the automatic one");
        assert_eq!(r.position, 3);
    }

    #[test]
    fn the_automatic_rule_rings_dated_tasks_at_the_reminder_time() {
        let task = dated("2026-07-25");
        let at = |auto| {
            reminder_of("L", 0, &task, auto, ReminderTime::parse("08:30").unwrap()).map(|r| r.at)
        };
        assert_eq!(at(AutoRemind::Off), None);
        assert_eq!(at(AutoRemind::DayOf).as_deref(), Some("2026-07-25T08:30"));
        assert_eq!(at(AutoRemind::DayBefore).as_deref(), Some("2026-07-24T08:30"));
        assert!(reminder_of("L", 0, &task, AutoRemind::DayOf, ReminderTime::default()).unwrap().auto);
    }

    #[test]
    fn an_undated_task_gets_no_automatic_reminder() {
        let task = Task::new("Sem data");
        assert_eq!(reminder_of("L", 0, &task, AutoRemind::DayOf, ReminderTime::default()), None);
    }

    #[test]
    fn a_done_task_never_rings() {
        let mut task = dated("2026-07-25");
        task.done = true;
        task.remind = parse_datetime("2026-07-24T18:00");
        assert_eq!(reminder_of("L", 0, &task, AutoRemind::DayOf, ReminderTime::default()), None);
    }

    #[test]
    fn the_day_before_crosses_a_month_boundary() {
        let task = dated("2026-08-01");
        let r = reminder_of("L", 0, &task, AutoRemind::DayBefore, ReminderTime::default()).unwrap();
        assert_eq!(r.at, "2026-07-31T09:00");
    }

    #[test]
    fn config_values_round_trip_and_refuse_nonsense() {
        for v in [AutoRemind::Off, AutoRemind::DayOf, AutoRemind::DayBefore] {
            assert_eq!(AutoRemind::parse(v.render()), Some(v));
        }
        assert_eq!(AutoRemind::parse("sometimes"), None);
        assert_eq!(AutoRemind::parse_or_default("sometimes"), AutoRemind::Off);

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
            auto: false,
        };
        let mut list = vec![mk("2026-07-25T09:00"), mk("2026-07-24T18:00"), mk("2026-07-25T08:00")];
        sort(&mut list);
        let ats: Vec<_> = list.iter().map(|r| r.at.as_str()).collect();
        assert_eq!(ats, ["2026-07-24T18:00", "2026-07-25T08:00", "2026-07-25T09:00"]);
    }
}
