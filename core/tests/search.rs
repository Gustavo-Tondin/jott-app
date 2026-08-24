//! Searching the whole notebook — tasks and notes in one question.
//!
//! The rules being guarded: searching never writes, an empty query finds
//! nothing, and the two kinds stay in two answers.

use chrono::NaiveDate;
use jott_core::{HitKind, NoteFolder, Notebook};

const INBOX: &str = "jott.tasks/task-list.md";
const LIMIT: usize = 50;

fn today() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 8, 14).unwrap()
}

fn notebook() -> (tempfile::TempDir, Notebook) {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    (dir, notebook)
}

fn notes_of(dir: &tempfile::TempDir) -> NoteFolder {
    let notes = NoteFolder::new(dir.path().join("jott.notes"));
    notes.ensure_default_folders().unwrap();
    notes
}

#[test]
fn finds_a_task_by_its_text() {
    let (_dir, notebook) = notebook();
    notebook.create_task(INBOX, "Comprar cimento").unwrap();
    notebook.create_task(INBOX, "Regar as plantas").unwrap();

    let found = notebook.search("cimento", LIMIT).unwrap();

    assert_eq!(found.tasks.len(), 1);
    assert_eq!(found.tasks[0].title, "Comprar cimento");
    assert_eq!(found.tasks[0].kind, HitKind::Task);
    // Everything needed to open it, with no path taken apart on the other side.
    assert_eq!(found.tasks[0].path, INBOX);
    assert_eq!(found.tasks[0].container, "task-list");
    assert_eq!(found.tasks[0].space, "Tasks");
    // The title IS the match: nothing else to prove.
    assert_eq!(found.tasks[0].snippet, "");
    assert!(found.notes.is_empty());
    assert!(!found.truncated);
}

#[test]
fn ignores_case_and_surrounding_spaces() {
    let (_dir, notebook) = notebook();
    notebook.create_task(INBOX, "Ligar para o Cliente").unwrap();

    for query in ["cliente", "CLIENTE", "  Cliente  "] {
        assert_eq!(notebook.search(query, LIMIT).unwrap().tasks.len(), 1, "{query}");
    }
}

#[test]
fn an_empty_query_finds_nothing() {
    // The per-folder search answers "everything" for an empty query because it
    // backs a browsing screen. A notebook-wide box doing that would just be a
    // slow way to show a list the user already has.
    let (dir, notebook) = notebook();
    notebook.create_task(INBOX, "Comprar cimento").unwrap();
    notes_of(&dir).create("Inbox", "Ideia", today()).unwrap();

    for query in ["", "   "] {
        let found = notebook.search(query, LIMIT).unwrap();
        assert!(found.is_empty(), "{query:?} should find nothing");
    }
}

#[test]
fn finds_a_note_by_title_and_by_body() {
    let (dir, notebook) = notebook();
    let notes = notes_of(&dir);
    notes.create("Inbox", "Receita de bolo", today()).unwrap();
    let other = notes.create("Inbox", "Reunião", today()).unwrap();
    notes
        .write(&other, "Combinamos entregar o orçamento na sexta.", today())
        .unwrap();

    let by_title = notebook.search("bolo", LIMIT).unwrap();
    assert_eq!(by_title.notes.len(), 1);
    assert_eq!(by_title.notes[0].title, "Receita de bolo");
    assert_eq!(by_title.notes[0].folder, "jott.notes");
    assert_eq!(by_title.notes[0].container, "Inbox");
    assert_eq!(by_title.notes[0].space, "Notes");

    let by_body = notebook.search("orçamento", LIMIT).unwrap();
    assert_eq!(by_body.notes.len(), 1);
    assert_eq!(by_body.notes[0].title, "Reunião");
    // Found in the body, so the hit has to show where.
    assert!(by_body.notes[0].snippet.contains("orçamento"));
}

#[test]
fn searching_never_writes() {
    // `tasks_in` repairs duplicated ids and saves. A search box must not
    // rewrite a single file just by being typed into.
    let (dir, notebook) = notebook();
    notebook.create_task(INBOX, "Comprar cimento").unwrap();
    let notes = notes_of(&dir);
    let note = notes.create("Inbox", "Ideia", today()).unwrap();
    notes.write(&note, "Sobre cimento também.", today()).unwrap();

    let file = dir.path().join(INBOX);
    let note_file = dir.path().join("jott.notes").join(&note);
    let before = (
        std::fs::read_to_string(&file).unwrap(),
        std::fs::read_to_string(&note_file).unwrap(),
    );

    let found = notebook.search("cimento", LIMIT).unwrap();
    assert_eq!(found.tasks.len(), 1);
    assert_eq!(found.notes.len(), 1);

    assert_eq!(std::fs::read_to_string(&file).unwrap(), before.0);
    assert_eq!(std::fs::read_to_string(&note_file).unwrap(), before.1);
}

