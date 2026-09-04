//! The day: today's state file, the plan for the days ahead, the rollover
//! that keeps them current, and everything that puts a task in a day or
//! takes it out.
//!
//! Both files hold **references** (`path#id`), never task text — the task
//! lives in its list, and a day is a choice about it. Every read goes
//! through [`Notebook::open_state`], so a notebook that sat closed for a
//! week is current the moment anything looks at it: the day rolled over,
//! and whatever was planned for the days that went by has been poured into
//! today.
//!
//! Until 2026-09-04 this was "the Day and the Week", two state files of the
//! same shape. The Home's calendar replaced the week with any day ahead, and
//! the week's bucket went with it (`state.rs` says what happens to the file).

use std::path::PathBuf;

use chrono::NaiveDate;

use crate::clock::{self, TurnOffset};
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

    /// The current day — the calendar's, since 2026-09-04: the hour the day
    /// turned was a preference until the Home's calendar let the next day
    /// be planned on its own page, and then it had nothing left to buy.
    pub fn today(&self) -> NaiveDate {
        clock::today(TurnOffset::MIDNIGHT)
    }

    /// Which of the three a date is. `None` is today, said the short way —
    /// the bridge passes the calendar's choice through as it is, and the
    /// Home opens on today without naming it.
    pub fn day_of(&self, day: Option<NaiveDate>) -> Day {
        let today = self.today();
        match day {
            None => Day::Today,
            Some(date) if date == today => Day::Today,
            Some(date) if date > today => Day::Ahead(date),
            Some(date) => Day::Gone(date),
        }
    }

    /// When the next turn of the day happens.
    ///
    /// The rollover must also fire while the app is *open*, not only when the
    /// notebook is reopened. The core cannot own a timer without dragging in a
    /// runtime, so it answers "when" and the app schedules the wake-up.
    pub fn next_turn_at(&self) -> chrono::DateTime<chrono::Local> {
        // The clock module reads the instant: this used to call Local::now()
        // here, which the invariant test now flags — the configured turn only
        // stays honest while clock.rs is the single reader.
        clock::next_daily_turn(TurnOffset::MIDNIGHT)
    }

    /// Today's state and the plan, each brought up to date against the
    /// other: the day rolled over, and every planned day that has arrived —
    /// or went by while the app was closed — poured into today, in the order
    /// it was planned, after whatever today already held.
    ///
    /// Read-only notebooks get the same picture in memory and nothing on
    /// disk.
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

    /// Opens today's state with the rollover already applied and the plan
    /// poured in.
    ///
    /// Every read goes through here, so a notebook that sat closed for a week
    /// is up to date the moment anything looks at it — the app never has to
    /// remember to roll over first.
    pub fn open_state(&self) -> Result<StateFile> {
        Ok(self.sync_day()?.0)
    }

    /// Opens the plan, with every day that already arrived taken out of it.
    pub fn open_plan(&self) -> Result<PlanFile> {
        Ok(self.sync_day()?.1)
    }

    /// Applies `mutate` to today's state **and** the plan, saving the ones
    /// that changed.
    ///
    /// The two are always updated together — completing, deleting, renaming
    /// or removing a list has to reach both, or a reference to a task that
    /// moved renders as a ghost row in one of the two. Four callers wrote
    /// this loop out; the next one gets it right by construction.
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

    /// Removes a task from a day. The task itself is untouched.
    ///
    /// Leaving today is remembered (2026-08-17): what was taken out of the
    /// day is the likeliest thing to be put back, so it comes back as its
    /// own group of suggestions instead of falling into the middle of its
    /// list. Leaving a day ahead is not — that is a plan changing, and there
    /// is nothing to offer back.
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

    /// Creates a task straight from a day: today, or one ahead.
    ///
    /// The task is written to the Inbox — a day never stores content of its
    /// own, it only points at tasks that live in a real list (spec 3).
    pub fn add_task_in_day(&self, day: Option<NaiveDate>, text: impl Into<String>) -> Result<String> {
        self.ensure_writable()?;
        let day = self.day_of(day);
        if let Day::Gone(date) = day {
            return Err(Error::DayGone(date));
        }
        let mut inbox = self.inbox()?;

        // This one earns an id immediately: the day is about to reference
        // it, and a reference needs something stable to point at.
        let position = inbox.add_placed(Self::stamped_task(text), self.config.new_tasks_on_top);
        let id = inbox
            .ensure_id_at(position)
            .expect("the task was just added at this position");
        inbox.save()?;

        match day {
            Day::Ahead(date) => {
                let mut file = self.open_plan()?;
                file.plan.add(date, Self::inbox_path(), &id);
                file.save()?;
            }
            _ => {
                let mut file = self.open_state()?;
                file.state.add(Self::inbox_path(), &id);
                file.save()?;
            }
        }

        let born = inbox.find(&id).and_then(|task| task.created);
        if let Some(born) = born {
            self.log_timeline(vec![crate::timeline::Record::created(
                crate::clock::civil_now(),
                crate::timeline::Kind::Task,
                Self::inbox_path(),
                born,
                inbox.find(&id).map(|task| task.text.clone()).unwrap_or_default(),
            )
            .with_id(&id)]);
        }
        Ok(id)
    }

    /// The tasks a day holds, resolved to the real thing, in the order they
    /// were pulled: today's state, or a day ahead's plan. A day gone by is
    /// empty — the Home reads it from the log (`Notebook::timeline`).
    ///
    /// A reference whose task no longer exists (deleted in another editor) is
    /// skipped instead of failing: the notebook is shared with other tools, so
    /// a stale reference is a normal state, not corruption.
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
                // A day ahead holds only what is still to do: a task ticked
                // before its day is done with, and vanishes from it (user
                // call, 2026-09-04). Today keeps its ticked ones, under
                // "Completed N".
                if task.done && day != Day::Today {
                    continue;
                }
                out.push(ListedTask {
                    path: reference.path.clone(),
                    task: task.clone(),
                });
            }
        }

        // A task with a date joins its day on its own (2026-08-14), unless
        // the user switched that off. Added on READ, never written to the
        // state: un-dating a task takes it back out, the turn of the day has
        // nothing to clean up, and what the user pulled by hand stays exactly
        // as pulled.
        if self.config.dated_tasks_join_period {
            for candidate in self.tasks_due_on(day)? {
                if !out.iter().any(|listed| is_same_task(listed, &candidate)) {
                    out.push(candidate);
                }
            }
        }

        // Both halves at once — pulled by hand and joined by date come off
        // different paths and have to leave with the same stamp.
        self.stamp_tasks(out.iter_mut().map(|listed| &mut listed.task));
        Ok(out)
    }

    /// How the day is arranged, if the user chose something. One choice for
    /// every day: today and the days ahead are the same screen.
    ///
    /// A day is not a folder, so there is no config file of its own to keep
    /// this in; it lives with the notebook, beside the manual `order`
    /// (2026-08-06).
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
    ///
    /// The file IS the day's list, so a hand-made order belongs in it rather
    /// than mirrored in the config: there is nothing to fall out of step
    /// with. A reference the caller did not mention keeps its place at the
    /// end, so a list that changed under the drag loses nothing.
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

    /// The days ahead with something planned, earliest first — for a
    /// calendar that wants to mark them.
    pub fn planned_days(&self) -> Result<Vec<NaiveDate>> {
        Ok(self.open_plan()?.plan.planned_days())
    }
}
