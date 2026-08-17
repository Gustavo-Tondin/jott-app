//! What happens to Today and This Week when the period turns.
//!
//! Nothing here destroys a task. The rollover only touches *references* in
//! the state files — the task itself keeps living in its list's `.md`. In
//! `reset` mode an unfinished task stops being pulled and goes back to being
//! a suggestion; in `carry` mode it stays pulled. Either way it is still
//! there.
//!
//! The turn is decided by comparing the state's `date` with the current
//! logical period, never by counting elapsed days. The app may sit closed for
//! a week, and turning three days at once has to land exactly where turning
//! one does.

use chrono::NaiveDate;

use crate::config::RolloverMode;
use crate::state::PeriodState;

/// Whether an address is a folder's `Completed.md` — where a ticked task
/// lives, and where its period reference now follows it.
fn is_completed_list(path: &str) -> bool {
    let completed = format!("{}.md", crate::COMPLETED_LIST);
    path.rsplit('/').next() == Some(completed.as_str())
}

/// What a rollover did, so the caller knows whether to write the file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rolled {
    /// Still the same logical period — nothing to do.
    Unchanged,
    /// The period turned.
    Turned {
        from: NaiveDate,
        to: NaiveDate,
        /// References dropped — everything in `reset`, and in `carry` only
        /// the tasks that were completed during the period.
        cleared: usize,
    },
}

impl Rolled {
    /// Whether the state changed and needs saving.
    pub fn changed(self) -> bool {
        matches!(self, Self::Turned { .. })
    }
}

