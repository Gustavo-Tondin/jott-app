//! What the shell holds between `invoke()` calls: which notebook each WINDOW
//! has open, plus its watcher. Everything else is read from disk on demand —
//! the files are the source of truth. One notebook PER WINDOW: every command
//! that touches a notebook takes a `Window` and hands its label in here; a
//! window that closes takes its entry and watcher thread (`AppState::close`).

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use jott_core::selfwrite;
use jott_core::{History, Notebook, NotebookWatcher};
use tauri::{AppHandle, Emitter, Runtime};

use crate::error::{CommandError, CommandResult};

/// Event emitted when the notebook changes outside the app.
pub const NOTEBOOK_CHANGED_EVENT: &str = "notebook://changed";

#[derive(Default)]
pub struct AppState {
    /// Window label → the notebook that window is working in. A window with
    /// no entry is a window showing the picker, which is not a failure: it is
    /// the state every window starts in.
    inner: Mutex<HashMap<String, OpenNotebook>>,
}

struct OpenNotebook {
    notebook: Notebook,
    /// What `Ctrl+Z` takes back in this window (`jott_core::history`). A
    /// session thing: it is born with the entry and dies with it, and a
    /// second window on the same notebook has its own.
    history: History,
    /// Dropping this stops the watcher thread, which is exactly what should
    /// happen when the window opens another notebook or closes.
    _watcher: WatcherHandle,
}

/// Names `window` as the owner of every write `f` makes, the moment each
/// lands (`jott_core::selfwrite`) — never at the end of `f`: the watcher
/// looks 50 ms after the event, and on slow storage the command that wrote
/// is still running then. Anything written by somebody else in the meantime
/// keeps a different stamp and is reported as theirs.
fn attribute<T>(window: &str, f: impl FnOnce() -> T) -> T {
    let _owner = selfwrite::as_owner(window);
    f()
}

/// Whether `path` reads as something `window` wrote in the last seconds —
/// the window's own save coming back as an event, which the front already
/// acted on. The window's own watcher drops those: reloading on the echo
/// cost a refresh of every screen and a refetch of every picture on every
/// keystroke pause, and, worse, a conflict copy of the window's own text.
pub fn is_own_write(path: &Path, window: &str) -> bool {
    selfwrite::is_own(path, window)
}

impl AppState {
    /// Runs `f` against the notebook `window` has open, or fails if it has
    /// none.
    pub fn with_notebook<T>(
        &self,
        window: &str,
        f: impl FnOnce(&Notebook) -> CommandResult<T>,
    ) -> CommandResult<T> {
        let guard = self.lock()?;
        let open = guard.get(window).ok_or_else(CommandError::no_notebook)?;
        f(&open.notebook)
    }

    /// Where the window's notebook lives — the key every machine preference
    /// about a notebook is filed under (`crate::prefs`).
    pub fn root_of(&self, window: &str) -> CommandResult<std::path::PathBuf> {
        self.with_notebook(window, |nb| Ok(nb.root().to_path_buf()))
    }

    /// `with_notebook` for the common case: a closure that is one core call,
    /// lifting the core's `Result` so a command need not spell `|nb| Ok(nb.x(..)?)`.
    pub fn read<T>(
        &self,
        window: &str,
        f: impl FnOnce(&Notebook) -> jott_core::Result<T>,
    ) -> CommandResult<T> {
        self.with_notebook(window, |nb| Ok(f(nb)?))
    }

    /// `write` for an ACTION — one the user can take back: named by the
    /// command, landed in the window's history. Deliberate exceptions, each
    /// with a history of its own or none: `write_note`, `set_task_fields`/
    /// `ensure_task_id`, the asset commands and `refresh_day`.
    pub fn record<T>(
        &self,
        window: &str,
        label: &str,
        f: impl FnOnce(&mut Notebook) -> jott_core::Result<T>,
    ) -> CommandResult<T> {
        let mut guard = self.lock()?;
        let open = guard.get_mut(window).ok_or_else(CommandError::no_notebook)?;
        let OpenNotebook { notebook, history, .. } = open;
        Ok(attribute(window, || notebook.record(history, label, f))?)
    }

