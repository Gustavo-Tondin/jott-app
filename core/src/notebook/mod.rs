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
//! ├── jott.home/            ← fixed space, type `home` (views only)
//! │   └── .space.json
//! ├── jott.tasks/           ← fixed space, type `tasks`
//! │   ├── .space.json
//! │   ├── task-list.md
//! │   └── completed.md
//! ├── jott.notes/           ← fixed space, type `notes`
//! └── Design/               ← a group (.group.json), holding spaces
//!     └── Clients/          ← a space of the user's, in that group
//! ```
//!
//! The app's own folders carry the `jott.` prefix so the plain words stay the
//! user's to take (2026-08-11), and the two files of a tasks space are named
//! the same in every one of them (2026-08-13) — the FOLDER is the name.
//!
//! Since phase 7 every list is addressed by its **root-relative path**
//! (`jott.tasks/task-list.md`), never by a bare name — two folders of tasks
//! mean two lists called `Inbox`, and a name stops identifying anything. A
//! notebook in the pre-phase-7 layout is refused on open with a clear message
//! (no migrations before v1 — decision 2026-07-21).

use std::path::{Path, PathBuf};

use crate::config::Config;
use crate::history::History;
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
/// (`jott.tasks/Compras.md`); the display name is the file stem, derived by
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

/// A list address as the notebook walk yields it: the full root-relative
/// path plus the two halves it was built from, so a caller never re-splits
/// what the walk just joined.
pub(super) struct ListAddress {
    /// `jott.tasks/task-list.md` — what every command takes.
    pub(super) path: String,
    /// The space folder, root-relative (`jott.tasks`, `Design/Clients`).
    pub(super) prefix: String,
    /// The file stem (`task-list`).
    pub(super) name: String,
}

/// Splits a root-relative list address into folder part and list name:
/// `jott.tasks/Compras.md` → (`jott.tasks`, `Compras`).
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

/// The folder part of a root-relative list address (`jott.tasks/a.md` →
/// `jott.tasks`); empty when the address has no `/`. The validating split is
/// [`split_list_path`] — this one is for sorting and grouping addresses that
/// were already accepted, where an odd address must not turn into an error.
pub(super) fn list_dir_of(path: &str) -> &str {
    crate::relpath::split_parent(path).0
}

/// The label for a space prefix, out of the map [`Notebook::space_labels`]
/// builds — the prefix itself when the map has no entry, so an address never
/// shows up blank. This lookup used to be a closure copy-pasted wherever
/// labels were needed.
pub(super) fn space_label_of(
    labels: &std::collections::HashMap<String, String>,
    prefix: &str,
) -> String {
    labels
        .get(prefix)
        .cloned()
        .unwrap_or_else(|| prefix.to_string())
}

