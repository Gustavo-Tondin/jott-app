//! When a repeating task comes back.
//!
//! Two decisions from `docs/project-strategy.md` 3.2 shape everything here:
//!
//! - **The next date is anchored on the original date, never on when the task
//!   was completed.** A monthly task due on the 1st, finished on the 10th,
//!   comes back on the 1st — not the 10th. Paying rent should not drift later
//!   every month just because you paid late once.
//! - **Completing a repeating task writes a new line.** No scheduler, no
//!   background state: the file stays the whole truth.

use chrono::{Datelike, Duration, NaiveDate};

use crate::task::{Repeat, RepeatUnit, Task};

/// The date a repeating task should come back, given the date it was anchored
/// on. `None` when the task does not repeat.
fn next_occurrence(repeat: Repeat, from: NaiveDate) -> Option<NaiveDate> {
    let every = repeat.every.max(1) as i64;
    match repeat.unit {
        RepeatUnit::Day => Some(from + Duration::days(every)),
        RepeatUnit::Week => Some(from + Duration::weeks(every)),
        RepeatUnit::Month => add_months(from, every as u32),
    }
}

/// Adds whole months, clamping to the end of the target month.
///
/// The 31st has no counterpart in most months. Falling back to the last day
/// keeps a "last day of the month" task on the last day, which is what someone
/// who wrote 31 meant.
fn add_months(date: NaiveDate, months: u32) -> Option<NaiveDate> {
    let zero_based = date.month0() + months;
    let year = date.year() + (zero_based / 12) as i32;
    let month = zero_based % 12 + 1;

    let last_day = days_in_month(year, month);
    NaiveDate::from_ymd_opt(year, month, date.day().min(last_day))
}

fn days_in_month(year: i32, month: u32) -> u32 {
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    let first_of_next = NaiveDate::from_ymd_opt(next_year, next_month, 1)
        .expect("a first-of-month is always a valid date");
    (first_of_next - Duration::days(1)).day()
}

