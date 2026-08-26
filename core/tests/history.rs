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