/// Whether two listed tasks are the same task.
///
/// Same list first; then id against id when both carry one. Most tasks have
/// no id — one is handed out only when something needs to address the task —
/// so two id-less tasks in the same list are the same one when their text is.
/// The rule was written out in full wherever a period or a suggestion had to
/// dedupe; a divergence here is a task shown twice or not at all.
pub(super) fn is_same_task(a: &ListedTask, b: &ListedTask) -> bool {
    a.path == b.path
        && match (a.task.id.as_deref(), b.task.id.as_deref()) {
            (Some(this), Some(that)) => this == that,
            _ => a.task.text == b.task.text,
        }
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

impl Notebook {
    /// Sets a marked folder's accent colour and icon; an empty string clears
    /// each. The body behind both public appearance setters — a space and a
    /// group differ only in where their marker lives, so only the path
    /// arrives here.
    fn set_marked_appearance(
        &self,
        path: PathBuf,
        color: Option<String>,
        icon: Option<String>,
    ) -> Result<()> {
        self.ensure_writable()?;
        edit_marked_config(path, |config| {
            config.color = color.as_deref().and_then(cleared_to_none);
            config.icon = icon.as_deref().and_then(cleared_to_none);
        })
    }
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
mod library;
pub use library::{NotebookContents, NotebookSummary};
mod lists;
mod notes;
pub use notes::NoteFolderEntry;
mod period;
mod reminders;
mod search;
mod seen;
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
            // The three fixed spaces and the files a tasks space is born
            // with; nothing is kept at the notebook root.
            notebook.ensure_fixed_spaces()?;
            notebook.write_format_guide()?;
            // Every task gets a creation date (the time axis, 3.6). Derived
            // like the two below: a list that will not take the stamp must
            // not keep the notebook from opening.
            let _ = notebook.adopt_created();
            // What the "last seen" index knew about notes that are no longer
            // there. Derived, like the three below, and skipped outright when
            // the index is empty.
            let _ = notebook.prune_seen();
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
        for (folder, kind, label) in [
            (TASKS_DIR, "tasks", "Tasks"),
            (NOTES_DIR, "notes", "Notes"),
        ] {
            let dir = self.root.join(folder);
            ensure_marker(&dir, kind, label)?;
            if kind == "tasks" {
                crate::folder::TaskFolder::new(dir.clone()).ensure_default_lists()?;
            } else {
                // The notes counterpart of the line above: the Inbox folder is
                // protected from rename and delete BECAUSE it comes back on
                // every open — a protection without the recreation would be
                // guarding something the app does not maintain.
                crate::notefolder::NoteFolder::new(dir).ensure_default_folders()?;
            }
        }
        Ok(())
    }

    fn write_format_guide(&self) -> Result<()> {
        // The guide sits in `.jott/`: every space owns its own folder, so
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

    /// Which folder a root-relative address lives in — a space, a list, a
    /// note; empty means the notebook root.
    ///
    /// A file address answers the folder AROUND it. Handing over the `.md`
    /// would be a different promise from the one the caller makes, which is
    /// "show me where this sits" — the notebook is plain files (principle 4),
    /// and that is what this exists to say out loud.
    ///
    /// The address is checked here exactly like every other address the app
    /// takes ([`crate::relpath::safe_join`]), so nothing can point outside
    /// the notebook. `is_dir` is a question about disk; an address that names
    /// nothing at all still resolves to the folder it would have been in,
    /// which is the honest answer for a notebook edited by other tools.
    pub fn folder_of(&self, path: Option<&str>) -> Result<PathBuf> {
        let root = self.root.clone();
        let Some(relative) = path.map(str::trim).filter(|p| !p.is_empty()) else {
            return Ok(root);
        };
        // The app's own folder is hidden, which `safe_join` refuses on
        // purpose (a hidden name is nobody's note) — but `.jott/_FORMAT.txt`
        // is the one address inside it the app itself hands out (Settings →
        // About opens it), so the config folder is walked into explicitly.
        // Only ONE level, and only under it: `.jott/../x` is still refused.
        let joined = match relative.strip_prefix(&format!("{NOTEBOOK_CONFIG_DIR}/")) {
            Some(inside) => crate::relpath::safe_join(&self.config_dir(), inside),
            None => crate::relpath::safe_join(&root, relative),
        }
        .ok_or_else(|| Error::InvalidNotePath(relative.to_string()))?;
        Ok(if joined.is_dir() {
            joined
        } else {
            joined.parent().map(Path::to_path_buf).unwrap_or(root)
        })
    }

    // `tasks_dir`/`tasks_folder`/`notes_dir` lived here until 2026-08-04. They
    // answered "where do the tasks live?" with `Tasks/`, which stopped being
    // true in the 2026-07-30 restructure — every tasks space holds its own
    // lists. The one answer now is `task_folders()`; a second, wrong one is
    // worse than none.

    pub fn config_dir(&self) -> PathBuf {
        self.root.join(NOTEBOOK_CONFIG_DIR)
    }

    /// The themes this notebook carries (`.jott/themes/`), for the app
    /// version asking. Reading only: a theme is a file the reader brought in,
    /// and the app never writes one.
    pub fn themes(&self, app_version: &str) -> Vec<crate::themes::UserTheme> {
        crate::themes::list(self.config_dir(), app_version)
    }

    /// Writes the app's own palette as `.jott/themes/jott.css` when the
    /// notebook has none — never over one that exists, never into a
    /// read-only notebook. `true` when it wrote (`themes::ensure_default`).
    pub fn ensure_default_theme(&self, css: &str) -> Result<bool> {
        if self.is_read_only() {
            return Ok(false);
        }
        crate::themes::ensure_default(self.config_dir(), css)
    }

    /// One theme's stylesheet, with every remote reference neutralised.
    pub fn theme_css(&self, name: &str) -> Result<crate::themes::Stylesheet> {
        crate::themes::css(self.config_dir(), name)
    }

    /// Writes a new theme into the notebook, from the stylesheet the app is
    /// wearing. The one write in this module that puts CSS on disk — and the
    /// reason the format is usable at all (`themes::create`).
    pub fn create_theme(&self, name: &str, css: &str) -> Result<crate::themes::UserTheme> {
        self.ensure_writable()?;
        crate::themes::create(self.config_dir(), name, css)
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

    /// Re-reads the preferences from disk.
    ///
    /// The notebook caches its `Config` by value and only ever loads it on
    /// open — so a `config.json` written by someone else (a sync tool, a
    /// text editor) would be announced by the watcher and then ignored:
    /// every command kept answering from the stale copy until the app
    /// restarted. The bridge calls this when the watcher sees the file
    /// change (2026-08-19).
    pub fn reload_config(&mut self) {
        self.config = Config::load(self.config_path());
    }

    /// Runs `action` against this notebook and records what it changed in
    /// `history`, under `label` — the door every action `Ctrl+Z` can take
    /// back goes through (`crate::history`). The action gets `&mut self`
    /// because a few of them (the config setters) need it; the rest ignore
    /// the mutability.
    pub fn record<T>(
        &mut self,
        history: &mut History,
        label: &str,
        action: impl FnOnce(&mut Self) -> Result<T>,
    ) -> Result<T> {
        let root = self.root.clone();
        history.record(&root, label, || action(self))
    }

    /// Takes back the last recorded action; answers its label, or `None`
    /// when there is nothing to take back. The config is re-read afterwards,
    /// since the undo may well have rewritten it — waiting for the watcher
    /// would leave the next command answering from the stale copy.
    pub fn undo(&mut self, history: &mut History) -> Result<Option<String>> {
        self.ensure_writable()?;
        let undone = history.undo(&self.root)?;
        self.reload_config();
        Ok(undone)
    }

    /// Does the last undone action again; answers its label, or `None`.
    pub fn redo(&mut self, history: &mut History) -> Result<Option<String>> {
        self.ensure_writable()?;
        let redone = history.redo(&self.root)?;
        self.reload_config();
        Ok(redone)
    }

    /// Replaces the preferences and writes them to disk.
    pub fn set_config(&mut self, config: Config) -> Result<()> {
        self.ensure_writable()?;
        config.save(self.config_path())?;
        self.config = config;
        Ok(())
    }

    /// Applies `change` to a copy of the config and writes it — the one door
    /// for every setter that touches a single field. The guard, the save and
    /// the swap are [`Notebook::set_config`]'s; this only spares each caller
    /// the clone-mutate-save dance, which seven of them spelled out.
    pub(super) fn edit_config(&mut self, change: impl FnOnce(&mut Config)) -> Result<()> {
        self.edit_config_if(|config| {
            change(config);
            true
        })
    }

    /// The conditional form: `change` says whether anything changed, and the
    /// file is only rewritten when it did.
    pub(super) fn edit_config_if(&mut self, change: impl FnOnce(&mut Config) -> bool) -> Result<()> {
        self.ensure_writable()?;
        let mut config = self.config.clone();
        if change(&mut config) {
            self.set_config(config)?;
        }
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
        self.edit_config(|config| config.set_order(namespace, names))
    }

    /// Records an opinion, or forgets one (`None` = back to the default).
    pub fn set_feature(&mut self, key: &str, on: Option<bool>) -> Result<()> {
        self.edit_config(|config| config.set_feature(key, on))
    }

    /// Binds a command to a chord, or unbinds it with `chord: None`.
    ///
    /// The core does not judge either string: which commands exist and how a
    /// chord is spelled belong to the interface, and a notebook a newer build
    /// wrote carries bindings this one cannot read. Unbinding REMOVES the key
    /// rather than writing an empty one, so a config only ever carries what
    /// differs from the app's own table.
    pub fn set_shortcut(&mut self, id: &str, chord: Option<String>) -> Result<()> {
        self.edit_config(|config| match chord {
            Some(chord) => {
                config
                    .shortcuts
                    .insert(id.to_string(), serde_json::Value::from(chord));
            }
            None => {
                config.shortcuts.remove(id);
            }
        })
    }

    /// Forgets every binding — back to the table the app ships with.
    pub fn reset_shortcuts(&mut self) -> Result<()> {
        self.edit_config(|config| config.shortcuts.clear())
    }

    /// Puts one page of Settings back to the app's defaults
    /// (`settings::reset_section`). `Ok(false)` names a page that is not the
    /// notebook's to reset; nothing is written then.
    pub fn reset_settings(&mut self, section: &str) -> Result<bool> {
        let mut known = false;
        self.edit_config_if(|config| {
            known = crate::settings::reset_section(config, section);
            known
        })?;
        Ok(known)
    }

    /// Starts watching this notebook for changes made outside the app.
    pub fn watch(&self) -> Result<crate::watcher::NotebookWatcher> {
        crate::watcher::NotebookWatcher::start(&self.root)
    }
}
