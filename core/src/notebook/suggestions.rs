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
    /// Open tasks whose due date lands on `day`. Today also takes what is
    /// overdue (overdue is still due); a day ahead takes only its own date.
    /// Today also keeps a dated task ticked TODAY, read back from its Completed
    /// list, so "1 of 3 done" counts it; ticked on another day, it stays out.
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
            // them is history, not a plan — except for what was finished
            // today, which today still shows under "Completed N".
            let finished = list.name == COMPLETED_LIST;
            if finished && day != Day::Today {
                continue;
            }
            for task in self.open_list(&list.path)?.tasks() {
                if task.done != finished {
                    continue;
                }
                if finished && task.completed != Some(today) {
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

    /// Whether a task counts as urgent right now: the `#urgent` tag, or a
    /// due date that is today or past (the date half is a config switch).
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
    /// already holds. Nothing here selects a task; dates only order the offer.
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
    /// lists, in the order the user arranged them. Anything the day already
    /// shows is left out, and so are completed tasks and `completed` itself.
    pub fn suggestions_for(&self, day: Option<chrono::NaiveDate>) -> Result<Vec<ListedTask>> {
        // What the day ALREADY shows, not just what was pulled into its
        // state: a dated task joins the day on its own.
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

/// The set form of [`super::is_same_task`], answering "is this task already
/// on the day's screen?" per candidate without a scan. Three sets carry the
/// predicate's three arms: id against id; an id-less candidate text-matches
/// ANY shown task; a candidate with an id still text-matches an id-less one.
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
