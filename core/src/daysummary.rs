//! The day summary: one notification at the start of the day, saying what the
//! day holds. It replaces ringing every dated task — a task rings only if it
//! asked (`remind:`), the day is announced once. This module answers when it
//! is due, when the next one is, and what it counts; the words are the shell's.

use std::time::Duration;

use chrono::{NaiveDate, NaiveDateTime};

use crate::reminders::{bounded_wait, ReminderTime};
use crate::task::Task;

/// How many task titles the notification lists before it stops naming them.
/// A system notification is a few lines tall; past this the count says it.
pub const NAMED: usize = 5;

/// The day's `time` as a moment.
pub fn summary_at(day: NaiveDate, time: ReminderTime) -> NaiveDateTime {
    day.and_time(time.time())
}

/// Whether today's summary should be announced NOW: the hour has come and
/// this machine has not announced today yet (`shown_on`). A launch after the
/// hour still gets today's — the summary is about a day, not a moment that
/// can be missed.
pub fn summary_due(now: NaiveDateTime, time: ReminderTime, shown_on: Option<NaiveDate>) -> bool {
    let today = now.date();
    shown_on != Some(today) && now >= summary_at(today, time)
}

/// The next moment a summary falls on: today's hour while it is still ahead
/// and not announced yet, else tomorrow's.
pub fn next_summary_at(now: NaiveDateTime, time: ReminderTime, shown_on: Option<NaiveDate>) -> NaiveDateTime {
    let today = now.date();
    let next = summary_at(today, time);
    if next <= now || shown_on == Some(today) {
        summary_at(today.succ_opt().unwrap_or(today), time)
    } else {
        next
    }
}

/// How long until the next summary, bounded like every wake-up.
pub fn wait_until_summary(now: NaiveDateTime, time: ReminderTime, shown_on: Option<NaiveDate>) -> Duration {
    bounded_wait(next_summary_at(now, time, shown_on), now)
}

/// What the summary of a day counts: its open tasks, the first [`NAMED`] by
/// name, and how many more there are.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DaySummary {
    pub count: usize,
    pub named: Vec<String>,
    pub more: usize,
}

/// The summary of the day's tasks, or `None` when nothing is open: a day with
/// no task is not worth a notification. A ticked task is not the day's load.
pub fn summary_of<'a>(tasks: impl IntoIterator<Item = &'a Task>) -> Option<DaySummary> {
    let open: Vec<&Task> = tasks.into_iter().filter(|task| !task.done).collect();
    if open.is_empty() {
        return None;
    }
    let named: Vec<String> = open.iter().take(NAMED).map(|task| task.text.clone()).collect();
    Some(DaySummary {
        count: open.len(),
        more: open.len() - named.len(),
        named,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::task::parse_datetime;

    fn moment(text: &str) -> NaiveDateTime {
        parse_datetime(text).unwrap()
    }

    fn time(text: &str) -> ReminderTime {
        ReminderTime::parse(text).unwrap()
    }

    fn day(text: &str) -> NaiveDate {
        text.parse().unwrap()
    }

    #[test]
    fn after_the_hour_once_a_day() {
        let now = moment("2026-09-08T09:00");
        assert!(summary_due(now, time("08:00"), None));
        assert!(!summary_due(now, time("08:00"), Some(day("2026-09-08"))));
        // Yesterday's mark says nothing about today.
        assert!(summary_due(now, time("08:00"), Some(day("2026-09-07"))));
    }

    #[test]
    fn never_before_the_hour() {
        assert!(!summary_due(moment("2026-09-08T09:00"), time("10:00"), None));
    }

    #[test]
    fn a_launch_after_the_hour_still_gets_todays() {
        assert!(summary_due(moment("2026-09-08T23:00"), time("08:00"), None));
    }

    #[test]
    fn the_wait_is_todays_hour_while_ahead_and_never_longer_than_the_cap() {
        let now = moment("2026-09-08T07:30");
        assert_eq!(wait_until_summary(now, time("08:00"), None), Duration::from_secs(30 * 60));
        assert_eq!(
            wait_until_summary(now, time("08:00"), Some(day("2026-09-08"))),
            crate::reminders::MAX_WAIT
        );
    }

    #[test]
    fn the_next_summary_is_todays_while_ahead_else_tomorrows() {
        assert_eq!(next_summary_at(moment("2026-09-08T07:30"), time("08:00"), None), moment("2026-09-08T08:00"));
        assert_eq!(next_summary_at(moment("2026-09-08T10:00"), time("08:00"), None), moment("2026-09-09T08:00"));
        assert_eq!(
            next_summary_at(moment("2026-09-08T07:30"), time("08:00"), Some(day("2026-09-08"))),
            moment("2026-09-09T08:00")
        );
    }

    fn tasks(texts: &[&str]) -> Vec<Task> {
        texts.iter().map(|text| Task::new(*text)).collect()
    }

    #[test]
    fn the_count_then_the_tasks_by_name() {
        let day = tasks(&["Pagar aluguel", "Ligar pro dentista"]);
        let said = summary_of(&day).unwrap();
        assert_eq!(said.count, 2);
        assert_eq!(said.named, ["Pagar aluguel", "Ligar pro dentista"]);
        assert_eq!(said.more, 0);
    }

    #[test]
    fn past_a_handful_the_count_carries_the_rest() {
        let texts: Vec<String> = (0..NAMED + 2).map(|i| format!("T{i}")).collect();
        let day = tasks(&texts.iter().map(String::as_str).collect::<Vec<_>>());
        let said = summary_of(&day).unwrap();
        assert_eq!(said.named.len(), NAMED);
        assert_eq!(said.more, 2);
    }

    #[test]
    fn a_completed_task_is_not_part_of_the_days_load() {
        let mut day = tasks(&["Aberta", "Feita"]);
        day[1].done = true;
        assert_eq!(summary_of(&day).unwrap().count, 1);
        day[0].done = true;
        assert_eq!(summary_of(&day), None);
    }
}
