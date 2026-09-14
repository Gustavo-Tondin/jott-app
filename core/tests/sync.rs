//! Two devices on one notebook, through a folder sync tool. Nothing here
//! talks to Syncthing: the tests reproduce what it does to the files — one
//! side keeps the name, the other lands beside it as a conflict copy — and
//! assert what the app is left holding.

use std::path::Path;

use jott_core::Notebook;

mod common;
use common::{init, read};

/// A device that already has everything `origin` has: the folder copied at
/// the moment the two were last in step.
fn clone_notebook(origin: &Path) -> (tempfile::TempDir, Notebook) {
    let dir = tempfile::tempdir().unwrap();
    copy_tree(origin, dir.path());
    let notebook = Notebook::open(dir.path()).unwrap();
    (dir, notebook)
}

fn copy_tree(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), &target).unwrap();
        }
    }
}

/// Lands `b`'s version of everything under `dir` on `a`, the way the sync
/// tool does when both sides changed the same file while apart: `a` keeps
/// the name and `b`'s bytes arrive beside it as a conflict copy. Same bytes
/// on both sides means nothing was in conflict, and nothing lands.
fn sync_folder(a: &Path, b: &Path, dir: &str) {
    for entry in std::fs::read_dir(b.join(dir)).unwrap() {
        let entry = entry.unwrap();
        if !entry.file_type().unwrap().is_file() {
            continue;
        }
        let theirs = std::fs::read(entry.path()).unwrap();
        let name = entry.file_name().to_string_lossy().into_owned();
        let ours = a.join(dir).join(&name);
        match std::fs::read(&ours) {
            Ok(bytes) if bytes == theirs => {}
            Ok(_) => {
                let (stem, ext) = name.rsplit_once('.').unwrap_or((name.as_str(), ""));
                let copy = format!("{stem}.sync-conflict-20260914-120000-PHONE.{ext}");
                std::fs::write(a.join(dir).join(copy), &theirs).unwrap();
            }
            Err(_) => std::fs::write(&ours, &theirs).unwrap(),
        }
    }
}

/// How many conflict copies the sync left in a folder.
fn conflict_copies(dir: &Path) -> usize {
    std::fs::read_dir(dir)
        .unwrap()
        .filter(|entry| {
            entry
                .as_ref()
                .unwrap()
                .file_name()
                .to_string_lossy()
                .contains(".sync-conflict-")
        })
        .count()
}

const INBOX: &str = "jott.tasks/task-list.md";

// ------------------------------------------------- a version landing mid-save

#[test]
fn a_save_keeps_the_version_that_landed_while_the_command_ran() {
    // Every command re-reads its list from disk, so the window a sync can
    // land in is the length of one command. Inside it the save still wins the
    // file — but what it found there is kept beside it first, and the banner
    // has it. Nothing decided, nothing lost.
    let (dir, notebook) = init();
    notebook.create_task(INBOX, "do desktop").unwrap();
    let path = dir.path().join(INBOX);

    // The app holds the list; the other device's version lands under it.
    let mut open = notebook.open_list(INBOX).unwrap();
    let arriving = format!("{}- [ ] do celular <!--id:c1-->\n", read(&path));
    std::fs::write(&path, &arriving).unwrap();

    open.save().unwrap();

    let on_disk = read(&path);
    assert!(
        on_disk.contains("do desktop"),
        "our version is the one on disk:\n{on_disk}"
    );
    assert!(
        !on_disk.contains("do celular"),
        "the arriving line is not merged in — that is step 6:\n{on_disk}"
    );

    let conflicts = notebook.conflicts().unwrap();
    assert_eq!(conflicts.len(), 1, "{conflicts:?}");
    let kept = read(&conflicts[0].path);
    assert_eq!(kept, arriving, "byte for byte what was found on disk");
    assert_eq!(
        conflict_copies(&dir.path().join("jott.tasks")),
        1,
        "one copy, named the way Syncthing names them"
    );
}

