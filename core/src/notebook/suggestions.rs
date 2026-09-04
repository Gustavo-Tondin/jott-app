//! What the app offers for a day, and why.
//!
//! Suggestions are read-only: nothing here writes. The grouping
//! ([`crate::notebook::SuggestionGroup`]) is the display order, so a group
//! cannot be reordered by accident somewhere else in the code.

use crate::error::Result;
use crate::task::Task;

use super::day::Day;
use crate::COMPLETED_LIST;

use super::*;

/// How many days ahead still counts as "soon".
const SOON_WINDOW_DAYS: i64 = 3;

impl Notebook {
    /// Open tasks whose due date lands on `day`. For today a date earlier
    /// than today counts too — overdue is still due, and today is the only
    /// day left to face it on (user call, 2026-09-04). A day ahead takes
    /// only what is due on it: what is overdue is today's, not the 5th's.
    pub(super) fn tasks_due_on(&self, day: Day) -> Result<Vec<ListedTask>> {
        let today = self.today();
        let due_on = |due: chrono::NaiveDate| match day {
            Day::Today => due <= today,
            Day::Ahead(date) => due == date,
            Day::Gone(_) => false,
        };

        let mut out = Vec::new();
        for list in self.list_paths()? {
            // Completed lists are where finished tasks go; a date on one of
            // them is history, not a plan.
            if list.name == COMPLETED_LIST {
                continue;
            }
            for task in self.open_list(&list.path)?.tasks() {
                if task.done {
                    continue;
                }
                if task.due.is_some_and(due_on) {
                    out.push(ListedTask {
                        path: list.path.clone(),
                        task: task.clone(),
                    });
                }
            }
        }
        Ok(out)
    }

    /// Whether a task counts as urgent right now.
    ///
    /// Two sources with equal weight (spec 3.2): the `#urgent` tag the user
    /// wrote, and a date that is today or already past. The date half can be
    /// switched off for people who do not want the interface flagging
    /// deadlines on its own.
    fn is_urgent(&self, task: &Task) -> bool {
        if task.is_marked_urgent() {
            return true;
        }
        if !self.config.auto_urgent_by_date {
            return false;
        }
        task.due.is_some_and(|due| due <= self.today())
    }

    /// What to offer pulling into a day, grouped and in display order.
    /// `None` is today; a day ahead is offered the same lists, minus what it
    /// already holds.
    ///
    /// Nothing here *selects* a task — the day stays a deliberate choice.
    /// Dates only change what is offered first.
    pub fn grouped_suggestions(&self, day: Option<chrono::NaiveDate>) -> Result<Vec<Suggestion>> {
        let today = self.today();
        let soon = today + chrono::Duration::days(SOON_WINDOW_DAYS);

        // What left Today, newest first. Rank and membership come from the
        // same map, so the group is also ordered by how recently it left.
        // Only today keeps such a memory: a day ahead that a task was taken
        // out of is a plan that changed, not a departure to offer back.
        let mut recent_rank: std::collections::HashMap<(String, String), usize> =
            Default::default();
        for reference in self.open_state()?.state.recent {
            let key = (reference.path, reference.id);
            if !recent_rank.contains_key(&key) {
                recent_rank.insert(key, recent_rank.len());
            }
        }
        let rank_of = |path: &str, id: Option<&String>| -> Option<usize> {
            let id = id?;
            recent_rank.get(&(path.to_string(), id.clone())).copied()
        };

        let labels = self.space_labels()?;
        // Unlike `space_label_of`, unknown here is the EMPTY string: a
        // suggestion row draws its space label as a small caption, and a raw
        // folder path there would be noise rather than a name.
        let space_of =
            |path: &str| -> String { labels.get(list_dir_of(path)).cloned().unwrap_or_default() };

        let mut suggestions: Vec<Suggestion> = self
            .suggestions_for(day)?
            .into_iter()
            .map(|entry| {
                let group = if self.is_urgent(&entry.task) {
                    SuggestionGroup::Urgent
                } else if entry.task.due.is_some_and(|due| due <= soon) {
                    SuggestionGroup::Soon
                } else if rank_of(&entry.path, entry.task.id.as_ref()).is_some() {
                    SuggestionGroup::Recent
                } else {
                    SuggestionGroup::Lists
                };
                Suggestion {
                    space: space_of(&entry.path),
                    path: entry.path,
                    task: entry.task,
                    group,
                }
            })
            .collect();

        // Stable sort: inside a group the original order is kept, which is the
        // order of the lists on disk — the order the user arranged. The one
        // group with an order of its own is `Recent`, which reads newest
        // first; every other group ranks flat and keeps the walk order.
        suggestions.sort_by_key(|s| {
            let rank = if s.group == SuggestionGroup::Recent {
                rank_of(&s.path, s.task.id.as_ref()).unwrap_or(usize::MAX)
            } else {
                0
            };
            (s.group, rank)
        });
        Ok(suggestions)
    }

