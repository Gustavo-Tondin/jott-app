//! The session history over a real notebook: what `Ctrl+Z` takes back, file
//! by file, and what it refuses.

use std::path::Path;

use jott_core::{History, Notebook, NOTES_DIR};

fn read(path: impl AsRef<Path>) -> String {
    std::fs::read_to_string(path).unwrap()
}

fn notebook() -> (tempfile::TempDir, Notebook, History) {
    let dir = tempfile::tempdir().unwrap();
    let nb = Notebook::init(dir.path()).unwrap();
    (dir, nb, History::new())
}

#[test]
fn deleting_a_note_is_undone_out_of_the_trash_and_redone_into_it() {
    let (dir, mut nb, mut history) = notebook();
    let path = nb.create_note(NOTES_DIR, "Inbox", "Idea").unwrap();
    let file = dir.path().join(NOTES_DIR).join(&path);
    nb.write_note(NOTES_DIR, &path, "the idea\n").unwrap();
    let original = read(&file);

    nb.record(&mut history, "delete_note", |nb| nb.delete_note(NOTES_DIR, &path))
        .unwrap();
    assert!(!file.exists());
    assert_eq!(nb.trash_entries().len(), 1);

    assert_eq!(nb.undo(&mut history).unwrap().as_deref(), Some("delete_note"));
    assert_eq!(read(&file), original);
    assert!(nb.trash_entries().is_empty(), "the trash line went with it");
    assert_eq!(history.undoable(), None);
    assert_eq!(history.redoable(), Some("delete_note"));

    assert_eq!(nb.redo(&mut history).unwrap().as_deref(), Some("delete_note"));
    assert!(!file.exists());
    assert_eq!(nb.trash_entries().len(), 1);
}

#[test]
fn a_reorder_is_undone_and_the_config_in_memory_follows() {
    let (_dir, mut nb, mut history) = notebook();
    nb.record(&mut history, "set_order", |nb| {
        nb.set_order("spaces", vec!["b".into(), "a".into()])
    })
    .unwrap();
    let mut items = vec!["a", "b"];
    nb.config().apply_order("spaces", &mut items, |s| s);
    assert_eq!(items, vec!["b", "a"]);

    nb.undo(&mut history).unwrap();
    let mut items = vec!["a", "b"];
    nb.config().apply_order("spaces", &mut items, |s| s);
    assert_eq!(items, vec!["a", "b"], "the undo reloaded the config it rewrote");
}

#[test]
fn creating_a_space_is_undone_folder_and_all() {
    let (dir, mut nb, mut history) = notebook();
    let folder = nb
        .record(&mut history, "create_space_in", |nb| nb.create_space_in("Work", "tasks", None))
        .unwrap();
    assert!(dir.path().join(&folder).is_dir());

    nb.undo(&mut history).unwrap();
    assert!(!dir.path().join(&folder).exists());

    nb.redo(&mut history).unwrap();
    assert!(dir.path().join(&folder).join(".space.json").is_file());
    assert!(dir.path().join(&folder).join("task-list.md").is_file());
}

#[test]
fn the_note_being_typed_is_not_the_history_s_business() {
    // `write_note` is never routed through `record` by the bridge; this
    // pins the other half — an unrecorded write leaves nothing to undo.
    let (_dir, mut nb, mut history) = notebook();
    let path = nb.create_note(NOTES_DIR, "Inbox", "Idea").unwrap();
    nb.write_note(NOTES_DIR, &path, "typing\n").unwrap();
    assert_eq!(nb.undo(&mut history).unwrap(), None);
}

#[test]
fn an_edit_from_outside_makes_the_undo_stale() {
    let (dir, mut nb, mut history) = notebook();
    let path = nb.create_note(NOTES_DIR, "Inbox", "Idea").unwrap();
    let file = dir.path().join(NOTES_DIR).join(&path);
    nb.record(&mut history, "set_note_pinned", |nb| nb.set_note_pinned(NOTES_DIR, &path, true))
        .unwrap();
    std::fs::write(&file, "rewritten by a sync tool\n").unwrap();

    let err = nb.undo(&mut history).unwrap_err();
    assert!(matches!(err, jott_core::Error::Stale(_)));
    assert_eq!(read(&file), "rewritten by a sync tool\n");
    assert_eq!(history.undoable(), None);
}

