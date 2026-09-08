//! Watching the notebook for changes made outside the app (sync tools, other
//! editors, backups). The core only reports what changed; reacting — deciding
//! to reload a view — belongs to the app.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher as _};
use serde::Serialize;

use crate::error::{Error, Result};
use crate::NOTEBOOK_CONFIG_DIR;

/// Which part of the notebook changed. Serialized as
/// `{ "kind": "list", "path": "..." }`; the tags are the frontend's contract.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Change {
    /// A `.md` file in any space — a task list or a note.
    List { path: PathBuf },
    /// The day's state, or the plan.
    State { path: PathBuf },
    /// `.jott/config.json`.
    Config,
    /// Anything under `.jott/themes/`. Its own kind: nothing about the
    /// notebook changed, only the theme needs re-reading.
    Theme { path: PathBuf },
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
            // The app's own bookkeeping (`crate::BOOKKEEPING_DIRS`) is the app
            // talking to itself: announcing it would reload every screen on
            // every note opened, for files no screen reads through the event.
            if crate::BOOKKEEPING_DIRS
                .iter()
                .any(|dir| path.starts_with(config_dir.join(dir)))
            {
                return None;
            }
            // Anything under `themes/`, at any depth: the stylesheet, the
            // manifest, the folder appearing at all.
            if path.starts_with(config_dir.join(crate::themes::THEMES_DIR)) {
                return Some(Self::Theme { path });
            }
            let name = path.file_name()?.to_string_lossy().to_string();
            return Some(match name.as_str() {
                "config.json" => Self::Config,
                crate::state::DAILY_STATE_FILE | crate::plan::PLAN_FILE => Self::State { path },
                _ => Self::Other { path },
            });
        }

        // Any `.md` outside `.jott/` is content, in ANY space: a missed
        // reload lets the next save overwrite an external edit in silence.
        if path.extension().is_some_and(|ext| ext == "md") {
            return Some(Self::List { path });
        }

        Some(Self::Other { path })
    }

    /// The file this change is about, where it names one. `Config` is the one
    /// kind that does not: it is always the same file.
    pub fn path(&self) -> Option<&Path> {
        match self {
            Self::List { path }
            | Self::State { path }
            | Self::Theme { path }
            | Self::Conflict { path }
            | Self::Other { path } => Some(path),
            Self::Config => None,
        }
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
    /// Starts watching a notebook, recursively. The app's own writes echo
    /// back through here too; reloading on an echo is harmless, so the core
    /// does not guess which writes were ours.
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

        watch_tree(&mut watcher, &root, MAX_DEPTH)?;
        Ok(Self {
            _watcher: watcher,
            events: rx,
        })
    }

    /// Next change, if one is already queued.
    fn try_next(&self) -> Option<Change> {
        self.events.try_recv().ok()
    }

    /// Waits up to `timeout` for the next change.
    pub fn next_within(&self, timeout: Duration) -> Option<Change> {
        self.events.recv_timeout(timeout).ok()
    }

    /// Drains everything queued, deduplicated: one save from another tool
    /// produces several OS events, and the app wants the change once.
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

/// How deep the fallback walk goes. Bounds a symlink loop; a real notebook
/// is nowhere near this deep.
const MAX_DEPTH: u32 = 24;

/// Watches `dir` and everything under it, LEAVING OUT what cannot be read.
/// `RecursiveMode::Recursive` is all or nothing — one unreadable folder
/// (`/sdcard/Android/data`, always) fails the whole root and the notebook
/// would not open. It is tried first; on refusal this descends by hand,
/// skipping unreadable branches. Cost: a folder created later inside a
/// degraded branch is not watched. See docs/platform-gotchas.md#android
fn watch_tree(watcher: &mut RecommendedWatcher, dir: &Path, depth: u32) -> Result<()> {
    if watcher.watch(dir, RecursiveMode::Recursive).is_ok() {
        return Ok(());
    }

    // This directory on its own. If even that fails, the caller decides: at the
    // root it is a real error, deeper down it is a branch to skip.
    watcher.watch(dir, RecursiveMode::NonRecursive)?;
    if depth == 0 {
        return Ok(());
    }

    // A directory that cannot be listed is one whose children cannot be
    // watched either, and that is not a reason to fail the notebook.
    let Ok(children) = crate::fsio::dir_paths(dir) else {
        return Ok(());
    };
    for child in children {
        // `is_dir` follows symlinks, and a link pointing back up would walk
        // forever — the depth counter is what bounds it.
        if child.is_dir() {
            let _ = watch_tree(watcher, &child, depth - 1);
        }
    }
    Ok(())
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
    fn a_stylesheet_the_reader_edits_comes_back_as_a_theme() {
        let root = Path::new("/caderno");
        let config_dir = config_dir(root);

        // Both shapes, and the manifest beside the stylesheet: the answer is
        // the same for all three, because all three change how the app looks.
        for relative in ["themes/solarized.css", "themes/blue/theme.css", "themes/blue/manifest.json"] {
            assert!(
                matches!(
                    Change::classify(config_dir.join(relative), &config_dir),
                    Some(Change::Theme { .. })
                ),
                "{relative} should be a theme change"
            );
        }

        // And a theme is not a config: re-reading the notebook's settings on
        // every keystroke of somebody writing CSS would be the wrong answer.
        assert!(matches!(
            Change::classify(config_dir.join("config.json"), &config_dir),
            Some(Change::Config)
        ));
    }

    #[test]
    fn the_apps_own_indexes_wake_nobody() {
        // Opening a note stamps `index/seen.json`; announcing it would reload
        // every screen for a derived file no screen reads.
        let root = PathBuf::from("/caderno");
        let config_dir = root.join(NOTEBOOK_CONFIG_DIR);
        for name in [crate::seen::SEEN_FILE, "seen.json.bak"] {
            assert_eq!(
                Change::classify(config_dir.join(crate::seen::INDEX_DIR).join(name), &config_dir),
                None,
                "{name}"
            );
        }
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

    /// A tree holding a folder nobody may open (Android's
    /// `/sdcard/Android/data`): a single recursive `watch()` must not take
    /// the notebook down. Guarded: as root the folder is readable and the
    /// test proves nothing.
    #[test]
    #[cfg(unix)]
    fn an_unreadable_folder_does_not_stop_the_watch() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir(root.join("Tasks")).unwrap();
        let locked = root.join("Locked");
        std::fs::create_dir(&locked).unwrap();
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();

        // Asked while it is still locked: running as root, mode 000 is no
        // obstacle at all and there would be nothing to prove.
        let really_locked = std::fs::read_dir(&locked).is_err();
        let started = NotebookWatcher::start(root);

        // Put it back before asserting, or the tempdir cannot clean itself up.
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).unwrap();
        if !really_locked {
            return;
        }
        let failure = started.err().map(|e| e.to_string());
        assert_eq!(failure, None, "the notebook must open anyway");
    }

    #[test]
    fn a_list_in_a_user_space_is_a_list_not_other() {
        // `Other` here means the UI never reloads and the next save overwrites
        // the external edit in silence.
        let root = Path::new("/caderno");
        let config_dir = config_dir(root);

        assert!(matches!(
            Change::classify(root.join("Project A/Backlog/Backlog.md"), &config_dir),
            Some(Change::List { .. })
        ));
    }
}
