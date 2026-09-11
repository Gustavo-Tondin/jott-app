//! The day: today, and the days ahead the Home's calendar can plan.
//!
//! A day owns no task: it holds REFERENCES to tasks that live in lists,
//! which is what lets the same task be in a day and in its own list at once.
//! `day` is an ISO date or null — null is today, and a date that already
//! went by is refused by the core (`Error::DayGone`): what a past day shows
//! is the log, read through the timeline commands.

use chrono::NaiveDate;
use jott_core::state::DayState;
use jott_core::{ListedTask, Notebook};
use serde::Serialize;
use tauri::{Runtime, State};

use crate::error::{CommandError, CommandResult};
use crate::state::AppState;

/// An ISO day (`2026-09-05`) from the front, or nothing — today here, "no
/// bound" for the timeline. Anything else is refused rather than read as
/// nothing: a typo planning the wrong day, or widening a window to the whole
/// log, would be a silent mistake.
pub(crate) fn iso_day(text: Option<String>) -> CommandResult<Option<NaiveDate>> {
    match text.filter(|s| !s.is_empty()) {
        None => Ok(None),
        Some(s) => s
            .parse()
            .map(Some)
            .map_err(|_| CommandError::new("invalidDay", format!("{s} is not a day"))),
    }
}

#[tauri::command]
pub async fn pull_into_day<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    day: Option<String>,
    list: String,
    id: String,
) -> CommandResult<bool> {
    let day = iso_day(day)?;
    state.record(window.label(), "pull_into", |nb| nb.pull_into_day(day, &list, &id))
}

#[tauri::command]
pub async fn remove_from_day<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    day: Option<String>,
    list: String,
    id: String,
) -> CommandResult<bool> {
    let day = iso_day(day)?;
    state.record(window.label(), "remove_from", |nb| nb.remove_from_day(day, &list, &id))
}

/// How the day is arranged (`name` / `created` / `completed`), or null for
/// the order the tasks were pulled in. One answer for every day.
#[tauri::command]
pub async fn day_sort<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<Option<String>> {
    state.with_notebook(window.label(), |nb| Ok(nb.day_sort().map(str::to_string)))
}

/// Sets that arrangement. A day has no `.space.json`, so it lives in the
/// notebook config beside the manual `order`.
#[tauri::command]
pub async fn set_day_sort<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    sort: Option<String>,
) -> CommandResult<()> {
    state.record(window.label(), "set_day_sort", |nb| nb.set_day_sort(sort.as_deref()))
}

/// Rearranges a day to the order the user dragged. The file is the day's
/// list, so the hand-made order goes straight into it.
#[tauri::command]
pub async fn set_day_order<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    day: Option<String>,
    refs: Vec<jott_core::state::TaskRef>,
) -> CommandResult<()> {
    let day = iso_day(day)?;
    state.record(window.label(), "set_day_order", |nb| nb.set_day_order(day, &refs))
}

/// The tasks a day holds, resolved to the real thing. Empty for a day gone
/// by — the Home reads those from the timeline.
#[tauri::command]
pub async fn day_tasks<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    day: Option<String>,
) -> CommandResult<Vec<ListedTask>> {
    let day = iso_day(day)?;
    state.read(window.label(), |nb| nb.day_tasks(day))
}

/// The current logical day, which weekday the calendar strip starts on, and
/// when the day turns next. The UI needs this both to draw the Home and to
/// schedule the in-app rollover.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayClock {
    pub today: String,
    /// `monday` / `sunday`.
    pub week_starts_on: String,
    pub next_daily_turn: String,
}

pub(crate) fn clock_of(nb: &Notebook) -> DayClock {
    DayClock {
        today: nb.today().to_string(),
        week_starts_on: nb.config().week_starts_on.render().to_string(),
        next_daily_turn: nb.next_turn_at().to_rfc3339(),
    }
}

#[tauri::command]
pub async fn day_clock<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<DayClock> {
    state.with_notebook(window.label(), |nb| Ok(clock_of(nb)))
}

/// Re-reads today's state, applying any rollover that came due while the
/// app was open — and pouring in whatever was planned for the day that just
/// arrived. The frontend calls this when the scheduled turn arrives.
#[tauri::command]
pub async fn refresh_day<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<DayState> {
    state.read(window.label(), |nb| Ok(nb.open_state()?.state))
}

/// Suggestions for a day with the reason each one is being offered, so the
/// UI can group them without re-deriving the rule.
#[tauri::command]
pub async fn grouped_suggestions<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    day: Option<String>,
) -> CommandResult<Vec<jott_core::notebook::Suggestion>> {
    let day = iso_day(day)?;
    state.read(window.label(), |nb| nb.grouped_suggestions(day))
}
