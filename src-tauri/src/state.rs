//! What the shell holds between `invoke()` calls.
//!
//! Exactly one thing: which notebook is open, plus the watcher keeping an eye
//! on it. Everything else is read from disk on demand — the files are the
//! source of truth, and caching them here would be a second one.

use std::sync::Mutex;

use jott_core::{Notebook, NotebookWatcher};
use tauri::{AppHandle, Emitter, Runtime};

use crate::error::{CommandError, CommandResult};

/// Event emitted when the notebook changes outside the app.
pub const NOTEBOOK_CHANGED_EVENT: &str = "notebook://changed";

#[derive(Default)]
pub struct AppState {
    inner: Mutex<Option<OpenNotebook>>,
}

struct OpenNotebook {
    notebook: Notebook,
    /// Dropping this stops the watcher thread, which is exactly what should
    /// happen when another notebook is opened.
    _watcher: WatcherHandle,
}

impl AppState {
    /// Runs `f` against the open notebook, or fails if there is none.
    pub fn with_notebook<T>(
        &self,
        f: impl FnOnce(&Notebook) -> CommandResult<T>,
    ) -> CommandResult<T> {
        let guard = self.lock()?;
        let open = guard.as_ref().ok_or_else(CommandError::no_notebook)?;
        f(&open.notebook)
    }

    /// Same, but for the operations that change the notebook itself (its
    /// config), which need `&mut`.
    pub fn with_notebook_mut<T>(
        &self,
        f: impl FnOnce(&mut Notebook) -> CommandResult<T>,
    ) -> CommandResult<T> {
        let mut guard = self.lock()?;
        let open = guard.as_mut().ok_or_else(CommandError::no_notebook)?;
        f(&mut open.notebook)
    }

    /// `with_notebook` for the common case: a closure that is one core call.
    ///
    /// Almost every command is a wire around a single `Notebook` method, and
    /// the core's own `Result` is what that method hands back. Lifting it into
    /// a `CommandResult` here is what keeps each command from spelling
    /// `|nb| Ok(nb.x(..)?)` — the `Ok(..?)` was the same conversion written
    /// seventy times.
    pub fn read<T>(&self, f: impl FnOnce(&Notebook) -> jott_core::Result<T>) -> CommandResult<T> {
        self.with_notebook(|nb| Ok(f(nb)?))
    }

    /// Same, for the operations that need `&mut`.
    pub fn write<T>(
        &self,
        f: impl FnOnce(&mut Notebook) -> jott_core::Result<T>,
    ) -> CommandResult<T> {
        self.with_notebook_mut(|nb| Ok(f(nb)?))
    }

    /// Replaces the open notebook and starts watching it.
    pub fn open<R: Runtime>(&self, app: &AppHandle<R>, notebook: Notebook) -> CommandResult<()> {
        let watcher = WatcherHandle::start(app.clone(), &notebook)?;
        let mut guard = self.lock()?;
        *guard = Some(OpenNotebook {
            notebook,
            _watcher: watcher,
        });
        Ok(())
    }

    /// Re-reads the open notebook's config from disk. A no-op with no
    /// notebook open, or with the state unusable — the watcher that calls
    /// this has nothing better to do than carry on.
    pub fn reload_config(&self) {
        if let Ok(mut guard) = self.lock() {
            if let Some(open) = guard.as_mut() {
                open.notebook.reload_config();
            }
        }
    }

    fn lock(&self) -> CommandResult<std::sync::MutexGuard<'_, Option<OpenNotebook>>> {
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
    fn start<R: Runtime>(app: AppHandle<R>, notebook: &Notebook) -> CommandResult<Self> {
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
                        app.state::<AppState>().reload_config();
                    }
                    if let Err(e) = app.emit(NOTEBOOK_CHANGED_EVENT, &change) {
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
