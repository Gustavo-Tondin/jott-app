//! Notes against the real filesystem (phase 8).
//!
//! The exit criterion of the phase, as tests: jot an idea down, find it again
//! by search, delete it — with the files readable outside the app.

use chrono::NaiveDate;
use jott_core::{NoteFolder, Notebook};

fn today() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 7, 21).unwrap()
}

fn folder() -> (tempfile::TempDir, NoteFolder) {
    let dir = tempfile::tempdir().unwrap();
    Notebook::init(dir.path()).unwrap();
    let notes = NoteFolder::new(dir.path().join("jott.notes"));
    notes.ensure_default_folders().unwrap();
    (dir, notes)
}


fn read(path: impl AsRef<std::path::Path>) -> String {
    std::fs::read_to_string(path).unwrap()
}

#[test]
fn the_whole_phase_eight_scenario_end_to_end() {
    // Jot it down, find it by search, delete it.
    let (dir, notes) = folder();

    let path = notes.create("Inbox", "Ideia de produto", today()).unwrap();
    assert_eq!(path, "Inbox/Ideia de produto.md");
    notes
        .write(&path, "Um leitor de markdown embutido no app.\n", today())
        .unwrap();

    let found = notes.search("leitor").unwrap();
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].title, "Ideia de produto");
    assert_eq!(found[0].folder, "Inbox");
    assert_eq!(found[0].created, Some(today()));

    // Readable outside the app, and the frontmatter is the documented shape.
    let on_disk = read(dir.path().join("jott.notes/Inbox/Ideia de produto.md"));
    assert_eq!(
        on_disk,
        "---\ncreated: 2026-07-21\n---\n\nUm leitor de markdown embutido no app.\n"
    );

    // Deleting is covered on its own, against the notebook's trash — see
    // `a_deleted_note_goes_to_the_notebooks_trash_and_comes_back`.
    std::fs::remove_file(dir.path().join("jott.notes/Inbox/Ideia de produto.md")).unwrap();
    assert!(notes.notes().unwrap().is_empty());
}

#[test]
fn a_note_written_by_hand_is_adopted_without_being_rewritten_on_read() {
    // Someone wrote it in Obsidian. Reading must not touch the file — the
    // same courtesy the lazy task id gets.
    let (dir, notes) = folder();
    let path = dir.path().join("jott.notes/Inbox/solta.md");
    let original = "Uma ideia escrita fora do app.\n";
    std::fs::write(&path, original).unwrap();

    let listed = notes.notes().unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].title, "solta");
    assert_eq!(listed[0].created, None, "no frontmatter, no date");
    assert_eq!(read(&path), original, "reading rewrote the file");

    // The first save by the app is what adopts `created`.
    notes.write("Inbox/solta.md", "Editada.\n", today()).unwrap();
    assert_eq!(read(&path), "---\ncreated: 2026-07-21\n---\n\nEditada.\n");
}

#[test]
fn folders_are_free_and_notes_are_found_all_the_way_down() {
    let (dir, notes) = folder();
    notes.create_folder("Clientes/Acme").unwrap();
    std::fs::write(
        dir.path().join("jott.notes/Clientes/Acme/briefing.md"),
        "Marca e tom de voz.\n",
    )
    .unwrap();
    notes.create("Inbox", "solta", today()).unwrap();

    let all = notes.notes().unwrap();
    let paths: Vec<&str> = all.iter().map(|n| n.path.as_str()).collect();
    assert!(paths.contains(&"Clientes/Acme/briefing.md"));
    assert!(paths.contains(&"Inbox/solta.md"));

    let folders = notes.folders().unwrap();
    assert!(folders.contains(&"Clientes".to_string()));
    assert!(folders.contains(&"Clientes/Acme".to_string()));
}

