//! Sync conflicts left behind by Syncthing.
//!
//! When two devices edit the same file before syncing, Syncthing does not
//! merge: it keeps one version and drops the other next to it, named
//! `Inbox.sync-conflict-20260720-143000-K3F7NLM.md`.
//!
//! Until now the app ignored those files, which meant two bad things at once:
//! the user only found out by opening the folder, and the leftover file showed
//! up in the app as a list named `Inbox.sync-conflict-...`.
//!
//! Scope on purpose: **detect and report**. Comparing or merging the two
//! versions is a separate problem, and guessing wrong there loses work.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// The marker Syncthing puts in the file name.
const MARKER: &str = ".sync-conflict-";

/// A conflicting copy of a file, and the file it belongs to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    /// The conflicting copy Syncthing wrote.
    pub path: PathBuf,
    /// Name of the list it belongs to (`Inbox`), when it is a task list.
    pub list: Option<String>,
    /// The file it conflicts with, if that file still exists.
    pub original: Option<PathBuf>,
    /// The copy's address, root-relative with `/` — what the interface hands
    /// back to `folder_of` to reveal it (2026-08-24). `describe` does not
    /// know the root; `Notebook::conflicts` fills it in.
    pub relative: Option<String>,
}

/// True when the file name looks like something a sync tool left behind.
///
/// Used to keep these files out of the list of lists — a conflict copy is not
/// a list the user created.
pub fn is_conflict_file(path: &Path) -> bool {
    crate::fsio::file_name_of(path).contains(MARKER)
}

/// Describes a conflict file: which list it belongs to and what it conflicts
/// with. Returns `None` when the path is not a conflict file.
pub fn describe(path: &Path) -> Option<Conflict> {
    let name = crate::fsio::file_name_of(path);
    let (original_stem, _) = name.split_once(MARKER)?;

    // `Inbox.sync-conflict-...md` belongs to `Inbox.md`, in the same folder.
    let original = path.parent().map(|dir| {
        let mut name = original_stem.to_string();
        if let Some(ext) = path.extension() {
            name.push('.');
            name.push_str(&ext.to_string_lossy());
        }
        dir.join(name)
    });

    let is_markdown = path.extension().is_some_and(|ext| ext == "md");
    Some(Conflict {
        list: is_markdown.then(|| original_stem.to_string()),
        original: original.filter(|p| p.exists()),
        relative: None,
        path: path.to_path_buf(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(name: &str) -> PathBuf {
        PathBuf::from("/notebook/Tasks").join(name)
    }

    #[test]
    fn recognizes_what_syncthing_writes() {
        assert!(is_conflict_file(&p(
            "Inbox.sync-conflict-20260720-143000-K3F7NLM.md"
        )));
    }

    #[test]
    fn leaves_normal_lists_alone() {
        for name in ["Inbox.md", "Compras.md", "Projeto X.md", "Completed.md"] {
            assert!(!is_conflict_file(&p(name)), "{name} is a normal list");
        }
    }

    #[test]
    fn a_list_named_after_the_marker_is_not_a_false_positive() {
        // Contrived, but a list really called "sync-conflict" must still work.
        assert!(!is_conflict_file(&p("sync-conflict.md")));
        assert!(!is_conflict_file(&p("meu sync conflict.md")));
    }

    #[test]
    fn describes_which_list_the_conflict_belongs_to() {
        let conflict = describe(&p("Inbox.sync-conflict-20260720-143000-K3F7NLM.md")).unwrap();

        assert_eq!(conflict.list.as_deref(), Some("Inbox"));
        // The original does not exist on this fake path, so it is reported as
        // missing rather than as a path that leads nowhere.
        assert_eq!(conflict.original, None);
    }

    #[test]
    fn a_list_name_with_dots_survives() {
        let conflict =
            describe(&p("Projeto v2.0.sync-conflict-20260720-143000-ABC.md")).unwrap();
        assert_eq!(conflict.list.as_deref(), Some("Projeto v2.0"));
    }

    #[test]
    fn a_conflict_on_a_non_markdown_file_has_no_list() {
        let conflict = describe(&PathBuf::from(
            "/notebook/.jott/daily-state.sync-conflict-20260720-143000-ABC.json",
        ))
        .unwrap();
        assert_eq!(conflict.list, None);
    }

    #[test]
    fn a_normal_file_is_not_described() {
        assert_eq!(describe(&p("Inbox.md")), None);
    }

    #[test]
    fn points_at_the_original_when_it_exists() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("Inbox.md");
        std::fs::write(&original, "- [ ] tarefa\n").unwrap();

        let conflict = describe(
            &dir.path()
                .join("Inbox.sync-conflict-20260720-143000-ABC.md"),
        )
        .unwrap();

        assert_eq!(conflict.original, Some(original));
    }
}