    /// `read` for a write that is NOT an action of its own — the editor's
    /// save, the inspector's, an id handed out — and so is folded into the
    /// history rather than recorded by it (`History::absorb`).
    pub fn quiet<T>(
        &self,
        window: &str,
        f: impl FnOnce(&Notebook) -> jott_core::Result<T>,
    ) -> CommandResult<T> {
        let mut guard = self.lock()?;
        let open = guard.get_mut(window).ok_or_else(CommandError::no_notebook)?;
        let result = attribute(window, || f(&open.notebook))?;
        // A scan that fails leaves the history as it was; the write itself
        // already happened, and that is what the caller asked for.
        let _ = open.history.absorb(open.notebook.root());
        Ok(result)
    }

    /// Takes back the window's last recorded action; answers its label, or
    /// `None` when there was nothing to take back. Attributed like any other
    /// write of the window: the front reloads itself after an undo, and the
    /// echo of the files it put back must not make it reload twice.
    pub fn undo(&self, window: &str) -> CommandResult<Option<String>> {
        let mut guard = self.lock()?;
        let open = guard.get_mut(window).ok_or_else(CommandError::no_notebook)?;
        let OpenNotebook { notebook, history, .. } = open;
        Ok(attribute(window, || notebook.undo(history))?)
    }

    /// Does the window's last undone action again; answers its label, or
    /// `None`.
    pub fn redo(&self, window: &str) -> CommandResult<Option<String>> {
        let mut guard = self.lock()?;
        let open = guard.get_mut(window).ok_or_else(CommandError::no_notebook)?;
        let OpenNotebook { notebook, history, .. } = open;
        Ok(attribute(window, || notebook.redo(history))?)
    }

    /// The label `undo` would answer with, without undoing anything.
    pub fn undoable(&self, window: &str) -> CommandResult<Option<String>> {
        let guard = self.lock()?;
        let open = guard.get(window).ok_or_else(CommandError::no_notebook)?;
        Ok(open.history.undoable().map(str::to_string))
    }

    /// Whether ANY window has the notebook at `path` open — the picker asks
    /// about notebooks it has not opened, and with two windows the folder may
    /// be the OTHER one's. Unusable state answers "yes": refusing beats moving
    /// a folder the app may still be holding.
    pub fn holds(&self, path: &std::path::Path) -> bool {
        match self.lock() {
            Ok(guard) => guard.values().any(|open| open.notebook.root() == path),
            Err(_) => true,
        }
    }

