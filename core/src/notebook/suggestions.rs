//! What the app offers for a period, and why.
//!
//! Suggestions are read-only: nothing here writes. The grouping
//! ([`crate::notebook::SuggestionGroup`]) is the display order, so a group
//! cannot be reordered by accident somewhere else in the code.

use crate::error::Result;
use crate::state::Period;
use crate::task::Task;
use crate::COMPLETED_LIST;

use super::*;

impl Notebook {
    /// Open tasks whose due date falls inside `period` — today for the Day,
    /// the current week for the Week (a date earlier than either counts too:
    /// overdue is still due).
    pub(super) fn tasks_due_in(&self, period: Period) -> Result<Vec<ListedTask>> {
        let last_day = match period {
            Period::Day => self.today(),
            Period::Week => self.current_week() + chrono::Duration::days(6),
        };

        let mut out = Vec::new();
        for (prefix, folder) in self.task_folders()? {
            for name in folder.list_names()? {
                // Completed lists are where finished tasks go; a date on one of
                // them is history, not a plan.
                if name == COMPLETED_LIST {
                    continue;
                }
                let path = format!("{prefix}/{name}.md");
                for task in self.open_list(&path)?.tasks() {
                    if task.done {
                        continue;
                    }
                    if task.due.is_some_and(|due| due <= last_day) {
                        out.push(ListedTask {
                            path: path.clone(),
                            task: task.clone(),
                        });
                    }
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
    pub fn is_urgent(&self, task: &Task) -> bool {
        if task.is_marked_urgent() {
            return true;
        }
        if !self.config.auto_urgent_by_date {
            return false;
        }
        task.due.is_some_and(|due| due <= self.today())
    }

    /// What to offer pulling into a period, grouped and in display order.
    ///
    /// Nothing here *selects* a task — the day stays a deliberate choice.
    /// Dates only change what is offered first.
    pub fn grouped_suggestions(&self, period: Period) -> Result<Vec<Suggestion>> {
        let today = self.today();
        let soon = today + chrono::Duration::days(SOON_WINDOW_DAYS);

        let in_week: std::collections::HashSet<(String, String)> = if period == Period::Day {
            self.open_state(Period::Week)?
                .state
                .items
                .iter()
                .map(|r| (r.path.clone(), r.id.clone()))
                .collect()
        } else {
            Default::default()
        };

        // What left Today or This Week, newest first — either period counts,
        // whichever one is being filled: "I took this out yesterday" is the
        // same answer to both questions. Rank and membership come from the
        // same map, so the group is also ordered by how recently it left.
        let mut recent_rank: std::collections::HashMap<(String, String), usize> =
            Default::default();
        for source in [Period::Day, Period::Week] {
            for reference in self.open_state(source)?.state.recent {
                let key = (reference.path, reference.id);
                if !recent_rank.contains_key(&key) {
                    recent_rank.insert(key, recent_rank.len());
                }
            }
        }
        let rank_of = |path: &str, id: Option<&String>| -> Option<usize> {
            let id = id?;
            recent_rank.get(&(path.to_string(), id.clone())).copied()
        };

        let labels = self.space_labels()?;
        let space_of = |path: &str| -> String {
            path.rsplit_once('/')
                .and_then(|(dir, _)| labels.get(dir).cloned())
                .unwrap_or_default()
        };

        let mut suggestions: Vec<Suggestion> = self
            .suggestions_for(period)?
            .into_iter()
            .map(|entry| {
                let group = if self.is_urgent(&entry.task) {
                    SuggestionGroup::Urgent
                } else if entry.task.due.is_some_and(|due| due <= soon) {
                    SuggestionGroup::Soon
                } else if entry
                    .task
                    .id
                    .as_ref()
                    .is_some_and(|id| in_week.contains(&(entry.path.clone(), id.clone())))
                {
                    SuggestionGroup::ThisWeek
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

    /// What to offer pulling into a period, in the order the UI shows it.
    ///
    /// For the day, tasks already chosen for the week come first: they are
    /// what the user decided mattered this week, so they are the best
    /// candidates for today. Everything else in the lists follows.
    ///
    /// Anything already pulled into the period is left out, and so are
    /// completed tasks and the `Completas` list itself.
    pub fn suggestions_for(&self, period: Period) -> Result<Vec<ListedTask>> {
        // What the period ALREADY shows — not just what was pulled into its
        // state. Since 2026-08-14 a dated task joins the period on its own, and
        // suggesting something the user is already looking at is noise.
        let showing = self.period_tasks(period)?;
        let mut out: Vec<ListedTask> = Vec::new();

        let is_showing = |candidate: &ListedTask| {
            showing.iter().any(|listed| {
                listed.path == candidate.path
                    && match (listed.task.id.as_deref(), candidate.task.id.as_deref()) {
                        (Some(a), Some(b)) => a == b,
                        // Most tasks have no id — one is handed out only when
                        // something needs to address the task — so two id-less
                        // tasks in the same list are the same one when their
                        // text is.
                        _ => listed.task.text == candidate.task.text,
                    }
            })
        };

        let push = |candidate: ListedTask, out: &mut Vec<ListedTask>| {
            if candidate.task.done || is_showing(&candidate) {
                return;
            }
            if let Some(id) = candidate.task.id.as_deref() {
                let already = out
                    .iter()
                    .any(|t| t.path == candidate.path && t.task.id.as_deref() == Some(id));
                if already {
                    return;
                }
            }
            out.push(candidate);
        };

        // The week feeds the day, but nothing feeds the week except the lists.
        if period == Period::Day {
            for candidate in self.period_tasks(Period::Week)? {
                push(candidate, &mut out);
            }
        }

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
