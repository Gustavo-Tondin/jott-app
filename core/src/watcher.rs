//! Watching the notebook for changes made outside the app.
//!
//! The notebook is a plain folder, so the app is never the only writer:
//! Syncthing pulls a new `Inbox.md` in the background, the user edits a list
//! in Obsidian, a file manager restores a backup. Without this, the app would
//! happily show and then overwrite stale content.
//!
//! What is *not* here on purpose: reacting to the events. The core reports
//! what changed; deciding to reload a view belongs to the app.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher as _};
use serde::Serialize;

use crate::error::{Error, Result};
use crate::NOTEBOOK_CONFIG_DIR;

/// Which part of the notebook changed.
///
/// Serialized as `{ "kind": "list", "path": "..." }`, since the app listens
/// for these over the Tauri event bridge. The tags are part of the contract
/// with the frontend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Change {
    /// A `.md` file in any space — a task list, or (until phase 8 gives
    /// them their own kind) a note.
    List { path: PathBuf },
    /// A day/week state file.
    State { path: PathBuf },
    /// `.jott/config.json`.
    Config,
    /// A sync tool left a conflicting copy behind. Checked before the other
    /// kinds: the app has to surface this, not treat it as a new list.
    Conflict { path: PathBuf },
    /// Anything else inside the notebook (notes, unknown files).
    Other { path: PathBuf },
}

impl Change {
    fn classify(path: PathBuf, config_dir: &Path) -> Option<Self> {
        // Our own atomic writes land as `*.tmp` before the rename. Reporting
        // those would wake the app up twice for every single save.
        if path.extension().is_some_and(|ext| ext == "tmp") {
            return None;
        }

        // Before anything else: a conflicting copy is never a list, a state or
        // a config, even though its name looks like one of them.
        if crate::conflict::is_conflict_file(&path) {
            return Some(Self::Conflict { path });
        }

        if path.starts_with(config_dir) {
            let name = path.file_name()?.to_string_lossy().to_string();
            return Some(match name.as_str() {
                "config.json" => Self::Config,
                "daily-state.json" | "weekly-state.json" => Self::State { path },
                _ => Self::Other { path },
            });
        }

        // Any `.md` outside `.jott/` is content — a list in *any* space,
        // or (phase 8) a note. The old rule only knew `Tasks/`, so a list in
        // a user space came back as `Other`, the UI never reloaded, and
        // the app's next save would overwrite the external edit in silence.
        // A note classified as `List` merely causes a harmless reload; phase
        // 8 refines the kinds.
        if path.extension().is_some_and(|ext| ext == "md") {
            return Some(Self::List { path });
        }

        Some(Self::Other { path })
    }

    /// The list name, for a change to a task list.
    pub fn list_name(&self) -> Option<String> {
        match self {
            Self::List { path } => path
                .file_stem()
                .map(|stem| stem.to_string_lossy().to_string()),
            _ => None,
        }
    }
}

/// Watches a notebook folder. Stops when dropped.
pub struct NotebookWatcher {
    // Held only to keep the watch alive: dropping it unregisters everything.
    _watcher: RecommendedWatcher,
    events: Receiver<Change>,
}

impl NotebookWatcher {
    /// Starts watching a notebook, recursively.
    ///
    /// Note the app will also see its *own* writes come back through here.
    /// Reloading from disk on an echo is harmless — the file is the source of
    /// truth either way — so the core does not try to guess which writes were
    /// ours.
    pub fn start(root: impl AsRef<Path>) -> Result<Self> {
        let root = root.as_ref().to_path_buf();
        let config_dir = root.join(NOTEBOOK_CONFIG_DIR);

        let (tx, rx) = channel();
        let mut watcher = notify::recommended_watcher(move |event: notify::Result<Event>| {
            let Ok(event) = event else { return };
            if !is_content_change(&event) {
                return;
            }
            for path in event.paths {
                if let Some(change) = Change::classify(path, &config_dir) {
                    // A closed receiver just means the app dropped the
                    // watcher; nothing to recover from.
                    let _ = tx.send(change);
                }
            }
        })?;

        watcher.watch(&root, RecursiveMode::Recursive)?;
        Ok(Self {
            _watcher: watcher,
            events: rx,
        })
    }