    /// Gives a window a notebook to work in, and starts watching it. Whatever
    /// that window held before is dropped, watcher and all.
    pub fn open<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        window: &str,
        notebook: Notebook,
    ) -> CommandResult<()> {
        let watcher = WatcherHandle::start(app.clone(), window, &notebook)?;
        let mut guard = self.lock()?;
        guard.insert(
            window.to_string(),
            OpenNotebook {
                notebook,
                history: History::new(),
                _watcher: watcher,
            },
        );
        Ok(())
    }

    /// Which window, if any, is working in the notebook at `path`. The picker
    /// asks before opening: a second window on an open notebook is two writers
    /// on the same files. The answer is a label, which `set_focus` takes.
    pub fn window_holding(&self, path: &std::path::Path) -> Option<String> {
        let guard = self.lock().ok()?;
        guard
            .iter()
            .find(|(_, open)| open.notebook.root() == path)
            .map(|(label, _)| label.clone())
    }

    /// Forgets a window, because it closed. The entry owns a watcher THREAD.
    /// Called from the window's own destroyed event (`lib.rs`).
    pub fn close(&self, window: &str) {
        if let Ok(mut guard) = self.lock() {
            guard.remove(window);
        }
    }

    /// Re-reads one window's notebook config from disk. A no-op where that
    /// window has none, or with the state unusable — the watcher that calls
    /// this has nothing better to do than carry on.
    pub fn reload_config(&self, window: &str) {
        if let Ok(mut guard) = self.lock() {
            if let Some(open) = guard.get_mut(window) {
                open.notebook.reload_config();
            }
        }
    }

    /// Shows `window`'s notebook the lists somebody else wrote: a sort those
    /// files no longer follow gives way to the file order
    /// (`Notebook::yield_to_file_order`). Attributed to the window, so its own
    /// watcher drops the echo of the config this rewrites. Answers whether a
    /// space gave way.
    pub fn yield_to_file_order(&self, window: &str, lists: &[std::path::PathBuf]) -> bool {
        let Ok(guard) = self.lock() else {
            return false;
        };
        guard.get(window).is_some_and(|open| {
            attribute(window, || open.notebook.yield_to_file_order(Some(lists)))
                .is_ok_and(|yielded| !yielded.is_empty())
        })
    }

    /// Tells `window`'s notebook that somebody else's version of each of
    /// these files landed — the new content the devices have in common
    /// (`Notebook::note_external_change`). Nothing is announced and nothing is
    /// written into the notebook; this only moves the merge base.
    pub fn note_external_changes(&self, window: &str, paths: &[std::path::PathBuf]) {
        if paths.is_empty() {
            return;
        }
        let Ok(guard) = self.lock() else {
            return;
        };
        if let Some(open) = guard.get(window) {
            for path in paths {
                open.notebook.note_external_change(path);
            }
        }
    }

    fn lock(&self) -> CommandResult<std::sync::MutexGuard<'_, HashMap<String, OpenNotebook>>> {
        // A poisoned mutex means a command panicked while holding it. Failing
        // the call is better than papering over an unknown state.
        self.inner
            .lock()
            .map_err(|_| CommandError::new("poisoned", "notebook state is unusable"))
    }
}

