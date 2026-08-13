//! Jott core — all business logic lives here.
//!
//! Hard rule: this crate must NEVER depend on Tauri. If a function only works
//! by calling into Tauri, it belongs in `src-tauri` instead. Keeping the rule
//! is what would let a different frontend reuse all of this untouched.
//!
//! Reading and writing the notebook is done. Day/week rules come next.

pub mod clock;
pub mod conflict;
pub mod config;
pub mod error;
pub mod folder;
pub mod fsio;
pub mod id;
pub mod jsondoc;
pub mod list;
pub mod note;
pub mod notebook;
pub mod notefolder;
pub mod recurrence;
pub mod relpath;
pub mod rollover;
pub mod state;
pub mod tags;
pub mod task;
pub mod trash;
pub mod watcher;
pub mod workspace;

pub use clock::{TurnOffset, WeekStart};
pub use config::{Config, Rollover, RolloverMode};
pub use conflict::Conflict;
pub use error::{Error, Result};
pub use list::{Line, TaskList};
pub use notebook::{ListedTask, Notebook, OriginAction};
pub use state::{Period, PeriodState, StateFile, TaskRef};
pub use watcher::{Change, NotebookWatcher};
pub use note::Note;
pub use notefolder::{NoteEntry, NoteFolder};
pub use task::Task;
pub use workspace::{Group, GroupEntry, Workspace, WorkspaceConfig};

/// Name of the hidden config directory inside a notebook.
/// Equivalent to Obsidian's `.obsidian`.
pub const NOTEBOOK_CONFIG_DIR: &str = ".jott";

// The three workspaces the app creates and recreates carry a `jott.` prefix
// (2026-08-11). They are the app's own folders, and saying so in the name is
// what frees the words a user actually wants — a workspace called "Tasks" or
// "Notes" is now theirs to make. No leading dot: these are content folders,
// and hiding the user's own tasks would be a strange way to own them.

/// Directory of the fixed tasks workspace.
pub const TASKS_DIR: &str = "jott.tasks";

/// Directory of the fixed notes workspace.
pub const NOTES_DIR: &str = "jott.notes";

/// Directory of the fixed Home workspace (views only, no files of its own).
pub const HOME_DIR: &str = "jott.home";

// A tasks workspace's two files have FIXED names (user call, 2026-08-13).
//
// They used to be named after the folder — `Work/` held `Work.md` — which
// made the file name a second copy of the workspace's name, and a copy drifts:
// renaming the workspace in the app left `Work.md` behind, and from then on
// the app showed one name and the disk another. There is no rename dance now
// and nothing to guess: the FOLDER names the workspace, the files never move.
//
// The cost, deliberately accepted: every tasks workspace has a `task-list.md`,
// so ten of them are ten identically-named files in an editor's tab bar or
// fuzzy finder — the folder is what tells them apart. The name is hyphenated
// and lowercase to read as the app's structure rather than as a title the user
// wrote.

/// The single list of a tasks workspace, in every one of them.
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