#[test]
fn pinned_notes_come_first_then_the_newest() {
    let (_dir, notes) = folder();
    let old = notes.create("Inbox", "antiga", today()).unwrap();
    let new = notes
        .create("Inbox", "nova", NaiveDate::from_ymd_opt(2026, 7, 22).unwrap())
        .unwrap();
    let pinned = notes.create("Inbox", "fixada", today()).unwrap();
    notes.set_pinned(&pinned, true).unwrap();

    let titles: Vec<String> = notes
        .notes()
        .unwrap()
        .into_iter()
        .map(|n| n.title)
        .collect();
    assert_eq!(titles, vec!["fixada", "nova", "antiga"]);

    // Unpinning removes the mark from the file rather than writing `false`.
    notes.set_pinned(&pinned, false).unwrap();
    assert!(!notes.read(&pinned).unwrap().pinned);
    assert_eq!(notes.notes().unwrap()[0].title, "nova");

    // And the other two are untouched by any of it.
    assert!(notes.read(&old).is_ok());
    assert!(notes.read(&new).is_ok());
}

#[test]
fn search_looks_at_the_title_and_the_body() {
    let (_dir, notes) = folder();
    let a = notes.create("Inbox", "Receita de bolo", today()).unwrap();
    notes.write(&a, "Farinha, ovos, açúcar.\n", today()).unwrap();
    let b = notes.create("Inbox", "Compras", today()).unwrap();
    notes.write(&b, "Comprar farinha na feira.\n", today()).unwrap();

    assert_eq!(notes.search("receita").unwrap().len(), 1, "pelo título");
    assert_eq!(notes.search("farinha").unwrap().len(), 2, "pelo corpo");
    assert_eq!(notes.search("FARINHA").unwrap().len(), 2, "sem caso");
    assert_eq!(notes.search("  ").unwrap().len(), 2, "vazia mostra tudo");
    assert!(notes.search("inexistente").unwrap().is_empty());
}

#[test]
fn renaming_and_moving_keep_the_content() {
    let (dir, notes) = folder();
    let path = notes.create("Inbox", "rascunho", today()).unwrap();
    notes.write(&path, "Conteúdo.\n", today()).unwrap();

    let renamed = notes.rename(&path, "Ideia boa").unwrap();
    assert_eq!(renamed, "Inbox/Ideia boa.md");

    let moved = notes.move_to(&renamed, "Clientes/Acme").unwrap();
    assert_eq!(moved, "Clientes/Acme/Ideia boa.md");
    assert!(notes.read(&moved).unwrap().body.contains("Conteúdo"));
    assert!(!dir.path().join("jott.notes/Inbox/Ideia boa.md").exists());
}

#[test]
fn a_name_clash_never_overwrites_a_note() {
    let (_dir, notes) = folder();
    let first = notes.create("Inbox", "ideia", today()).unwrap();
    notes.write(&first, "A primeira.\n", today()).unwrap();

    let second = notes.create("Inbox", "ideia", today()).unwrap();
    assert_eq!(second, "Inbox/ideia 2.md");
    assert!(notes.read(&first).unwrap().body.contains("A primeira"));

    // Renaming onto an existing name is refused rather than silently merged.
    assert!(notes.rename(&second, "ideia").is_err());
}

#[test]
fn note_addresses_that_could_escape_the_folder_are_refused() {
    let (_dir, notes) = folder();

    for bad in [
        "../fora.md",
        "Inbox/../../etc/passwd.md",
        "/etc/passwd.md",
        ".oculta.md",
        "Inbox/.oculta.md",
        "Inbox/nota",     // not a .md
        "Inbox/a\0b.md",
    ] {
        assert!(
            notes.read(bad).is_err(),
            "should have refused note address {bad:?}"
        );
    }

    // A title that would break out becomes a safe file name instead of an
    // error — the user typed a title, not a path.
    let path = notes.create("Inbox", "../fuga", today()).unwrap();
    assert_eq!(path, "Inbox/-fuga.md");
}

#[test]
fn hidden_files_and_sync_conflicts_are_not_notes() {
    let (dir, notes) = folder();
    std::fs::write(dir.path().join("jott.notes/Inbox/.oculta.md"), "x\n").unwrap();
    std::fs::write(
        dir.path()
            .join("jott.notes/Inbox/nota.sync-conflict-20260721-090000-ABC.md"),
        "versão do celular\n",
    )
    .unwrap();
    std::fs::write(dir.path().join("jott.notes/Inbox/nota.md"), "a boa\n").unwrap();

    let listed = notes.notes().unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].title, "nota");
}

