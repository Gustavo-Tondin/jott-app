//! The notebook seen from outside: what the picker reads off a notebook it has
//! not opened, and the two things it may do to one.
//!
//! The promise being guarded is that none of it TOUCHES the notebook. A picker
//! drawing eight cards would otherwise recreate eight sets of fixed spaces and
//! rebuild eight completed indexes just to show two numbers — and on a synced
//! folder, that is eight notebooks changed on disk for a screen nobody has
//! chosen anything on yet.

use std::path::Path;

use jott_core::Notebook;

/// A notebook with something in it, and the paths its two counts read.
fn notebook(dir: &Path) -> Notebook {
    let nb = Notebook::init(dir).unwrap();
    nb.note_folder("jott.notes")
        .unwrap()
        .ensure_default_folders()
        .unwrap();
    nb
}

fn today() -> chrono::NaiveDate {
    chrono::NaiveDate::from_ymd_opt(2026, 8, 24).unwrap()
}

#[test]
fn a_summary_counts_the_open_tasks_and_the_notes_waiting_in_the_inbox() {
    let dir = tempfile::tempdir().unwrap();
    let nb = notebook(dir.path());
    let list = Notebook::inbox_path();

    nb.create_task(&list, "Comprar cimento").unwrap();
    nb.create_task(&list, "Ligar pro Jorge").unwrap();
    let done = nb.create_task(&list, "Já feito").unwrap();
    let id = nb.ensure_task_id(&list, done).unwrap();
    nb.complete_task(&list, &id).unwrap();

    let notes = nb.note_folder("jott.notes").unwrap();
    notes.quick_capture("Inbox", "uma ideia", today()).unwrap();
    notes.quick_capture("Inbox", "outra ideia", today()).unwrap();
    // Filed away, so it is no longer waiting — the card promises the Inbox.
    notes.create_folder("Clientes").unwrap();
    notes.create("Clientes", "Proposta", today()).unwrap();

    let summary = Notebook::summarize(dir.path()).unwrap();
    assert_eq!(summary.name, dir.path().file_name().unwrap().to_str().unwrap());
    assert_eq!(summary.tasks, 2, "the completed one is not still to do");
    assert_eq!(summary.notes, 2, "only what sits in the Inbox");
    assert!(!summary.read_only);
}

#[test]
fn the_contents_count_every_note_the_open_tasks_the_files_and_the_bytes() {
    let dir = tempfile::tempdir().unwrap();
    let nb = notebook(dir.path());
    let list = Notebook::inbox_path();

    nb.create_task(&list, "Comprar cimento").unwrap();
    let done = nb.create_task(&list, "Já feito").unwrap();
    let id = nb.ensure_task_id(&list, done).unwrap();
    nb.complete_task(&list, &id).unwrap();

    let notes = nb.note_folder("jott.notes").unwrap();
    notes.quick_capture("Inbox", "uma ideia", today()).unwrap();
    notes.create_folder("Clientes").unwrap();
    notes.create("Clientes", "Proposta", today()).unwrap();

    nb.import_asset("foto.png", b"png-bytes").unwrap();

    let contents = nb.contents().unwrap();
    assert_eq!(contents.notes, 2, "filed notes count too — unlike the picker");
    assert_eq!(contents.tasks, 1, "the completed one is not still to do");
    assert_eq!(contents.files, 1);
    assert!(contents.bytes > 0);

    // The size is the whole tree: adding bytes anywhere under the root
    // — even in the hidden config folder — grows it.
    let before = contents.bytes;
    std::fs::write(dir.path().join(".jott/extra.bin"), vec![0u8; 4096]).unwrap();
    assert_eq!(nb.contents().unwrap().bytes, before + 4096);
}

#[test]
fn a_summary_wears_the_accent_the_notebook_chose() {
    let dir = tempfile::tempdir().unwrap();
    let mut nb = notebook(dir.path());

    // Untouched: the card reads as the app's own colour, and says so by
    // saying nothing.
    assert_eq!(Notebook::summarize(dir.path()).unwrap().accent_color, "");

    // The same door the bridge writes settings through
    // (`commands::settings::set_notebook_settings`).
    let mut config = nb.config().clone();
    config.accent_color = "orange".to_string();
    nb.set_config(config).unwrap();
    assert_eq!(
        Notebook::summarize(dir.path()).unwrap().accent_color,
        "orange"
    );
}

