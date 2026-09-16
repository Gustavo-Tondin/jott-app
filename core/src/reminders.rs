//! Reminders: when a task should ring. One source — the task's own `remind:`
//! moment ([`crate::task::Task::remind`]), asked for task by task. Nothing
//! rings a task that did not ask; what the notebook offers instead is the
//! day summary (`Config::day_summary`), which is a notification about the
//! DAY, not about a task. Who rings is the shell; this module answers
//! "what, and when".

use std::time::Duration;

use chrono::{NaiveDateTime, NaiveTime, Timelike};
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
    /// Where the list is, as a person reads it: the space's readable address
    /// (`Design/Tasks`), plus the list's own name for an extra list.
    pub place: String,
    pub text: String,
    /// The task's due date (`yyyy-mm-dd`), when it has one.
    pub due: Option<String>,
    /// The moment, as the task file writes it (`2026-07-25T09:00`, local).
    pub at: String,
}

/// The reminder of one task: the moment it asked for, or nothing. A done
/// task never rings, and a date alone never does — a task rings because
/// someone set `remind:` on it.
pub fn reminder_of(list: &str, place: &str, position: usize, task: &Task) -> Option<Reminder> {
    if task.done {
        return None;
    }
    task.remind.map(|at| Reminder {
        list: list.to_string(),
        id: task.id.clone(),
        position,
        place: place.to_string(),
        text: task.text.clone(),
        due: task.due.map(|day| day.to_string()),
        at: render_datetime(at),
    })
}

/// Where a task's acknowledgement is filed in the `acks` index
/// (`crate::seen::Index::Acked`): the list's root-relative address, the
/// task's id and the moment it asked for, so a space that is renamed carries
/// every ack under it along, and a `remind:` moved to ANY other moment is a
/// new reminder — one an old ack never silences.
pub fn ack_key(list: &str, id: &str, at: NaiveDateTime) -> String {
    format!("{list}/{id}@{}", render_datetime(at))
}

/// What someone did with a reminder's notification. Every one of them
/// acknowledges the moment in the notebook — a notification that only
/// EXPIRED is none of these, and leaves the other devices ringing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReminderAction {
    /// The body was clicked or tapped: the shell opens the task.
    Open,
    /// Swiped or closed by hand.
    Dismiss,
    /// Completes the task.
    Done,
    /// Rings again an hour from now ([`later_from`]).
    Later,
    /// Rings again tomorrow at the notebook's reminder time ([`tomorrow_at`]).
    Tomorrow,
}

impl ReminderAction {
    /// The name a notification carries (`default` is the freedesktop click).
    pub fn parse(name: &str) -> Option<Self> {
        match name {
            "default" | "open" => Some(Self::Open),
            "dismiss" => Some(Self::Dismiss),
            "done" => Some(Self::Done),
            "later" => Some(Self::Later),
            "tomorrow" => Some(Self::Tomorrow),
            _ => None,
        }
    }
}

/// Where "Later" moves a reminder: an hour from `now`, up to the next five
/// minutes, so the moment reads as one a person would pick.
pub fn later_from(now: NaiveDateTime) -> NaiveDateTime {
    let hour_on = to_minute(now) + chrono::Duration::hours(1);
    let past_five = i64::from(hour_on.minute() % 5);
    if past_five == 0 {
        hour_on
    } else {
        hour_on + chrono::Duration::minutes(5 - past_five)
    }
}

/// Where "Tomorrow" moves a reminder: the day after `now`, at `time`.
pub fn tomorrow_at(now: NaiveDateTime, time: ReminderTime) -> NaiveDateTime {
    (now.date() + chrono::Duration::days(1)).and_time(time.time())
}

/// How many reminders due at once still ring one notification each. Past
/// this — a machine back from a day away — they arrive as one.
pub const RING_APART: usize = 3;

/// Sorts soonest first; ties keep list order, which is the order they came in.
pub fn sort(reminders: &mut [Reminder]) {
    reminders.sort_by(|a, b| a.at.cmp(&b.at));
}

/// The shortest wait a wake-up accepts: a moment already past still waits a
/// beat, so a clock that keeps answering "now" cannot spin.
pub const MIN_WAIT: Duration = Duration::from_secs(1);
/// And the longest: a long sleep or a clock jump is caught up within an hour.
pub const MAX_WAIT: Duration = Duration::from_secs(60 * 60);

/// How long from `now` until `at`, held within [`MIN_WAIT`] and [`MAX_WAIT`].
pub fn bounded_wait(at: NaiveDateTime, now: NaiveDateTime) -> Duration {
    (at - now)
        .to_std()
        .unwrap_or(Duration::ZERO)
        .clamp(MIN_WAIT, MAX_WAIT)
}

/// `now` to the minute — the precision `remind:` and the machine's mark hold.
pub fn to_minute(now: NaiveDateTime) -> NaiveDateTime {
    now.with_second(0)
        .and_then(|at| at.with_nanosecond(0))
        .unwrap_or(now)
}

fn moment_of(reminder: &Reminder) -> Option<NaiveDateTime> {
    crate::task::parse_datetime(&reminder.at)
}

/// The reminders that should ring NOW: at or before `now` (to the minute) and
/// after `until`, the moment up to which this machine already rang. `None` =
/// never, and then nothing from the past rings — a first launch is not an
/// avalanche.
pub fn due_now(reminders: &[Reminder], now: NaiveDateTime, until: Option<NaiveDateTime>) -> Vec<Reminder> {
    let Some(until) = until else {
        return Vec::new();
    };
    let limit = to_minute(now);
    reminders
        .iter()
        .filter(|r| moment_of(r).is_some_and(|at| at <= limit && at > until))
        .cloned()
        .collect()
}