#[test]
fn a_list_saved_over_and_over_keeps_no_copy_of_itself() {
    // The guard above must not fire on the app's own writing: every command
    // that touches a list saves it, and a list open across two saves (or two
    // handles on one file inside one command, as a move between lists is)
    // finds its own bytes there.
    let (dir, notebook) = init();
    notebook.create_task(INBOX, "do desktop").unwrap();

    let mut open = notebook.open_list(INBOX).unwrap();
    open.add_text_with_id("mais uma");
    open.save().unwrap();
    open.add_text_with_id("e outra");
    open.save().unwrap();

    // And a fresh handle saving what another handle just wrote.
    let mut again = notebook.open_list(INBOX).unwrap();
    open.add_text_with_id("da primeira alça");
    open.save().unwrap();
    again.add_text_with_id("da segunda");
    again.save().unwrap();

    assert_eq!(conflict_copies(&dir.path().join("jott.tasks")), 0);
    assert!(notebook.conflicts().unwrap().is_empty());
}

// ------------------------------------------- the same task finished on both

#[test]
#[ignore = "passes once the merge of step 6 (docs/pendências/sync-proposta.md) is in"]
fn a_freely_task_completed_on_both_devices_comes_back_once() {
    // `repeat: freely` keeps one open copy at a time. Completed on two
    // devices before they meet, each side spawns an occurrence of its own,
    // with an id of its own, and each files the completion. The merge has to
    // leave one open occurrence and one line per completion.
    let (a_dir, a) = init();
    let inbox = a_dir.path().join(INBOX);
    std::fs::write(&inbox, "- [ ] Regar as plantas <!--id:r1-->\n  repeat: freely\n").unwrap();

    let (b_dir, b) = clone_notebook(a_dir.path());

    a.complete_task(INBOX, "r1").unwrap();
    b.complete_task(INBOX, "r1").unwrap();

    sync_folder(a_dir.path(), b_dir.path(), "jott.tasks");
    assert_eq!(
        conflict_copies(&a_dir.path().join("jott.tasks")),
        2,
        "the sync left a copy of the list and one of Completed"
    );

    // Opening is where the app is handed the pair.
    let a = Notebook::open(a_dir.path()).unwrap();

    let list = read(&inbox);
    assert_eq!(
        list.matches("- [ ] Regar as plantas").count(),
        1,
        "one open occurrence, not two:\n{list}"
    );
    let completed = read(a_dir.path().join("jott.tasks/completed.md"));
    assert_eq!(
        completed.matches("- [x] Regar as plantas").count(),
        1,
        "the one completion each device recorded is the same one:\n{completed}"
    );
    assert!(
        a.conflicts().unwrap().is_empty(),
        "and the copies were settled, not left for the banner"
    );
}

// ------------------------------------------- a copy that decides nothing

#[test]
fn a_copy_identical_to_the_original_is_trashed_wherever_it_is() {
    // Both devices wrote the same bytes: there is no version to choose, so
    // the copy is noise — the user's text as much as the app's own files.
    let (dir, notebook) = init();
    notebook.create_task(INBOX, "Comprar pão").unwrap();
    let note = notebook.create_note("jott.notes", "Inbox", "Ideia").unwrap();

    let list = dir.path().join(INBOX);
    let note_path = dir.path().join("jott.notes").join(&note);
    for original in [&list, &note_path] {
        let copy = original.with_file_name(format!(
            "{}.sync-conflict-20260914-120000-PHONE.md",
            original.file_stem().unwrap().to_string_lossy()
        ));
        std::fs::copy(original, copy).unwrap();
    }
    assert!(
        notebook.conflicts().unwrap().is_empty(),
        "an identical copy is not reported even before the reaper runs"
    );

    // Opening is where the derived work runs.
    let notebook = Notebook::open(dir.path()).unwrap();

    assert_eq!(conflict_copies(&dir.path().join("jott.tasks")), 0);
    assert_eq!(conflict_copies(&dir.path().join("jott.notes/Inbox")), 0);
    assert!(notebook.conflicts().unwrap().is_empty());
    assert_eq!(
        notebook.trash_entries().len(),
        2,
        "nothing was destroyed: both copies are in the trash"
    );
}

#[test]
fn a_copy_that_differs_is_left_for_the_user() {
    let (dir, notebook) = init();
    notebook.create_task(INBOX, "Comprar pão").unwrap();
    let list = dir.path().join(INBOX);
    let copy = list.with_file_name("task-list.sync-conflict-20260914-120000-PHONE.md");
    std::fs::write(&copy, format!("{}- [ ] do celular\n", read(&list))).unwrap();

    let notebook = Notebook::open(dir.path()).unwrap();

    assert!(copy.is_file(), "the copy is still there");
    assert_eq!(
        notebook.conflicts().unwrap().len(),
        1,
        "and the banner still has something to ask"
    );
}
