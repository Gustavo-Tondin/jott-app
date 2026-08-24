//! The Day and the Week.
//!
//! Neither owns a task: a period holds REFERENCES to tasks that live in lists,
//! which is what lets the same task be in today and in its own list at once.

use jott_core::state::{Period, PeriodState};
use jott_core::{ListedTask, Notebook};
use serde::Serialize;
use tauri::{Runtime, State};

use crate::error::CommandResult;
use crate::state::AppState;

#[tauri::command]
pub fn pull_into_period<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    period: Period,
    list: String,
    id: String,
) -> CommandResult<bool> {
    state.record(window.label(), "pull_into", |nb| nb.pull_into(period, &list, &id))
}

#[tauri::command]
pub fn remove_from_period<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    period: Period,
    list: String,
    id: String,
) -> CommandResult<bool> {
    state.record(window.label(), "remove_from", |nb| nb.remove_from(period, &list, &id))
}

/// Creates a task straight from Today or This Week. It is written to the
/// Inbox — the periods only ever hold references.
#[tauri::command]
pub fn add_task_in_period<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    period: Period,
    text: String,
) -> CommandResult<String> {
    state.read(window.label(), |nb| nb.add_task_in_period(period, text))
}

/// How the Day or the Week is arranged (`name` / `created` / `completed`), or
/// null for the order the tasks were pulled in.
#[tauri::command]
pub fn period_sort<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>, period: Period) -> CommandResult<Option<String>> {
    state.with_notebook(window.label(), |nb| Ok(nb.period_sort(period).map(str::to_string)))
}

/// Sets that arrangement. A period has no `.space.json`, so it lives in the
/// notebook config beside the manual `order`.
#[tauri::command]
pub fn set_period_sort<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    period: Period,
    sort: Option<String>,
) -> CommandResult<()> {
    state.record(window.label(), "set_period_sort", |nb| nb.set_period_sort(period, sort.as_deref()))
}

/// Rearranges the period to the order the user dragged. The state file is the
/// day's list, so the hand-made order goes straight into it.
#[tauri::command]
pub fn set_period_order<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    period: Period,
    refs: Vec<jott_core::state::TaskRef>,
) -> CommandResult<()> {
    state.record(window.label(), "set_period_order", |nb| nb.set_period_order(period, &refs))
}

/// The tasks pulled into a period, resolved to the real thing.
#[tauri::command]
pub fn period_tasks<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    period: Period,
) -> CommandResult<Vec<ListedTask>> {
    state.read(window.label(), |nb| nb.period_tasks(period))
}

/// What to offer pulling into a period, already in display order.
#[tauri::command]
pub fn period_suggestions<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    period: Period,
) -> CommandResult<Vec<ListedTask>> {
    state.read(window.label(), |nb| nb.suggestions_for(period))
}

/// The current logical day and week, and when each turns next. The UI needs
/// this both to label the screens and to schedule the in-app rollover.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodClock {
    pub today: String,
    pub week_start: String,
    pub next_daily_turn: String,
    pub next_weekly_turn: String,
}

pub(crate) fn clock_of(nb: &Notebook) -> PeriodClock {
    PeriodClock {
        today: nb.today().to_string(),
        week_start: nb.current_week().to_string(),
        next_daily_turn: nb.next_turn_at(Period::Day).to_rfc3339(),
        next_weekly_turn: nb.next_turn_at(Period::Week).to_rfc3339(),
    }
}

#[tauri::command]
pub fn period_clock<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>,) -> CommandResult<PeriodClock> {
    state.with_notebook(window.label(), |nb| Ok(clock_of(nb)))
}

/// Re-reads both period states, applying any rollover that came due while the
/// app was open. The frontend calls this when the scheduled turn arrives.
#[tauri::command]
pub fn refresh_periods<R: Runtime>(state: State<'_, AppState>,
    window: tauri::Window<R>,) -> CommandResult<Vec<PeriodState>> {
    state.read(window.label(), |nb| {
        Ok(vec![
            nb.open_state(Period::Day)?.state,
            nb.open_state(Period::Week)?.state,
        ])
    })
}

/// Suggestions with the reason each one is being offered, so the UI can group
/// them without re-deriving the rule.
#[tauri::command]
pub fn grouped_suggestions<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    period: Period,
) -> CommandResult<Vec<jott_core::notebook::Suggestion>> {
    state.read(window.label(), |nb| nb.grouped_suggestions(period))
}
