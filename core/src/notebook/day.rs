//! The day: today's state file, the plan for the days ahead, the rollover
//! that keeps them current, and everything that puts a task in a day or
//! takes it out. Both files hold references (`path#id`), never task text.
//! Every read goes through [`Notebook::open_state`], so a notebook closed
//! for a week is current the moment anything looks at it.

use std::path::PathBuf;

use chrono::NaiveDate;

use crate::clock;
use crate::error::{Error, Result};
use crate::plan::{PlanFile, PLAN_FILE};
use crate::rollover;
use crate::state::{StateFile, TaskRef, TaskRefs, DAILY_STATE_FILE};

use super::*;

/// Where a date stands against the logical today — the one question every
/// door of this module asks first, since today lives in one file, the days
/// ahead in another, and a day gone by in neither (it is the log's).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Day {
    Today,
    Ahead(NaiveDate),
    Gone(NaiveDate),
}

impl Notebook {
    // ---------------------------------------------------------------- state

    fn state_path(&self) -> PathBuf {
        self.config_dir().join(DAILY_STATE_FILE)
    }

    fn plan_path(&self) -> PathBuf {
        self.config_dir().join(PLAN_FILE)
    }

    /// The current day — the calendar's.
    pub fn today(&self) -> NaiveDate {
        clock::civil_today()
    }

    /// Which of the three a date is. `None` is today, said the short way.
    fn day_of(&self, day: Option<NaiveDate>) -> Day {
        let today = self.today();
        match day {
            None => Day::Today,
            Some(date) if date == today => Day::Today,
            Some(date) if date > today => Day::Ahead(date),
            Some(date) => Day::Gone(date),
        }
    }

    /// When the next turn of the day happens. The rollover must also fire
    /// while the app is open; the core owns no timer, so it answers "when"
    /// and the app schedules the wake-up.
    pub fn next_turn_at(&self) -> chrono::DateTime<chrono::Local> {
        // `clock` is the single reader of the instant; `Local::now()` here
        // fails the invariant test.
        clock::next_daily_turn()
    }

    /// Today's state and the plan, brought up to date: the day rolled over,
    /// and every planned day that arrived (or went by while closed) poured
    /// into today, in planned order, after what today already held.
    /// Read-only notebooks get the same picture in memory, nothing on disk.
    fn sync_day(&self) -> Result<(StateFile, PlanFile)> {
        let today = self.today();
        let mut state = StateFile::load(self.state_path(), today);
        let mut plan = PlanFile::load(self.plan_path());

        let rolled = rollover::apply(&mut state.state, today, self.config.rollover.daily.mode);
        let days_before = plan.plan.days.len();
        let mut poured = false;
        for reference in plan.plan.take_due(today) {
            poured |= state.state.add(reference.path, reference.id);
        }
        // `take_due` drains, so a day leaving the plan is exactly the file
        // changing — even when everything it held was already in today.
        let plan_changed = plan.plan.days.len() != days_before;

        if !self.is_read_only() {
            if rolled.changed() || poured {
                state.save()?;
            }
            if plan_changed {
                plan.save()?;
            }
        }
        Ok((state, plan))
    }

    /// Opens today's state with the rollover applied and the plan poured in.
    /// Every read goes through here: the app never rolls over by hand.
    pub fn open_state(&self) -> Result<StateFile> {
        Ok(self.sync_day()?.0)
    }

    /// Opens the plan, with every day that already arrived taken out of it.
    pub fn open_plan(&self) -> Result<PlanFile> {
        Ok(self.sync_day()?.1)
    }

    /// Applies `mutate` to today's state AND the plan, saving the ones that
    /// changed. Always both: a change that reaches only one leaves a ghost
    /// row in the other.
    pub(super) fn update_states(&self, mutate: impl Fn(&mut dyn TaskRefs) -> bool) -> Result<()> {
        let (mut state, mut plan) = self.sync_day()?;
        if mutate(&mut state.state) {
            state.save()?;
        }
        if mutate(&mut plan.plan) {
            plan.save()?;
        }
        Ok(())
    }

