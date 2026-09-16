//! The bell: what rings on desktop, and the thread that rings it. ONE thread
//! per open NOTEBOOK, not per window — two windows on the same notebook share
//! it, so a reminder rings once — and it lives in the process, so a window
//! hidden in the tray or throttled by its webview rings all the same. The last
//! window to leave the notebook takes the thread with it.
//!
//! What rings and when is the core's (`jott_core::reminders`,
//! `jott_core::daysummary`). Android never starts a ringer: there the
//! system's alarm service rings (`services/androidReminders.js`).

use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use chrono::{NaiveDate, NaiveDateTime};
use jott_core::daysummary::{self, DaySummary};
use jott_core::reminders::{self, Reminder, MAX_WAIT};
use jott_core::task::{parse_datetime, render_datetime};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::state::AppState;

/// What a notification carries back when it is clicked: enough to open the
/// task. Emitted to the window as `reminder://open`; an empty `list` only
/// brings the window back.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderTarget {
    pub list: String,
    pub id: Option<String>,
}

/// The event a clicked reminder sends to its window.
pub const REMINDER_OPEN_EVENT: &str = "reminder://open";

/// The event that says which reminders could not be shown (no notification
/// daemon, say): their texts, once, so the window says it in the app.
pub const REMINDER_UNSHOWN_EVENT: &str = "reminder://unshown";

/// One notification, as the bell was asked to show it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rung {
    pub title: String,
    pub body: String,
    pub target: ReminderTarget,
}

/// The words of the notifications. The second place with strings in Rust,
/// after the tray menu — i18n has to count on both.
mod words {
    pub const REMINDER_TITLE: &str = "Reminder";

    pub fn day_title(count: usize) -> String {
        if count == 1 {
            "You have 1 task today".to_string()
        } else {
            format!("You have {count} tasks today")
        }
    }

    pub fn day_more(count: usize) -> String {
        if count == 1 {
            "…and 1 more".to_string()
        } else {
            format!("…and {count} more")
        }
    }
}

fn summary_notice(summary: &DaySummary) -> (String, String) {
    let mut lines: Vec<String> = summary.named.iter().map(|text| format!("• {text}")).collect();
    if summary.more > 0 {
        lines.push(words::day_more(summary.more));
    }
    (words::day_title(summary.count), lines.join("\n"))
}

/// Every ringer of the process, by notebook root.
#[derive(Default)]
pub struct Ringers {
    inner: Mutex<HashMap<PathBuf, Ringer>>,
    /// `Some` while a test listens: what would have been shown lands here
    /// instead of on the desktop, and only `ring_at` rings — the threads
    /// stand still, so the real clock never races the test's.
    captured: Mutex<Option<Vec<Rung>>>,
}

struct Ringer {
    /// The windows working in this notebook; the first one owns the
    /// notifications (a click brings it back).
    windows: BTreeSet<String>,
    shared: Arc<Shared>,
}

impl Drop for Ringer {
    fn drop(&mut self) {
        self.shared.signal(|control| control.stop = true);
    }
}

#[derive(Default)]
struct Shared {
    control: Mutex<Control>,
    wake: Condvar,
    /// One pass at a time: the thread's and a test's never interleave, and a
    /// nudge during a ring waits for the mark it wrote.
    pass: Mutex<()>,
}

#[derive(Default)]
struct Control {
    stop: bool,
    dirty: bool,
    /// Whether the Remind function is on. `None` until a window says: the
    /// default is the interface's (`features.js`), not the core's.
    reminders_on: Option<bool>,
}

impl Shared {
    fn signal(&self, change: impl FnOnce(&mut Control)) {
        if let Ok(mut control) = self.control.lock() {
            change(&mut control);
            control.dirty = true;
        }
        self.wake.notify_all();
    }

    fn reminders_on(&self) -> bool {
        self.control
            .lock()
            .map(|control| control.reminders_on == Some(true))
            .unwrap_or(false)
    }
}

impl Ringers {
    /// `window` now works in the notebook at `root`: it leaves whatever ringer
    /// it was in, and joins — or starts — this one's.
    pub fn attach<R: Runtime>(&self, app: &AppHandle<R>, window: &str, root: &Path) {
        self.detach(window);
        if cfg!(mobile) {
            return;
        }
        let Ok(mut guard) = self.inner.lock() else {
            return;
        };
        if let Some(ringer) = guard.get_mut(root) {
            ringer.windows.insert(window.to_string());
            return;
        }
        let shared = Arc::new(Shared::default());
        spawn(app.clone(), root.to_path_buf(), shared.clone());
        guard.insert(
            root.to_path_buf(),
            Ringer {
                windows: BTreeSet::from([window.to_string()]),
                shared,
            },
        );
    }

    /// `window` closed or left its notebook. The last window out stops the
    /// thread.
    pub fn detach(&self, window: &str) {
        let Ok(mut guard) = self.inner.lock() else {
            return;
        };
        guard.retain(|_, ringer| {
            ringer.windows.remove(window);
            !ringer.windows.is_empty()
        });
    }

