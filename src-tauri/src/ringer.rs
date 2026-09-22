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

use chrono::{NaiveDate, NaiveDateTime, NaiveTime};
use jott_core::config::DateFormat;
use jott_core::daysummary::{self, DaySummary, NAMED};
use jott_core::lang::Lang;
use jott_core::reminders::{self, Reminder, ReminderAction, MAX_WAIT, RING_APART};
use jott_core::task::{parse_datetime, render_datetime};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::state::{AppState, NOTEBOOK_CHANGED_EVENT};

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
    /// The reminders it stands for — acknowledged when someone acts on it,
    /// never when it is merely shown. Empty for the day summary.
    pub covered: Vec<Covered>,
    /// Whether it offers Done, Later and Tomorrow: one task's reminder does;
    /// the summary and a pile of missed ones only open.
    pub buttons: bool,
}

/// A reminder a notification stands for, as the notebook names it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Covered {
    pub list: String,
    pub id: String,
    pub at: NaiveDateTime,
}

impl Covered {
    /// A reminder with no id cannot be named on another device, and so is
    /// neither acknowledged nor acted on.
    fn of(reminder: &Reminder) -> Option<Self> {
        Some(Self {
            list: reminder.list.clone(),
            id: reminder.id.clone()?,
            at: parse_datetime(&reminder.at)?,
        })
    }
}

/// What became of a notification, as the server reported it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Answer {
    /// The body (`default`) or a button, by the action's name.
    Clicked(String),
    /// Closed by hand.
    Dismissed,
    /// Timed out, closed by the app, or a reason this build does not know —
    /// nobody is known to have seen it, so another device still rings.
    Unseen,
}

/// The words of the notifications. The second place with strings in Rust,
/// after the tray menu. Open/Done/Later/Tomorrow also live in `strings.js`
/// (`notify*`, Android's buttons): a translation changes both.
mod words {
    use jott_core::lang::Lang::{self, En, PtBr};

    pub fn due_on(lang: Lang, date: &str) -> String {
        match lang {
            En => format!("due {date}"),
            PtBr => format!("para {date}"),
        }
    }

    pub fn missed_title(lang: Lang, count: usize) -> String {
        match lang {
            En => format!("{count} reminders while you were away"),
            PtBr => format!("{count} lembretes enquanto você esteve fora"),
        }
    }

    pub fn first_reminder_at(lang: Lang, time: &str) -> String {
        match lang {
            En => format!("First reminder at {time}"),
            PtBr => format!("Primeiro lembrete às {time}"),
        }
    }

    pub fn day_title(lang: Lang, count: usize) -> String {
        match (lang, count) {
            (En, 1) => "You have 1 task today".to_string(),
            (En, _) => format!("You have {count} tasks today"),
            (PtBr, 1) => "Você tem 1 tarefa hoje".to_string(),
            (PtBr, _) => format!("Você tem {count} tarefas hoje"),
        }
    }

    /// Open, Done, Later, Tomorrow.
    pub fn buttons(lang: Lang) -> [&'static str; 4] {
        match lang {
            En => ["Open", "Done", "Later", "Tomorrow"],
            PtBr => ["Abrir", "Concluir", "Depois", "Amanhã"],
        }
    }

    /// Where a reminder's task lives. The fixed Tasks space keeps "Tasks" on
    /// disk and reads in the language — the twin of `spaceLabel` (paths.js).
    pub fn place(lang: Lang, list: &str, place: &str) -> String {
        let fixed = list.starts_with(&format!("{}/", jott_core::TASKS_DIR));
        match (lang, place.strip_prefix("Tasks")) {
            (PtBr, Some(rest)) if fixed && (rest.is_empty() || rest.starts_with('/')) => format!("Tarefas{rest}"),
            _ => place.to_string(),
        }
    }

    pub fn day_more(lang: Lang, count: usize) -> String {
        match (lang, count) {
            (En, 1) => "…and 1 more".to_string(),
            (En, _) => format!("…and {count} more"),
            (PtBr, 1) => "…e mais 1".to_string(),
            (PtBr, _) => format!("…e mais {count}"),
        }
    }
}

