//! The Day and the Week: the two state files, the rollover that keeps them
//! current, and everything that puts a task in one or takes it out.
//!
//! A state file holds **references** (`path#id`), never task text — the task
//! lives in its list, and the period is a choice about it. Every read goes
//! through [`Notebook::open_state`], so a notebook that sat closed for a week
//! is current the moment anything looks at it.

use std::path::PathBuf;

use chrono::NaiveDate;

use crate::clock;
use crate::config::RolloverMode;
use crate::error::{Error, Result};
use crate::rollover;
use crate::state::{Period, StateFile, TaskRef};

use super::*;

impl Notebook {
    // ---------------------------------------------------------------- state

    pub fn state_path(&self, period: Period) -> PathBuf {
        self.config_dir().join(period.file_name())
    }

    /// The current logical day, honouring the configured turn.
    pub fn today(&self) -> NaiveDate {
        clock::today(self.config.rollover.daily.at)
    }

    /// First day of the current logical week.
    pub fn current_week(&self) -> NaiveDate {
        clock::this_week(
            self.config.rollover.weekly.at,
            self.config.rollover.weekly.starts_on,
        )
    }

    pub fn current_period_date(&self, period: Period) -> NaiveDate {
        match period {
            Period::Day => self.today(),
            Period::Week => self.current_week(),
        }
    }

    /// When the next turn of `period` happens.
    ///
    /// The rollover must also fire while the app is *open*, not only when the
    /// notebook is reopened. The core cannot own a timer without dragging in a
    /// runtime, so it answers "when" and the app schedules the wake-up.
    pub fn next_turn_at(&self, period: Period) -> chrono::DateTime<chrono::Local> {
        // The clock module reads the instant: this used to call Local::now()
        // here, which the invariant test now flags — the configured turn only
        // stays honest while clock.rs is the single reader.
        match period {
            Period::Day => clock::next_daily_turn(self.config.rollover.daily.at),
            Period::Week => clock::next_weekly_turn(
                self.config.rollover.weekly.at,
                self.config.rollover.weekly.starts_on,
            ),
        }
    }

    fn rollover_mode(&self, period: Period) -> RolloverMode {
        match period {
            Period::Day => self.config.rollover.daily.mode,
            Period::Week => self.config.rollover.weekly.mode,
        }
    }

    /// Opens a state file with the rollover already applied.
    ///
    /// Every read goes through here, so a notebook that sat closed for a week
    /// is up to date the moment anything looks at it — the app never has to
    /// remember to roll over first.
    pub fn open_state(&self, period: Period) -> Result<StateFile> {
        let current = self.current_period_date(period);
        let mut file = StateFile::load(self.state_path(period), current);

        let rolled = rollover::apply(&mut file.state, current, self.rollover_mode(period));
        if rolled.changed() && !self.is_read_only() {
            file.save()?;
        }
        Ok(file)
    }

    /// Applies `mutate` to **both** period states, saving the ones that
    /// changed.
    ///
    /// Day and Week are always updated together — completing, deleting,
    /// renaming or removing a list has to reach both, or a reference to a task
    /// that moved renders as a ghost row in one of the two screens. Four
    /// callers wrote this loop out; the next one gets it right by construction.
    pub(super) fn update_states(&self, mutate: impl Fn(&mut crate::state::PeriodState) -> bool) -> Result<()> {
        for period in [Period::Day, Period::Week] {
            let mut file = self.open_state(period)?;
            if mutate(&mut file.state) {
                file.save()?;
            }
        }
        Ok(())
    }

    /// Pulls an existing task into Today or This Week.
    pub fn pull_into(&self, period: Period, path: &str, id: &str) -> Result<bool> {
        self.ensure_writable()?;
        // Fail before writing the state if the task is not really there —
        // a reference to a missing task shows up as a ghost row in the UI.
        let source = self.open_list(path)?;
        if source.find(id).is_none() {
            return Err(Error::TaskNotFound(id.to_string()));
        }

        let mut file = self.open_state(period)?;
        if !file.state.add(path, id) {
            return Ok(false);
        }
        file.save()?;
        Ok(true)
    }

