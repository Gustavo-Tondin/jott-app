//! The notebook: the folder the user picked, and everything inside it.
//! `.jott/` holds config and the day/plan state; `jott.home`, `jott.tasks`
//! and `jott.notes` are the fixed spaces; the user's spaces sit at the root
//! or inside groups (`.group.json`). Every list is addressed by its
//! **root-relative path** (`jott.tasks/task-list.md`), never by a bare name.

use std::path::{Path, PathBuf};

use crate::config::Config;
use crate::history::History;
use crate::error::{Error, IoContext, Result};
use crate::task::Task;
use crate::{NOTEBOOK_CONFIG_DIR, NOTES_DIR, TASKS_DIR};

/// What to do with a task's `origin` field when moving it between lists.
/// The writer stays mechanical: deciding *when* to record is the caller's.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OriginAction {
    /// Record the source list, so the move can be undone later.
    Record,
    /// Drop the origin — the task is going back where it came from.
    Clear,
    /// Leave whatever was there.
    Keep,
}

/// A task together with the list it lives in. `path` is relative to the
/// notebook root (`jott.tasks/Compras.md`); the display name is the file
/// stem, derived by whoever shows it.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct ListedTask {
    pub path: String,
    pub task: Task,
}

/// A note together with the notes SPACE it lives in — `folder` is the
/// space's root-relative address (`jott.notes`), `note.path` is relative to
/// it. The pair every command that answers across spaces returns, the way
/// [`ListedTask`] does for a task.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct ListedNote {
    pub folder: String,
    pub note: crate::notefolder::NoteEntry,
}

