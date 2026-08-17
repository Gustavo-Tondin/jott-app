//! The notebook: the folder the user picked, and everything inside it.
//!
//! Layout (spec 3.5, rewritten 2026-08-11 — no widget layer):
//!
//! ```text
//! MyNotebook/
//! ├── .jott/
//! │   ├── config.json
//! │   ├── daily-state.json
//! │   └── weekly-state.json
//! ├── Tasks/                ← fixed space, type `tasks`
//! │   ├── .space.json
//! │   ├── Tasks.md
//! │   └── Completed.md
//! ├── Notes/                ← fixed space, type `notes`
//! └── Design/               ← a group, holding spaces
//!     └── Clients/
//! ```
//!
//! Since phase 7 every list is addressed by its **root-relative path**
//! (`Tasks/Compras.md`), never by a bare name — two folders of tasks mean two
//! lists called `Inbox`, and a name stops identifying anything. A notebook in
//! the pre-phase-7 layout is refused on open with a clear message (no
//! migrations before v1 — decision 2026-07-21).

use std::path::{Path, PathBuf};

use crate::config::Config;
use crate::error::{Error, IoContext, Result};
use crate::task::Task;
use crate::{NOTEBOOK_CONFIG_DIR, NOTES_DIR, TASKS_DIR};

/// What to do with a task's `origin` field when moving it between lists.
///
/// The writer stays mechanical on purpose — deciding *when* to record an
/// origin is business logic, and it lives in the caller.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OriginAction {
    /// Record the source list, so the move can be undone later.
    Record,
    /// Drop the origin — the task is going back where it came from.
    Clear,
    /// Leave whatever was there.
    Keep,
}

/// A task together with the list it lives in.
///
/// Day and Week show tasks from several lists at once, so the list's address
/// has to travel with the task — without it the UI could not tell the core
/// which file to act on. `path` is relative to the notebook root
/// (`Tasks/Compras.md`); the display name is the file stem, derived by
/// whoever shows it.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct ListedTask {
    pub path: String,
    pub task: Task,
}

/// Why a suggestion is where it is.
///
/// The order of the variants **is** the display order, so a group cannot be
/// reordered by accident somewhere else in the code.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SuggestionGroup {
    /// Overdue, due today, or tagged `#urgent`.
    Urgent,
    /// Due in the next few days.
    Soon,
    /// Already chosen for this week (only offered to the day).
    ThisWeek,
    /// Was in Today or This Week and left — taken out by hand, or dropped when
    /// the period turned (2026-08-17). Below `ThisWeek` on purpose: what the
    /// user chose for the week is a live decision, this one is a way back to
    /// an old one.
    Recent,
    /// Everything else, in the order the lists have it.
    Lists,
}

/// How many days ahead still counts as "soon".
const SOON_WINDOW_DAYS: i64 = 3;

/// A task offered for a period, and the reason it is being offered.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub path: String,
    /// The space holding it, as the user reads it (see [`ListEntry`]).
    pub space: String,
    pub task: Task,
    pub group: SuggestionGroup,
}

/// A list as the navigation shows it: address plus display name.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListEntry {
    /// Root-relative address (`jott.tasks/Compras.md`) — what every command
    /// takes.
    pub path: String,
    /// The file stem (`Compras`) — what the user reads.
    pub name: String,
    /// Where it lives, as the user reads it: the space's **readable
    /// address** — `Design/Tasks` inside a group, `Mercado` when loose, and
    /// `Tasks` for the fixed one whose folder is `jott.tasks` (2026-08-13).
    ///
    /// Never derived in the frontend. The three fixed spaces live in
    /// `jott.*` folders so the plain names stay free for the user, and the
    /// interface has always called them Home, Tasks and Notes — deriving this
    /// from the path on the other side would put the folder on screen
    /// (2026-08-11).
    pub space: String,
}

/// Splits a root-relative list address into folder part and list name:
/// `Tasks/Compras.md` → (`Tasks`, `Compras`).
///
/// Rejects everything that could escape the notebook — the address arrives
/// from user input and config files. Note the inversion from the old
/// name-based rule: `/` stopped being forbidden and became the separator;
/// what is forbidden now is any component that climbs (`..`), hides (leading
/// `.`) or breaks the comment format (`"`).
fn split_list_path(path: &str) -> Result<(&str, &str)> {
    let invalid = || Error::InvalidListName(path.to_string());

    let stem = path.strip_suffix(".md").ok_or_else(invalid)?;
    // A list always lives inside a space folder, never at the root.
    let (dir, name) = stem.rsplit_once('/').ok_or_else(invalid)?;

    // Each component has to stand on its own — the canonical predicate, so the
    // address a config file hands us is judged by the same rule as a name the
    // user types.
    let bad = |part: &str| !crate::relpath::is_safe_component(part);
    if path.starts_with('/')
        || path.contains(['\\', '\0', '"'])
        || path.contains("..")
        || dir.split('/').any(bad)
        || bad(name)
    {
        return Err(invalid());
    }
    Ok((dir, name))
}