/// Owns the watcher thread and stops it on drop.
struct WatcherHandle {
    stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl WatcherHandle {
    fn start<R: Runtime>(
        app: AppHandle<R>,
        window: &str,
        notebook: &Notebook,
    ) -> CommandResult<Self> {
        // Captured by the thread: the event has to reach the window whose
        // notebook actually changed, and nobody else's.
        let window = window.to_string();
        // The one change that names no file of its own (`Change::Config`).
        let config_json = notebook.config_path();
        let watcher: NotebookWatcher = notebook.watch()?;
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = stop.clone();

        std::thread::spawn(move || {
            use std::sync::atomic::Ordering;
            use std::time::Duration;

            // Polling with a timeout instead of blocking forever is what lets
            // the thread notice it should stop.
            let mut arrivals = Arrivals::default();
            let mut announced = Announced::default();
            while !flag.load(Ordering::Relaxed) {
                // Lists somebody else wrote are judged once their burst has
                // settled (`Arrivals`). A space that gave way to its file
                // order is announced as a change of a list, so the window
                // re-reads the snapshot and its menu ticks Custom.
                if let Some(settled) = arrivals.due(std::time::Instant::now()) {
                    use tauri::Manager;
                    let state = app.state::<AppState>();
                    // The versions that arrived are what the devices now have
                    // in common — taken only now, with the whole burst on disk.
                    // Lists and notes as much as the day's state: they are
                    // merged too, and a merge without a base does nothing.
                    state.note_external_changes(&window, &settled.states);
                    state.note_external_changes(&window, &settled.lists);
                    if !settled.lists.is_empty()
                        && state.yield_to_file_order(&window, &settled.lists)
                    {
                        let change = jott_core::watcher::Change::List {
                            path: settled.lists[0].clone(),
                        };
                        if let Err(e) = app.emit_to(&window, NOTEBOOK_CHANGED_EVENT, &change) {
                            eprintln!("[jott] could not emit change event: {e}");
                        }
                    }
                }

                let Some(first) = watcher.next_within(Duration::from_millis(250)) else {
                    continue;
                };

                // A single external save fires several OS events; collapse the
                // burst so the UI reloads once.
                std::thread::sleep(Duration::from_millis(50));
                let mut changes = vec![first];
                for change in watcher.drain() {
                    if !changes.contains(&change) {
                        changes.push(change);
                    }
                }

                // The window's own saves come back as events; the front
                // already acted on them. Dropped by STAMP, so a file somebody
                // else touched after us is still reported (`selfwrite`). What
                // is left is weighed against what the window already knows the
                // file to hold: the same content twice is no news.
                let changes: Vec<_> = changes
                    .into_iter()
                    .filter(|change| {
                        let watched = watched_path(change, &config_json);
                        if change.path().is_some_and(|path| is_own_write(path, &window)) {
                            if let Some(path) = watched {
                                announced.record(path, selfwrite::Stamp::of_file(path));
                            }
                            return false;
                        }
                        match watched {
                            Some(path) => announced.is_news(path, selfwrite::Stamp::of_file(path)),
                            None => true,
                        }
                    })
                    .collect();
                arrivals.note(&changes, std::time::Instant::now());

                for change in changes {
                    // A synced-in `config.json` must take effect: the notebook
                    // caches its Config by value and only reads it on open.
                    // Re-reading our own write back is harmless.
                    if matches!(change, jott_core::watcher::Change::Config) {
                        use tauri::Manager;
                        app.state::<AppState>().reload_config(&window);
                    }
                    // To the ONE window: a broadcast would reload every window
                    // on every other window's save.
                    if let Err(e) = app.emit_to(&window, NOTEBOOK_CHANGED_EVENT, &change) {
                        eprintln!("[jott] could not emit change event: {e}");
                    }
                }
            }
        });

        Ok(Self { stop })
    }
}

impl Drop for WatcherHandle {
    fn drop(&mut self) {
        self.stop.store(true, std::sync::atomic::Ordering::Relaxed);
    }
}

/// The file a change is about, when the window reloads that file's CONTENT
/// and the file is small enough to read on every event. An asset is left out
/// on purpose: it can be megabytes, and the screen only drops its picture.
fn watched_path<'a>(
    change: &'a jott_core::watcher::Change,
    config_json: &'a Path,
) -> Option<&'a Path> {
    use jott_core::watcher::Change;
    match change {
        // The one kind that names no path: it is always the same file.
        Change::Config => Some(config_json),
        Change::List { .. } | Change::State { .. } | Change::Conflict { .. } => change.path(),
        Change::Theme { .. } | Change::Other { .. } => None,
    }
}

/// What this window last knew each watched file to hold — announced to it,
/// or written by it. An event carrying content the window already has is no
/// news: a sync lands one file as several events, and every reload costs a
/// refresh of the whole shell (docs/desempenho.md). A session thing, born
/// with the watcher thread and dying with the window, like the history.
#[derive(Default)]
struct Announced {
    known: HashMap<std::path::PathBuf, selfwrite::Stamp>,
}

impl Announced {
    /// Whether `stamp` is news for `path`, remembering it when it is. A file
    /// that cannot be read is always news: it went away, or it is being
    /// written this instant, and either way the window has to look.
    fn is_news(&mut self, path: &Path, stamp: Option<selfwrite::Stamp>) -> bool {
        match stamp {
            Some(stamp) => self.known.insert(path.to_path_buf(), stamp) != Some(stamp),
            None => {
                self.known.remove(path);
                true
            }
        }
    }

    /// Takes note of what the window itself wrote, announcing nothing: what
    /// comes back holding those bytes is the echo of this write.
    fn record(&mut self, path: &Path, stamp: Option<selfwrite::Stamp>) {
        let _ = self.is_news(path, stamp);
    }
}