#[test]
fn reaches_every_space_and_says_which_one() {
    let (_dir, notebook) = notebook();
    let work = notebook.create_space("Obra", "tasks").unwrap();
    let list = format!("{work}/task-list.md");
    notebook.create_task(&list, "Comprar cimento").unwrap();
    notebook.create_task(INBOX, "Comprar cimento também").unwrap();

    let found = notebook.search("cimento", LIMIT).unwrap();

    assert_eq!(found.tasks.len(), 2);
    let mut places: Vec<&str> = found.tasks.iter().map(|hit| hit.space.as_str()).collect();
    places.sort();
    assert_eq!(places, ["Obra", "Tasks"]);
}

#[test]
fn a_scoped_search_stays_inside_one_space() {
    // The ⋮ of a screen asks about THAT screen (2026-08-17): the same engine,
    // narrowed to the space the user is looking at.
    let (dir, notebook) = notebook();
    let work = notebook.create_space("Obra", "tasks").unwrap();
    notebook
        .create_task(&format!("{work}/task-list.md"), "Comprar cimento")
        .unwrap();
    notebook.create_task(INBOX, "Comprar cimento também").unwrap();
    notes_of(&dir)
        .create("", "Cimento e areia", today())
        .unwrap();

    let found = notebook.search_in("cimento", LIMIT, Some(&work)).unwrap();
    assert_eq!(found.tasks.len(), 1);
    assert_eq!(found.tasks[0].space, "Obra");
    // The notes space is another place, so it is out of this question.
    assert!(found.notes.is_empty());

    // A space with nothing matching answers nothing, rather than falling back
    // to the whole notebook.
    let quiet = notebook.create_space("Vazio", "tasks").unwrap();
    assert!(notebook.search_in("cimento", LIMIT, Some(&quiet)).unwrap().is_empty());

    // And no scope is still the whole notebook.
    assert_eq!(notebook.search("cimento", LIMIT).unwrap().tasks.len(), 2);
}

#[test]
fn open_tasks_come_before_completed_ones() {
    // A search is nearly always about what is still to do.
    let (_dir, notebook) = notebook();
    notebook.create_task(INBOX, "Comprar cimento").unwrap();
    let id = notebook.ensure_task_id(INBOX, 0).unwrap();
    notebook.complete_task(INBOX, &id).unwrap();
    notebook.create_task(INBOX, "Comprar cimento branco").unwrap();

    let found = notebook.search("cimento", LIMIT).unwrap();

    assert_eq!(found.tasks.len(), 2);
    assert!(!found.tasks[0].done);
    assert!(found.tasks[1].done);
}

#[test]
fn finds_what_the_card_does_not_show_and_proves_it() {
    let (_dir, notebook) = notebook();
    notebook.create_task(INBOX, "Reunião de quinta").unwrap();
    let id = notebook.ensure_task_id(INBOX, 0).unwrap();
    let mut list = notebook.open_list(INBOX).unwrap();
    let task = list.task_mut(&id).unwrap();
    task.description = vec!["Levar o orçamento revisado".into()];
    task.tags = vec!["obra".into()];
    list.save().unwrap();

    let by_description = notebook.search("orçamento", LIMIT).unwrap();
    assert_eq!(by_description.tasks.len(), 1);
    assert!(by_description.tasks[0].snippet.contains("orçamento"));

    // Tags are searched with and without the `#`: both are how people type
    // them into a search box.
    for query in ["obra", "#obra"] {
        let found = notebook.search(query, LIMIT).unwrap();
        assert_eq!(found.tasks.len(), 1, "{query}");
        assert_eq!(found.tasks[0].snippet, "#obra");
    }
}

#[test]
fn says_out_loud_when_it_left_something_out() {
    let (_dir, notebook) = notebook();
    for i in 0..5 {
        notebook.create_task(INBOX, format!("Item {i} de cimento")).unwrap();
    }

    let found = notebook.search("cimento", 3).unwrap();

    assert_eq!(found.tasks.len(), 3);
    assert!(found.truncated, "a partial answer must say so");
}

#[test]
fn counts_how_often_each_tag_is_used_whether_catalogued_or_not() {
    let (_dir, notebook) = notebook();
    for (i, tags) in [vec!["obra"], vec!["obra", "casa"], vec![]].iter().enumerate() {
        notebook.create_task(INBOX, format!("Tarefa {i}")).unwrap();
        let id = notebook.ensure_task_id(INBOX, i).unwrap();
        let mut list = notebook.open_list(INBOX).unwrap();
        list.task_mut(&id).unwrap().tags = tags.iter().map(|t| t.to_string()).collect();
        list.save().unwrap();
    }
    // Only one of the two is in the catalogue; both are in use.
    notebook.set_tag("obra", Some("blue".into())).unwrap();

    let usage = notebook.tag_usage().unwrap();
    let pairs: Vec<(&str, usize)> = usage.iter().map(|u| (u.name.as_str(), u.count)).collect();
    assert_eq!(pairs, vec![("obra", 2), ("casa", 1)]);

    // A catalogued colour with no task is not "in use" — the catalogue is
    // the other half of the screen's answer.
    notebook.set_tag("nunca", None).unwrap();
    assert!(notebook.tag_usage().unwrap().iter().all(|u| u.name != "nunca"));
}