/// The value of a field the user may have cleared: blank is absent, and the
/// whitespace around what they typed is never part of it.
fn cleared_to_none(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

/// Reads a marked node's config, edits it, and writes it back.
///
/// A space and a group carry the **same** [`SpaceConfig`] — name,
/// colour, icon — under different file names, so renaming one and renaming the
/// other were the same three lines twice, as were the two appearance setters.
/// Only the path differs, so only the path is a parameter.
fn edit_marked_config(
    path: PathBuf,
    edit: impl FnOnce(&mut crate::space::SpaceConfig),
) -> Result<()> {
    let mut config = crate::space::SpaceConfig::load(&path);
    edit(&mut config);
    config.save(path)
}

/// An open notebook.
#[derive(Debug, Clone)]
pub struct Notebook {
    root: PathBuf,
    config: Config,
}

// One area of the notebook per module. They all write into the SAME
// `impl Notebook`, so nothing about the type changes from the outside — the
// split is about where a reader looks, not a new boundary. What lives in this
// file is what every area needs: opening a notebook, its config, and the
// guards.
//
// A method one area needs from another is `pub(super)`: visible across the
// notebook, and no wider. Private still means private to its own area, so the
// helpers of an area cannot quietly become an interface.
mod groups;
mod lists;
mod notes;
mod period;
mod search;
mod spaces;
mod suggestions;
mod tags;
mod tasks;
mod trash;

impl Notebook {
    /// True when the folder looks like a notebook, i.e. it has a `.jott/`.
    pub fn is_notebook(path: impl AsRef<Path>) -> bool {
        path.as_ref().join(NOTEBOOK_CONFIG_DIR).is_dir()
    }

    /// Opens an existing notebook, recreating the default lists if the user
    /// deleted them outside the app.
    ///
    /// A notebook in the pre-phase-7 layout is **refused with a clear
    /// message**, never converted in silence — decided on 2026-07-21: there
    /// is exactly one (test) notebook in the world, and carrying migration
    /// code for a format that still changes weekly is weight without a user.
    /// From v1 on this inverts, permanently: breaking an existing notebook
    /// stops being an option and every format change ships with a migration.
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let root = path.as_ref().to_path_buf();
        if !Self::is_notebook(&root) {
            return Err(Error::NotANotebook(root));
        }
        if root.join(crate::legacy::TASKS_DIR).is_dir()
            || root.join(crate::legacy::NOTES_DIR).is_dir()
        {
            return Err(Error::LegacyNotebook(root));
        }

        let config = Config::load(root.join(NOTEBOOK_CONFIG_DIR).join("config.json"));
        let notebook = Self { root, config };

        // A notebook written by a newer app is opened for reading only, so
        // nothing here may touch the disk.
        if !notebook.is_read_only() {
            // `ensure_fixed_spaces` now creates the fixed widgets and their
            // default lists inside `Inbox/`; no separate root-level defaults.
            notebook.ensure_fixed_spaces()?;
            notebook.write_format_guide()?;
            // Clear expired trash and rebuild the aggregated Completed index —
            // both derived, so a failure here must not stop the notebook opening.
            let _ = notebook.reap_trash();
            let _ = notebook.reap_completed();
            let _ = notebook.refresh_completed_index();
        }
        Ok(notebook)
    }

    /// Creates a notebook in an empty or existing folder.
    pub fn init(path: impl AsRef<Path>) -> Result<Self> {
        let root = path.as_ref().to_path_buf();
        if Self::is_notebook(&root) {
            return Err(Error::AlreadyANotebook(root));
        }

        let dir = root.join(NOTEBOOK_CONFIG_DIR);
        std::fs::create_dir_all(&dir).ctx(&dir)?;

        let notebook = Self {
            root,
            config: Config::default(),
        };
        notebook.config.save(notebook.config_path())?;
        notebook.ensure_fixed_spaces()?;
        notebook.write_format_guide()?;
        Ok(notebook)
    }

    /// Recreates the three fixed spaces — Home, Tasks, Notes — when their
    /// folder or marker is missing. Called on init and on every open, same
    /// treatment the default lists get: the user may delete things outside
    /// the app, and the app must not break.
    ///
    /// Only the **markers** are recreated; the contents of the folders are
    /// never touched. A `.space.json` the user edited is left exactly as
    /// it is — recreating is not rewriting.
    fn ensure_fixed_spaces(&self) -> Result<()> {
        use crate::space::SPACE_CONFIG_FILE;

        // Recreate a marker only when missing — never rewrite an existing one
        // (recreating is not rewriting: it must not clobber a user's edits).
        //
        // The one thing it does complete: a fixed marker with no `type`. The
        // three fixed spaces are the app's own, and their function is not
        // a user choice — Tasks is a tasks space, always. Without this a
        // marker written before `type` existed opens as "unsupported", which
        // is a lie about a folder the app itself created. A USER space is
        // never touched: there, the type is a decision, and guessing it would
        // be inventing one.
        let ensure_marker = |dir: &std::path::Path, kind: &str, label: &str| -> Result<()> {
            std::fs::create_dir_all(dir).ctx(dir)?;
            let marker = dir.join(SPACE_CONFIG_FILE);
            if !marker.exists() {
                let body = format!(
                    "{{\n  \"schemaVersion\": 1,\n  \"type\": \"{kind}\",\n  \
                     \"name\": \"{label}\",\n  \"fixed\": true\n}}\n"
                );
                return crate::fsio::write_atomically(&marker, body.as_bytes());
            }
            let mut config = crate::space::SpaceConfig::load(&marker);
            if config.is_read_only() {
                return Ok(());
            }
            // The display name is what the interface has always shown for
            // these three, and it is NOT the folder — the folder carries the
            // app's `jott.` prefix. Filled only when absent: a fixed
            // space the user renamed keeps the name they gave it.
            let fill_name = config.name.is_none();
            if config.kind.is_empty() || fill_name {
                if config.kind.is_empty() {
                    config.kind = kind.to_string();
                }
                if fill_name {
                    config.name = Some(label.to_string());
                }
                // Every other key the file carries survives the rewrite.
                config.save(&marker)?;
            }
            Ok(())
        };

        // Home: pure views, no files of its own.
        ensure_marker(&self.root.join(crate::HOME_DIR), "home", "Home")?;

        // Tasks and Notes: a typed space that owns its files directly —
        // the tasks one is a single list plus its Completed (spec 3.5, no
        // widget layer).
        for (ws_name, wtype, label) in [
            (TASKS_DIR, "tasks", "Tasks"),
            (NOTES_DIR, "notes", "Notes"),
        ] {
            let ws_dir = self.root.join(ws_name);
            ensure_marker(&ws_dir, wtype, label)?;
            if wtype == "tasks" {
                self.task_folder(ws_dir.clone()).ensure_default_lists()?;
            }
        }
        Ok(())
    }

    fn write_format_guide(&self) -> Result<()> {
        // The guide sits in `.jott/` now: with widgets in their own folders,
        // there is no single `Tasks/` folder to drop it in.
        crate::folder::TaskFolder::new(self.config_dir()).write_format_guide()
    }

    /// Opens the notebook, creating it if the folder is not one yet.
    pub fn open_or_init(path: impl AsRef<Path>) -> Result<Self> {
        if Self::is_notebook(&path) {
            Self::open(path)
        } else {
            Self::init(path)
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    // `tasks_dir`/`tasks_folder`/`notes_dir` lived here until 2026-08-04. They
    // answered "where do the tasks live?" with `Tasks/`, which stopped being
    // true in the 2026-07-30 restructure — lists moved into each widget's own
    // folder (`Tasks/Inbox/`). The one answer now is `task_folders()`; a second,
    // wrong one is worse than none.

    pub fn config_dir(&self) -> PathBuf {
        self.root.join(NOTEBOOK_CONFIG_DIR)
    }

    pub fn config_path(&self) -> PathBuf {
        self.config_dir().join("config.json")
    }

    pub fn config(&self) -> &Config {
        &self.config
    }

    /// True when the notebook was written by a newer version of the app.
    pub fn is_read_only(&self) -> bool {
        self.config.is_read_only()
    }

    /// Replaces the preferences and writes them to disk.
    pub fn set_config(&mut self, config: Config) -> Result<()> {
        self.ensure_writable()?;
        config.save(self.config_path())?;
        self.config = config;
        Ok(())
    }

    /// Guard for every operation that writes. Reading a future notebook is
    /// fine; rewriting one is how data written by a newer app gets destroyed.
    fn ensure_writable(&self) -> Result<()> {
        crate::error::guard_schema(
            self.config.schema_version(),
            crate::config::SUPPORTED_SCHEMA_VERSION,
        )
    }

    /// Records the manual order for a namespace and writes the config. The
    /// single door the sidebar's drag goes through, for spaces and lists
    /// alike (`"spaces"`, `"lists:<folder>"`).
    pub fn set_order(&mut self, namespace: &str, names: Vec<String>) -> Result<()> {
        let mut config = self.config.clone();
        config.set_order(namespace, names);
        self.set_config(config)
    }

    /// What the user said about a feature, if anything (2026-08-06). The core
    /// reads this and nothing else: no folder stops being created and no file
    /// stops being read, so switching a feature back on has to find everything
    /// exactly where it was left.
    pub fn feature(&self, key: &str) -> Option<bool> {
        self.config.feature(key)
    }

    /// Records an opinion, or forgets one (`None` = back to the default).
    pub fn set_feature(&mut self, key: &str, on: Option<bool>) -> Result<()> {
        self.ensure_writable()?;
        let mut config = self.config.clone();
        config.set_feature(key, on);
        self.set_config(config)
    }

    /// Starts watching this notebook for changes made outside the app.
    pub fn watch(&self) -> Result<crate::watcher::NotebookWatcher> {
        crate::watcher::NotebookWatcher::start(&self.root)
    }
}