/// How long a burst from outside must stay quiet before its lists are judged.
const SETTLE: std::time::Duration = std::time::Duration::from_secs(3);

/// Lists somebody else wrote, held until the burst they came in has settled.
/// A sync delivers a sort change as a `.space.json` AND the lists it rewrote,
/// in no promised order: judged before its config lands, a new order reads as
/// a hand edit. A space whose config came in the same burst is left alone —
/// whoever changed it already said which sort it is.
#[derive(Default)]
struct Arrivals {
    lists: Vec<std::path::PathBuf>,
    /// The day's state and the plan, whose arriving version becomes the merge
    /// base (`Notebook::note_external_change`), as every arriving list and
    /// note does — held for the same reason the lists are: a conflict copy
    /// landing beside one of them arrives in the same burst, and a base taken
    /// before it would be one of the two versions in conflict, never what the
    /// devices had in common.
    states: Vec<std::path::PathBuf>,
    /// Folders whose `.space.json` changed during the burst.
    configs: std::collections::HashSet<std::path::PathBuf>,
    last: Option<std::time::Instant>,
}

/// What a settled burst leaves to judge.
#[derive(Debug, Default, PartialEq, Eq)]
struct Settled {
    lists: Vec<std::path::PathBuf>,
    states: Vec<std::path::PathBuf>,
}

impl Arrivals {
    fn note(&mut self, changes: &[jott_core::watcher::Change], now: std::time::Instant) {
        use jott_core::watcher::Change;
        for change in changes {
            match change {
                Change::List { path } => self.lists.push(path.clone()),
                Change::State { path } => self.states.push(path.clone()),
                Change::Other { path }
                    if path.file_name().is_some_and(|name| name == jott_core::space::SPACE_CONFIG_FILE) =>
                {
                    if let Some(dir) = path.parent() {
                        self.configs.insert(dir.to_path_buf());
                    }
                }
                _ => {}
            }
        }
        // Anything still arriving pushes the judgement back.
        let nothing_held = self.lists.is_empty() && self.states.is_empty() && self.configs.is_empty();
        if !changes.is_empty() && !nothing_held {
            self.last = Some(now);
        }
    }

