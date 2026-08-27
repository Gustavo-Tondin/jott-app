//! The Timeline: the notebook's durable log, read back for the screen.
//!
//! Three doors and nothing else. The screen asks one year at a time (the
//! log is one file a year), the year pills ask which years there are, and
//! "Remove from timeline" is the user's one way of rewriting the log — an
//! act of the user, not of the history, for the reason `Notebook::
//! forget_from_timeline` gives.

use chrono::NaiveDate;
use jott_core::timeline::Key;
use jott_core::TimelineItem;
use serde::Deserialize;
use tauri::{Runtime, State};

use crate::error::CommandResult;
use crate::state::AppState;

/// An ISO day (`2026-08-27`) from the front, or nothing. Anything else is
/// refused rather than read as "no bound": a typo widening the window to
/// the whole log would be a silent, expensive mistake.
fn day(text: Option<String>) -> Result<Option<NaiveDate>, jott_core::Error> {
    match text.filter(|s| !s.is_empty()) {
        None => Ok(None),
        Some(s) => s
            .parse()
            .map(Some)
            .map_err(|_| jott_core::Error::InvalidNotePath(s)),
    }
}

/// Everything the notebook held between two days — born in the window or
/// ticked in it — newest first, each item told its space. Reads the whole
/// log and every list with a live task: ask when the screen opens (and per
/// year as the reader scrolls), never per render.
#[tauri::command]
pub fn timeline<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    from: Option<String>,
    to: Option<String>,
) -> CommandResult<Vec<TimelineItem>> {
    let (from, to) = (day(from)?, day(to)?);
    state.read(window.label(), |nb| nb.timeline(from, to))
}

/// The years the log has a file for, newest first.
#[tauri::command]
pub fn timeline_years<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
) -> CommandResult<Vec<i32>> {
    state.read(window.label(), |nb| Ok(nb.timeline_years()))
}

/// Which thing to forget: `{kind: "task", key: <id>}` or
/// `{kind: "note", key: <root-relative path>}`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase", tag = "kind", content = "key")]
pub enum Target {
    Task(String),
    Note(String),
}

/// Forgets one thing from the log for good. Goes through `quiet`, not
/// `record`: the files it rewrites are bookkeeping the history ignores, and
/// an undo that put the lines back would defeat the confirmation the user
/// just gave. Returns how many lines went.
#[tauri::command]
pub fn forget_from_timeline<R: Runtime>(
    state: State<'_, AppState>,
    window: tauri::Window<R>,
    target: Target,
) -> CommandResult<usize> {
    let key = match target {
        Target::Task(id) => Key::Task(id),
        Target::Note(path) => Key::Note(path),
    };
    state.quiet(window.label(), |nb| nb.forget_from_timeline(&key))
}
