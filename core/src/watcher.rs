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
    /// The day's state, or the plan.
    State { path: PathBuf },
    /// `.jott/config.json`.
    Config,
    /// A stylesheet under `.jott/themes/`. Its own kind because the answer is
    /// its own: nothing about the notebook changed, and re-reading the theme
    /// is what makes writing one bearable — save the file, see the colour.
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
            // The app's own bookkeeping is the app talking to itself
            // (`crate::BOOKKEEPING_DIRS`). Opening a note writes
            // `index/seen.json` and creating one appends to `timeline/`, and
            // announcing either would have every screen reload every time a
            // note is opened — for files no screen reads through the event.
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

/// How deep the fallback walk goes before giving up. A notebook is folders of
/// markdown, not a filesystem; anything past this is somebody having pointed
/// the app at their whole phone, and the depth is there so a symlink loop
/// cannot spin forever.
const MAX_DEPTH: u32 = 24;

/// Watches `dir` and everything under it, LEAVING OUT what cannot be read.
///
/// WHY NOT JUST `RecursiveMode::Recursive` — that is one call, and it is all
/// or nothing: `notify` walks the tree itself and returns `Err` for the whole
/// root the moment one directory refuses to open. On Android that is not an
/// edge case but the normal shape of shared storage: `/sdcard/Android/data` is
/// carved out of MANAGE_EXTERNAL_STORAGE and stays unreadable to an app
/// holding it, so picking `/sdcard` (or any folder above it) failed the watch,
/// and `state.rs` propagates that — the notebook would not open at all (user
/// report on device, 2026-08-20: "Permission denied (os error 13) about
/// ["/sdcard/Android/data"]").
///
/// So the recursive call is still the FIRST thing tried, because it is one
/// inotify registration for the common case where every folder is readable.
/// Only when it refuses does this descend by hand: watch this directory alone,
/// then try each child the same way. An unreadable branch is skipped and its
/// siblings are kept, which is the whole point.
///
/// What the fallback costs: a directory created LATER inside a degraded branch
/// is not watched, because nothing re-walks. The parent is watched, so its
/// creation is still reported and the app still reloads — only later changes
/// *inside* it are missed until the notebook is reopened. That is the price of
/// the notebook opening at all.
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
        // Opening a note stamps `index/seen.json` (`crate::seen`). Announcing
        // that would reload every screen every time a note is opened, for a
        // file no screen reads through the event — and the index is derived,
        // so nothing about the notebook changed.
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

    /// The one that had to be measured against a real directory: a notebook
    /// whose tree holds a folder nobody may open. That is Android's shared
    /// storage every time (`/sdcard/Android/data`), and a single recursive
    /// `watch()` refuses the whole root over it, which took the notebook down
    /// with it.
    ///
    /// Root-only guard: root reads everything, so the unreadable folder would
    /// be readable and the test would prove nothing.
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
