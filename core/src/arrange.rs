//! The order of a tasks space, applied to its FILES: the `.md` is the order
//! the screen draws, so arranging is a rewrite, never a reading. Pure — tasks
//! in, a permutation out. Pinned tasks lead; ties keep the file's order.

use std::cmp::Reverse;
use std::collections::HashMap;

use chrono::NaiveDate;

use crate::space::SpaceConfig;
use crate::task::Task;

/// What a space arranges its tasks by.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Key {
    /// The file order as it stands — what the last drag, or edit, built.
    Custom,
    /// The task's text, case-insensitive.
    Name,
    /// The `created` stamp.
    Created,
    /// The due date.
    Due,
}

impl Key {
    /// A `sort` value as the space config carries it. Anything this build
    /// does not arrange by — absent, `custom`, the old `completed`, a newer
    /// word — reads as `Custom`: the file order stands.
    pub fn parse(sort: Option<&str>) -> Self {
        match sort {
            Some("name") => Self::Name,
            Some("created") => Self::Created,
            Some("due") => Self::Due,
            _ => Self::Custom,
        }
    }
}

/// The `sortDirection` that turns an arrangement over (`↑`). Any other value,
/// or none, is the default direction (`↓`).
pub const REVERSED: &str = "up";

/// The `sort` a drag, or a file reordered by hand, leaves behind.
pub const CUSTOM_SORT: &str = "custom";

/// A sort and its direction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Arrangement {
    pub key: Key,
    /// The default direction turned over. Meaningless on `Custom`.
    pub reversed: bool,
}

impl Arrangement {
    pub const CUSTOM: Self = Self {
        key: Key::Custom,
        reversed: false,
    };

    /// The arrangement a space's `.space.json` declares.
    pub fn of(config: &SpaceConfig) -> Self {
        Self {
            key: Key::parse(config.sort.as_deref()),
            reversed: config.sort_direction.as_deref() == Some(REVERSED),
        }
    }

    /// Whether the order comes from the tasks' own fields — and so can be
    /// broken by someone editing the file by hand.
    pub fn is_by_field(&self) -> bool {
        self.key != Key::Custom
    }

    /// Positions into `tasks`, in the order they should stand. The default
    /// direction goes from "least" to "most": name A→Z, creation newest
    /// first, due date soonest first. A task without the date sits below the
    /// dated ones in either direction, where it already was among them.
    pub fn positions(&self, tasks: &[&Task]) -> Vec<usize> {
        pinned_first(tasks, (0..tasks.len()).collect(), |block| self.within(tasks, block))
    }

    fn within(&self, tasks: &[&Task], mut block: Vec<usize>) -> Vec<usize> {
        match self.key {
            Key::Custom => block,
            Key::Name => {
                // Stable, like every sort here: equal names keep file order.
                if self.reversed {
                    block.sort_by_cached_key(|&i| Reverse(tasks[i].text.to_lowercase()));
                } else {
                    block.sort_by_cached_key(|&i| tasks[i].text.to_lowercase());
                }
                block
            }
            Key::Created => self.dated(tasks, block, |task| task.created, true),
            Key::Due => self.dated(tasks, block, |task| task.due, false),
        }
    }

    fn dated(
        &self,
        tasks: &[&Task],
        block: Vec<usize>,
        date_of: impl Fn(&Task) -> Option<NaiveDate>,
        newest_first: bool,
    ) -> Vec<usize> {
        let (mut dated, undated): (Vec<usize>, Vec<usize>) =
            block.into_iter().partition(|&i| date_of(tasks[i]).is_some());
        if newest_first != self.reversed {
            dated.sort_by_key(|&i| Reverse(date_of(tasks[i])));
        } else {
            dated.sort_by_key(|&i| date_of(tasks[i]));
        }
        dated.extend(undated);
        dated
    }
}

/// The saved custom order (`order` in `.space.json`) applied to `tasks`. A
/// task the order does not name — created since that drag — leads, keeping
/// its file order; the rest follow by rank. Pinned first, as always.
pub fn by_saved_order(tasks: &[&Task], order: &[String]) -> Vec<usize> {
    let rank: HashMap<&str, usize> = order
        .iter()
        .enumerate()
        .map(|(i, id)| (id.as_str(), i))
        .collect();
    let rank_of = |i: usize| tasks[i].id.as_deref().and_then(|id| rank.get(id).copied());
    pinned_first(tasks, (0..tasks.len()).collect(), |mut block| {
        // `None` sorts before `Some`: the unnamed lead.
        block.sort_by_key(|&i| rank_of(i));
        block
    })
}