#[test]
fn a_checklist_in_a_note_stays_a_note() {
    // Spec 5, the decision the user confirmed: it must not become a task
    // list, and the notebook's task side must never see it.
    let (dir, notes) = folder();
    let path = notes.create("Inbox", "lista de compras", today()).unwrap();
    notes
        .write(&path, "- [ ] leite\n- [x] pão\n", today())
        .unwrap();

    let notebook = Notebook::open(dir.path()).unwrap();
    let lists: Vec<String> = notebook
        .lists()
        .unwrap()
        .into_iter()
        .map(|l| l.path)
        .collect();
    assert!(
        !lists.iter().any(|p| p.starts_with("jott.notes/")),
        "a note must never be listed as a task list: {lists:?}"
    );
    assert!(notebook
        .suggestions_for(jott_core::state::Period::Day)
        .unwrap()
        .is_empty());

    // And the text is exactly what was written — no ids, no rewriting.
    let on_disk = read(dir.path().join("jott.notes/Inbox/lista de compras.md"));
    assert!(on_disk.ends_with("- [ ] leite\n- [x] pão\n"));
    assert!(!on_disk.contains("<!--id"));
}

#[test]
fn deleting_a_folder_moves_what_was_inside_up_instead_of_destroying_it() {
    // The tasks side rescues a deleted list's tasks into the Inbox; the notes
    // side moves a deleted folder's contents up to the parent. Same rule,
    // same reason: filing is not throwing away (principle 2).
    let (dir, notes) = folder();
    notes.create_folder("Clientes/Acme").unwrap();
    let note = notes.create("Clientes", "contrato", today()).unwrap();
    notes.write(&note, "Assinado.\n", today()).unwrap();
    std::fs::write(
        dir.path().join("jott.notes/Clientes/Acme/briefing.md"),
        "Marca.\n",
    )
    .unwrap();

    let moved = notes.delete_folder("Clientes").unwrap();
    assert_eq!(moved, 2, "the note and the subfolder both moved up");

    // The note is at the root now, with its content intact...
    assert!(notes.read("contrato.md").unwrap().body.contains("Assinado"));
    // ...and the subfolder moved up whole, keeping what was under it.
    assert!(notes.read("Acme/briefing.md").unwrap().body.contains("Marca"));
    assert!(!dir.path().join("jott.notes/Clientes").exists());
}

#[test]
fn moving_up_never_overwrites_a_name_that_is_already_taken() {
    let (_dir, notes) = folder();
    let root = notes.create("", "nota", today()).unwrap();
    notes.write(&root, "A de fora.\n", today()).unwrap();
    notes.create_folder("Pasta").unwrap();
    let inner = notes.create("Pasta", "nota", today()).unwrap();
    notes.write(&inner, "A de dentro.\n", today()).unwrap();

    notes.delete_folder("Pasta").unwrap();

    assert!(notes.read("nota.md").unwrap().body.contains("A de fora"));
    assert!(notes.read("nota 2.md").unwrap().body.contains("A de dentro"));
}

#[test]
fn folders_can_be_renamed_and_the_notes_come_along() {
    let (_dir, notes) = folder();
    notes.create_folder("Clientes").unwrap();
    let note = notes.create("Clientes", "briefing", today()).unwrap();
    notes.write(&note, "Conteúdo.\n", today()).unwrap();

    let renamed = notes.rename_folder("Clientes", "Contas").unwrap();
    assert_eq!(renamed, "Contas");
    assert!(notes.read("Contas/briefing.md").unwrap().body.contains("Conteúdo"));

    // Renaming onto an existing folder is refused rather than merged.
    notes.create_folder("Outra").unwrap();
    assert!(notes.rename_folder("Outra", "Contas").is_err());
}

#[test]
fn the_notes_inbox_cannot_be_renamed_or_deleted() {
    // It is recreated on every open, so allowing either would just confuse.
    let (_dir, notes) = folder();
    assert!(matches!(
        notes.delete_folder("Inbox"),
        Err(jott_core::Error::Protected(_))
    ));
    assert!(matches!(
        notes.rename_folder("Inbox", "Outra"),
        Err(jott_core::Error::Protected(_))
    ));
}