#[test]
fn summarizing_writes_nothing_at_all() {
    // The whole reason this module exists rather than calling `open`. Compared
    // by modification time on every file in the tree: `open` recreates the
    // fixed spaces, reaps the trash and rebuilds the completed index, and a
    // picker must do none of that to draw a card.
    let dir = tempfile::tempdir().unwrap();
    notebook(dir.path());

    fn stamps(dir: &Path) -> Vec<(std::path::PathBuf, std::time::SystemTime)> {
        let mut found = Vec::new();
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            let meta = std::fs::metadata(&path).unwrap();
            found.push((path.clone(), meta.modified().unwrap()));
            if meta.is_dir() {
                found.extend(stamps(&path));
            }
        }
        found.sort();
        found
    }

    let before = stamps(dir.path());
    Notebook::summarize(dir.path()).unwrap();
    assert_eq!(before, stamps(dir.path()));
}

#[test]
fn a_folder_that_is_not_a_notebook_has_no_summary() {
    // A picker's list is paths remembered from an earlier run: the folder may
    // have been deleted, renamed or moved outside the app since.
    let dir = tempfile::tempdir().unwrap();
    assert!(Notebook::summarize(dir.path()).is_err());
    assert!(Notebook::summarize(dir.path().join("gone")).is_err());
}

#[test]
fn renaming_moves_the_folder_and_answers_with_the_new_path() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("Trabalho");
    notebook(&root);

    let moved = Notebook::rename_at(&root, "Pessoal").unwrap();
    assert_eq!(moved, dir.path().join("Pessoal"));
    assert!(!root.exists());
    assert!(Notebook::is_notebook(&moved));
    assert_eq!(Notebook::summarize(&moved).unwrap().name, "Pessoal");
}

#[test]
fn renaming_refuses_a_name_that_is_a_path_or_that_is_taken() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("Trabalho");
    notebook(&root);
    std::fs::create_dir(dir.path().join("Ocupado")).unwrap();

    // A name typed by the user is a LEAF: `../x` would move the notebook
    // while claiming to rename it.
    for bad in ["", "..", "../fora", "com/barra"] {
        assert!(
            Notebook::rename_at(&root, bad).is_err(),
            "{bad:?} was accepted"
        );
    }
    // And nothing is ever overwritten — `fs::rename` would replace an empty
    // directory without a word.
    assert!(Notebook::rename_at(&root, "Ocupado").is_err());
    assert!(dir.path().join("Ocupado").is_dir());
    assert!(Notebook::is_notebook(&root), "the notebook stayed put");
}

#[test]
fn renaming_to_the_same_name_is_a_no_op_rather_than_a_collision() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("Trabalho");
    notebook(&root);

    assert_eq!(Notebook::rename_at(&root, "Trabalho").unwrap(), root);
    assert!(Notebook::is_notebook(&root));
}

#[test]
fn moving_carries_the_notebook_whole_into_another_folder() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("Trabalho");
    let nb = notebook(&root);
    nb.create_task(&Notebook::inbox_path(), "Comprar cimento")
        .unwrap();
    let elsewhere = dir.path().join("Arquivo");
    std::fs::create_dir(&elsewhere).unwrap();

    let moved = Notebook::move_at(&root, &elsewhere).unwrap();
    assert_eq!(moved, elsewhere.join("Trabalho"));
    assert!(!root.exists());
    assert_eq!(Notebook::summarize(&moved).unwrap().tasks, 1);
}

#[test]
fn moving_refuses_to_put_a_notebook_inside_itself() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("Trabalho");
    notebook(&root);

    assert!(Notebook::move_at(&root, &root).is_err());
    assert!(Notebook::move_at(&root, root.join("jott.notes")).is_err());
    // Written the long way round, which does not `starts_with` the root as
    // spelled — the check canonicalizes both sides for exactly this.
    assert!(Notebook::move_at(&root, root.join("jott.notes/..")).is_err());
    assert!(Notebook::is_notebook(&root), "the notebook stayed put");
}

#[test]
fn moving_refuses_a_destination_that_is_not_a_folder_or_that_is_taken() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("Trabalho");
    notebook(&root);
    let elsewhere = dir.path().join("Arquivo");
    std::fs::create_dir_all(elsewhere.join("Trabalho")).unwrap();

    assert!(Notebook::move_at(&root, dir.path().join("nao-existe")).is_err());
    assert!(Notebook::move_at(&root, &elsewhere).is_err());
    assert!(Notebook::is_notebook(&root), "the notebook stayed put");
}

#[test]
fn a_folder_that_is_not_a_notebook_is_neither_renamed_nor_moved() {
    // The guard that keeps these two off any folder on the machine: they are
    // reachable from a picker, and a picker holds paths, not notebooks.
    let dir = tempfile::tempdir().unwrap();
    let plain = dir.path().join("fotos");
    std::fs::create_dir(&plain).unwrap();

    assert!(Notebook::rename_at(&plain, "outras").is_err());
    assert!(Notebook::move_at(&plain, dir.path()).is_err());
    assert!(plain.is_dir());
}