/// Rolls `state` forward to `current` if the period turned.
///
/// A state dated in the *future* is never cleared: that means the system clock
/// moved backwards (wrong date corrected, travelling across timezones), not
/// that a period elapsed. Re-dating it without dropping the references keeps a
/// clock mistake from wiping a day the user had already planned.
pub fn apply(state: &mut PeriodState, current: NaiveDate, mode: RolloverMode) -> Rolled {
    let from = state.date;
    if from == current {
        return Rolled::Unchanged;
    }

    let went_backwards = from > current;
    let cleared = match mode {
        // Carrying keeps the unfinished work pulled — but a reference that
        // now points into a `Completed.md` is a task that was ticked during
        // the period, and carrying that into the next one would put yesterday's
        // finished work in today's list (2026-08-06, since a completed task
        // keeps its period reference so it can show under "Completed N").
        RolloverMode::Carry => {
            let before = state.len();
            state
                .items
                .retain(|reference| !is_completed_list(&reference.path));
            before - state.len()
        }
        RolloverMode::Reset if went_backwards => 0,
        RolloverMode::Reset => {
            let dropped = state.len();
            // The unfinished ones become "recently pulled" — the day turned
            // under them, and offering them back is the whole point of the
            // group (2026-08-17). What points into a `Completed.md` was ticked
            // during the period, so it left by being done, not by being
            // dropped.
            let gone: Vec<_> = state
                .items
                .iter()
                .filter(|reference| !is_completed_list(&reference.path))
                .cloned()
                .collect();
            state.items.clear();
            // Reversed, because `recall` treats each one as newer than the
            // last: they all left at the same instant, and the order worth
            // keeping is the one the day had.
            state.recall(gone.into_iter().rev());
            dropped
        }
    };

    state.date = current;
    Rolled::Turned {
        from,
        to: current,
        cleared,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ymd(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    fn state_with(date: NaiveDate, items: &[(&str, &str)]) -> PeriodState {
        let mut state = PeriodState::new(date);
        for (list, id) in items {
            state.add(*list, *id);
        }
        state
    }

    #[test]
    fn same_period_changes_nothing() {
        let mut state = state_with(ymd(2026, 7, 20), &[("Inbox", "a")]);
        let rolled = apply(&mut state, ymd(2026, 7, 20), RolloverMode::Reset);

        assert_eq!(rolled, Rolled::Unchanged);
        assert!(!rolled.changed());
        assert_eq!(state.len(), 1);
    }

    #[test]
    fn reset_empties_the_state_and_moves_the_date() {
        let mut state = state_with(ymd(2026, 7, 20), &[("Inbox", "a"), ("Compras", "b")]);
        let rolled = apply(&mut state, ymd(2026, 7, 21), RolloverMode::Reset);

        assert_eq!(
            rolled,
            Rolled::Turned {
                from: ymd(2026, 7, 20),
                to: ymd(2026, 7, 21),
                cleared: 2,
            }
        );
        assert!(state.is_empty());
        assert_eq!(state.date, ymd(2026, 7, 21));
    }

    #[test]
    fn carry_keeps_the_references() {
        let mut state = state_with(ymd(2026, 7, 20), &[("Inbox", "a")]);
        let rolled = apply(&mut state, ymd(2026, 7, 21), RolloverMode::Carry);

        assert_eq!(
            rolled,
            Rolled::Turned {
                from: ymd(2026, 7, 20),
                to: ymd(2026, 7, 21),
                cleared: 0,
            }
        );
        assert_eq!(state.len(), 1);
        assert!(state.contains("Inbox", "a"));
        assert_eq!(state.date, ymd(2026, 7, 21));
    }

    #[test]
    fn carry_leaves_behind_what_was_completed_during_the_period() {
        // A completed task keeps its reference so it can show under
        // "Completed N" (2026-08-06) — but carrying yesterday's finished work
        // into today's list is exactly what carry must not do.
        let mut state = state_with(
            ymd(2026, 7, 20),
            &[
                ("Tasks/Inbox/Inbox.md", "a"),
                ("Tasks/Inbox/completed.md", "b"),
                ("Space/Work/completed.md", "c"),
            ],
        );
        let rolled = apply(&mut state, ymd(2026, 7, 21), RolloverMode::Carry);

        assert_eq!(
            rolled,
            Rolled::Turned {
                from: ymd(2026, 7, 20),
                to: ymd(2026, 7, 21),
                cleared: 2,
            }
        );
        assert_eq!(state.len(), 1);
        assert!(state.contains("Tasks/Inbox/Inbox.md", "a"));
    }

    #[test]
    fn reset_remembers_the_unfinished_ones_it_dropped() {
        // The day turned under them: they are exactly what the user may want
        // back, and "recently pulled" is where they come back (2026-08-17).
        let mut state = state_with(
            ymd(2026, 8, 16),
            &[
                ("jott.tasks/task-list.md", "a"),
                ("jott.tasks/task-list.md", "b"),
                ("jott.tasks/completed.md", "c"),
            ],
        );
        apply(&mut state, ymd(2026, 8, 17), RolloverMode::Reset);

        assert!(state.is_empty());
        // In the order the day had them, and without the one that left by
        // being ticked.
        assert_eq!(
            state.recent,
            vec![
                crate::state::TaskRef::new("jott.tasks/task-list.md", "a"),
                crate::state::TaskRef::new("jott.tasks/task-list.md", "b"),
            ]
        );
    }

    #[test]
    fn carry_remembers_nothing_because_nothing_unfinished_left() {
        let mut state = state_with(
            ymd(2026, 8, 16),
            &[
                ("jott.tasks/task-list.md", "a"),
                ("jott.tasks/completed.md", "b"),
            ],
        );
        apply(&mut state, ymd(2026, 8, 17), RolloverMode::Carry);

        assert_eq!(state.len(), 1);
        assert!(state.recent.is_empty());
    }

    #[test]
    fn turning_many_days_at_once_lands_where_turning_one_does() {
        // The app can stay closed for a week; the result must not depend on
        // how many periods elapsed.
        let mut after_one = state_with(ymd(2026, 7, 20), &[("Inbox", "a")]);
        apply(&mut after_one, ymd(2026, 7, 21), RolloverMode::Reset);

        let mut after_many = state_with(ymd(2026, 7, 20), &[("Inbox", "a")]);
        apply(&mut after_many, ymd(2026, 7, 27), RolloverMode::Reset);

        assert!(after_one.is_empty() && after_many.is_empty());
        assert_eq!(after_many.date, ymd(2026, 7, 27));
    }

    #[test]
    fn carry_over_many_days_still_keeps_everything() {
        let mut state = state_with(ymd(2026, 7, 20), &[("Inbox", "a"), ("Inbox", "b")]);
        apply(&mut state, ymd(2026, 8, 30), RolloverMode::Carry);

        assert_eq!(state.len(), 2);
        assert_eq!(state.date, ymd(2026, 8, 30));
    }

    #[test]
    fn rolling_twice_is_the_same_as_rolling_once() {
        let mut state = state_with(ymd(2026, 7, 20), &[("Inbox", "a")]);
        apply(&mut state, ymd(2026, 7, 21), RolloverMode::Reset);
        let second = apply(&mut state, ymd(2026, 7, 21), RolloverMode::Reset);

        assert_eq!(second, Rolled::Unchanged);
        assert_eq!(state.date, ymd(2026, 7, 21));
    }

    #[test]
    fn a_clock_moving_backwards_re_dates_without_clearing() {
        // Wrong system date corrected, or a flight west. No period actually
        // elapsed, so the planned day survives.
        let mut state = state_with(ymd(2026, 7, 20), &[("Inbox", "a")]);
        let rolled = apply(&mut state, ymd(2026, 7, 18), RolloverMode::Reset);

        assert_eq!(
            rolled,
            Rolled::Turned {
                from: ymd(2026, 7, 20),
                to: ymd(2026, 7, 18),
                cleared: 0,
            }
        );
        assert_eq!(state.len(), 1);
        assert_eq!(state.date, ymd(2026, 7, 18));
    }

    #[test]
    fn an_empty_state_turns_without_pretending_it_cleared_anything() {
        let mut state = PeriodState::new(ymd(2026, 7, 20));
        let rolled = apply(&mut state, ymd(2026, 7, 21), RolloverMode::Reset);

        assert_eq!(
            rolled,
            Rolled::Turned {
                from: ymd(2026, 7, 20),
                to: ymd(2026, 7, 21),
                cleared: 0,
            }
        );
    }
}
