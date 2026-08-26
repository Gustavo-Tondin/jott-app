//! Jott core — all business logic lives here.
//!
//! Hard rule: this crate must NEVER depend on Tauri. If a function only works
//! by calling into Tauri, it belongs in `src-tauri` instead. Keeping the rule
//! is what would let a different frontend reuse all of this untouched.
//!
//! Reading and writing the notebook is done. Day/week rules come next.

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
pub mod recurrence;
pub mod relpath;
pub mod reminders;
pub mod rollover;
pub mod search;
pub mod seen;
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

pub use age::{Band, Thresholds};
pub use assets::{AssetEntry, Assets, ASSETS_DIR};
pub use clock::{TurnOffset, WeekStart};
pub use config::{Config, Rollover, RolloverMode};
pub use conflict::Conflict;
pub use error::{Error, Result};
pub use history::History;
pub use list::{Line, TaskList};
pub use notebook::{
    ListedTask, NoteFolderEntry, Notebook, NotebookContents, NotebookSummary, OriginAction,
};
pub use search::{HitKind, SearchHit, SearchResults};
pub use seen::Seen;
pub use timeline::{Item as TimelineItem, Record as TimelineRecord};
pub use settings::{Display, DisplayPrefs, NotebookSettings};
pub use space::{FolderSettings, Group, GroupEntry, Space, SpaceConfig};
pub use state::{Period, PeriodState, StateFile, TaskRef};
pub use watcher::{Change, NotebookWatcher};
pub use note::{Banner, Note};
pub use notefolder::{NoteEntry, NoteFolder};
pub use task::{parse_datetime, render_datetime, Attachment, Task};

/// Name of the hidden config directory inside a notebook.
/// Equivalent to Obsidian's `.obsidian`.
pub const NOTEBOOK_CONFIG_DIR: &str = ".jott";

// The three spaces the app creates and recreates carry a `jott.` prefix
// (2026-08-11). They are the app's own folders, and saying so in the name is
// what frees the words a user actually wants — a space called "Tasks" or
// "Notes" is now theirs to make. No leading dot: these are content folders,
// and hiding the user's own tasks would be a strange way to own them.

/// Directory of the fixed tasks space.
pub const TASKS_DIR: &str = "jott.tasks";

/// Directory of the fixed notes space.
pub const NOTES_DIR: &str = "jott.notes";

/// Directory of the fixed Home space (views only, no files of its own).
pub const HOME_DIR: &str = "jott.home";

// A tasks space's two files have FIXED names (user call, 2026-08-13).
//
// They used to be named after the folder — `Work/` held `Work.md` — which
// made the file name a second copy of the space's name, and a copy drifts:
// renaming the space in the app left `Work.md` behind, and from then on
// the app showed one name and the disk another. There is no rename dance now
// and nothing to guess: the FOLDER names the space, the files never move.
//
// The cost, deliberately accepted: every tasks space has a `task-list.md`,
// so ten of them are ten identically-named files in an editor's tab bar or
// fuzzy finder — the folder is what tells them apart. The name is hyphenated
// and lowercase to read as the app's structure rather than as a title the user
// wrote.

/// The single list of a tasks space, in every one of them.
pub const MAIN_LIST: &str = "task-list";

/// List holding completed tasks, recreated whenever the notebook is opened.
pub const COMPLETED_LIST: &str = "completed";

/// The names these used to have, before the app settled on English in
/// 2026-07-20. Kept so [`notebook::Notebook::open`] can *recognize* a legacy
/// notebook and refuse it with a clear message — the pre-v1 policy is no
/// migrations (2026-07-21), and from v1 on that inverts permanently.
pub mod legacy {
    pub const TASKS_DIR: &str = "Tarefas";
    pub const NOTES_DIR: &str = "Notas";
    pub const COMPLETED_LIST: &str = "Completas";
}

/// The folders inside `.jott/` the app writes for ITSELF, and that neither
/// the watcher nor the history looks at.
///
/// Two folders, two different reasons, one consequence:
///
/// - `index/` is **derived**. Opening a note stamps it, so announcing it
///   would reload every screen each time a note is opened, and undoing a
///   rename would have to undo a bookkeeping entry nobody asked for.
/// - `timeline/` is **durable and append-only**. Nothing may ever rewrite a
///   line of it — least of all `Ctrl+Z`, which would quietly delete history
///   that is meant to outlive the session.
///
/// There is also a mechanical reason that bites either way: both hold files
/// the history watches by STAMP rather than by content (`*.bak`, `*.jsonl`),
/// and one stamp-only file appearing makes the whole action unrecordable —
/// measured 2026-08-26, when deleting a note quietly stopped being undoable.
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
        // Last changed 2026-07-20, when the app settled on English names.
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