#[test]
fn importing_a_picture_is_not_recorded() {
    let (_dir, mut nb, mut history) = notebook();
    nb.record(&mut history, "import_asset", |nb| nb.import_asset("pic.png", b"PNG"))
        .unwrap();
    assert_eq!(history.undoable(), None);
}

#[test]
fn the_last_seen_index_never_costs_an_action_its_undo() {
    // Measured on 2026-08-26, when the index gained a backup file: the
    // history watches `*.bak` by STAMP rather than by content, and one
    // stamp-only file appearing makes the whole diff unrecordable — so
    // deleting a note quietly stopped being undoable. `.jott/index/` is
    // outside the history's scan now, and this is the guard.
    let (dir, mut nb, mut history) = notebook();
    let path = nb.create_note(NOTES_DIR, "Inbox", "Idea").unwrap();
    // Twice, so the index has both a main file and a backup beside it.
    nb.mark_note_seen(NOTES_DIR, &path).unwrap();
    nb.write_note(NOTES_DIR, &path, "the idea\n").unwrap();
    assert!(dir.path().join(".jott/index/seen.json").is_file());

    nb.record(&mut history, "rename_note", |nb| {
        nb.rename_note(NOTES_DIR, &path, "Other")
    })
    .unwrap();
    assert_eq!(nb.undo(&mut history).unwrap().as_deref(), Some("rename_note"));
    assert!(dir.path().join(NOTES_DIR).join(&path).exists());
}

/// The history over bare files, without a notebook: what one action
/// records, what undo puts back byte for byte, and what it refuses.
mod files {
    use std::path::Path;

    use jott_core::{fsio, Error, History, Result};

    fn write(root: &Path, rel: &str, text: &str) {
        fsio::write_atomically(root.join(rel), text.as_bytes()).unwrap();
    }

    fn read(root: &Path, rel: &str) -> Option<String> {
        std::fs::read_to_string(root.join(rel)).ok()
    }