/// A handful of lines by name, then how many more.
fn named_lines<'a>(lang: Lang, texts: impl ExactSizeIterator<Item = &'a str>) -> Vec<String> {
    let count = texts.len();
    let mut lines: Vec<String> = texts.take(NAMED).map(|text| format!("• {text}")).collect();
    if count > lines.len() {
        lines.push(words::day_more(lang, count - lines.len()));
    }
    lines
}

fn summary_notice(lang: Lang, summary: &DaySummary, first_reminder: Option<NaiveTime>) -> (String, String) {
    let mut lines: Vec<String> = summary.named.iter().map(|text| format!("• {text}")).collect();
    if summary.more > 0 {
        lines.push(words::day_more(lang, summary.more));
    }
    if let Some(time) = first_reminder {
        lines.push(words::first_reminder_at(lang, &time.format("%H:%M").to_string()));
    }
    (words::day_title(lang, summary.count), lines.join("\n"))
}

/// One reminder's notification: the task leads, and the body says where it
/// lives and, when it has one, its date.
fn reminder_notice(lang: Lang, reminder: &Reminder, dates: DateFormat) -> (String, String) {
    let due = reminder
        .due
        .as_deref()
        .and_then(|day| day.parse::<NaiveDate>().ok())
        .map(|day| words::due_on(lang, &dates.format(day)));
    let place = words::place(lang, &reminder.list, &reminder.place);
    let body = match due {
        Some(due) => format!("{place} · {due}"),
        None => place,
    };
    (reminder.text.clone(), body)
}

/// What rings for `due`: one notification each, or — past [`RING_APART`] —
/// one for them all, whose click opens the first one's list.
fn rungs_of(lang: Lang, due: &[Reminder], dates: DateFormat) -> Vec<(Rung, Vec<&Reminder>)> {
    if due.len() > RING_APART {
        let body = named_lines(lang, due.iter().map(|r| r.text.as_str())).join("\n");
        let target = ReminderTarget {
            list: due[0].list.clone(),
            id: None,
        };
        let rung = Rung {
            title: words::missed_title(lang, due.len()),
            body,
            target,
            covered: due.iter().filter_map(Covered::of).collect(),
            buttons: false,
        };
        return vec![(rung, due.iter().collect())];
    }
    due.iter()
        .map(|reminder| {
            let (title, body) = reminder_notice(lang, reminder, dates);
            let target = ReminderTarget {
                list: reminder.list.clone(),
                id: reminder.id.clone(),
            };
            let covered: Vec<Covered> = Covered::of(reminder).into_iter().collect();
            let buttons = !covered.is_empty();
            (Rung { title, body, target, covered, buttons }, vec![reminder])
        })
        .collect()
}

/// The actions a notification carries, as `(name, label)`: none where the
/// server draws no actions (the card's overdue mark is then what is left),
/// else the click, plus the three buttons on one task's reminder.
pub fn actions_for(lang: Lang, rung: &Rung, capabilities: &[String]) -> Vec<(&'static str, &'static str)> {
    if !capabilities.iter().any(|c| c == "actions") {
        return Vec::new();
    }
    let [open, done, later, tomorrow] = words::buttons(lang);
    let mut out = vec![("default", open)];
    if rung.buttons {
        out.extend([("done", done), ("later", later), ("tomorrow", tomorrow)]);
    }
    out
}