#[test]
fn the_home_sees_notes_created_today_without_owning_any() {
    // Spec 5: the Home has no notes of its own — it is a view of the inbox
    // filtered by `created`, so nothing is moved on the turn of the day.
    let (dir, notes) = folder();
    let yesterday = NaiveDate::from_ymd_opt(2026, 7, 20).unwrap();

    notes.create("Inbox", "de hoje", today()).unwrap();
    notes.create("Inbox", "de ontem", yesterday).unwrap();
    // Written by hand outside the app: no `created`, so the app does not
    // pretend to know when it was written.
    std::fs::write(dir.path().join("jott.notes/Inbox/sem data.md"), "solta\n").unwrap();

    let titles: Vec<String> = notes
        .created_on(today())
        .unwrap()
        .into_iter()
        .map(|n| n.title)
        .collect();
    assert_eq!(titles, vec!["de hoje"]);

    // And the others are still right where they were.
    assert_eq!(notes.notes().unwrap().len(), 3);
}

#[test]
fn quick_capture_names_the_note_after_what_was_written() {
    let (_dir, notes) = folder();

    let path = notes
        .quick_capture("Inbox", "Comprar cimento\nna loja do Jorge\n", today())
        .unwrap();
    assert_eq!(path, "Inbox/Comprar cimento.md");
    assert!(notes.read(&path).unwrap().body.contains("loja do Jorge"));

    // A pasted heading is still the title, without its `#`.
    let heading = notes
        .quick_capture("Inbox", "# Ideia grande\n\ncorpo\n", today())
        .unwrap();
    assert_eq!(heading, "Inbox/Ideia grande.md");

    // And text with nothing nameable still becomes a note.
    let blank = notes.quick_capture("Inbox", "   \n\n", today()).unwrap();
    assert_eq!(blank, "Inbox/Untitled.md");
}

#[test]
fn a_deleted_note_goes_to_the_notebooks_trash_and_comes_back() {
    // Deleting is a filing decision, not a decision to burn the file — the
    // user can change their mind, and the app is not the only thing that
    // knows what was in there. Same reasoning as a deleted list rescuing
    // its tasks (principle 2).
    //
    // It goes to the notebook's OWN trash, not the desktop's: that one has no
    // restore, does not exist on Android, and does not travel with a synced
    // notebook.
    let dir = tempfile::tempdir().unwrap();
    let nb = Notebook::init(dir.path()).unwrap();
    let notes = nb.note_folder("jott.notes").unwrap();

    let path = notes.create("", "arrependimento", today()).unwrap();
    notes.write(&path, "Conteúdo que importa.\n", today()).unwrap();
    nb.delete_note("jott.notes", &path).unwrap();

    assert!(notes.notes().unwrap().is_empty(), "gone from the notebook");
    assert!(!dir.path().join("jott.notes/arrependimento.md").exists());

    // ...and still on disk, with a record of where it came from.
    let entries = nb.trash_entries();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].origin, "jott.notes/arrependimento.md");
    let stored = dir.path().join(".jott/trash/items/arrependimento.md");
    assert!(read(&stored).contains("Conteúdo que importa"));

    // Deleting a second note of the same name does not overwrite the first.
    let again = notes.create("", "arrependimento", today()).unwrap();
    notes.write(&again, "A segunda.\n", today()).unwrap();
    nb.delete_note("jott.notes", &again).unwrap();
    assert!(dir
        .path()
        .join(".jott/trash/items/arrependimento 2.md")
        .is_file());
    assert!(
        read(&stored).contains("Conteúdo que importa"),
        "the first is intact"
    );

    // And it comes back where it was — the part the desktop trash could not do.
    // Entries are newest first, so the older of the two is the last one.
    let oldest = nb.trash_entries().last().unwrap().id.clone();
    nb.restore_from_trash(&oldest).unwrap();
    let restored = dir.path().join("jott.notes/arrependimento.md");
    assert!(restored.is_file(), "restore puts it back at its origin");
    assert!(read(&restored).contains("Conteúdo que importa"));
}
