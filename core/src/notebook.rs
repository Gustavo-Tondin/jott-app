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
//! ├── Tasks/                ← fixed workspace, type `tasks`
//! │   ├── .workspace.json
//! │   ├── Tasks.md
//! │   └── Completed.md
//! ├── Notes/                ← fixed workspace, type `notes`
//! └── Design/               ← a group, holding workspaces
//!     └── Clients/
//! ```
//!
//! Since phase 7 every list is addressed by its **root-relative path**
//! (`Tasks/Compras.md`), never by a bare name — two folders of tasks mean two
//! lists called `Inbox`, and a name stops identifying anything. A notebook in
//! the pre-phase-7 layout is refused on open with a clear message (no
//! migrations before v1 — decision 2026-07-21).

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use chrono::NaiveDate;

use crate::clock;
use crate::conflict::Conflict;
use crate::config::{Config, RolloverMode};
use crate::error::{Error, IoContext, Result};
use crate::list::TaskList;
use crate::rollover;
use crate::search::{HitKind, SearchHit, SearchResults};
use crate::state::{Period, StateFile, TaskRef};
use crate::task::Task;
use crate::{COMPLETED_LIST, NOTEBOOK_CONFIG_DIR, NOTES_DIR, TASKS_DIR};

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
    /// The workspace holding it, as the user reads it (see [`ListEntry`]).
    pub workspace: String,
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
    /// Where it lives, as the user reads it: the workspace's **readable
    /// address** — `Design/Tasks` inside a group, `Mercado` when loose, and
    /// `Tasks` for the fixed one whose folder is `jott.tasks` (2026-08-13).
    ///
    /// Never derived in the frontend. The three fixed workspaces live in
    /// `jott.*` folders so the plain names stay free for the user, and the
    /// interface has always called them Home, Tasks and Notes — deriving this
    /// from the path on the other side would put the folder on screen
    /// (2026-08-11).
    pub workspace: String,
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
    // A list always lives inside a workspace folder, never at the root.
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
/// A workspace and a group carry the **same** [`WorkspaceConfig`] — name,
/// colour, icon — under different file names, so renaming one and renaming the
/// other were the same three lines twice, as were the two appearance setters.
/// Only the path differs, so only the path is a parameter.
fn edit_marked_config(
    path: PathBuf,
    edit: impl FnOnce(&mut crate::workspace::WorkspaceConfig),
) -> Result<()> {
    let mut config = crate::workspace::WorkspaceConfig::load(&path);
    edit(&mut config);
    config.save(path)
}