/// Why a suggestion is where it is. The order of the variants **is** the
/// display order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SuggestionGroup {
    /// Overdue, due today, or tagged `#urgent`.
    Urgent,
    /// Due in the next few days.
    Soon,
    /// Was in Today and left — taken out by hand, or dropped when the day
    /// turned. A way back to an old decision.
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
    /// address** — `Design/Tasks` inside a group, `Mercado` when loose,
    /// `Tasks` for the fixed `jott.tasks`. Never derived in the frontend:
    /// that would put the `jott.*` folder on screen.
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
/// `jott.tasks/Compras.md` → (`jott.tasks`, `Compras`). Rejects everything
/// that could escape the notebook: `/` is the separator; a component that
/// climbs (`..`), hides (leading `.`) or breaks the comment format (`"`) is refused.
fn split_list_path(path: &str) -> Result<(&str, &str)> {
    let invalid = || Error::InvalidListName(path.to_string());

    let stem = path.strip_suffix(".md").ok_or_else(invalid)?;
    // A list always lives inside a space folder, never at the root.
    let (dir, name) = stem.rsplit_once('/').ok_or_else(invalid)?;

    // Each component is judged by the canonical predicate, the same rule a
    // name the user types gets.
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
/// shows up blank.
pub(super) fn space_label_of(
    labels: &std::collections::HashMap<String, String>,
    prefix: &str,
) -> String {
    labels
        .get(prefix)
        .cloned()
        .unwrap_or_else(|| prefix.to_string())
}

/// Whether two listed tasks are the same task: same list first; then id
/// against id when both carry one, else text against text. The one rule
/// every period and suggestion dedupes by — a divergence is a task shown
/// twice or not at all.
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

/// Reads a marked node's config, edits it, and writes it back. A space and a
/// group carry the **same** [`SpaceConfig`] under different file names, so
/// only the path is a parameter.
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
    /// each. The body behind both public appearance setters.
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

// One area of the notebook per module, all writing into the SAME
// `impl Notebook`: the split is about where a reader looks, not a boundary.
// This file holds what every area needs (opening, config, guards). A method
// one area needs from another is `pub(super)`; private stays private to its area.
mod age;
mod groups;
mod library;
pub use library::{NotebookContents, NotebookSummary};
mod lists;
mod notes;
pub use notes::NoteFolderEntry;
mod day;
pub use day::Day;
mod reminders;
mod search;
mod seen;
mod spaces;
mod suggestions;
mod tags;
mod tasks;
mod timeline;
mod trash;

impl Notebook {
    /// True when the folder looks like a notebook, i.e. it has a `.jott/`.
    pub fn is_notebook(path: impl AsRef<Path>) -> bool {
        path.as_ref().join(NOTEBOOK_CONFIG_DIR).is_dir()
    }

    /// Opens an existing notebook, recreating the default lists if the user
    /// deleted them outside the app. A notebook in the pre-phase-7 layout is
    /// **refused with a clear message**, never converted: no migrations before v1.
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
            // The weekly state file is read by nothing and goes on open.
            let _ = std::fs::remove_file(
                notebook
                    .config_dir()
                    .join(crate::state::LEGACY_WEEKLY_STATE_FILE),
            );
            // A list reordered while the app was closed keeps its order: the
            // sort it broke gives way BEFORE anything below saves — and so
            // re-sorts — a list.
            let _ = notebook.yield_to_file_order(None);
            // Every task gets a creation date and an id. Derived, like the
            // ones below: a failure must not keep the notebook from opening.
            let _ = notebook.adopt_task_identity();
            // The durable log is reconciled AFTER the ids: a task with no id
            // is one the log cannot follow.
            let _ = notebook.sweep_timeline();
            // Forget the "last seen" stamps of notes no longer there.
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
    /// folder or marker is missing, on init and on every open. Only the
    /// **markers** are recreated; the contents are never touched, and a
    /// `.space.json` the user edited is left as it is.
    fn ensure_fixed_spaces(&self) -> Result<()> {
        use crate::space::SPACE_CONFIG_FILE;

        // Never rewrite an existing marker. The one thing completed is a
        // fixed marker with no `type`: a fixed space's function is not a user
        // choice, and without it the marker opens as "unsupported". A USER
        // space is never touched — there, the type is a decision.
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
            // The display name is NOT the folder (which carries the `jott.`
            // prefix). Filled only when absent: a renamed fixed space keeps its name.
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

        // Tasks and Notes: a typed space that owns its files directly.
        for (folder, kind, label) in [
            (TASKS_DIR, "tasks", "Tasks"),
            (NOTES_DIR, "notes", "Notes"),
        ] {
            let dir = self.root.join(folder);
            ensure_marker(&dir, kind, label)?;
            if kind == "tasks" {
                crate::folder::TaskFolder::new(dir.clone()).ensure_default_lists()?;
            } else {
                // The Inbox folder is protected from rename and delete
                // BECAUSE it comes back on every open.
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
    /// note; empty means the notebook root. A file address answers the folder
    /// AROUND it. Checked like every other address ([`crate::relpath::safe_join`]);
    /// an address that names nothing resolves to the folder it would be in.
    pub fn folder_of(&self, path: Option<&str>) -> Result<PathBuf> {
        let root = self.root.clone();
        let Some(relative) = path.map(str::trim).filter(|p| !p.is_empty()) else {
            return Ok(root);
        };
        // `safe_join` refuses the hidden `.jott/` on purpose, but
        // `.jott/_FORMAT.txt` is an address the app itself hands out, so the
        // config folder is walked into explicitly — one level, under it only.
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
    /// wearing (`themes::create`).
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

    /// Re-reads the preferences from disk. The `Config` is cached by value,
    /// so a `config.json` written by someone else would be announced by the
    /// watcher and then ignored; the bridge calls this when the watcher sees it.
    pub fn reload_config(&mut self) {
        self.config = Config::load(self.config_path());
    }

    /// Runs `action` against this notebook and records what it changed in
    /// `history`, under `label` — the door every action `Ctrl+Z` can take
    /// back goes through (`crate::history`).
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
    /// for every setter that touches a single field.
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

    /// Binds a command to a chord, or unbinds it with `chord: None`. Neither
    /// string is judged here (they belong to the interface). Unbinding
    /// REMOVES the key, so a config carries only what differs from the app's table.
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