    /// Next change, if one is already queued.
    pub fn try_next(&self) -> Option<Change> {
        self.events.try_recv().ok()
    }

    /// Waits up to `timeout` for the next change.
    pub fn next_within(&self, timeout: Duration) -> Option<Change> {
        self.events.recv_timeout(timeout).ok()
    }

    /// Drains everything queued, deduplicated.
    ///
    /// One save from another tool typically produces several OS events; the
    /// app wants "the Inbox changed" once, not five times.
    pub fn drain(&self) -> Vec<Change> {
        let mut changes: Vec<Change> = Vec::new();
        while let Some(change) = self.try_next() {
            if !changes.contains(&change) {
                changes.push(change);
            }
        }
        changes
    }
}

/// Ignores access/metadata noise: only creation, modification and removal
/// mean the content on disk is different from what the app is showing.
fn is_content_change(event: &Event) -> bool {
    use notify::EventKind;
    matches!(
        event.kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) | EventKind::Any
    )
}

impl From<notify::Error> for Error {
    fn from(source: notify::Error) -> Self {
        Error::Watch(source.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config_dir(root: &Path) -> PathBuf {
        root.join(NOTEBOOK_CONFIG_DIR)
    }

    #[test]
    fn classifies_the_notebook_layout() {
        let root = Path::new("/caderno");
        let config_dir = config_dir(root);

        let list = Change::classify(root.join("Tasks/Compras.md"), &config_dir);
        assert_eq!(list.as_ref().unwrap().list_name().as_deref(), Some("Compras"));
        assert!(matches!(list, Some(Change::List { .. })));

        assert!(matches!(
            Change::classify(config_dir.join("config.json"), &config_dir),
            Some(Change::Config)
        ));
        assert!(matches!(
            Change::classify(config_dir.join("daily-state.json"), &config_dir),
            Some(Change::State { .. })
        ));
        // Any `.md` outside `.jott/` is content now — including notes; a
        // spurious reload is harmless, a missed one loses data.
        assert!(matches!(
            Change::classify(root.join("Notes/Ideias.md"), &config_dir),
            Some(Change::List { .. })
        ));
        assert!(matches!(
            Change::classify(root.join("anexo.pdf"), &config_dir),
            Some(Change::Other { .. })
        ));
    }

    #[test]
    fn change_serializes_with_the_tags_the_frontend_listens_for() {
        let change = Change::List {
            path: PathBuf::from("/caderno/Tarefas/Inbox.md"),
        };
        let json: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&change).unwrap()).unwrap();

        assert_eq!(json["kind"], "list");
        assert_eq!(json["path"], "/caderno/Tarefas/Inbox.md");
        assert_eq!(
            serde_json::to_value(Change::Config).unwrap()["kind"],
            "config"
        );
    }

    #[test]
    fn ignores_our_own_atomic_write_temporaries() {
        let root = Path::new("/caderno");
        let config_dir = config_dir(root);

        assert_eq!(
            Change::classify(root.join("Tasks/Inbox.md.tmp"), &config_dir),
            None
        );
        assert_eq!(
            Change::classify(config_dir.join("daily-state.json.tmp"), &config_dir),
            None
        );
    }

    #[test]
    fn a_list_in_a_user_space_is_a_list_not_other() {
        // The old rule only knew Tasks/: an external edit to a user
        // space's list came back as Other, the UI never reloaded, and
        // the app's next save overwrote the edit in silence.
        let root = Path::new("/caderno");
        let config_dir = config_dir(root);

        assert!(matches!(
            Change::classify(root.join("Project A/Backlog/Backlog.md"), &config_dir),
            Some(Change::List { .. })
        ));
    }
}