    /// What to offer pulling into a day, in the order the UI shows it: the
    /// lists, in the order the user arranged them.
    ///
    /// Anything the day already shows is left out, and so are completed
    /// tasks and the folder's `completed` list itself.
    pub fn suggestions_for(&self, day: Option<chrono::NaiveDate>) -> Result<Vec<ListedTask>> {
        // What the day ALREADY shows — not just what was pulled into its
        // state. Since 2026-08-14 a dated task joins the day on its own, and
        // suggesting something the user is already looking at is noise.
        let showing = ShownIndex::of(&self.day_tasks(day)?);
        let mut out: Vec<ListedTask> = Vec::new();
        // Ids already offered. Id-only ON PURPOSE, narrower than
        // `is_same_task`: two id-less tasks with the same text in one list
        // are usually two real tasks ("call back" twice), and hiding one of
        // them from the panel would hide work.
        let mut offered: std::collections::HashSet<(String, String)> = Default::default();

        let mut push = |candidate: ListedTask, out: &mut Vec<ListedTask>| {
            if candidate.task.done || showing.contains(&candidate) {
                return;
            }
            if let Some(id) = candidate.task.id.as_deref() {
                if !offered.insert((candidate.path.clone(), id.to_string())) {
                    return;
                }
            }
            out.push(candidate);
        };

        for entry in self.lists()? {
            if entry.name == COMPLETED_LIST {
                continue;
            }
            for task in self.tasks_in(&entry.path)? {
                push(
                    ListedTask {
                        path: entry.path.clone(),
                        task,
                    },
                    &mut out,
                );
            }
        }
        Ok(out)
    }
}

/// The set form of [`super::is_same_task`], for asking "is this task already
/// on the day's screen?" once per candidate without a scan per question.
///
/// Three sets carry the predicate's three arms exactly: id against id when
/// both exist; a candidate with no id falls back to text against ANY shown
/// task; a candidate with an id still text-matches a shown task that has
/// none (an id is handed out lazily, so the same task can be id-less on one
/// side and named on the other).
struct ShownIndex {
    ids: std::collections::HashSet<(String, String)>,
    texts_all: std::collections::HashSet<(String, String)>,
    texts_idless: std::collections::HashSet<(String, String)>,
}

impl ShownIndex {
    fn of(shown: &[ListedTask]) -> Self {
        let mut index = Self {
            ids: Default::default(),
            texts_all: Default::default(),
            texts_idless: Default::default(),
        };
        for listed in shown {
            let key = (listed.path.clone(), listed.task.text.clone());
            index.texts_all.insert(key.clone());
            match listed.task.id.as_deref() {
                Some(id) => {
                    index.ids.insert((listed.path.clone(), id.to_string()));
                }
                None => {
                    index.texts_idless.insert(key);
                }
            }
        }
        index
    }

    fn contains(&self, candidate: &ListedTask) -> bool {
        let text_key = (candidate.path.clone(), candidate.task.text.clone());
        match candidate.task.id.as_deref() {
            Some(id) => {
                self.ids.contains(&(candidate.path.clone(), id.to_string()))
                    || self.texts_idless.contains(&text_key)
            }
            None => self.texts_all.contains(&text_key),
        }
    }
}