/// Does what someone did with a notification of the notebook at `root`, each
/// answer acknowledging every reminder it stands for; `Unseen` changes nothing.
/// Only the click brings the window: a button tells the notebook's windows a
/// list changed, as if someone else had written it.
pub fn respond<R: Runtime>(app: &AppHandle<R>, root: &Path, rung: &Rung, answer: Answer) {
    let action = match &answer {
        Answer::Clicked(name) => ReminderAction::parse(name),
        Answer::Dismissed => Some(ReminderAction::Dismiss),
        Answer::Unseen => None,
    };
    let Some(action) = action else {
        return;
    };
    let state = app.state::<AppState>();
    let windows = state.ringers().windows_of(root);
    let Some(owner) = windows.first() else {
        eprintln!("[jott] a reminder was answered with no window on its notebook");
        return;
    };
    let now = jott_core::clock::civil_now();
    let mut changed = Vec::new();
    for covered in &rung.covered {
        let act = |nb: &jott_core::Notebook| nb.act_on_reminder(&covered.list, &covered.id, covered.at, action, now);
        let result = match action {
            ReminderAction::Done => state.record(owner, "complete_task", |nb| act(nb)),
            _ => state.quiet(owner, act),
        };
        match result {
            Ok(_) if !matches!(action, ReminderAction::Open | ReminderAction::Dismiss) => {
                changed.push(covered.list.clone())
            }
            Ok(_) => {}
            Err(e) => eprintln!("[jott] reminder not acted on: {}", e.message),
        }
    }
    if action == ReminderAction::Open {
        open_target(app, owner, &rung.target);
    }
    if changed.is_empty() {
        return;
    }
    // The owner's watcher drops its own write, so every window is told.
    for list in changed {
        let change = jott_core::watcher::Change::List { path: root.join(&list) };
        for window in &windows {
            if let Err(e) = app.emit_to(window.as_str(), NOTEBOOK_CHANGED_EVENT, &change) {
                eprintln!("[jott] could not emit change event: {e}");
            }
        }
    }
    state.ringers().nudge(root, None);
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

    /// The Remind function's switch, once a window has said it.
    fn reminders_on(&self) -> Option<bool> {
        self.control.lock().ok().and_then(|control| control.reminders_on)
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
    // Nothing rings until a window says the switch: the summary names the
    // day's first reminder, and a pass that did not know would announce
    // without it. The window's nudge wakes the thread.
    let Some(reminders_on) = shared.reminders_on() else {
        return MAX_WAIT;
    };
    let lang = crate::prefs::lang(app);
    let mut wait = MAX_WAIT;

    let mut list = Vec::new();
    if reminders_on {
        match state.read(&owner, |nb| nb.reminders()) {
            Ok(read) => {
                wait = wait.min(ring_reminders(app, lang, &owner, root, &read, now));
                list = read;
            }
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
            announce(app, lang, &owner, root, &list, now);
            wait = wait.min(daysummary::wait_until_summary(now, time, Some(now.date())));
        } else {
            wait = wait.min(daysummary::wait_until_summary(now, time, shown_on));
        }
    }
    wait
}

/// Rings what came due since this machine's mark and moves the mark past it,
/// bell or no bell. Shown is not dealt with: the ack waits for [`respond`], so
/// an unseen banner leaves the phone ringing. What could not be shown is said
/// once in the app. Answers the wait until the next reminder.
fn ring_reminders<R: Runtime>(
    app: &AppHandle<R>,
    lang: Lang,
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
        let dates = state
            .read(owner, |nb| {
                let display = crate::commands::settings::display_of(app, nb);
                Ok(DateFormat::parse_or_default(&display.date_display_format))
            })
            .unwrap_or_default();
        let mut unshown = Vec::new();
        for (rung, covered) in rungs_of(lang, &due, dates) {
            if let Err(e) = show(app, root, rung) {
                eprintln!("[jott] reminder not shown: {e}");
                unshown.extend(covered.iter().map(|reminder| reminder.text.clone()));
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
fn announce<R: Runtime>(
    app: &AppHandle<R>,
    lang: Lang,
    owner: &str,
    root: &Path,
    reminders: &[Reminder],
    now: NaiveDateTime,
) {
    let state = app.state::<AppState>();
    let tasks = state.read(owner, |nb| nb.day_tasks(None)).unwrap_or_default();
    if let Some(summary) = daysummary::summary_of(tasks.iter().map(|listed| &listed.task)) {
        let first = daysummary::first_reminder_of_day(reminders, now);
        let (title, body) = summary_notice(lang, &summary, first);
        let target = ReminderTarget { list: String::new(), id: None };
        let rung = Rung { title, body, target, covered: Vec::new(), buttons: false };
        if let Err(e) = show(app, root, rung) {
            eprintln!("[jott] day summary not shown: {e}");
        }
    }
    crate::prefs::remember_summarized_on(app, root, &now.date().to_string());
}

fn show<R: Runtime>(app: &AppHandle<R>, root: &Path, rung: Rung) -> Result<(), String> {
    if app.state::<AppState>().ringers().keep(&rung) {
        return Ok(());
    }
    show_notification(app, root, rung)
}

/// What the notification server says it can do, asked once per process —
/// GNOME, KDE, XFCE, dunst and mako each answer differently, and a hint a
/// server does not know is at best ignored. See docs/platform-gotchas.md#ambiente
#[cfg(target_os = "linux")]
fn capabilities(connection: &zbus::blocking::Connection) -> &'static [String] {
    static CAPABILITIES: std::sync::OnceLock<Vec<String>> = std::sync::OnceLock::new();
    CAPABILITIES.get_or_init(|| {
        connection
            .call_method(Some(NOTIFICATIONS), NOTIFICATIONS_PATH, Some(NOTIFICATIONS), "GetCapabilities", &())
            .and_then(|reply| reply.body().deserialize::<Vec<String>>())
            .unwrap_or_default()
    })
}

#[cfg(target_os = "linux")]
const NOTIFICATIONS: &str = "org.freedesktop.Notifications";
#[cfg(target_os = "linux")]
const NOTIFICATIONS_PATH: &str = "/org/freedesktop/Notifications";

/// What a `NotificationClosed` reason says someone did: only 2 is a person
/// dismissing it; 1 (expired), 3 (closed by the app) and anything unknown
/// are not an answer.
#[cfg(target_os = "linux")]
pub fn closed_answer(reason: u32) -> Answer {
    if reason == 2 {
        Answer::Dismissed
    } else {
        Answer::Unseen
    }
}

/// The app's icon as a FILE, written once into the app's data folder: every
/// server reads a path, while the bare name `jott` is only found in the icon
/// theme of an installed app. Falls back to the name.
#[cfg(target_os = "linux")]
fn icon<R: Runtime>(app: &AppHandle<R>) -> String {
    static ICON: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();
    ICON.get_or_init(|| {
        let path = app.path().app_data_dir().ok()?.join("notification-icon.png");
        jott_core::fsio::write_atomically(&path, crate::commands::update::ICON_PNG)
            .map_err(|e| eprintln!("[jott] notification icon not written: {e}"))
            .ok()?;
        Some(path.to_string_lossy().into_owned())
    })
    .clone()
    .unwrap_or_else(|| crate::APP_ICON_NAME.to_string())
}

/// Linux: plain text (a server without markup shows the tags), with the
/// actions the server draws, spoken over D-Bus directly: the answer includes
/// the activation token GNOME opens for a button (`startup.rs`). The answer
/// may never come — GNOME keeps an expired banner in its tray and says
/// nothing — so it waits on its own thread.
#[cfg(target_os = "linux")]
fn show_notification<R: Runtime>(app: &AppHandle<R>, root: &Path, rung: Rung) -> Result<(), String> {
    use zbus::zvariant::Value;
    let connection = zbus::blocking::Connection::session().map_err(|e| e.to_string())?;
    // Subscribed before the notification exists, so no answer can slip by.
    let rule = zbus::MatchRule::builder()
        .msg_type(zbus::message::Type::Signal)
        .interface(NOTIFICATIONS)
        .and_then(|rule| rule.path(NOTIFICATIONS_PATH))
        .map_err(|e| e.to_string())?
        .build();
    let messages = zbus::blocking::MessageIterator::for_match_rule(rule, &connection, None).map_err(|e| e.to_string())?;
    let actions: Vec<&str> = actions_for(crate::prefs::lang(app), &rung, capabilities(&connection))
        .into_iter()
        .flat_map(|(name, label)| [name, label])
        .collect();
    let icon = icon(app);
    let urgency: u8 = if rung.covered.is_empty() { 0 } else { 1 };
    let hints = HashMap::from([
        ("desktop-entry", Value::from(crate::APP_ICON_NAME)),
        ("urgency", Value::from(urgency)),
    ]);
    let id: u32 = connection
        .call_method(
            Some(NOTIFICATIONS),
            NOTIFICATIONS_PATH,
            Some(NOTIFICATIONS),
            "Notify",
            &("Jott", 0u32, icon.as_str(), rung.title.as_str(), rung.body.as_str(), actions, hints, -1i32),
        )
        .and_then(|reply| reply.body().deserialize())
        .map_err(|e| e.to_string())?;
    let app = app.clone();
    let root = root.to_path_buf();
    std::thread::spawn(move || {
        // The connection is what the server answers to; it lives as long as this.
        let _connection = connection;
        let mut token = None;
        for message in messages {
            let Ok(message) = message else { break };
            let header = message.header();
            let body = message.body();
            match header.member().map(|m| m.as_str()) {
                Some("ActivationToken") => {
                    if let Ok((of, given)) = body.deserialize::<(u32, String)>() {
                        if of == id {
                            token = Some(given);
                        }
                    }
                }
                Some("ActionInvoked") => {
                    if let Ok((of, action)) = body.deserialize::<(u32, String)>() {
                        if of == id {
                            if let Some(token) = token.take() {
                                if let Err(e) = crate::startup::complete(&token) {
                                    eprintln!("[jott] startup sequence not ended: {e}");
                                }
                            }
                            respond(&app, &root, &rung, Answer::Clicked(action));
                            return;
                        }
                    }
                }
                Some("NotificationClosed") => {
                    if let Ok((of, reason)) = body.deserialize::<(u32, u32)>() {
                        if of == id {
                            respond(&app, &root, &rung, closed_answer(reason));
                            return;
                        }
                    }
                }
                _ => {}
            }
        }
    });
    Ok(())
}

/// Everywhere else the plugin shows it, with no actions (the plugin has none
/// on desktop); a click is the system's business.
#[cfg(not(target_os = "linux"))]
fn show_notification<R: Runtime>(app: &AppHandle<R>, _root: &Path, rung: Rung) -> Result<(), String> {
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
        let (title, body) = summary_notice(Lang::En, &summary, None);
        assert_eq!(title, "You have 7 tasks today");
        assert_eq!(body, "• Pagar aluguel\n• Ligar\n…and 5 more");
        let one = DaySummary { count: 1, named: vec!["Só".into()], more: 0 };
        assert_eq!(summary_notice(Lang::En, &one, None), ("You have 1 task today".into(), "• Só".into()));
    }

    #[test]
    fn the_summary_names_the_first_reminder_of_the_day() {
        let one = DaySummary { count: 1, named: vec!["Só".into()], more: 0 };
        let first = NaiveTime::from_hms_opt(18, 30, 0);
        assert_eq!(summary_notice(Lang::En, &one, first).1, "• Só\nFirst reminder at 18:30");
    }

    fn reminder(text: &str, due: Option<&str>) -> Reminder {
        Reminder {
            list: "Casa/task-list.md".into(),
            id: Some(text.to_lowercase()),
            position: 0,
            place: "Casa".into(),
            text: text.into(),
            due: due.map(String::from),
            at: "2026-07-24T18:00".into(),
        }
    }

    #[test]
    fn the_notice_leads_with_the_task() {
        let (title, body) = reminder_notice(Lang::En, &reminder("Pagar aluguel", None), DateFormat::default());
        assert_eq!((title.as_str(), body.as_str()), ("Pagar aluguel", "Casa"));
        let (_, body) = reminder_notice(Lang::En, &reminder("Pagar aluguel", Some("2026-07-25")), DateFormat::DayMonthYear);
        assert_eq!(body, "Casa · due 25/07/2026");
    }

    #[test]
    #[cfg(target_os = "linux")]
    fn only_a_person_dismissing_is_an_answer() {
        assert_eq!(closed_answer(2), Answer::Dismissed);
        for reason in [1, 3, 4, 0] {
            assert_eq!(closed_answer(reason), Answer::Unseen);
        }
    }

    #[test]
    fn a_server_without_actions_gets_a_plain_notification() {
        let due = [reminder("Pagar aluguel", None)];
        let one = &rungs_of(Lang::En, &due, DateFormat::default())[0].0;
        assert!(actions_for(Lang::En, one, &["body".into(), "persistence".into()]).is_empty());
        let names: Vec<_> = actions_for(Lang::En, one, &["actions".into()]).iter().map(|(name, _)| *name).collect();
        assert_eq!(names, ["default", "done", "later", "tomorrow"]);
    }

    #[test]
    fn a_few_ring_apart_and_more_arrive_as_one() {
        let three: Vec<_> = ["A", "B", "C"].iter().map(|t| reminder(t, None)).collect();
        assert_eq!(rungs_of(Lang::En, &three, DateFormat::default()).len(), 3);

        let seven: Vec<_> = ["A", "B", "C", "D", "E", "F", "G"].iter().map(|t| reminder(t, None)).collect();
        let rungs = rungs_of(Lang::En, &seven, DateFormat::default());
        assert_eq!(rungs.len(), 1);
        let (rung, covered) = &rungs[0];
        assert_eq!(rung.title, "7 reminders while you were away");
        assert_eq!(rung.body, "• A\n• B\n• C\n• D\n• E\n…and 2 more");
        assert_eq!(rung.target, ReminderTarget { list: "Casa/task-list.md".into(), id: None });
        assert_eq!(covered.len(), 7);
        assert_eq!(rung.covered.len(), 7, "an answer acknowledges every one of them");
        let names: Vec<_> = actions_for(Lang::En, rung, &["actions".into()]).iter().map(|(name, _)| *name).collect();
        assert_eq!(names, ["default"], "a pile only opens");
    }

    #[test]
    fn the_notifications_speak_portuguese() {
        let pt = Lang::PtBr;
        let seven = DaySummary { count: 7, named: vec!["Ligar".into()], more: 6 };
        let first = NaiveTime::from_hms_opt(18, 30, 0);
        assert_eq!(
            summary_notice(pt, &seven, first),
            ("Você tem 7 tarefas hoje".into(), "• Ligar\n…e mais 6\nPrimeiro lembrete às 18:30".into())
        );
        let one = DaySummary { count: 1, named: vec!["Só".into()], more: 0 };
        assert_eq!(summary_notice(pt, &one, None).0, "Você tem 1 tarefa hoje");
        let (_, body) = reminder_notice(pt, &reminder("Pagar", Some("2026-07-25")), DateFormat::DayMonthYear);
        assert_eq!(body, "Casa · para 25/07/2026");
        let inbox = Reminder { list: "jott.tasks/task-list.md".into(), place: "Tasks".into(), ..reminder("P", None) };
        assert_eq!(reminder_notice(pt, &inbox, DateFormat::default()).1, "Tarefas");
        assert_eq!(reminder_notice(Lang::En, &inbox, DateFormat::default()).1, "Tasks");
        let own = Reminder { list: "Tasks/task-list.md".into(), place: "Tasks".into(), ..reminder("P", None) };
        assert_eq!(reminder_notice(pt, &own, DateFormat::default()).1, "Tasks", "a space the user named");
        let due = [reminder("Pagar", None)];
        let labels: Vec<_> = actions_for(pt, &rungs_of(pt, &due, DateFormat::default())[0].0, &["actions".into()])
            .iter()
            .map(|(_, label)| *label)
            .collect();
        assert_eq!(labels, ["Abrir", "Concluir", "Depois", "Amanhã"]);
    }
}
