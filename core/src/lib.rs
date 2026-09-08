//! Jott core — all business logic lives here.
//!
//! Hard rule: this crate must NEVER depend on Tauri. If a function only works
//! by calling into Tauri, it belongs in `src-tauri` instead.

pub mod age;
pub mod assets;
pub mod browse;
pub mod clock;
pub mod conflict;
pub mod config;
pub mod desktop;
pub mod error;
pub mod folder;
pub mod fonts;
pub mod fsio;
pub mod history;
pub mod id;
pub mod jsondoc;
pub mod links;
pub mod list;
pub mod note;
pub mod notebook;
pub mod notefolder;
pub mod plan;
pub mod recurrence;
pub mod relpath;
pub mod reminders;
pub mod rollover;
pub mod search;
pub mod seen;
pub mod selfwrite;
pub mod settings;
pub mod space;
pub mod state;
pub mod tags;
pub mod task;
pub mod themes;
pub mod timeline;
pub mod trash;
pub mod version;
pub mod watcher;

pub use age::{Age, Band, Thresholds};
pub use assets::{AssetEntry, Assets, ASSETS_DIR};
pub use clock::WeekStart;
pub use config::{Config, Rollover, RolloverMode};
pub use conflict::Conflict;
pub use error::{Error, Result};
pub use history::History;
pub use list::{Line, TaskList};
pub use notebook::{
    ListedNote, ListedTask, NoteFolderEntry, Notebook, NotebookContents, NotebookSummary,
    OriginAction,
};
pub use search::{HitKind, SearchHit, SearchResults};
pub use seen::Seen;
pub use timeline::{Item as TimelineItem, Record as TimelineRecord};
pub use settings::{Display, DisplayPrefs, NotebookSettings};
pub use space::{FolderSettings, Group, GroupEntry, Space, SpaceConfig};
pub use plan::{Plan, PlanFile};
pub use state::{DayState, StateFile, TaskRef, TaskRefs};
pub use watcher::{Change, NotebookWatcher};
pub use note::{Banner, Note};
pub use notefolder::{NoteEntry, NoteFolder};
pub use task::{parse_datetime, render_datetime, Attachment, Task};

/// Name of the hidden config directory inside a notebook.
/// Equivalent to Obsidian's `.obsidian`.
pub const NOTEBOOK_CONFIG_DIR: &str = ".jott";

// The app's own spaces carry a `jott.` prefix, which frees "Tasks"/"Notes"
// for the user. No leading dot: they are content folders, never hidden.

/// Directory of the fixed tasks space.
pub const TASKS_DIR: &str = "jott.tasks";

/// Directory of the fixed notes space.
pub const NOTES_DIR: &str = "jott.notes";

/// Directory of the fixed Home space (views only, no files of its own).
pub const HOME_DIR: &str = "jott.home";

// A tasks space's two files have FIXED names: the FOLDER names the space,
// the files never move, so a rename cannot leave the file name behind.

/// The single list of a tasks space, in every one of them.
pub const MAIN_LIST: &str = "task-list";

/// List holding completed tasks, recreated whenever the notebook is opened.
pub const COMPLETED_LIST: &str = "completed";

/// The names a legacy notebook used. Kept so [`notebook::Notebook::open`]
/// can recognize one and refuse it clearly: no migrations before v1.
pub mod legacy {
    pub const TASKS_DIR: &str = "Tarefas";
    pub const NOTES_DIR: &str = "Notas";
    pub const COMPLETED_LIST: &str = "Completas";
}

/// The folders inside `.jott/` the app writes for ITSELF; the watcher and the
/// history skip them. `index/` is derived (announcing it would reload every
/// screen per note open); `timeline/` is append-only, and Ctrl+Z must never
/// rewrite it. Both also hold files the history watches by STAMP (`*.bak`,
/// `*.jsonl`), and one such file makes a whole action unrecordable.
pub const BOOKKEEPING_DIRS: [&str; 2] = [seen::INDEX_DIR, timeline::TIMELINE_DIR];

/// Version of this crate, exposed so the shell can report it.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notebook_layout_constants_match_the_spec() {
        // The notebook layout is part of the file format users depend on:
        // renaming any of these breaks every existing notebook, so changing
        // this test has to be a deliberate act with a migration attached.
        assert_eq!(NOTEBOOK_CONFIG_DIR, ".jott");
        assert_eq!(TASKS_DIR, "jott.tasks");
        assert_eq!(NOTES_DIR, "jott.notes");
        assert_eq!(HOME_DIR, "jott.home");
        assert_eq!(MAIN_LIST, "task-list");
        assert_eq!(COMPLETED_LIST, "completed");
        // The asset library is addressed from inside `.md` files
        // (`![](assets/x.png)`), so its name is part of the format too.
        assert_eq!(ASSETS_DIR, "assets");
        // The app's own folders are named so, and are NOT hidden: a leading
        // dot would take the user's tasks out of their own file manager.
        for dir in [TASKS_DIR, NOTES_DIR, HOME_DIR] {
            assert!(dir.starts_with("jott."), "{dir}");
            assert!(!dir.starts_with('.'), "{dir}");
        }
    }

    #[test]
    fn legacy_names_are_the_ones_we_migrate_from() {
        // These must never change: they recognize notebooks already on disk.
        assert_eq!(legacy::TASKS_DIR, "Tarefas");
        assert_eq!(legacy::NOTES_DIR, "Notas");
        assert_eq!(legacy::COMPLETED_LIST, "Completas");
    }

    #[test]
    fn version_is_not_empty() {
        assert!(!version().is_empty());
    }
}