/// An open notebook.
#[derive(Debug, Clone)]
pub struct Notebook {
    root: PathBuf,
    config: Config,
}

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
            // `ensure_fixed_workspaces` now creates the fixed widgets and their
            // default lists inside `Inbox/`; no separate root-level defaults.
            notebook.ensure_fixed_workspaces()?;
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
        notebook.ensure_fixed_workspaces()?;
        notebook.write_format_guide()?;
        Ok(notebook)
    }

    /// Recreates the three fixed workspaces — Home, Tasks, Notes — when their
    /// folder or marker is missing. Called on init and on every open, same
    /// treatment the default lists get: the user may delete things outside
    /// the app, and the app must not break.
    ///
    /// Only the **markers** are recreated; the contents of the folders are
    /// never touched. A `.workspace.json` the user edited is left exactly as
    /// it is — recreating is not rewriting.
    fn ensure_fixed_workspaces(&self) -> Result<()> {
        use crate::workspace::WORKSPACE_CONFIG_FILE;

        // Recreate a marker only when missing — never rewrite an existing one
        // (recreating is not rewriting: it must not clobber a user's edits).
        //
        // The one thing it does complete: a fixed marker with no `type`. The
        // three fixed workspaces are the app's own, and their function is not
        // a user choice — Tasks is a tasks workspace, always. Without this a
        // marker written before `type` existed opens as "unsupported", which
        // is a lie about a folder the app itself created. A USER workspace is
        // never touched: there, the type is a decision, and guessing it would
        // be inventing one.
        let ensure_marker = |dir: &std::path::Path, kind: &str, label: &str| -> Result<()> {
            std::fs::create_dir_all(dir).ctx(dir)?;
            let marker = dir.join(WORKSPACE_CONFIG_FILE);
            if !marker.exists() {
                let body = format!(
                    "{{\n  \"schemaVersion\": 1,\n  \"type\": \"{kind}\",\n  \
                     \"name\": \"{label}\",\n  \"fixed\": true\n}}\n"
                );
                return crate::fsio::write_atomically(&marker, body.as_bytes());
            }
            let mut config = crate::workspace::WorkspaceConfig::load(&marker);
            if config.is_read_only() {
                return Ok(());
            }
            // The display name is what the interface has always shown for
            // these three, and it is NOT the folder — the folder carries the
            // app's `jott.` prefix. Filled only when absent: a fixed
            // workspace the user renamed keeps the name they gave it.
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

        // Tasks and Notes: a typed workspace that owns its files directly —
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

    /// The root-relative address of the fixed Tasks workspace's list — where
    /// quick-captured tasks land.
    pub fn inbox_path() -> String {
        format!("{TASKS_DIR}/{}.md", crate::MAIN_LIST)
    }

    /// The address of the Completed list that serves `list_path` — the one in
    /// the **same folder** (spec 3.5: one Completed per tasks widget, so a
    /// completed task never leaves the workspace it lived in).
    pub fn completed_path_of(list_path: &str) -> Result<String> {
        let (dir, _) = split_list_path(list_path)?;
        Ok(format!("{dir}/{COMPLETED_LIST}.md"))
    }

    /// Resolves a root-relative list address (`Tasks/Compras.md`) into the
    /// folder that owns it and the list name. Every operation that receives a
    /// list goes through here — the address is user input, exactly like a
    /// list name used to be.
    fn resolve_list(&self, path: &str) -> Result<(crate::folder::TaskFolder, String)> {
        let (dir, name) = split_list_path(path)?;
        Ok((self.task_folder(self.root.join(dir)), name.to_string()))
    }

    /// A tasks folder for `dir`. Every one of them is the same shape now
    /// (2026-08-13): `task-list.md` beside `completed.md`, whatever the folder
    /// is called. The fixed Tasks workspace used to be the exception — it
    /// lives in `jott.tasks/` and had to be TOLD its list was `Tasks.md`,
    /// because the folder name could not say it.
    fn task_folder(&self, dir: PathBuf) -> crate::folder::TaskFolder {
        crate::folder::TaskFolder::new(dir)
    }

    /// Every tasks workspace's folder in the notebook, with its root-relative
    /// prefix. This is the walk behind lists, counts, conflicts and
    /// suggestions — one definition of "where tasks live", not four.
    fn task_folders(&self) -> Result<Vec<(String, crate::folder::TaskFolder)>> {
        Ok(self
            .typed_workspace_dirs("tasks")?
            .into_iter()
            .map(|(prefix, dir)| (prefix, self.task_folder(dir)))
            .collect())
    }

    /// Every notes workspace's folder in the notebook, with its root-relative
    /// prefix — the notes counterpart of [`Notebook::task_folders`].
    pub fn note_folders(&self) -> Result<Vec<(String, crate::notefolder::NoteFolder)>> {
        Ok(self
            .typed_workspace_dirs("notes")?
            .into_iter()
            .map(|(prefix, dir)| (prefix, crate::notefolder::NoteFolder::new(dir)))
            .collect())
    }

    /// Every workspace folder of a given type, as (root-relative prefix,
    /// absolute dir). The walk behind both folder listings above — they
    /// differ only in the type they ask for and the folder value they build,
    /// so the walk itself is written once. A workspace is its own content
    /// folder now: the widget level between them was cut (2026-08-11).
    fn typed_workspace_dirs(&self, kind: &str) -> Result<Vec<(String, PathBuf)>> {
        let mut found = Vec::new();
        for workspace in self.workspaces()? {
            if workspace.kind() != kind {
                continue;
            }
            let dir = workspace.root().to_path_buf();
            found.push((crate::relpath::relative_slash(&self.root, &dir), dir));
        }
        Ok(found)
    }

    /// The notes folder at a root-relative address, e.g. `Notes`.
    pub fn note_folder(&self, prefix: &str) -> Result<crate::notefolder::NoteFolder> {
        self.note_folders()?
            .into_iter()
            .find(|(at, _)| at == prefix)
            .map(|(_, folder)| folder)
            .ok_or_else(|| Error::InvalidNotePath(prefix.to_string()))
    }

    /// The lists of the notebook, across every workspace's tasks widgets.
    /// Sorted by name, which is what a sidebar shows.
    pub fn lists(&self) -> Result<Vec<ListEntry>> {
        let labels = self.workspace_labels()?;
        let mut entries: Vec<ListEntry> = Vec::new();
        for (prefix, folder) in self.task_folders()? {
            let workspace = labels
                .get(&prefix)
                .cloned()
                .unwrap_or_else(|| prefix.clone());
            for name in folder.list_names()? {
                entries.push(ListEntry {
                    path: format!("{prefix}/{name}.md"),
                    name,
                    workspace: workspace.clone(),
                });
            }
        }
        // Manual order lives per folder — the sidebar reorders one folder's
        // lists at a time. So: group by folder and sort by name first, then let
        // the stored order rearrange each folder's run. Anything the order does
        // not mention (Inbox, Completed, a freshly created list) keeps its
        // alphabetical place, after the named ones.
        let folder_of = |path: &str| -> String {
            path.rsplit_once('/')
                .map(|(folder, _)| folder.to_string())
                .unwrap_or_default()
        };
        entries.sort_by(|a, b| {
            folder_of(&a.path)
                .cmp(&folder_of(&b.path))
                .then_with(|| a.name.cmp(&b.name))
        });
        // The same helper the workspaces go through — the "manual order lives in
        // the config" rule has one implementation, applied here once per folder.
        for run in entries.chunk_by_mut(|a, b| folder_of(&a.path) == folder_of(&b.path)) {
            let namespace = format!("lists:{}", folder_of(&run[0].path));
            self.config.apply_order(&namespace, run, |entry| &entry.name);
        }
        Ok(entries)
    }

    /// How many open tasks each list has, keyed by address, across every
    /// workspace's tasks widgets.
    pub fn open_task_counts(&self) -> Result<BTreeMap<String, usize>> {
        let mut counts = BTreeMap::new();
        for (prefix, folder) in self.task_folders()? {
            for (name, count) in folder.open_task_counts()? {
                counts.insert(format!("{prefix}/{name}.md"), count);
            }
        }
        Ok(counts)
    }

    /// Conflicting copies sitting in the notebook right now.
    ///
    /// Scans the config folder and every tasks-widget folder, which is where
    /// sync tools leave them. Reporting is all this does — the user decides
    /// what to keep.
    pub fn conflicts(&self) -> Result<Vec<Conflict>> {
        let mut found = Vec::new();
        let mut dirs = vec![self.config_dir()];
        for (_, folder) in self.task_folders()? {
            dirs.push(folder.dir().to_path_buf());
        }
        for dir in dirs {
            for path in crate::fsio::dir_paths(&dir)? {
                if let Some(conflict) = crate::conflict::describe(&path) {
                    found.push(conflict);
                }
            }
        }
        found.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(found)
    }

    /// Opens a list by its root-relative address (`Tasks/Compras.md`).
    pub fn open_list(&self, path: &str) -> Result<TaskList> {
        let (folder, name) = self.resolve_list(path)?;
        folder.open_list(&name)
    }

    /// Tasks of a list, ready to show.
    ///
    /// Reading does **not** hand out ids: a task only gets one when something
    /// needs to address it (see [`Notebook::ensure_task_id`]). Opening a list
    /// therefore leaves a hand-written file exactly as it was.
    ///
    /// The one thing reading does fix is a *duplicated* id, because that makes
    /// two lines indistinguishable to every later operation. That is rare, so
    /// the file is only rewritten when it actually happens.
    pub fn tasks_in(&self, path: &str) -> Result<Vec<Task>> {
        let mut tasks = self.open_list(path)?;
        if !self.is_read_only() && tasks.dedupe_ids() > 0 {
            tasks.save()?;
        }
        Ok(tasks.tasks().cloned().collect())
    }

    /// Gives the task at `position` in the list at `path` an id, and returns
    /// it.
    ///
    /// The frontend shows tasks by position; the moment the user acts on one
    /// — pulls it into a period, completes it — it needs a stable name. This
    /// is where a task earns one.
    pub fn ensure_task_id(&self, path: &str, position: usize) -> Result<String> {
        self.ensure_writable()?;
        let mut tasks = self.open_list(path)?;

        let existing = tasks
            .tasks()
            .nth(position)
            .ok_or_else(|| Error::TaskNotFound(format!("{path}[{position}]")))?
            .id
            .clone();
        if let Some(id) = existing {
            return Ok(id);
        }

        let id = tasks
            .ensure_id_at(position)
            .ok_or_else(|| Error::TaskNotFound(format!("{path}[{position}]")))?;
        tasks.save()?;
        Ok(id)
    }

    /// The fixed workspace's inbox.
    pub fn inbox(&self) -> Result<TaskList> {
        self.open_list(&Self::inbox_path())
    }

    /// Whether a list is one the app protects: the folder's main list (the
    /// workspace *is* that list, spec 3.5) and its Completed. Both come back
    /// on every open, and neither can be renamed or deleted.
    fn is_protected_list(folder: &crate::folder::TaskFolder, name: &str) -> bool {
        name == COMPLETED_LIST || name == folder.main_list_name()
    }

    /// Creates a new list inside `folder` (a root-relative workspace folder,
    /// e.g. `Tasks`). Fails if one with that name already exists.
    pub fn create_list(&self, folder: &str, name: &str) -> Result<TaskList> {
        self.ensure_writable()?;
        // A list name is a leaf: a `/` here would silently create a nested
        // folder instead of a list called "sub/lista".
        if name.contains('/') {
            return Err(Error::InvalidListName(name.to_string()));
        }
        // Validate folder and name in one go by resolving the would-be path.
        let address = format!("{folder}/{name}.md");
        let (task_folder, name) = self.resolve_list(&address)?;
        let path = task_folder.list_path(&name)?;
        if path.exists() {
            return Err(Error::InvalidListName(format!("{name} already exists")));
        }
        crate::fsio::write_atomically(&path, b"")?;
        TaskList::load(path)
    }

    /// The three workspaces the app creates and recreates — never renamed,
    /// deleted, nor treated as user content. They carry the `jott.` prefix, so
    /// the plain names (`Tasks`, `Notes`, `Home`) are the user's to take.
    fn is_fixed_workspace(folder: &str) -> bool {
        folder == crate::HOME_DIR || folder == TASKS_DIR || folder == NOTES_DIR
    }

    /// Validates a workspace folder name (user input): a safe single component,
    /// not hidden. Shared by create and open.
    fn check_workspace_name(name: &str) -> Result<()> {
        if !crate::relpath::is_safe_leaf(name) {
            return Err(Error::InvalidWorkspaceName(name.to_string()));
        }
        Ok(())
    }

    /// Creates a user workspace at the root: a folder carrying a
    /// `.workspace.json` with the chosen type (`tasks` or `notes`) — the
    /// workspace's single function, chosen at creation and never changed
    /// (spec 3.5). A tasks workspace is born usable: its list (named after
    /// the folder) and its `Completed.md`. Returns the folder name.
    pub fn create_workspace(&self, name: &str, kind: &str) -> Result<String> {
        self.create_workspace_in(name, kind, None)
    }

    /// Creates a workspace at the root or inside a group. The folder name is
    /// the identity — unique across the notebook (spec 3.5), so a workspace
    /// in a group is addressed the same as one at the root. Returns the name.
    pub fn create_workspace_in(
        &self,
        name: &str,
        kind: &str,
        into_group: Option<&str>,
    ) -> Result<String> {
        self.ensure_writable()?;
        if !["tasks", "notes"].contains(&kind) {
            return Err(Error::InvalidWorkspaceName(format!(
                "unknown workspace type {kind:?}"
            )));
        }
        let parent = match into_group {
            Some(group) => self.open_group(group)?.0,
            None => self.root.clone(),
        };
        let config = crate::workspace::WorkspaceConfig::new(kind);
        let folder = self.create_marked_folder(
            name,
            &parent,
            crate::workspace::WORKSPACE_CONFIG_FILE,
            &config.render(),
        )?;
        if kind == "tasks" {
            // Born usable: its one list and the Completed beside it, under the
            // names every tasks workspace uses (2026-08-13).
            let dir = self.resolve_workspace_path(&folder)?;
            crate::folder::TaskFolder::new(dir).ensure_default_lists()?;
        }
        Ok(folder)
    }

    /// Creates a folder that carries a marker — a workspace or a group.
    ///
    /// Creating either is the same act: a name that has to be a safe leaf, free
    /// across the whole notebook (spec 3.5 — the leaf name *is* the identity),
    /// on a folder that does not exist yet, plus the marker file that turns it
    /// into interface. Only the marker differs, so the marker (and its body)
    /// is a parameter.
    fn create_marked_folder(
        &self,
        name: &str,
        parent: &Path,
        marker: &str,
        body: &str,
    ) -> Result<String> {
        let folder = name.trim();
        Self::check_workspace_name(folder)?;
        // A workspace called `completed` used to be refused, because its list
        // was named after its folder and would have collided with its own
        // `completed.md`. Fixed file names removed the collision, but the name
        // is still refused: a folder and a file called the same thing inside it
        // is a trap for whoever opens the notebook without the app.
        if Self::is_fixed_workspace(folder)
            || folder.eq_ignore_ascii_case(COMPLETED_LIST)
            || folder.eq_ignore_ascii_case(crate::MAIN_LIST)
        {
            return Err(Error::InvalidWorkspaceName(format!("{folder} is reserved")));
        }
        // Free HERE, not notebook-wide (2026-08-13). A name had to be unique
        // across the whole notebook while the leaf was the identity; now the
        // PATH is, so two groups may each hold a `Tasks/` — which is exactly
        // what a user builds on purpose. The only collision left is the real
        // one: a sibling of the same name.
        let dir = parent.join(folder);
        if dir.exists() {
            return Err(Error::InvalidWorkspaceName(format!("{folder} already exists")));
        }
        std::fs::create_dir_all(&dir).ctx(&dir)?;
        crate::fsio::write_atomically(&dir.join(marker), body.as_bytes())?;
        // The PATH, not the leaf: it is the address the caller will open the
        // new workspace by, and inside a group the leaf is not enough.
        Ok(crate::relpath::relative_slash(&self.root, &dir))
    }

    /// Changes a workspace's own `.workspace.json`, through the same tolerant
    /// config type discovery reads.
    fn with_workspace_config(
        &self,
        folder: &str,
        change: impl FnOnce(&mut crate::workspace::WorkspaceConfig),
    ) -> Result<()> {
        self.ensure_writable()?;
        let ws = self.open_workspace(folder)?;
        let path = ws.config_path();
        let mut config = ws.config;
        change(&mut config);
        config.save(path)
    }

    /// Persists how a workspace arranges its items (`name` / `created` /
    /// `completed` / `custom`, `None` = file order) in its `.workspace.json`.
    pub fn set_workspace_sort(&self, folder: &str, sort: Option<&str>) -> Result<()> {
        self.with_workspace_config(folder, |config| {
            config.sort = sort.map(str::to_string);
        })
    }

    /// Persists the hand-dragged arrangement (task ids / note paths) in the
    /// workspace's `.workspace.json` and switches it to the custom ordering —
    /// the order lives in the config, never in the content files.
    pub fn set_workspace_order(&self, folder: &str, order: Vec<String>) -> Result<()> {
        self.with_workspace_config(folder, |config| {
            config.sort = Some("custom".to_string());
            config.order = order;
        })
    }

    /// Opens an existing user workspace by its folder name.
    /// Opens a workspace by its **root-relative path** (`Mercado`,
    /// `Design/Tasks`).
    ///
    /// The path, not the leaf name (2026-08-13). The leaf used to be the
    /// identity, "unique across the notebook", and that invariant died the
    /// moment the folder became the name: two groups may each hold a `Tasks/`,
    /// which is exactly the arrangement a user builds on purpose. The old
    /// lookup searched the root and then every group for a matching leaf, so
    /// with two matches it silently opened the first — and the sidebar
    /// highlighted BOTH, because both answered to the same address (user
    /// report, screen recording 2026-08-13).
    fn open_workspace(&self, path: &str) -> Result<crate::workspace::Workspace> {
        let dir = self.resolve_workspace_path(path)?;
        crate::workspace::Workspace::open(dir)
    }

    /// A root-relative path resolved against the notebook, refusing anything
    /// that climbs, hides, or is not a single safe run of components.
    fn resolve_workspace_path(&self, path: &str) -> Result<PathBuf> {
        crate::relpath::safe_join(&self.root, path)
            .ok_or_else(|| Error::InvalidWorkspaceName(path.to_string()))
    }

    /// Creates an empty group (a folder with a `.group.json`) at the root. The
    /// folder name is the identity — a safe single component, unique in the
    /// notebook. Returns the folder name.
    pub fn create_group(&self, name: &str, into_group: Option<&str>) -> Result<String> {
        self.ensure_writable()?;
        let parent = match into_group {
            Some(group) => self.open_group(group)?.0,
            None => self.root.clone(),
        };
        self.create_marked_folder(
            name,
            &parent,
            crate::workspace::GROUP_CONFIG_FILE,
            "{\n  \"schemaVersion\": 1\n}\n",
        )
    }

    /// Renames a group's display name (`.group.json` `name`); empty clears it.
    /// Renames a group by renaming its FOLDER — the same rule as a workspace
    /// (2026-08-13). Everything under it moves with it, so the Day/Week
    /// references and the stored arrangements are repointed by `relocate`.
    pub fn rename_group(&mut self, folder: &str, new_name: &str) -> Result<()> {
        self.ensure_writable()?;
        let name = new_name.trim();
        Self::check_workspace_name(name)?;
        let (from, _) = self.open_group(folder)?;
        let parent = from.parent().unwrap_or(&self.root).to_path_buf();
        self.relocate(&from, &parent, name)?;
        let moved = parent.join(name).join(crate::workspace::GROUP_CONFIG_FILE);
        edit_marked_config(moved, |config| config.name = None)
    }

    /// Sets a group's accent colour and icon; an empty string clears each.
    pub fn set_group_appearance(
        &self,
        folder: &str,
        color: Option<String>,
        icon: Option<String>,
    ) -> Result<()> {
        self.ensure_writable()?;
        let path = self.group_config_path(folder)?;
        edit_marked_config(path, |config| {
            config.color = color.as_deref().and_then(cleared_to_none);
            config.icon = icon.as_deref().and_then(cleared_to_none);
        })
    }

    /// Where a group's config lives.
    fn group_config_path(&self, folder: &str) -> Result<PathBuf> {
        Ok(self
            .open_group(folder)?
            .0
            .join(crate::workspace::GROUP_CONFIG_FILE))
    }

    /// Sends a group to the trash after handing what it held to its own parent
    /// (the root, or the group it sat in), so nothing is ever lost with it.
    pub fn delete_group(&mut self, folder: &str) -> Result<()> {
        self.ensure_writable()?;
        let (dir, _) = self.open_group(folder)?;
        let parent = self.parent_group_of(&dir);

        // Members first: a workspace still inside when the folder goes to the
        // trash would go with it.
        let mut members = Vec::new();
        self.collect_workspaces(&dir, &mut members)?;
        for ws in members {
            let path = crate::relpath::relative_slash(&self.root, ws.root());
            self.move_workspace(&path, parent.as_deref())?;
        }
        // Child groups the same way — deleting a group is not deleting a branch.
        for child in crate::workspace::marker_dirs(&dir, crate::workspace::GROUP_CONFIG_FILE)? {
            let path = crate::relpath::relative_slash(&self.root, &child);
            self.move_group(&path, parent.as_deref())?;
        }
        self.trash_path(&dir)?;
        Ok(())
    }

    /// Moves a workspace into a group (`Some`) or back to the root (`None`),
    /// renaming its folder. Identity is the leaf name, which never changes, so
    /// nothing addressing the workspace *by name* breaks — but its lists are
    /// addressed by PATH, and the path is exactly what a move changes.
    pub fn move_workspace(&mut self, name: &str, into_group: Option<&str>) -> Result<()> {
        self.ensure_writable()?;
        if Self::is_fixed_workspace(name) {
            return Err(Error::Protected(name.to_string()));
        }
        let ws = self.open_workspace(name)?;
        let from = ws.root().to_path_buf();
        let target_parent = match into_group {
            Some(group) => self.open_group(group)?.0,
            None => self.root.clone(),
        };
        // `relocate` is told the LEAF to land under; `name` is a path now.
        let leaf = crate::workspace::folder_name_of(&from);
        self.relocate(&from, &target_parent, &leaf)
    }

    /// Moves a group — with everything under it — into another group (`Some`)
    /// or back to the root (`None`).
    pub fn move_group(&mut self, name: &str, into_group: Option<&str>) -> Result<()> {
        self.ensure_writable()?;
        let (from, _) = self.open_group(name)?;
        let target_parent = match into_group {
            Some(group) => {
                let (dir, _) = self.open_group(group)?;
                if dir == from {
                    return Err(Error::InvalidWorkspaceName(format!(
                        "{name} cannot hold itself"
                    )));
                }
                // A group cannot move inside its own subtree: the branch would
                // be carrying itself, and everything under it would leave the
                // notebook with the move.
                if dir.starts_with(&from) {
                    return Err(Error::InvalidWorkspaceName(format!(
                        "{group} is inside {name}"
                    )));
                }
                dir
            }
            None => self.root.clone(),
        };
        let leaf = crate::workspace::folder_name_of(&from);
        self.relocate(&from, &target_parent, &leaf)
    }

    /// Moves a marked folder under a new parent, keeping its name.
    ///
    /// Every list under it just changed address, so the Day/Week references
    /// follow — a reference left pointing at the old path reads as a task that
    /// vanished. (It is the same repointing a moved widget used to do; a moved
    /// workspace never did it, which is the bug this closes.)
    fn relocate(&mut self, from: &Path, target_parent: &Path, name: &str) -> Result<()> {
        let to = target_parent.join(name);
        if from == to {
            return Ok(());
        }
        if to.exists() {
            return Err(Error::InvalidWorkspaceName(format!("{name} already exists")));
        }
        let from_rel = crate::relpath::relative_slash(&self.root, from);
        let to_rel = crate::relpath::relative_slash(&self.root, &to);

        std::fs::create_dir_all(target_parent).ctx(target_parent)?;
        std::fs::rename(from, &to).ctx(&to)?;

        self.update_states(|state| state.rename_prefix(&from_rel, &to_rel))?;
        // The hand-dragged arrangements are addressed by folder too, and a
        // stale one fails silently: the workspace just falls to the end of a
        // column the user arranged (services/sidebarOrder.js reads what is
        // stored, and what is stored no longer names anything).
        let mut config = self.config.clone();
        if config.relocate_orders(&from_rel, &to_rel) {
            self.set_config(config)?;
        }
        // The aggregated index holds paths too; it is reconstructible, so a
        // failure here must not fail the move.
        let _ = self.refresh_completed_index();
        Ok(())
    }

    /// The group a directory sits in, if it sits in one at all.
    fn parent_group_of(&self, dir: &Path) -> Option<String> {
        dir.parent()
            .filter(|parent| *parent != self.root.as_path())
            .filter(|parent| crate::workspace::Group::is_group(parent))
            .map(|parent| crate::relpath::relative_slash(&self.root, parent))
    }

    /// Opens a group by folder name — at the root or nested in another group —
    /// returning its dir and config.
    fn open_group(&self, path: &str) -> Result<(PathBuf, crate::workspace::WorkspaceConfig)> {
        let wanted = self.resolve_workspace_path(path)?;
        let dir = self
            .group_dirs()?
            .into_iter()
            .find(|dir| *dir == wanted)
            .ok_or_else(|| Error::InvalidWorkspaceName(format!("{path} is not a group")))?;
        let config = crate::workspace::WorkspaceConfig::load(
            dir.join(crate::workspace::GROUP_CONFIG_FILE),
        );
        Ok((dir, config))
    }

    /// Renames a workspace by renaming its **FOLDER** (user call, 2026-08-13).
    ///
    /// It used to write a `name` into the marker and leave the folder alone,
    /// which kept the identity stable but made the name a second copy of it —
    /// and the two drifted the moment anything was renamed. The folder is the
    /// name now, in both directions: rename it here and the disk follows;
    /// rename it in a file manager and the sidebar follows.
    ///
    /// The app's own `jott.*` workspaces cannot take that route — their folder
    /// name is an identifier the app recreates — so those, and only those,
    /// still keep their label in the marker.
    pub fn rename_workspace(&mut self, folder: &str, new_name: &str) -> Result<()> {
        self.ensure_writable()?;
        let ws = self.open_workspace(folder)?;
        if crate::workspace::is_app_folder(folder) {
            return edit_marked_config(ws.config_path(), |config| {
                config.name = cleared_to_none(new_name)
            });
        }
        let name = new_name.trim();
        Self::check_workspace_name(name)?;
        let from = ws.root().to_path_buf();
        let parent = from.parent().unwrap_or(&self.root).to_path_buf();
        self.relocate(&from, &parent, name)?;
        // The marker's `name` is dead weight from here on: it is no longer
        // read for a user workspace, and leaving it would show up in a diff as
        // a name that disagrees with the folder.
        let moved = parent.join(name).join(crate::workspace::WORKSPACE_CONFIG_FILE);
        edit_marked_config(moved, |config| config.name = None)
    }

    /// Sets a workspace's accent colour and icon; an empty string clears each.
    pub fn set_workspace_appearance(
        &self,
        folder: &str,
        color: Option<String>,
        icon: Option<String>,
    ) -> Result<()> {
        self.ensure_writable()?;
        let path = self.open_workspace(folder)?.config_path();
        edit_marked_config(path, |config| {
            config.color = color.as_deref().and_then(cleared_to_none);
            config.icon = icon.as_deref().and_then(cleared_to_none);
        })
    }

    /// Sends a user workspace to the trash — never a fixed one, and never a
    /// permanent delete (the trash is the only door out).
    pub fn delete_workspace(&self, folder: &str) -> Result<()> {
        self.ensure_writable()?;
        if Self::is_fixed_workspace(folder) {
            return Err(Error::Protected(folder.to_string()));
        }
        let ws = self.open_workspace(folder)?;
        self.trash_path(ws.root())?;
        Ok(())
    }

    /// Renames a user list (addressed by path) to a new **name**, in the same
    /// folder — a rename never moves a list between workspaces. Repoints
    /// everything that referred to it: the `origin` of completed tasks in the
    /// folder's own Completed (otherwise undo would send them to a list that
    /// no longer exists) and the day/week states.
    pub fn rename_list(&self, from: &str, to_name: &str) -> Result<()> {
        self.ensure_writable()?;
        let (folder, from_name) = self.resolve_list(from)?;
        if Self::is_protected_list(&folder, &from_name) {
            return Err(Error::Protected(from_name));
        }
        if to_name == COMPLETED_LIST {
            return Err(Error::InvalidListName(to_name.to_string()));
        }

        let source = folder.list_path(&from_name)?;
        let target = folder.list_path(to_name)?;
        if !source.exists() {
            return Err(Error::InvalidListName(format!("{from} does not exist")));
        }
        if target.exists() {
            return Err(Error::InvalidListName(format!("{to_name} already exists")));
        }

        std::fs::rename(&source, &target).ctx(&target)?;

        // Origins live in the folder's own Completed and hold bare names —
        // relative to the widget, so the folder stays portable (spec 3.5).
        let mut completed = folder.open_list(COMPLETED_LIST)?;
        if completed.repoint_origin(&from_name, to_name) > 0 {
            completed.save()?;
        }

        let (dir, _) = split_list_path(from)?;
        let to_path = format!("{dir}/{to_name}.md");
        self.update_states(|state| state.rename_path(from, &to_path))
    }

    /// Deletes a user list, moving whatever was still in it to the **same
    /// folder's** Inbox.
    ///
    /// Deleting a list is a filing decision, not a decision to throw work
    /// away — principle 2, the data is the user's. An empty list disappears
    /// silently; one with tasks leaves them in the folder's Inbox.
    pub fn delete_list(&self, path: &str) -> Result<usize> {
        self.ensure_writable()?;
        let (folder, name) = self.resolve_list(path)?;
        if Self::is_protected_list(&folder, &name) {
            return Err(Error::Protected(name));
        }

        let file = folder.list_path(&name)?;
        if !file.exists() {
            return Err(Error::InvalidListName(format!("{path} does not exist")));
        }

        // Every task moves, not just the ones that happen to have an id —
        // most tasks never earn one, and losing them here would be silent.
        let list = TaskList::load(&file)?;
        let rescued: Vec<Task> = list.tasks().cloned().collect();

        let main_list = folder.main_list_name();
        let mut inbox = folder.open_list(&main_list)?;
        for task in &rescued {
            inbox.add(task.clone());
        }

        // Inbox first, then the file goes away: a crash in between leaves a
        // duplicate, never a hole.
        //
        // To the trash rather than gone: the rescue above only carries the
        // *tasks*, and a list file may also hold a heading, a note to self,
        // whatever prose the user wrote around them. That is theirs too.
        inbox.save()?;
        self.trash_path(&file)?;
        let rescued = rescued.len();

        let (dir, _) = split_list_path(path)?;
        let inbox_path = format!("{dir}/{main_list}.md");
        // References now point at the main-list copies, which carry the same
        // ids; repointing keeps a pulled task pulled.
        self.update_states(|state| state.rename_path(path, &inbox_path))?;
        Ok(rescued)
    }

    /// Moves a task between lists (addressed by path), preserving its id.
    pub fn move_task(
        &self,
        id: &str,
        from: &str,
        to: &str,
        origin: OriginAction,
    ) -> Result<Task> {
        self.transfer(id, from, to, origin, None)
    }

    /// Inserts a copy of a task right after it, in the same list. The copy
    /// carries the task's fields but no id and no origin — it is a new task.
    pub fn duplicate_task(&self, path: &str, id: &str) -> Result<()> {
        self.ensure_writable()?;
        let mut list = self.open_list(path)?;
        list.duplicate(id)?;
        list.save()?;
        Ok(())
    }

    /// Pins a task to the top of its list, or unpins it (the card's bookmark).
    ///
    /// Filing, not a label: it rides in the hidden comment, so a pinned task
    /// reads the same to anyone opening the file in another editor and no
    /// `#pinned` tag turns up in the tag manager.
    pub fn set_task_pinned(&self, path: &str, id: &str, pinned: bool) -> Result<()> {
        self.ensure_writable()?;
        let mut list = self.open_list(path)?;
        list.task_mut(id)?.pinned = pinned;
        list.save()
    }

    /// The move primitive. `done` optionally flips the checkbox in the same
    /// write, so completing a task is one pass over each file instead of two.
    ///
    /// A recorded origin is the source's **name**, not its path: origins are
    /// only ever resolved inside the same folder (undo goes back to a sibling
    /// list), and a bare name keeps the folder portable as a template.
    fn transfer(
        &self,
        id: &str,
        from: &str,
        to: &str,
        origin: OriginAction,
        done: Option<bool>,
    ) -> Result<Task> {
        self.ensure_writable()?;
        let (_, from_name) = self.resolve_list(from)?;
        let mut source = self.open_list(from)?;
        let mut target = self.open_list(to)?;

        let mut task = source.remove(id)?;
        match origin {
            OriginAction::Record => task.origin = Some(from_name),
            OriginAction::Clear => task.origin = None,
            OriginAction::Keep => {}
        }
        if let Some(done) = done {
            task.done = done;
            // Completing stamps the civil date (same wall-clock stamp the
            // trash uses); undoing clears it — "when was this completed" is
            // meaningless on a task that is open again.
            task.completed = done.then(crate::clock::civil_today);
        }

        let fallback = task.clone();
        let position = target.add(task);
        // `add` re-issues an id that the destination already uses, so the task
        // may not have arrived under the name it left with.
        let moved = target.tasks().nth(position).cloned().unwrap_or(fallback);
        let settled = moved.id.clone();

        // Target first: a crash between the two writes duplicates the task
        // instead of losing it, and a duplicate is recoverable by hand.
        target.save()?;
        source.save()?;

        // Today and This Week reference the *task*, not the place: it stays
        // pulled wherever it goes, including into the folder's Completed —
        // which is what puts a ticked task in the period's "Completed N"
        // section instead of making it vanish (2026-08-06).
        if let Some(settled) = settled {
            self.update_states(|state| state.repoint(from, id, to, &settled))?;
        }
        Ok(moved)
    }

    // ---------------------------------------------------------------- state

    pub fn state_path(&self, period: Period) -> PathBuf {
        self.config_dir().join(period.file_name())
    }

    /// The current logical day, honouring the configured turn.
    pub fn today(&self) -> NaiveDate {
        clock::today(self.config.rollover.daily.at)
    }

    /// First day of the current logical week.
    pub fn current_week(&self) -> NaiveDate {
        clock::this_week(
            self.config.rollover.weekly.at,
            self.config.rollover.weekly.starts_on,
        )
    }

    pub fn current_period_date(&self, period: Period) -> NaiveDate {
        match period {
            Period::Day => self.today(),
            Period::Week => self.current_week(),
        }
    }

    /// When the next turn of `period` happens.
    ///
    /// The rollover must also fire while the app is *open*, not only when the
    /// notebook is reopened. The core cannot own a timer without dragging in a
    /// runtime, so it answers "when" and the app schedules the wake-up.
    pub fn next_turn_at(&self, period: Period) -> chrono::DateTime<chrono::Local> {
        // The clock module reads the instant: this used to call Local::now()
        // here, which the invariant test now flags — the configured turn only
        // stays honest while clock.rs is the single reader.
        match period {
            Period::Day => clock::next_daily_turn(self.config.rollover.daily.at),
            Period::Week => clock::next_weekly_turn(
                self.config.rollover.weekly.at,
                self.config.rollover.weekly.starts_on,
            ),
        }
    }

    /// The workspaces of this notebook: every first-level folder carrying a
    /// `.workspace.json`, alphabetically by folder name.
    ///
    /// Folders without the marker are ignored on purpose — a stray folder
    /// dropped into the notebook (downloads, an attachments dir, whatever a
    /// sync tool leaves) must never turn into interface on its own.
    pub fn workspaces(&self) -> Result<Vec<crate::workspace::Workspace>> {
        // Workspaces live at the root and one level inside a group (spec 3.5:
        // groups do not nest). Their identity is the leaf folder name, unique
        // across the notebook — so nothing addressing a workspace cares whether
        // it sits in a group or not.
        let mut found = Vec::new();
        self.collect_workspaces(&self.root, &mut found)?;
        for group_dir in self.group_dirs()? {
            self.collect_workspaces(&group_dir, &mut found)?;
        }
        // By PATH, so a workspace sorts under the group it belongs to and two
        // workspaces sharing a leaf name are two different entries.
        let path_of = |ws: &crate::workspace::Workspace| {
            crate::relpath::relative_slash(&self.root, ws.root())
        };
        found.sort_by(|a, b| path_of(a).cmp(&path_of(b)));
        // `name` sorts by what the user READS, which is not the folder name a
        // workspace was created under (2026-08-06). Anything else — including
        // the default — is the hand-dragged order; fixed workspaces are not
        // named in it and simply keep their place.
        if self.config.workspaces_sort == "name" {
            found.sort_by(|a, b| {
                a.display_name()
                    .to_lowercase()
                    .cmp(&b.display_name().to_lowercase())
            });
        } else {
            let keys: Vec<String> = found.iter().map(path_of).collect();
            let mut zipped: Vec<(String, crate::workspace::Workspace)> =
                keys.into_iter().zip(found.drain(..)).collect();
            self.config
                .apply_order("workspaces", &mut zipped, |entry| &entry.0);
            found = zipped.into_iter().map(|(_, ws)| ws).collect();
        }
        Ok(found)
    }

    /// Every workspace's root-relative path, mapped to the name the user
    /// reads. The one place that answers "what is this address called?" —
    /// the frontend used to derive it from the path, which put the folder on
    /// screen the moment the fixed folders gained their `jott.` prefix.
    fn workspace_labels(&self) -> Result<std::collections::HashMap<String, String>> {
        Ok(self
            .workspaces()?
            .into_iter()
            .map(|ws| {
                let path = crate::relpath::relative_slash(&self.root, ws.root());
                // The label is the workspace's READABLE ADDRESS, not just its
                // name (user call, 2026-08-13): `Design/Tasks` for one inside a
                // group, `Mercado` for a loose one. Two workspaces called Tasks
                // in two different groups are a normal thing to have, and named
                // alone they were the same word twice in the same picker.
                //
                // Building it from the path costs nothing now that a group's
                // name IS its folder — there is no second name to look up. Only
                // the leaf can differ from its folder, and only for the app's
                // own `jott.*` workspaces, so only the leaf is substituted.
                let mut parts: Vec<&str> = path.split('/').collect();
                if let Some(last) = parts.last_mut() {
                    *last = ws.display_name();
                }
                (path.clone(), parts.join("/"))
            })
            .collect())
    }

    /// Everything in the notebook that matches `query` — tasks and notes, kept
    /// as two answers (see [`crate::search`] for why).
    ///
    /// Reads through `open_list`, never `tasks_in`: typing into a search box
    /// must not rewrite a single file. An empty query finds nothing.
    pub fn search(&self, query: &str, limit: usize) -> Result<SearchResults> {
        let needle = crate::search::needle(query);
        let mut results = SearchResults::default();
        if needle.is_empty() {
            return Ok(results);
        }

        let labels = self.workspace_labels()?;
        let label_of = |prefix: &String| labels.get(prefix).cloned().unwrap_or_else(|| prefix.clone());

        for (prefix, folder) in self.task_folders()? {
            let workspace = label_of(&prefix);
            for name in folder.list_names()? {
                let path = format!("{prefix}/{name}.md");
                for task in self.open_list(&path)?.tasks() {
                    let Some(snippet) = crate::search::task_match(task, &needle) else {
                        continue;
                    };
                    if results.tasks.len() >= limit {
                        results.truncated = true;
                        break;
                    }
                    results.tasks.push(SearchHit {
                        kind: HitKind::Task,
                        path: path.clone(),
                        folder: String::new(),
                        id: task.id.clone(),
                        title: task.text.clone(),
                        snippet,
                        workspace: workspace.clone(),
                        container: name.clone(),
                        done: task.done,
                    });
                }
            }
        }
        // Open tasks first: a search is nearly always about what is still to
        // do. Within each half the walk order (workspace, then list) stands.
        results.tasks.sort_by_key(|hit| hit.done);

        for (prefix, folder) in self.note_folders()? {
            let workspace = label_of(&prefix);
            for entry in folder.search(&needle)? {
                if results.notes.len() >= limit {
                    results.truncated = true;
                    break;
                }
                // The title already matching is the match; otherwise the body
                // did, and the hit has to show where.
                let snippet = if crate::search::contains(&entry.title, &needle) {
                    String::new()
                } else {
                    crate::search::snippet_around(&folder.read(&entry.path)?.body, &needle)
                };
                results.notes.push(SearchHit {
                    kind: HitKind::Note,
                    path: entry.path,
                    folder: prefix.clone(),
                    id: None,
                    title: entry.title,
                    snippet,
                    workspace: workspace.clone(),
                    container: entry.folder,
                    done: false,
                });
            }
        }

        Ok(results)
    }

    /// Collects the workspace subfolders directly inside `dir`.
    fn collect_workspaces(
        &self,
        dir: &std::path::Path,
        out: &mut Vec<crate::workspace::Workspace>,
    ) -> Result<()> {
        for path in
            crate::workspace::marker_dirs(dir, crate::workspace::WORKSPACE_CONFIG_FILE)?
        {
            out.push(crate::workspace::Workspace::open(path)?);
        }
        Ok(())
    }

    /// The absolute directory of every group, at any depth.
    ///
    /// Groups nest (2026-08-11): a group is a folder carrying a `.group.json`,
    /// inside the root or inside another group. The walk goes down from the
    /// root through the groups it finds — a workspace's own subfolders are its
    /// content and are never entered.
    fn group_dirs(&self) -> Result<Vec<PathBuf>> {
        let mut found = Vec::new();
        let mut pending = vec![self.root.clone()];
        while let Some(dir) = pending.pop() {
            for child in
                crate::workspace::marker_dirs(&dir, crate::workspace::GROUP_CONFIG_FILE)?
            {
                pending.push(child.clone());
                found.push(child);
            }
        }
        found.sort();
        Ok(found)
    }

    /// The groups of the notebook, each with the group it sits in (if any) and
    /// the **root-relative paths** of the workspaces it holds directly — a
    /// workspace in a child group belongs to that child, not to this one.
    ///
    /// Paths, not leaf names, since 2026-08-13: two groups may each hold a
    /// `Tasks/`, and by leaf they were indistinguishable.
    ///
    /// The members come out in the notebook's own workspace order, not
    /// alphabetically: the sidebar reads a group's place off its members, and
    /// sorting them here would quietly discard the order the user dragged
    /// (user report, 2026-08-11).
    pub fn groups(&self) -> Result<Vec<crate::workspace::GroupEntry>> {
        let ordered = self.workspaces()?;
        let mut groups = Vec::new();
        for dir in self.group_dirs()? {
            let folder = crate::relpath::relative_slash(&self.root, &dir);
            let config = crate::workspace::WorkspaceConfig::load(
                dir.join(crate::workspace::GROUP_CONFIG_FILE),
            );
            let workspaces: Vec<String> = ordered
                .iter()
                .filter(|ws| ws.root().parent() == Some(dir.as_path()))
                .map(|ws| crate::relpath::relative_slash(&self.root, ws.root()))
                .collect();
            groups.push(crate::workspace::GroupEntry {
                folder,
                parent: self.parent_group_of(&dir),
                config,
                workspaces,
            });
        }
        groups.sort_by(|a, b| a.folder.cmp(&b.folder));
        Ok(groups)
    }

    /// Records the manual order for a namespace and writes the config. The
    /// single door the sidebar's drag goes through, for workspaces and lists
    /// alike (`"workspaces"`, `"lists:<folder>"`).
    pub fn set_order(&mut self, namespace: &str, names: Vec<String>) -> Result<()> {
        let mut config = self.config.clone();
        config.set_order(namespace, names);
        self.set_config(config)
    }

    /// Starts watching this notebook for changes made outside the app.
    pub fn watch(&self) -> Result<crate::watcher::NotebookWatcher> {
        crate::watcher::NotebookWatcher::start(&self.root)
    }

    fn rollover_mode(&self, period: Period) -> RolloverMode {
        match period {
            Period::Day => self.config.rollover.daily.mode,
            Period::Week => self.config.rollover.weekly.mode,
        }
    }

    /// Opens a state file with the rollover already applied.
    ///
    /// Every read goes through here, so a notebook that sat closed for a week
    /// is up to date the moment anything looks at it — the app never has to
    /// remember to roll over first.
    pub fn open_state(&self, period: Period) -> Result<StateFile> {
        let current = self.current_period_date(period);
        let mut file = StateFile::load(self.state_path(period), current);

        let rolled = rollover::apply(&mut file.state, current, self.rollover_mode(period));
        if rolled.changed() && !self.is_read_only() {
            file.save()?;
        }
        Ok(file)
    }

    /// Applies `mutate` to **both** period states, saving the ones that
    /// changed.
    ///
    /// Day and Week are always updated together — completing, deleting,
    /// renaming or removing a list has to reach both, or a reference to a task
    /// that moved renders as a ghost row in one of the two screens. Four
    /// callers wrote this loop out; the next one gets it right by construction.
    fn update_states(&self, mutate: impl Fn(&mut crate::state::PeriodState) -> bool) -> Result<()> {
        for period in [Period::Day, Period::Week] {
            let mut file = self.open_state(period)?;
            if mutate(&mut file.state) {
                file.save()?;
            }
        }
        Ok(())
    }

    /// Pulls an existing task into Today or This Week.
    pub fn pull_into(&self, period: Period, path: &str, id: &str) -> Result<bool> {
        self.ensure_writable()?;
        // Fail before writing the state if the task is not really there —
        // a reference to a missing task shows up as a ghost row in the UI.
        let source = self.open_list(path)?;
        if source.find(id).is_none() {
            return Err(Error::TaskNotFound(id.to_string()));
        }

        let mut file = self.open_state(period)?;
        if !file.state.add(path, id) {
            return Ok(false);
        }
        file.save()?;
        Ok(true)
    }

    /// Removes a task from Today or This Week. The task itself is untouched.
    pub fn remove_from(&self, period: Period, path: &str, id: &str) -> Result<bool> {
        self.ensure_writable()?;
        let mut file = self.open_state(period)?;
        if !file.state.remove(path, id) {
            return Ok(false);
        }
        file.save()?;
        Ok(true)
    }

    /// Creates a task straight from Today or This Week.
    ///
    /// The task is written to the Inbox — Day and Week never store content of
    /// their own, they only point at tasks that live in a real list (spec 3).
    pub fn add_task_in_period(&self, period: Period, text: impl Into<String>) -> Result<String> {
        self.ensure_writable()?;
        let mut inbox = self.inbox()?;

        // This one earns an id immediately: the state is about to reference
        // it, and a reference needs something stable to point at.
        let position = inbox.add(Self::stamped_task(text));
        let id = inbox
            .ensure_id_at(position)
            .expect("the task was just added at this position");
        inbox.save()?;

        let mut file = self.open_state(period)?;
        file.state.add(Self::inbox_path(), &id);
        file.save()?;
        Ok(id)
    }

    /// The tasks actually pulled into a period, in the order they were pulled.
    ///
    /// A reference whose task no longer exists (deleted in another editor) is
    /// skipped instead of failing: the notebook is shared with other tools, so
    /// a stale reference is a normal state, not corruption.
    pub fn period_tasks(&self, period: Period) -> Result<Vec<ListedTask>> {
        let state = self.open_state(period)?.state;
        let mut out = Vec::new();

        for reference in &state.items {
            let Ok(list) = self.open_list(&reference.path) else {
                continue;
            };
            if let Some(task) = list.find(&reference.id) {
                out.push(ListedTask {
                    path: reference.path.clone(),
                    task: task.clone(),
                });
            }
        }

        // A task with a date joins the period on its own (2026-08-14), unless
        // the user switched that off. Added on READ, never written to the
        // state: un-dating a task takes it back out, the turn of the day has
        // nothing to clean up, and what the user pulled by hand stays exactly
        // as pulled.
        if self.config.dated_tasks_join_period {
            for candidate in self.tasks_due_in(period)? {
                let already = out.iter().any(|listed| {
                    listed.path == candidate.path
                        && match (listed.task.id.as_deref(), candidate.task.id.as_deref()) {
                            (Some(a), Some(b)) => a == b,
                            // An id is handed out only when something needs to
                            // address the task, so two id-less tasks are the
                            // same one when their text is.
                            _ => listed.task.text == candidate.task.text,
                        }
                });
                if !already {
                    out.push(candidate);
                }
            }
        }

        Ok(out)
    }

    /// Open tasks whose due date falls inside `period` — today for the Day,
    /// the current week for the Week (a date earlier than either counts too:
    /// overdue is still due).
    fn tasks_due_in(&self, period: Period) -> Result<Vec<ListedTask>> {
        let last_day = match period {
            Period::Day => self.today(),
            Period::Week => self.current_week() + chrono::Duration::days(6),
        };

        let mut out = Vec::new();
        for (prefix, folder) in self.task_folders()? {
            for name in folder.list_names()? {
                // Completed lists are where finished tasks go; a date on one of
                // them is history, not a plan.
                if name == COMPLETED_LIST {
                    continue;
                }
                let path = format!("{prefix}/{name}.md");
                for task in self.open_list(&path)?.tasks() {
                    if task.done {
                        continue;
                    }
                    if task.due.is_some_and(|due| due <= last_day) {
                        out.push(ListedTask {
                            path: path.clone(),
                            task: task.clone(),
                        });
                    }
                }
            }
        }
        Ok(out)
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

    /// How the sidebar arranges workspaces: `"name"` or the dragged order.
    pub fn workspaces_sort(&self) -> &str {
        &self.config.workspaces_sort
    }

    /// Sets it. Anything but `"name"` means the hand-dragged order, which is
    /// what an untouched notebook already does.
    pub fn set_workspaces_sort(&mut self, sort: &str) -> Result<()> {
        self.ensure_writable()?;
        let mut config = self.config.clone();
        config.workspaces_sort = if sort == "name" { sort.to_string() } else { String::new() };
        self.set_config(config)
    }

    /// How the Day or the Week is arranged, if the user chose something.
    ///
    /// A period is not a folder, so there is no config file of its own to keep this in;
    /// it lives with the notebook, beside the manual `order` (2026-08-06).
    pub fn period_sort(&self, period: Period) -> Option<&str> {
        self.config.period_sort.get(period.key()).map(String::as_str)
    }

    /// Sets that arrangement. `None` goes back to the order things were pulled
    /// in, which is the state file's own order.
    pub fn set_period_sort(&mut self, period: Period, sort: Option<&str>) -> Result<()> {
        self.ensure_writable()?;
        let mut config = self.config.clone();
        match sort {
            Some(sort) if !sort.is_empty() => {
                config.period_sort.insert(period.key().to_string(), sort.to_string());
            }
            _ => {
                config.period_sort.remove(period.key());
            }
        }
        self.set_config(config)
    }

    /// Rearranges the period to match `refs` — the order the user just dragged.
    ///
    /// The state file IS the day's list, so a hand-made order belongs in it
    /// rather than mirrored in the config: there is nothing to fall out of step
    /// with. A reference the caller did not mention keeps its place at the end,
    /// so a list that changed under the drag loses nothing.
    pub fn set_period_order(&self, period: Period, refs: &[TaskRef]) -> Result<()> {
        self.ensure_writable()?;
        let mut file = self.open_state(period)?;
        let rank = |item: &TaskRef| refs.iter().position(|r| r == item);
        file.state.items.sort_by(|a, b| match (rank(a), rank(b)) {
            (Some(x), Some(y)) => x.cmp(&y),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            // Stable, so anything unmentioned keeps the order it had.
            (None, None) => std::cmp::Ordering::Equal,
        });
        file.save()
    }

    /// Whether a task counts as urgent right now.
    ///
    /// Two sources with equal weight (spec 3.2): the `#urgent` tag the user
    /// wrote, and a date that is today or already past. The date half can be
    /// switched off for people who do not want the interface flagging
    /// deadlines on its own.
    pub fn is_urgent(&self, task: &Task) -> bool {
        if task.is_marked_urgent() {
            return true;
        }
        if !self.config.auto_urgent_by_date {
            return false;
        }
        task.due.is_some_and(|due| due <= self.today())
    }

    /// What to offer pulling into a period, grouped and in display order.
    ///
    /// Nothing here *selects* a task — the day stays a deliberate choice.
    /// Dates only change what is offered first.
    pub fn grouped_suggestions(&self, period: Period) -> Result<Vec<Suggestion>> {
        let today = self.today();
        let soon = today + chrono::Duration::days(SOON_WINDOW_DAYS);

        let in_week: std::collections::HashSet<(String, String)> = if period == Period::Day {
            self.open_state(Period::Week)?
                .state
                .items
                .iter()
                .map(|r| (r.path.clone(), r.id.clone()))
                .collect()
        } else {
            Default::default()
        };

        let labels = self.workspace_labels()?;
        let workspace_of = |path: &str| -> String {
            path.rsplit_once('/')
                .and_then(|(dir, _)| labels.get(dir).cloned())
                .unwrap_or_default()
        };

        let mut suggestions: Vec<Suggestion> = self
            .suggestions_for(period)?
            .into_iter()
            .map(|entry| {
                let group = if self.is_urgent(&entry.task) {
                    SuggestionGroup::Urgent
                } else if entry.task.due.is_some_and(|due| due <= soon) {
                    SuggestionGroup::Soon
                } else if entry
                    .task
                    .id
                    .as_ref()
                    .is_some_and(|id| in_week.contains(&(entry.path.clone(), id.clone())))
                {
                    SuggestionGroup::ThisWeek
                } else {
                    SuggestionGroup::Lists
                };
                Suggestion {
                    workspace: workspace_of(&entry.path),
                    path: entry.path,
                    task: entry.task,
                    group,
                }
            })
            .collect();

        // Stable sort: inside a group the original order is kept, which is the
        // order of the lists on disk — the order the user arranged.
        suggestions.sort_by_key(|s| s.group);
        Ok(suggestions)
    }

    /// What to offer pulling into a period, in the order the UI shows it.
    ///
    /// For the day, tasks already chosen for the week come first: they are
    /// what the user decided mattered this week, so they are the best
    /// candidates for today. Everything else in the lists follows.
    ///
    /// Anything already pulled into the period is left out, and so are
    /// completed tasks and the `Completas` list itself.
    pub fn suggestions_for(&self, period: Period) -> Result<Vec<ListedTask>> {
        // What the period ALREADY shows — not just what was pulled into its
        // state. Since 2026-08-14 a dated task joins the period on its own, and
        // suggesting something the user is already looking at is noise.
        let showing = self.period_tasks(period)?;
        let mut out: Vec<ListedTask> = Vec::new();

        let is_showing = |candidate: &ListedTask| {
            showing.iter().any(|listed| {
                listed.path == candidate.path
                    && match (listed.task.id.as_deref(), candidate.task.id.as_deref()) {
                        (Some(a), Some(b)) => a == b,
                        // Most tasks have no id — one is handed out only when
                        // something needs to address the task — so two id-less
                        // tasks in the same list are the same one when their
                        // text is.
                        _ => listed.task.text == candidate.task.text,
                    }
            })
        };

        let push = |candidate: ListedTask, out: &mut Vec<ListedTask>| {
            if candidate.task.done || is_showing(&candidate) {
                return;
            }
            if let Some(id) = candidate.task.id.as_deref() {
                let already = out
                    .iter()
                    .any(|t| t.path == candidate.path && t.task.id.as_deref() == Some(id));
                if already {
                    return;
                }
            }
            out.push(candidate);
        };

        // The week feeds the day, but nothing feeds the week except the lists.
        if period == Period::Day {
            for candidate in self.period_tasks(Period::Week)? {
                push(candidate, &mut out);
            }
        }

        for entry in self.lists()? {
            if entry.name == COMPLETED_LIST {
                continue;
            }
            for task in self.tasks_in(&entry.path)? {
                push(
                    ListedTask {
                        path: entry.path.clone(),
                        task,
                    },
                    &mut out,
                );
            }
        }
        Ok(out)
    }

    /// A fresh task stamped with today's civil date — every task the app
    /// creates goes through here, so the by-creation ordering always has a
    /// date to read (2026-08-04).
    fn stamped_task(text: impl Into<String>) -> Task {
        let mut task = Task::new(text);
        task.created = Some(crate::clock::civil_today());
        task
    }

    /// Creates a task in `path` and returns its **position**, not an id — a
    /// new task has no id until something needs to address it.
    pub fn create_task(&self, path: &str, text: impl Into<String>) -> Result<usize> {
        self.ensure_writable()?;
        let mut list = self.open_list(path)?;
        let position = list.add(Self::stamped_task(text));
        list.save()?;
        Ok(position)
    }

    // ------------------------------------------------------- complete / undo

    /// Completes a task: it moves to the **same folder's** Completed with its
    /// origin recorded, and stops being pulled into Today and This Week.
    ///
    /// A repeating task leaves its next occurrence behind in the same list,
    /// so finishing it is also what schedules it — there is no scheduler.
    /// Every occurrence is its own item: the spawn is born **with an id**, and
    /// the completed copy records it as `spawned:<id>` — the chain's memory.
    /// Re-completing a restored occurrence finds its spawn still alive and
    /// does not generate another; only the newest occurrence (which never
    /// spawned) schedules the next (decision with the user, 2026-08-05,
    /// replacing the delete-the-spawn undo of 2026-08-04 that duplicated the
    /// chain whenever it had already moved on).
    pub fn complete_task(&self, path: &str, id: &str) -> Result<Task> {
        self.ensure_writable()?;
        let completed = Self::completed_path_of(path)?;

        let mut source = self.open_list(path)?;
        let planned = source
            .find(id)
            .cloned()
            .map(|task| (crate::recurrence::respawn(&task), task));
        if let Some((Some(next), task)) = planned {
            match self.find_spawned(&source, &completed, &task, &next) {
                // The chain already has this occurrence: just (re)point at it.
                Some(existing) => {
                    if existing != task.spawned {
                        if let Ok(t) = source.task_mut(id) {
                            t.spawned = existing;
                        }
                        source.save()?;
                    }
                }
                // Schedule it, id first — the pointer needs a target.
                None => {
                    let position = source.add(next);
                    let spawn_id = source.ensure_id_at(position);
                    if let Ok(t) = source.task_mut(id) {
                        t.spawned = spawn_id;
                    }
                    source.save()?;
                }
            }
        }

        // The task moves; the Day and Week references FOLLOW it into the
        // Completed (done inside `transfer`, for every move alike). Removing
        // them here is what used to make a task ticked in Today disappear from
        // the screen instead of sliding into its "Completed N" section.
        let task = self.transfer(id, path, &completed, OriginAction::Record, Some(true))?;

        // Keep the aggregated Completed index in step (best effort — a failed
        // index write must not fail the completion itself).
        let _ = self.refresh_completed_index();
        Ok(task)
    }

    /// Whether the chain already carries the occurrence `task` would generate
    /// on completion. `Some(id)` means it exists (and `id` is what `spawned:`
    /// should point at — `None` inside when the twin has no id to record);
    /// a `None` return means it truly is missing and should be generated.
    ///
    /// The `spawned:` pointer is authoritative while it resolves — in the
    /// task's own list or its Completed. A dangling pointer (the spawn was
    /// deleted) falls through to generating again. Tasks completed before the
    /// pointer existed fall back to an exact twin of the computed occurrence:
    /// same text, repeat and due date, open in the list or already completed.
    fn find_spawned(
        &self,
        source: &TaskList,
        completed_path: &str,
        task: &Task,
        next: &Task,
    ) -> Option<Option<String>> {
        let done_list = self.open_list(completed_path).ok();

        if let Some(sid) = &task.spawned {
            let alive = source.find(sid).is_some()
                || done_list
                    .as_ref()
                    .is_some_and(|done| done.find(sid).is_some());
            if alive {
                return Some(Some(sid.clone()));
            }
        }

        let is_twin =
            |t: &&Task| t.text == next.text && t.repeat == next.repeat && t.due == next.due;
        if let Some(twin) = source.tasks().filter(|t| !t.done).find(is_twin) {
            return Some(twin.id.clone());
        }
        if let Some(twin) = done_list.as_ref().and_then(|done| done.tasks().find(is_twin)) {
            return Some(twin.id.clone());
        }
        None
    }

    /// Un-completes a task, sending it back to the list it came from.
    ///
    /// `completed` is the address of the Completed list holding the task —
    /// with one Completed per widget (spec 3.5), the id alone cannot say
    /// which folder to undo in. The origin is a bare name resolved **inside
    /// that same folder**; a task with no usable origin — hand-written, or
    /// pointing at a name that is no longer valid — lands in the folder's
    /// Inbox rather than nowhere. The origin list is recreated when it no
    /// longer exists.
    pub fn uncomplete_task(&self, completed: &str, id: &str) -> Result<Task> {
        self.ensure_writable()?;
        let (folder, _) = self.resolve_list(completed)?;
        let list = self.open_list(completed)?;
        let task = list
            .find(id)
            .ok_or_else(|| Error::TaskNotFound(id.to_string()))?;

        let target_name = match task.origin.as_deref() {
            Some(origin) if folder.list_path(origin).is_ok() => origin.to_string(),
            // No usable origin: the folder's own list, never nowhere.
            _ => folder.main_list_name(),
        };
        let (dir, _) = split_list_path(completed)?;
        let target = format!("{dir}/{target_name}.md");

        // The restore keeps `spawned:` — the occurrence this completion
        // generated stays where it is (every occurrence is its own item), and
        // the pointer is exactly what stops a re-completion from generating
        // it again. Deleting the spawn here was the 2026-08-04 approach, and
        // it duplicated the chain whenever the spawn had already moved on.
        let task = self.transfer(id, completed, &target, OriginAction::Clear, Some(false))?;

        let _ = self.refresh_completed_index();
        Ok(task)
    }

    // -------------------------------------------------------- completed index

    /// Every completed task across all tasks widgets, aggregated for the
    /// Completed screen. The per-widget `Completed.md` files are the source of
    /// truth; this just gathers them (spec 3.5 — a reconstructible index).
    pub fn completed_all(&self) -> Result<Vec<ListedTask>> {
        let mut out = Vec::new();
        for (prefix, folder) in self.task_folders()? {
            let path = format!("{prefix}/{COMPLETED_LIST}.md");
            if let Ok(list) = folder.open_list(COMPLETED_LIST) {
                for task in list.tasks() {
                    out.push(ListedTask {
                        path: path.clone(),
                        task: task.clone(),
                    });
                }
            }
        }
        Ok(out)
    }

    /// Rewrites `.jott/completed.json` from the current `Completed.md` files —
    /// the index the Completed screen reads. Reconstructible: this *is* the
    /// rebuild, run on open and after each completion change.
    fn refresh_completed_index(&self) -> Result<()> {
        let items: Vec<serde_json::Value> = self
            .completed_all()?
            .into_iter()
            .filter_map(|listed| {
                listed
                    .task
                    .id
                    .as_ref()
                    .map(|id| serde_json::json!({ "list": listed.path, "id": id }))
            })
            .collect();
        let doc = serde_json::json!({ "schemaVersion": 1, "items": items });
        crate::fsio::write_atomically(
            &self.config_dir().join("completed.json"),
            crate::fsio::pretty_json(&doc).as_bytes(),
        )
    }

    // ------------------------------------------------------------------ trash

    /// The notebook's own trash, rooted at `.jott/trash/`.
    fn trash(&self) -> crate::trash::Trash {
        crate::trash::Trash::open(self.config_dir().join("trash"))
    }

    /// Moves a file or folder into the notebook's trash, recording its origin.
    /// The single door every file/folder deletion goes through now — no more
    /// OS trash (which Android lacks and a synced folder cannot carry).
    fn trash_path(&self, abs: &std::path::Path) -> Result<()> {
        let origin = crate::relpath::relative_slash(&self.root, abs);
        self.trash()
            .trash_file(abs, &origin, crate::clock::civil_today())?;
        Ok(())
    }

    /// The trashed items awaiting restore or expiry, newest first.
    pub fn trash_entries(&self) -> Vec<crate::trash::TrashEntry> {
        let mut entries = self.trash().entries().to_vec();
        entries.reverse();
        entries
    }

    /// Clears items whose retention window elapsed. Run on open.
    pub fn reap_trash(&self) -> Result<()> {
        self.trash()
            .reap(self.config.trash_retention_days, crate::clock::civil_today())
    }

    /// Brings a trashed item back to where it came from. A collision at the
    /// origin is suffixed, never overwritten.
    pub fn restore_from_trash(&self, id: &str) -> Result<()> {
        self.ensure_writable()?;
        let mut trash = self.trash();
        let Some(entry) = trash.take(id) else {
            return Err(Error::TaskNotFound(id.to_string()));
        };
        match entry.kind {
            crate::trash::TrashKind::File => {
                let stored = entry.stored.clone().unwrap_or_default();
                let source = trash.stored_path(&stored);
                let dest = self.root.join(&entry.origin);
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent).ctx(parent)?;
                }
                let name = dest
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "restored".to_string());
                let final_dest = if dest.exists() {
                    crate::fsio::free_name(dest.parent().unwrap_or(&self.root), &name)
                } else {
                    dest
                };
                std::fs::rename(&source, &final_dest).ctx(&final_dest)?;
            }
            crate::trash::TrashKind::Task => {
                // A deleted task goes back to its origin list. The stored lines
                // are already valid Markdown (the task as it was rendered), so
                // they are appended raw — `add_text` would wrap `- [ ] foo` as
                // a task whose *text* is `- [ ] foo`. Position-exact restore is
                // a later refinement; recover it to the list end.
                if let Some(lines) = &entry.content {
                    let (folder, name) = self.resolve_list(&entry.origin)?;
                    let path = folder.list_path(&name)?;
                    let mut text = std::fs::read_to_string(&path).unwrap_or_default();
                    if !text.is_empty() && !text.ends_with('\n') {
                        text.push('\n');
                    }
                    for line in lines {
                        text.push_str(line);
                        text.push('\n');
                    }
                    crate::fsio::write_atomically(&path, text.as_bytes())?;
                }
            }
        }
        let _ = self.refresh_completed_index();
        Ok(())
    }

    /// Deletes a single task, sending its lines to the trash (never destroyed).
    pub fn delete_task(&self, path: &str, id: &str) -> Result<()> {
        self.ensure_writable()?;
        let mut list = self.open_list(path)?;
        let index = list
            .lines()
            .iter()
            .position(|line| matches!(line, crate::list::Line::Task(t) if t.id.as_deref() == Some(id)))
            .unwrap_or(0);
        let task = list.remove(id)?;
        let label = task.text.clone();
        let content = task.render();
        list.save()?;
        self.trash()
            .trash_task(path, index, content, &label, crate::clock::civil_today())?;
        // A reference to a gone task would render as a ghost row.
        self.update_states(|state| state.remove(path, id))
    }

    /// Files away completed tasks older than `completedRetentionDays`, in every
    /// widget's `Completed.md`. Run on open, beside the trash reaper.
    ///
    /// Nothing is destroyed — each one goes to `.jott/trash/`, where the trash
    /// retention then applies, so a task is always recoverable for a while
    /// after it leaves the screen. `0` days means never (2026-08-06).
    ///
    /// A task with no `completed:` stamp is left alone: it was written by hand
    /// or by an older build, and the app has no idea how old it is.
    pub fn reap_completed(&self) -> Result<usize> {
        self.ensure_writable()?;
        let days = self.config.completed_retention_days;
        if days <= 0 {
            return Ok(0);
        }
        let cutoff = crate::clock::civil_today() - chrono::Duration::days(days);

        let mut reaped = 0;
        for (prefix, _) in self.task_folders()? {
            let path = format!("{prefix}/{COMPLETED_LIST}.md");
            let Ok(list) = self.open_list(&path) else {
                continue;
            };
            let expired: Vec<String> = list
                .tasks()
                .filter(|task| matches!(task.completed, Some(day) if day < cutoff))
                .filter_map(|task| task.id.clone())
                .collect();
            for id in expired {
                // Through `delete_task`, so the trash entry, the reference
                // cleanup and the atomic write are the same ones a hand
                // deletion goes through.
                self.delete_task(&path, &id)?;
                reaped += 1;
            }
        }
        if reaped > 0 {
            let _ = self.refresh_completed_index();
        }
        Ok(reaped)
    }

    /// Deletes a note (a file inside a notes widget), sending it to the trash.
    pub fn delete_note(&self, folder: &str, relative: &str) -> Result<()> {
        self.ensure_writable()?;
        let note_folder = self.note_folder(folder)?;
        let abs = note_folder.note_path(relative)?;
        self.trash_path(&abs)
    }

    // ------------------------------------------------------------------- tags

    fn tags_path(&self) -> PathBuf {
        self.config_dir().join("tags.json")
    }

    /// The user's tag catalogue (names + colours).
    pub fn tags(&self) -> crate::tags::Tags {
        crate::tags::Tags::load(self.tags_path())
    }

    /// Sets (or creates) a tag's colour; an empty colour clears it.
    pub fn set_tag(&self, name: &str, color: Option<String>) -> Result<()> {
        self.ensure_writable()?;
        let mut tags = self.tags();
        tags.set(name, color);
        tags.save(self.tags_path())
    }

    /// Forgets a tag's colour (the `#word` text in tasks stays).
    pub fn remove_tag(&self, name: &str) -> Result<()> {
        self.ensure_writable()?;
        let mut tags = self.tags();
        tags.remove(name);
        tags.save(self.tags_path())
    }
}