    /// What to judge, once the burst has been quiet for [`SETTLE`]; each burst
    /// is judged once.
    fn due(&mut self, now: std::time::Instant) -> Option<Settled> {
        if now.duration_since(self.last?) < SETTLE {
            return None;
        }
        self.last = None;
        let configs = std::mem::take(&mut self.configs);
        let mut lists: Vec<_> = std::mem::take(&mut self.lists)
            .into_iter()
            .filter(|path| !path.parent().is_some_and(|dir| configs.contains(dir)))
            .collect();
        lists.dedup();
        let mut states = std::mem::take(&mut self.states);
        states.dedup();
        (!lists.is_empty() || !states.is_empty()).then_some(Settled { lists, states })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use jott_core::watcher::Change;
    use std::path::PathBuf;
    use std::time::{Duration, Instant};

    fn list(path: &str) -> Change {
        Change::List { path: PathBuf::from(path) }
    }

    fn other(path: &str) -> Change {
        Change::Other { path: PathBuf::from(path) }
    }

    #[test]
    fn a_list_from_outside_waits_for_its_burst_to_settle() {
        let start = Instant::now();
        let at = |ms: u64| start + Duration::from_millis(ms);
        let mut arrivals = Arrivals::default();
        arrivals.note(&[list("/nb/Work/task-list.md")], at(0));
        assert_eq!(arrivals.due(at(1000)), None);
        // Something else of the same sync pushes the judgement back.
        arrivals.note(&[other("/nb/assets/photo.jpg")], at(2000));
        assert_eq!(arrivals.due(at(4000)), None);
        assert_eq!(
            arrivals.due(at(5001)),
            Some(Settled {
                lists: vec![PathBuf::from("/nb/Work/task-list.md")],
                states: Vec::new(),
            })
        );
        assert_eq!(arrivals.due(at(9000)), None, "a burst is judged once");
    }

    #[test]
    fn the_days_state_waits_for_the_burst_too() {
        // The version that arrived becomes the merge base, and a conflict copy
        // landing beside it comes in the same burst: taken before the burst
        // settles, the base would be one of the two versions in conflict.
        let start = Instant::now();
        let at = |ms: u64| start + Duration::from_millis(ms);
        let state = PathBuf::from("/nb/.jott/daily-state.json");
        let mut arrivals = Arrivals::default();
        arrivals.note(&[Change::State { path: state.clone() }], at(0));
        assert_eq!(arrivals.due(at(1000)), None);
        assert_eq!(
            arrivals.due(at(3001)),
            Some(Settled { lists: Vec::new(), states: vec![state] })
        );
        assert_eq!(arrivals.due(at(9000)), None, "a burst is judged once");
    }

    #[test]
    fn a_file_arriving_with_the_content_the_window_has_is_not_news() {
        let mut announced = Announced::default();
        let path = PathBuf::from("/nb/Work/task-list.md");
        let a = jott_core::selfwrite::Stamp::of_bytes(b"- [ ] a\n");
        let b = jott_core::selfwrite::Stamp::of_bytes(b"- [ ] b\n");

        assert!(announced.is_news(&path, Some(a)), "the first sight of a file is news");
        assert!(!announced.is_news(&path, Some(a)), "the same bytes again are not");
        assert!(announced.is_news(&path, Some(b)), "other bytes are");
        assert!(announced.is_news(&path, None), "and a file it cannot read always is");
        assert!(announced.is_news(&path, Some(b)), "which leaves nothing remembered");
    }

    #[test]
    fn what_the_window_wrote_itself_is_what_it_knows() {
        // The echo of an own save never reaches the front, so it is recorded
        // rather than announced. What must still arrive is somebody putting
        // the OLD content back: the screen holds the newer one.
        let mut announced = Announced::default();
        let path = PathBuf::from("/nb/Work/task-list.md");
        let theirs = jott_core::selfwrite::Stamp::of_bytes(b"- [ ] theirs\n");
        let ours = jott_core::selfwrite::Stamp::of_bytes(b"- [ ] ours\n");

        assert!(announced.is_news(&path, Some(theirs)));
        announced.record(&path, Some(ours));
        assert!(
            announced.is_news(&path, Some(theirs)),
            "their version coming back is a change the window has to see"
        );
    }

    #[test]
    fn only_the_files_the_screen_re_reads_are_weighed() {
        let config = PathBuf::from("/nb/.jott/config.json");
        assert_eq!(
            watched_path(&Change::Config, &config),
            Some(config.as_path()),
            "the one change that names no file is always the same file"
        );
        let list = list("/nb/Work/task-list.md");
        assert_eq!(watched_path(&list, &config), list.path());
        assert_eq!(
            watched_path(&other("/nb/assets/photo.jpg"), &config),
            None,
            "an asset is not read on every event"
        );
    }

    #[test]
    fn a_space_whose_config_came_with_its_lists_is_left_alone() {
        // Desktop switched Work to `name`: the lists and the config travel
        // together, the config LAST. Only the other space is judged.
        let start = Instant::now();
        let mut arrivals = Arrivals::default();
        arrivals.note(&[list("/nb/Work/task-list.md"), list("/nb/Casa/task-list.md")], start);
        arrivals.note(&[other("/nb/Work/.space.json")], start + Duration::from_secs(1));
        assert_eq!(
            arrivals.due(start + Duration::from_secs(5)),
            Some(Settled {
                lists: vec![PathBuf::from("/nb/Casa/task-list.md")],
                states: Vec::new(),
            })
        );

        // A config alone leaves nothing to judge.
        arrivals.note(&[other("/nb/Work/.space.json")], start);
        assert_eq!(arrivals.due(start + Duration::from_secs(9)), None);
    }
}
