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

/// Whether `path` still carries the stamp `window` left on it — the window's
/// own save coming back as an event, which the front already acted on. The
/// window's own watcher drops those: reloading on the echo cost a refresh of
/// every screen and a refetch of every picture on every keystroke pause.
pub fn is_own_write(path: &Path, window: &str) -> bool {
    selfwrite::own(path, window).is_some_and(|stamp| selfwrite::unchanged(path, &stamp))
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

    /// Same, but for the operations that change the notebook itself (its
    /// config), which need `&mut`.
    pub fn with_notebook_mut<T>(
        &self,
        window: &str,
        f: impl FnOnce(&mut Notebook) -> CommandResult<T>,
    ) -> CommandResult<T> {
        let mut guard = self.lock()?;
        let open = guard.get_mut(window).ok_or_else(CommandError::no_notebook)?;
        f(&mut open.notebook)
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
    /// `None` when there was nothing to take back.
    pub fn undo(&self, window: &str) -> CommandResult<Option<String>> {
        let mut guard = self.lock()?;
        let open = guard.get_mut(window).ok_or_else(CommandError::no_notebook)?;
        let OpenNotebook { notebook, history, .. } = open;
        Ok(notebook.undo(history)?)
    }

    /// Does the window's last undone action again; answers its label, or
    /// `None`.
    pub fn redo(&self, window: &str) -> CommandResult<Option<String>> {
        let mut guard = self.lock()?;
        let open = guard.get_mut(window).ok_or_else(CommandError::no_notebook)?;
        let OpenNotebook { notebook, history, .. } = open;
        Ok(notebook.redo(history)?)
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
        let watcher: NotebookWatcher = notebook.watch()?;
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = stop.clone();

        std::thread::spawn(move || {
            use std::sync::atomic::Ordering;
            use std::time::Duration;

            // Polling with a timeout instead of blocking forever is what lets
            // the thread notice it should stop.
            while !flag.load(Ordering::Relaxed) {
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
                // else touched after us is still reported (`selfwrite`).
                let changes: Vec<_> = changes
                    .into_iter()
                    .filter(|change| !change.path().is_some_and(|path| is_own_write(path, &window)))
                    .collect();

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