    #[test]
    fn an_edit_is_undone_and_redone_byte_for_byte() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "a/note.md", "one\n");
        let mut history = History::new();

        history
            .record(root, "edit", || {
                write(root, "a/note.md", "two\n");
                Ok(())
            })
            .unwrap();
        assert_eq!(history.undoable(), Some("edit"));
        assert_eq!(history.redoable(), None);

        assert_eq!(history.undo(root).unwrap().as_deref(), Some("edit"));
        assert_eq!(read(root, "a/note.md").as_deref(), Some("one\n"));
        assert_eq!(history.undoable(), None);
        assert_eq!(history.redoable(), Some("edit"));

        assert_eq!(history.redo(root).unwrap().as_deref(), Some("edit"));
        assert_eq!(read(root, "a/note.md").as_deref(), Some("two\n"));
        assert_eq!(history.redo(root).unwrap(), None);
    }

    #[test]
    fn a_created_file_is_removed_on_undo_with_its_empty_folder() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "keep.md", "");
        let mut history = History::new();

        history
            .record(root, "create", || {
                write(root, "new/deeper/note.md", "hi");
                Ok(())
            })
            .unwrap();
        history.undo(root).unwrap();
        assert!(!root.join("new").exists());
        assert!(root.join("keep.md").exists());

        history.redo(root).unwrap();
        assert_eq!(read(root, "new/deeper/note.md").as_deref(), Some("hi"));
    }

    #[test]
    fn a_removed_file_comes_back_on_undo() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "gone.md", "bye");
        let mut history = History::new();

        history
            .record(root, "delete", || {
                std::fs::remove_file(root.join("gone.md")).unwrap();
                Ok(())
            })
            .unwrap();
        history.undo(root).unwrap();
        assert_eq!(read(root, "gone.md").as_deref(), Some("bye"));
    }

    #[test]
    fn an_empty_folder_is_a_change_too() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut history = History::new();

        history
            .record(root, "folder", || {
                std::fs::create_dir_all(root.join("empty")).unwrap();
                Ok(())
            })
            .unwrap();
        assert_eq!(history.undoable(), Some("folder"));
        history.undo(root).unwrap();
        assert!(!root.join("empty").exists());
        history.redo(root).unwrap();
        assert!(root.join("empty").is_dir());
    }

    #[test]
    fn an_action_that_touches_a_binary_is_not_recorded() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut history = History::new();

        history
            .record(root, "import", || {
                write(root, "assets/pic.png", "PNG");
                write(root, "note.md", "![](assets/pic.png)");
                Ok(())
            })
            .unwrap();
        assert_eq!(history.undoable(), None);
    }

    #[test]
    fn an_action_that_changes_nothing_leaves_no_entry() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "note.md", "same");
        let mut history = History::new();

        history
            .record(root, "noop", || {
                write(root, "note.md", "same");
                Ok(())
            })
            .unwrap();
        assert_eq!(history.undoable(), None);
    }

    #[test]
    fn a_failed_action_leaves_no_entry() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut history = History::new();

        let result: Result<()> = history.record(root, "fail", || {
            write(root, "note.md", "half");
            Err(Error::Protected("x".into()))
        });
        assert!(result.is_err());
        assert_eq!(history.undoable(), None);
    }

    #[test]
    fn a_file_changed_outside_refuses_the_undo_and_forgets_it() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "note.md", "one");
        let mut history = History::new();

        history
            .record(root, "first", || {
                write(root, "note.md", "two");
                Ok(())
            })
            .unwrap();
        history
            .record(root, "second", || {
                write(root, "note.md", "three");
                Ok(())
            })
            .unwrap();
        write(root, "note.md", "synced from elsewhere");

        let err = history.undo(root).unwrap_err();
        assert!(matches!(err, Error::Stale(ref label) if label == "second"));
        assert_eq!(
            read(root, "note.md").as_deref(),
            Some("synced from elsewhere")
        );
        // Both rested on that file: nothing older is offered either.
        assert_eq!(history.undoable(), None);
    }

    #[test]
    fn a_new_action_after_an_undo_forgets_the_redo() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "note.md", "one");
        let mut history = History::new();

        history
            .record(root, "a", || {
                write(root, "note.md", "two");
                Ok(())
            })
            .unwrap();
        history.undo(root).unwrap();
        history
            .record(root, "b", || {
                write(root, "note.md", "three");
                Ok(())
            })
            .unwrap();
        assert_eq!(history.redoable(), None);
        assert_eq!(history.undoable(), Some("b"));
        history.undo(root).unwrap();
        assert_eq!(read(root, "note.md").as_deref(), Some("one"));
    }
    #[test]
    fn a_quiet_write_is_absorbed_into_the_action_before_it() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut history = History::new();

        history
            .record(root, "create", || {
                write(root, "list.md", "- [ ] task\n");
                Ok(())
            })
            .unwrap();
        // The inspector saves a field: not an action, but the app's own.
        write(root, "list.md", "- [ ] task !2\n");
        history.absorb(root).unwrap();

        assert_eq!(history.undo(root).unwrap().as_deref(), Some("create"));
        assert!(!root.join("list.md").exists());
        history.redo(root).unwrap();
        assert_eq!(read(root, "list.md").as_deref(), Some("- [ ] task !2\n"));
    }

    #[test]
    fn a_quiet_write_under_a_redoable_action_forgets_the_redo() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "note.md", "one");
        let mut history = History::new();

        history
            .record(root, "pin", || {
                write(root, "note.md", "two");
                Ok(())
            })
            .unwrap();
        history.undo(root).unwrap();
        write(root, "note.md", "typed after the undo");
        history.absorb(root).unwrap();
        assert_eq!(history.redoable(), None);
    }
}