    /// Removes a task from Today or This Week. The task itself is untouched.
    ///
    /// The departure is remembered (2026-08-17): what was taken out of the day
    /// is the likeliest thing to be put back, so it comes back as its own
    /// group of suggestions instead of falling into the middle of its list.
    pub fn remove_from(&self, period: Period, path: &str, id: &str) -> Result<bool> {
        self.ensure_writable()?;
        let mut file = self.open_state(period)?;
        if !file.state.remove(path, id) {
            return Ok(false);
        }
        file.state.recall([crate::state::TaskRef::new(path, id)]);
        file.save()?;
        Ok(true)
    }

    /// Creates a task straight from Today or This Week.
    ///
    /// The task is written to the Inbox — Day and Week never store content of
    /// their own, they only point at tasks that live in a real list (spec 3).
    pub fn add_task_in_period(&self, period: Period, text: impl Into<String>) -> Result<String> {
        self.ensure_writable()?;
        let mut inbox = self.inbox()?;

        // This one earns an id immediately: the state is about to reference
        // it, and a reference needs something stable to point at.
        let position = inbox.add(Self::stamped_task(text));
        let id = inbox
            .ensure_id_at(position)
            .expect("the task was just added at this position");
        inbox.save()?;

        let mut file = self.open_state(period)?;
        file.state.add(Self::inbox_path(), &id);
        file.save()?;
        Ok(id)
    }

    /// The tasks actually pulled into a period, in the order they were pulled.
    ///
    /// A reference whose task no longer exists (deleted in another editor) is
    /// skipped instead of failing: the notebook is shared with other tools, so
    /// a stale reference is a normal state, not corruption.
    pub fn period_tasks(&self, period: Period) -> Result<Vec<ListedTask>> {
        let state = self.open_state(period)?.state;
        let mut out = Vec::new();

        for reference in &state.items {
            let Ok(list) = self.open_list(&reference.path) else {
                continue;
            };
            if let Some(task) = list.find(&reference.id) {
                out.push(ListedTask {
                    path: reference.path.clone(),
                    task: task.clone(),
                });
            }
        }

        // A task with a date joins the period on its own (2026-08-14), unless
        // the user switched that off. Added on READ, never written to the
        // state: un-dating a task takes it back out, the turn of the day has
        // nothing to clean up, and what the user pulled by hand stays exactly
        // as pulled.
        if self.config.dated_tasks_join_period {
            for candidate in self.tasks_due_in(period)? {
                if !out.iter().any(|listed| is_same_task(listed, &candidate)) {
                    out.push(candidate);
                }
            }
        }

        Ok(out)
    }

    /// How the Day or the Week is arranged, if the user chose something.
    ///
    /// A period is not a folder, so there is no config file of its own to keep this in;
    /// it lives with the notebook, beside the manual `order` (2026-08-06).
    pub fn period_sort(&self, period: Period) -> Option<&str> {
        self.config.period_sort.get(period.key()).map(String::as_str)
    }

    /// Sets that arrangement. `None` goes back to the order things were pulled
    /// in, which is the state file's own order.
    pub fn set_period_sort(&mut self, period: Period, sort: Option<&str>) -> Result<()> {
        self.edit_config(|config| match sort {
            Some(sort) if !sort.is_empty() => {
                config.period_sort.insert(period.key().to_string(), sort.to_string());
            }
            _ => {
                config.period_sort.remove(period.key());
            }
        })
    }

    /// Rearranges the period to match `refs` — the order the user just dragged.
    ///
    /// The state file IS the day's list, so a hand-made order belongs in it
    /// rather than mirrored in the config: there is nothing to fall out of step
    /// with. A reference the caller did not mention keeps its place at the end,
    /// so a list that changed under the drag loses nothing.
    pub fn set_period_order(&self, period: Period, refs: &[TaskRef]) -> Result<()> {
        self.ensure_writable()?;
        let mut file = self.open_state(period)?;
        // Stable, so anything unmentioned keeps the order it had.
        crate::config::by_rank(&mut file.state.items, |item| {
            refs.iter().position(|r| r == item)
        });
        file.save()
    }
}