/// Builds the next occurrence of a task that was just completed.
///
/// Returns `None` when the task does not repeat, or when it has no date to
/// anchor on — a repeating task with neither `@date` nor `created` cannot say
/// when it comes back, and inventing an anchor would be worse than doing
/// nothing.
///
/// The new task is deliberately a *fresh* one: no id (it has never been
/// referenced), not done, and no origin. Everything the user wrote — text,
/// tags, priority, description, subtasks — comes along, with the subtasks
/// unchecked again, because next month's chore starts from zero.
pub fn respawn(task: &Task) -> Option<Task> {
    let repeat = task.repeat?;
    let anchor = task.due.or(task.created)?;
    let next = next_occurrence(repeat, anchor)?;

    let mut respawned = task.clone();
    respawned.id = None;
    respawned.origin = None;
    respawned.done = false;
    // A fresh task was never completed — without this, respawning FROM an
    // already-completed copy (the undo path) would inherit the stamp.
    respawned.completed = None;
    // And it never spawned anyone either; it will earn its own pointer when
    // it is completed in turn.
    respawned.spawned = None;
    respawned.due = Some(next);
    // Only meaningful when there is no due date; now there is one.
    respawned.created = task.due.is_none().then_some(next);
    for subtask in &mut respawned.subtasks {
        subtask.done = false;
    }
    Some(respawned)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ymd(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    fn repeat(every: u32, unit: RepeatUnit) -> Repeat {
        Repeat { every, unit }
    }

    #[test]
    fn adds_days_and_weeks() {
        assert_eq!(
            next_occurrence(repeat(1, RepeatUnit::Day), ymd(2026, 7, 20)),
            Some(ymd(2026, 7, 21))
        );
        assert_eq!(
            next_occurrence(repeat(3, RepeatUnit::Day), ymd(2026, 7, 20)),
            Some(ymd(2026, 7, 23))
        );
        assert_eq!(
            next_occurrence(repeat(1, RepeatUnit::Week), ymd(2026, 7, 20)),
            Some(ymd(2026, 7, 27))
        );
        assert_eq!(
            next_occurrence(repeat(2, RepeatUnit::Week), ymd(2026, 7, 20)),
            Some(ymd(2026, 8, 3))
        );
    }

    #[test]
    fn adds_months_keeping_the_day() {
        assert_eq!(
            next_occurrence(repeat(1, RepeatUnit::Month), ymd(2026, 7, 15)),
            Some(ymd(2026, 8, 15))
        );
        assert_eq!(
            next_occurrence(repeat(6, RepeatUnit::Month), ymd(2026, 7, 15)),
            Some(ymd(2027, 1, 15))
        );
    }

    #[test]
    fn the_thirty_first_lands_on_the_last_day_of_a_shorter_month() {
        assert_eq!(
            next_occurrence(repeat(1, RepeatUnit::Month), ymd(2026, 1, 31)),
            Some(ymd(2026, 2, 28))
        );
        assert_eq!(
            next_occurrence(repeat(1, RepeatUnit::Month), ymd(2026, 3, 31)),
            Some(ymd(2026, 4, 30))
        );
    }

    #[test]
    fn february_29_exists_on_leap_years() {
        // 2028 is a leap year; the clamp must not fire.
        assert_eq!(
            next_occurrence(repeat(1, RepeatUnit::Month), ymd(2028, 1, 31)),
            Some(ymd(2028, 2, 29))
        );
    }

    #[test]
    fn crossing_the_year_works() {
        assert_eq!(
            next_occurrence(repeat(1, RepeatUnit::Month), ymd(2026, 12, 10)),
            Some(ymd(2027, 1, 10))
        );
        assert_eq!(
            next_occurrence(repeat(1, RepeatUnit::Day), ymd(2026, 12, 31)),
            Some(ymd(2027, 1, 1))
        );
    }

    #[test]
    fn respawn_anchors_on_the_original_date_not_on_today() {
        // The decision this test exists for: a task due on the 1st, completed
        // on the 10th, comes back on the 1st.
        let mut task = Task::new("Pagar aluguel");
        task.due = Some(ymd(2026, 7, 1));
        task.repeat = Some(repeat(1, RepeatUnit::Month));

        let next = respawn(&task).unwrap();
        assert_eq!(next.due, Some(ymd(2026, 8, 1)));
    }

    #[test]
    fn respawn_starts_clean() {
        let mut task = Task::new("Limpar o filtro");
        task.id = Some("abc123".into());
        task.origin = Some("Casa".into());
        task.done = true;
        task.due = Some(ymd(2026, 7, 1));
        task.repeat = Some(repeat(1, RepeatUnit::Month));
        task.tags = vec!["casa".into()];
        task.priority = Some(2);
        task.description = vec!["com a escova velha".into()];
        task.subtasks = vec![crate::task::Subtask {
            text: "comprar filtro".into(),
            done: true,
        }];

        let next = respawn(&task).unwrap();

        assert_eq!(next.id, None, "a new occurrence was never referenced");
        assert_eq!(next.origin, None);
        assert!(!next.done);
        assert!(!next.subtasks[0].done, "subtarefa recomeça desmarcada");
        // What the user wrote comes along.
        assert_eq!(next.text, "Limpar o filtro");
        assert_eq!(next.tags, vec!["casa"]);
        assert_eq!(next.priority, Some(2));
        assert_eq!(next.description, vec!["com a escova velha"]);
    }

    #[test]
    fn respawn_falls_back_to_the_creation_date() {
        let mut task = Task::new("Regar as plantas");
        task.created = Some(ymd(2026, 7, 20));
        task.repeat = Some(repeat(1, RepeatUnit::Week));

        let next = respawn(&task).unwrap();

        assert_eq!(next.due, Some(ymd(2026, 7, 27)));
        assert_eq!(
            next.created,
            Some(ymd(2026, 7, 27)),
            "still the only anchor it has"
        );
    }

    #[test]
    fn a_task_with_no_anchor_does_not_respawn() {
        let mut task = Task::new("Sem data");
        task.repeat = Some(repeat(1, RepeatUnit::Week));

        assert_eq!(respawn(&task), None);
    }

    #[test]
    fn a_task_without_repeat_does_not_respawn() {
        let mut task = Task::new("Comum");
        task.due = Some(ymd(2026, 7, 20));

        assert_eq!(respawn(&task), None);
    }
}