/// The first reminder still ahead of `now` (to the minute), or `None`.
/// `reminders` is sorted soonest first, as `Notebook::reminders` hands it.
pub fn next_after(reminders: &[Reminder], now: NaiveDateTime) -> Option<NaiveDateTime> {
    let limit = to_minute(now);
    reminders.iter().filter_map(moment_of).find(|at| *at > limit)
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
        let r = reminder_of("Tasks/task-list.md", "Tasks", 3, &task).unwrap();
        assert_eq!(r.at, "2026-07-24T18:00");
        assert_eq!(r.position, 3);
        assert_eq!(r.place, "Tasks");
        assert_eq!(r.due.as_deref(), Some("2026-07-25"));
    }

    #[test]
    fn a_date_alone_never_rings() {
        // Dated tasks are announced by the day summary, one notification for
        // the whole day — not by a bell each.
        assert_eq!(reminder_of("L", "L", 0, &dated("2026-07-25")), None);
    }

    #[test]
    fn a_done_task_never_rings() {
        let mut task = dated("2026-07-25");
        task.done = true;
        task.remind = parse_datetime("2026-07-24T18:00");
        assert_eq!(reminder_of("L", "L", 0, &task), None);
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
    fn an_ack_is_filed_under_the_task_inside_its_list_at_its_moment() {
        let at = parse_datetime("2026-07-24T18:00").unwrap();
        assert_eq!(
            ack_key("jott.tasks/task-list.md", "ab12cd", at),
            "jott.tasks/task-list.md/ab12cd@2026-07-24T18:00"
        );
    }

    #[test]
    fn later_is_an_hour_on_up_to_the_next_five_minutes() {
        assert_eq!(later_from(parse_datetime("2026-07-24T13:17:42").unwrap()), parse_datetime("2026-07-24T14:20").unwrap());
        assert_eq!(later_from(parse_datetime("2026-07-24T13:20").unwrap()), parse_datetime("2026-07-24T14:20").unwrap());
        assert_eq!(later_from(parse_datetime("2026-07-24T23:58").unwrap()), parse_datetime("2026-07-25T01:00").unwrap());
    }

    #[test]
    fn tomorrow_is_the_next_day_at_the_notebooks_time() {
        let time = ReminderTime::parse("09:00").unwrap();
        assert_eq!(tomorrow_at(parse_datetime("2026-07-31T23:30").unwrap(), time), parse_datetime("2026-08-01T09:00").unwrap());
    }

    #[test]
    fn an_action_is_named_as_a_notification_carries_it() {
        assert_eq!(ReminderAction::parse("default"), Some(ReminderAction::Open));
        assert_eq!(ReminderAction::parse("later"), Some(ReminderAction::Later));
        assert_eq!(ReminderAction::parse("__closed"), None);
    }

    #[test]
    fn sorting_is_by_moment_soonest_first() {
        let mk = |at: &str| Reminder {
            list: "L".into(),
            id: None,
            position: 0,
            place: "L".into(),
            text: String::new(),
            due: None,
            at: at.into(),
        };
        let mut list = vec![mk("2026-07-25T09:00"), mk("2026-07-24T18:00"), mk("2026-07-25T08:00")];
        sort(&mut list);
        let ats: Vec<_> = list.iter().map(|r| r.at.as_str()).collect();
        assert_eq!(ats, ["2026-07-24T18:00", "2026-07-25T08:00", "2026-07-25T09:00"]);
    }

    fn at(id: &str, when: &str) -> Reminder {
        Reminder {
            list: "L".into(),
            id: Some(id.into()),
            position: 0,
            place: "L".into(),
            text: String::new(),
            due: None,
            at: when.into(),
        }
    }

    fn moment(text: &str) -> NaiveDateTime {
        parse_datetime(text).unwrap()
    }

    fn due_list() -> Vec<Reminder> {
        vec![
            at("a", "2026-07-22T08:00"),
            at("b", "2026-07-22T10:00"),
            at("c", "2026-07-22T10:20"),
            at("d", "2026-07-22T11:00"),
        ]
    }

    #[test]
    fn nothing_from_the_past_rings_on_a_machine_that_never_rang() {
        assert!(due_now(&due_list(), moment("2026-07-22T10:20"), None).is_empty());
    }

    #[test]
    fn everything_between_the_last_ring_and_now_rings_once() {
        // Seconds into the minute still count the minute's reminder as due.
        let now = moment("2026-07-22T10:20:45");
        let due = due_now(&due_list(), now, Some(moment("2026-07-22T08:00")));
        let ids: Vec<_> = due.iter().map(|r| r.id.as_deref().unwrap()).collect();
        assert_eq!(ids, ["b", "c"]);
    }

    #[test]
    fn the_next_one_is_the_first_still_ahead() {
        assert_eq!(next_after(&due_list(), moment("2026-07-22T10:20")), Some(moment("2026-07-22T11:00")));
        assert_eq!(next_after(&due_list(), moment("2026-07-22T12:00")), None);
    }

    #[test]
    fn the_wait_is_bounded_on_both_sides() {
        let now = moment("2026-07-22T10:20");
        assert_eq!(bounded_wait(moment("2026-07-22T10:21"), now), Duration::from_secs(60));
        assert_eq!(bounded_wait(moment("2026-07-22T10:00"), now), MIN_WAIT);
        assert_eq!(bounded_wait(moment("2026-08-22T10:00"), now), MAX_WAIT);
    }
}