    /// Wakes the ringer of `root` to look again — something it reads changed.
    /// `reminders_on` is the Remind function's switch when a window says it.
    pub fn nudge(&self, root: &Path, reminders_on: Option<bool>) {
        if let Some(shared) = self.shared_of(root) {
            shared.signal(|control| {
                if reminders_on.is_some() {
                    control.reminders_on = reminders_on;
                }
            });
        }
    }

    /// The windows sharing the ringer of `root`, first owner first; empty
    /// when no ringer runs for it.
    pub fn windows_of(&self, root: &Path) -> Vec<String> {
        self.inner
            .lock()
            .ok()
            .and_then(|guard| guard.get(root).map(|r| r.windows.iter().cloned().collect()))
            .unwrap_or_default()
    }

    /// How many ringers run — one per open notebook.
    pub fn count(&self) -> usize {
        self.inner.lock().map(|guard| guard.len()).unwrap_or(0)
    }

    /// From now on, what would be shown is kept instead and the threads stand
    /// still (the tests' bell).
    pub fn capture(&self) {
        if let Ok(mut captured) = self.captured.lock() {
            captured.get_or_insert_with(Vec::new);
        }
    }

    /// What was shown since `capture`.
    pub fn rung(&self) -> Vec<Rung> {
        self.captured
            .lock()
            .ok()
            .and_then(|captured| captured.clone())
            .unwrap_or_default()
    }

    fn capturing(&self) -> bool {
        self.captured.lock().map(|captured| captured.is_some()).unwrap_or(false)
    }

    fn shared_of(&self, root: &Path) -> Option<Arc<Shared>> {
        self.inner.lock().ok()?.get(root).map(|r| r.shared.clone())
    }

    fn owner_of(&self, root: &Path) -> Option<String> {
        self.windows_of(root).into_iter().next()
    }

    /// Kept for the tests when capturing; `false` means ring for real.
    fn keep(&self, rung: &Rung) -> bool {
        match self.captured.lock() {
            Ok(mut captured) => match captured.as_mut() {
                Some(list) => {
                    list.push(rung.clone());
                    true
                }
                None => false,
            },
            Err(_) => false,
        }
    }
}

fn spawn<R: Runtime>(app: AppHandle<R>, root: PathBuf, shared: Arc<Shared>) {
    std::thread::spawn(move || loop {
        match shared.control.lock() {
            Ok(mut control) if !control.stop => control.dirty = false,
            _ => return,
        }
        let wait = if app.state::<AppState>().ringers().capturing() {
            MAX_WAIT
        } else {
            ring_pass(&app, &root, &shared, jott_core::clock::civil_now())
        };
        let Ok(control) = shared.control.lock() else {
            return;
        };
        let Ok((control, _)) = shared
            .wake
            .wait_timeout_while(control, wait, |control| !control.stop && !control.dirty)
        else {
            return;
        };
        if control.stop {
            return;
        }
    });
}

/// One pass of the ringer of `root` at `now`, as its thread runs it — for the
/// tests, which cannot wait for the clock. Answers how long until the next.
pub fn ring_at<R: Runtime>(app: &AppHandle<R>, root: &Path, now: NaiveDateTime) -> Duration {
    match app.state::<AppState>().ringers().shared_of(root) {
        Some(shared) => ring_pass(app, root, &shared, now),
        None => MAX_WAIT,
    }
}

fn ring_pass<R: Runtime>(app: &AppHandle<R>, root: &Path, shared: &Shared, now: NaiveDateTime) -> Duration {
    let _one = shared.pass.lock();
    let state = app.state::<AppState>();
    let Some(owner) = state.ringers().owner_of(root) else {
        return MAX_WAIT;
    };
    let mut wait = MAX_WAIT;

    if shared.reminders_on() {
        match state.read(&owner, |nb| nb.reminders()) {
            Ok(list) => wait = wait.min(ring_reminders(app, &owner, root, &list, now)),
            Err(e) => eprintln!("[jott] reminders not read: {}", e.message),
        }
    }

    let summary = state.read(&owner, |nb| {
        let config = nb.config();
        Ok((config.day_summary, config.day_summary_time))
    });
    if let Ok((true, time)) = summary {
        let shown_on = crate::prefs::summarized_on(app, root).and_then(|day| day.parse::<NaiveDate>().ok());
        if daysummary::summary_due(now, time, shown_on) {
            announce(app, &owner, root, now);
            wait = wait.min(daysummary::wait_until_summary(now, time, Some(now.date())));
        } else {
            wait = wait.min(daysummary::wait_until_summary(now, time, shown_on));
        }
    }
    wait
}

