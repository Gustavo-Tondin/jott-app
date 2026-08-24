//! What the shell holds between `invoke()` calls.
//!
//! Exactly one thing: which notebook each WINDOW has open, plus the watcher
//! keeping an eye on it. Everything else is read from disk on demand — the
//! files are the source of truth, and caching them here would be a second one.
//!
//! ONE NOTEBOOK PER WINDOW (2026-08-24). It used to be one notebook, full
//! stop: a single `Option<Notebook>` that every command read. That is what the
//! app was — one window, one notebook — until the notebooks screen made a
//! second window possible, and a second window means two notebooks answering
//! at once. A command therefore has to say WHICH, and the only honest answer
//! is the window the `invoke()` came from: every command that touches a
//! notebook takes a `Window` and hands its label in here.
//!
//! The label is Tauri's own name for a window, unique for as long as it
//! exists. A window that closes takes its entry (and its watcher thread) with
//! it — see `AppState::close`.

use std::collections::HashMap;
use std::sync::Mutex;

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

    /// `with_notebook` for the common case: a closure that is one core call.
    ///
    /// Almost every command is a wire around a single `Notebook` method, and
    /// the core's own `Result` is what that method hands back. Lifting it into
    /// a `CommandResult` here is what keeps each command from spelling
    /// `|nb| Ok(nb.x(..)?)` — the `Ok(..?)` was the same conversion written
    /// seventy times.
    pub fn read<T>(
        &self,
        window: &str,
        f: impl FnOnce(&Notebook) -> jott_core::Result<T>,
    ) -> CommandResult<T> {
        self.with_notebook(window, |nb| Ok(f(nb)?))
    }

    /// `write` for an ACTION — one the user can take back. Every command that
    /// changes the notebook on the user's word goes through here, named by
    /// the command, and lands in the window's history (`jott_core::history`).
    /// The exceptions are deliberate, and each has its own history or none:
    /// `write_note` (the editor's), `set_task_fields`/`ensure_task_id` (the
    /// inspector's), the asset commands (binaries are not recorded) and
    /// `refresh_periods` (the clock's, not the user's).
    pub fn record<T>(
        &self,
        window: &str,
        label: &str,
        f: impl FnOnce(&mut Notebook) -> jott_core::Result<T>,
    ) -> CommandResult<T> {
        let mut guard = self.lock()?;
        let open = guard.get_mut(window).ok_or_else(CommandError::no_notebook)?;
        let OpenNotebook { notebook, history, .. } = open;
        Ok(notebook.record(history, label, f)?)
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
        let result = f(&open.notebook)?;
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

    /// Whether ANY window has the notebook at `path` open.
    ///
    /// The one question about an open notebook that is not asked BY it: the
    /// picker acts on notebooks it has not opened, and has to be sure the one
    /// in its hands is not under another window (`commands::notebook`). Any
    /// window and not just the asking one — with two windows the folder being
    /// renamed may well be the OTHER one's, which is exactly the case a
    /// single-notebook app never had.
    ///
    /// Unusable state answers "yes", which is the safe way round — it refuses
    /// an operation instead of moving a folder the app may still be holding.
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

    /// Which window, if any, is working in the notebook at `path`.
    ///
    /// The picker asks before opening one: a notebook is a folder, two windows
    /// on it are two writers on the same files, and a second window on a
    /// notebook already open is never what someone meant by clicking its card
    /// (user report, 2026-08-24). The answer is a label, which is what
    /// `set_focus` takes.
    pub fn window_holding(&self, path: &std::path::Path) -> Option<String> {
        let guard = self.lock().ok()?;
        guard
            .iter()
            .find(|(_, open)| open.notebook.root() == path)
            .map(|(label, _)| label.clone())
    }

    /// Forgets a window, because it closed.
    ///
    /// Not housekeeping: the entry owns a watcher THREAD, and a map that only
    /// ever grows would leave one running per window the user ever opened,
    /// each polling a folder nobody is looking at. Called from the window's
    /// own destroyed event (`lib.rs`).
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

                for change in changes {
                    // A synced-in `config.json` must actually take effect:
                    // the notebook caches its Config by value and only reads
                    // it on open, so without this re-read the app would
                    // announce the change and keep serving the stale copy
                    // until restarted. Re-reading our own write back is
                    // harmless — it loads what was just saved.
                    if matches!(change, jott_core::watcher::Change::Config) {
                        use tauri::Manager;
                        app.state::<AppState>().reload_config(&window);
                    }
                    // To the ONE window (2026-08-24). Broadcast, every window
                    // reloaded on every other window's save — and with two
                    // notebooks open that is two screens flickering because
                    // something was typed in the third.
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