/// Splits `positions` into the pinned block and the rest (stable), arranges
/// each with `arrange`, and puts the pinned one on top.
fn pinned_first(
    tasks: &[&Task],
    positions: Vec<usize>,
    arrange: impl Fn(Vec<usize>) -> Vec<usize>,
) -> Vec<usize> {
    let (pinned, rest): (Vec<usize>, Vec<usize>) =
        positions.into_iter().partition(|&i| tasks[i].is_pinned());
    let mut out = arrange(pinned);
    out.extend(arrange(rest));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(d: u32) -> Option<NaiveDate> {
        NaiveDate::from_ymd_opt(2026, 9, d)
    }

    fn task(text: &str) -> Task {
        Task::new(text)
    }

    fn texts(tasks: &[Task], arrangement: Arrangement) -> Vec<String> {
        let refs: Vec<&Task> = tasks.iter().collect();
        arrangement
            .positions(&refs)
            .into_iter()
            .map(|i| tasks[i].text.clone())
            .collect()
    }

    fn by(key: Key, reversed: bool) -> Arrangement {
        Arrangement { key, reversed }
    }

    #[test]
    fn an_unknown_or_absent_sort_is_the_file_order() {
        for sort in [None, Some("custom"), Some("completed"), Some("kanban")] {
            assert_eq!(Key::parse(sort), Key::Custom, "{sort:?}");
        }
        let tasks = vec![task("b"), task("a")];
        assert_eq!(texts(&tasks, Arrangement::CUSTOM), vec!["b", "a"]);
    }

    #[test]
    fn name_goes_a_to_z_down_and_z_to_a_up_ignoring_case() {
        let tasks = vec![task("banana"), task("Abacate"), task("cereja")];
        assert_eq!(texts(&tasks, by(Key::Name, false)), vec!["Abacate", "banana", "cereja"]);
        assert_eq!(texts(&tasks, by(Key::Name, true)), vec!["cereja", "banana", "Abacate"]);
    }

    #[test]
    fn creation_is_newest_first_down_and_ties_keep_the_file_order() {
        let mut tasks = vec![task("old"), task("new 1"), task("mid"), task("new 2")];
        for (t, d) in tasks.iter_mut().zip([1, 9, 5, 9]) {
            t.created = day(d);
        }
        assert_eq!(
            texts(&tasks, by(Key::Created, false)),
            vec!["new 1", "new 2", "mid", "old"]
        );
        assert_eq!(
            texts(&tasks, by(Key::Created, true)),
            vec!["old", "mid", "new 1", "new 2"]
        );
    }

    #[test]
    fn due_is_soonest_first_down_and_the_undated_stay_below_in_their_order() {
        let mut tasks = vec![task("none 1"), task("far"), task("none 2"), task("soon")];
        tasks[1].due = day(20);
        tasks[3].due = day(11);
        assert_eq!(
            texts(&tasks, by(Key::Due, false)),
            vec!["soon", "far", "none 1", "none 2"]
        );
        // Turned over, the dated ones flip; the undated stay below.
        assert_eq!(
            texts(&tasks, by(Key::Due, true)),
            vec!["far", "soon", "none 1", "none 2"]
        );
    }

    #[test]
    fn pinned_tasks_lead_every_arrangement_and_are_sorted_among_themselves() {
        let mut tasks = vec![task("c"), task("b pinned"), task("a"), task("a pinned")];
        tasks[1].pinned = true;
        tasks[3].pinned = true;
        assert_eq!(
            texts(&tasks, by(Key::Name, false)),
            vec!["a pinned", "b pinned", "a", "c"]
        );
        // Custom keeps the pinned in the order they already had.
        assert_eq!(
            texts(&tasks, Arrangement::CUSTOM),
            vec!["b pinned", "a pinned", "c", "a"]
        );
    }

    #[test]
    fn the_saved_order_puts_what_it_does_not_name_on_top() {
        let mut tasks = [task("x"), task("new"), task("y"), task("z")];
        for (t, id) in tasks.iter_mut().zip(["x", "n", "y", "z"]) {
            t.id = Some(id.to_string());
        }
        tasks[1].id = Some("fresh".into());
        let refs: Vec<&Task> = tasks.iter().collect();
        let order: Vec<String> = ["z", "x", "y"].map(String::from).to_vec();
        let got: Vec<&str> = by_saved_order(&refs, &order)
            .into_iter()
            .map(|i| tasks[i].text.as_str())
            .collect();
        assert_eq!(got, vec!["new", "z", "x", "y"]);
    }
}