    /// Pulls an existing task into a day: today, or one ahead. A day gone
    /// by is refused — what it shows is the log, and the log is not planned.
    pub fn pull_into_day(&self, day: Option<NaiveDate>, path: &str, id: &str) -> Result<bool> {
        self.ensure_writable()?;
        let day = self.day_of(day);
        // Fail before writing the state if the task is not really there —
        // a reference to a missing task shows up as a ghost row in the UI.
        let source = self.open_list(path)?;
        if source.find(id).is_none() {
            return Err(Error::TaskNotFound(id.to_string()));
        }

        match day {
            Day::Today => {
                let mut file = self.open_state()?;
                if !file.state.add(path, id) {
                    return Ok(false);
                }
                file.save()?;
                Ok(true)
            }
            Day::Ahead(date) => {
                let mut file = self.open_plan()?;
                if !file.plan.add(date, path, id) {
                    return Ok(false);
                }
                file.save()?;
                Ok(true)
            }
            Day::Gone(date) => Err(Error::DayGone(date)),
        }
    }

    /// Removes a task from a day; the task itself is untouched. Leaving today
    /// is remembered (`recall`) so it comes back as its own group of
    /// suggestions; leaving a day ahead is not — that is a plan changing.
    pub fn remove_from_day(&self, day: Option<NaiveDate>, path: &str, id: &str) -> Result<bool> {
        self.ensure_writable()?;
        match self.day_of(day) {
            Day::Today => {
                let mut file = self.open_state()?;
                if !file.state.remove(path, id) {
                    return Ok(false);
                }
                file.state.recall([TaskRef::new(path, id)]);
                file.save()?;
                Ok(true)
            }
            Day::Ahead(date) => {
                let mut file = self.open_plan()?;
                if !file.plan.remove_from(date, path, id) {
                    return Ok(false);
                }
                file.save()?;
                Ok(true)
            }
            Day::Gone(date) => Err(Error::DayGone(date)),
        }
    }

    /// The tasks a day holds, resolved, in the order pulled: today's state or
    /// a day ahead's plan. A day gone by is empty (the Home reads the log).
    /// A reference whose task is gone is skipped, not an error: a stale
    /// reference is a normal state in a shared folder.
    pub fn day_tasks(&self, day: Option<NaiveDate>) -> Result<Vec<ListedTask>> {
        let day = self.day_of(day);
        let refs: Vec<TaskRef> = match day {
            Day::Today => self.open_state()?.state.items,
            Day::Ahead(date) => self.open_plan()?.plan.of(date).to_vec(),
            Day::Gone(_) => return Ok(Vec::new()),
        };
        let mut out = Vec::new();

        for reference in &refs {
            let Ok(list) = self.open_list(&reference.path) else {
                continue;
            };
            if let Some(task) = list.find(&reference.id) {
                // A day ahead holds only what is still to do; today keeps
                // its ticked ones, under "Completed N".
                if task.done && day != Day::Today {
                    continue;
                }
                out.push(ListedTask {
                    path: reference.path.clone(),
                    task: task.clone(),
                });
            }
        }

        // A dated task joins its day on its own, unless switched off. Added
        // on READ, never written to the state: un-dating takes it back out,
        // and what the user pulled by hand stays exactly as pulled.
        if self.config.dated_tasks_join_period {
            for candidate in self.tasks_due_on(day)? {
                if !out.iter().any(|listed| is_same_task(listed, &candidate)) {
                    out.push(candidate);
                }
            }
        }

        // Both halves at once: pulled by hand and joined by date leave with
        // the same stamp.
        self.stamp_tasks(out.iter_mut().map(|listed| &mut listed.task));
        Ok(out)
    }

    /// How the day is arranged, if the user chose something. One choice for
    /// every day, kept in the notebook config: a day is not a folder.
    pub fn day_sort(&self) -> Option<&str> {
        Some(self.config.day_sort.as_str()).filter(|sort| !sort.is_empty())
    }

    /// Sets that arrangement. `None` goes back to the order things were pulled
    /// in, which is the file's own order.
    pub fn set_day_sort(&mut self, sort: Option<&str>) -> Result<()> {
        self.edit_config(|config| {
            config.day_sort = sort.unwrap_or_default().to_string();
        })
    }

    /// Rearranges a day to match `refs` — the order the user just dragged.
    /// The file IS the day's list, so the order lives there. A reference the
    /// caller did not mention keeps its place at the end.
    pub fn set_day_order(&self, day: Option<NaiveDate>, refs: &[TaskRef]) -> Result<()> {
        self.ensure_writable()?;
        match self.day_of(day) {
            Day::Today => {
                let mut file = self.open_state()?;
                // Stable, so anything unmentioned keeps the order it had.
                crate::config::by_rank(&mut file.state.items, |item| {
                    refs.iter().position(|r| r == item)
                });
                file.save()
            }
            Day::Ahead(date) => {
                let mut file = self.open_plan()?;
                file.plan.set_order(date, refs);
                file.save()
            }
            Day::Gone(date) => Err(Error::DayGone(date)),
        }
    }
}