/// Rings what came due since this machine's mark, acknowledges it in the
/// notebook, and moves the mark past it — whether or not the bell worked. A
/// notification that could not be shown is said ONCE in the app and not
/// acknowledged (nobody saw it). Answers the wait until the next reminder.
fn ring_reminders<R: Runtime>(
    app: &AppHandle<R>,
    owner: &str,
    root: &Path,
    list: &[Reminder],
    now: NaiveDateTime,
) -> Duration {
    let state = app.state::<AppState>();
    let minute = reminders::to_minute(now);
    // A machine that never rang this notebook starts from now: nothing old rings.
    let Some(until) = crate::prefs::reminded_until(app, root).and_then(|at| parse_datetime(&at)) else {
        crate::prefs::remember_reminded_until(app, root, &render_datetime(minute));
        return next_wait(list, now);
    };

    let due = reminders::due_now(list, now, Some(until));
    if !due.is_empty() {
        let mut unshown = Vec::new();
        for reminder in &due {
            let rung = Rung {
                title: words::REMINDER_TITLE.to_string(),
                body: reminder.text.clone(),
                target: ReminderTarget {
                    list: reminder.list.clone(),
                    id: reminder.id.clone(),
                },
            };
            if let Err(e) = show(app, owner, rung) {
                eprintln!("[jott] reminder not shown: {e}");
                unshown.push(reminder.text.clone());
                continue;
            }
            if let (Some(id), Some(at)) = (reminder.id.as_deref(), parse_datetime(&reminder.at)) {
                if let Err(e) = state.quiet(owner, |nb| nb.ack_reminder(&reminder.list, id, at)) {
                    eprintln!("[jott] reminder not acknowledged: {}", e.message);
                }
            }
        }
        crate::prefs::remember_reminded_until(app, root, &render_datetime(minute));
        if !unshown.is_empty() {
            if let Err(e) = app.emit_to(owner, REMINDER_UNSHOWN_EVENT, &unshown) {
                eprintln!("[jott] could not emit unshown reminders: {e}");
            }
        }
    }
    next_wait(list, now)
}

fn next_wait(list: &[Reminder], now: NaiveDateTime) -> Duration {
    reminders::next_after(list, now).map_or(MAX_WAIT, |at| reminders::bounded_wait(at, now))
}

/// Announces the day, and marks it announced whether or not there was
/// anything to say or the bell worked: an empty day must not announce the
/// moment a task is added, and a broken bell must not retry every hour.
fn announce<R: Runtime>(app: &AppHandle<R>, owner: &str, root: &Path, now: NaiveDateTime) {
    let state = app.state::<AppState>();
    let tasks = state.read(owner, |nb| nb.day_tasks(None)).unwrap_or_default();
    if let Some(summary) = daysummary::summary_of(tasks.iter().map(|listed| &listed.task)) {
        let (title, body) = summary_notice(&summary);
        let target = ReminderTarget { list: String::new(), id: None };
        if let Err(e) = show(app, owner, Rung { title, body, target }) {
            eprintln!("[jott] day summary not shown: {e}");
        }
    }
    crate::prefs::remember_summarized_on(app, root, &now.date().to_string());
}

fn show<R: Runtime>(app: &AppHandle<R>, owner: &str, rung: Rung) -> Result<(), String> {
    if app.state::<AppState>().ringers().keep(&rung) {
        return Ok(());
    }
    show_notification(app, owner, rung)
}

/// Linux: D-Bus notifications can be clicked, and the click is what opens the
/// task. `wait_for_action` blocks until the notification is acted on or goes
/// away, so it waits on its own thread.
#[cfg(target_os = "linux")]
fn show_notification<R: Runtime>(app: &AppHandle<R>, label: &str, rung: Rung) -> Result<(), String> {
    let handle = notify_rust::Notification::new()
        .appname("Jott")
        .summary(&rung.title)
        .body(&rung.body)
        .icon(crate::APP_ICON_NAME)
        .action("default", "Open")
        .show()
        .map_err(|e| e.to_string())?;
    let app = app.clone();
    let label = label.to_string();
    std::thread::spawn(move || {
        handle.wait_for_action(|action| {
            if action == "default" {
                open_target(&app, &label, &rung.target);
            }
        });
    });
    Ok(())
}

/// Everywhere else the plugin shows it; a click is the system's business.
#[cfg(not(target_os = "linux"))]
fn show_notification<R: Runtime>(app: &AppHandle<R>, _label: &str, rung: Rung) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(rung.title)
        .body(rung.body)
        .show()
        .map_err(|e| e.to_string())
}

/// Brings the window back (it may be hidden in the tray) and tells it which
/// task to open.
pub fn open_target<R: Runtime>(app: &AppHandle<R>, label: &str, target: &ReminderTarget) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        // Only desktop windows minimise; the method does not exist on mobile.
        #[cfg(desktop)]
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit(REMINDER_OPEN_EVENT, target.clone());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_summary_names_a_handful_and_counts_the_rest() {
        let summary = DaySummary {
            count: 7,
            named: vec!["Pagar aluguel".into(), "Ligar".into()],
            more: 5,
        };
        let (title, body) = summary_notice(&summary);
        assert_eq!(title, "You have 7 tasks today");
        assert_eq!(body, "• Pagar aluguel\n• Ligar\n…and 5 more");
        let one = DaySummary { count: 1, named: vec!["Só".into()], more: 0 };
        assert_eq!(summary_notice(&one), ("You have 1 task today".into(), "• Só".into()));
    }
}
