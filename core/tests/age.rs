//! The age of a thing, as the notebook hands it out (spec 3.6, F3 + M7/M8).
//!
//! The rule lives in `core/age.rs` and is unit-tested there; what these tests
//! guard is the half that is easy to get wrong later — that every door a card
//! comes through stamps, that nothing of it reaches the file, and that the
//! Inbox is read against its own shorter deadline.

use chrono::{Duration, NaiveDate};
use jott_core::{Band, Notebook};

fn notebook() -> (tempfile::TempDir, Notebook) {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    (dir, notebook)
}

/// Writes a task list by hand, so the creation date is ours to choose.
fn list_with(dir: &std::path::Path, created: NaiveDate) {
    std::fs::write(
        dir.join("jott.tasks/task-list.md"),
        format!("- [ ] Comprar tinta <!--id:abc123 created:{created}-->\n"),
    )
    .unwrap();
}

#[test]
fn a_listed_task_carries_the_age_of_its_creation() {
    let (dir, notebook) = notebook();
    let today = notebook.today();
    list_with(dir.path(), today - Duration::days(12));

    let tasks = notebook.tasks_in("jott.tasks/task-list.md").unwrap();
    let age = tasks[0].age.expect("a listed task is stamped");
    assert_eq!(age.days, 12);
    assert_eq!(age.band, Band::Stale);
}

#[test]
fn the_age_is_never_written_to_the_file() {
    // The one thing a derived field must never do: get back into the `.md`.
    let (dir, notebook) = notebook();
    let today = notebook.today();
    list_with(dir.path(), today - Duration::days(3));
    let before = std::fs::read_to_string(dir.path().join("jott.tasks/task-list.md")).unwrap();

    let tasks = notebook.tasks_in("jott.tasks/task-list.md").unwrap();
    assert!(tasks[0].age.is_some());
    // An edit that rewrites the list: the age must not travel with it.
    notebook
        .set_task_fields("jott.tasks/task-list.md", "abc123", Default::default())
        .unwrap();
    let after = std::fs::read_to_string(dir.path().join("jott.tasks/task-list.md")).unwrap();
    assert!(!after.contains("age"), "{after}");
    assert_eq!(before, after);
}

#[test]
fn every_door_a_task_card_comes_through_stamps_it() {
    // The Day, the Completed screen and the suggestions all draw the same
    // card as a list does; a door that forgot to stamp would show a card
    // with no age and nobody would know which one.
    let (dir, notebook) = notebook();
    let today = notebook.today();
    list_with(dir.path(), today - Duration::days(40));

    let id = notebook
        .ensure_task_id("jott.tasks/task-list.md", 0)
        .unwrap();
    notebook
        .pull_into_day(None, "jott.tasks/task-list.md", &id)
        .unwrap();

    let day = notebook.day_tasks(None).unwrap();
    assert_eq!(day[0].task.age.map(|age| age.band), Some(Band::Forgotten));

    let offered = notebook
        .grouped_suggestions(Some(today + Duration::days(1)))
        .unwrap();
    assert!(
        offered.iter().all(|s| s.task.age.is_some()),
        "a suggestion came through unstamped"
    );

    notebook
        .complete_task("jott.tasks/task-list.md", &id)
        .unwrap();
    let done = notebook.completed_all().unwrap();
    assert_eq!(done[0].task.age.map(|age| age.days), Some(40));
}

#[test]
fn a_task_with_no_creation_date_has_no_age() {
    // A file written by another tool between two opens. Inventing an age for
    // it would be a number the card draws and nothing backs.
    let (dir, notebook) = notebook();
    std::fs::write(dir.path().join("jott.tasks/task-list.md"), "- [ ] Solta\n").unwrap();
    let tasks = notebook.tasks_in("jott.tasks/task-list.md").unwrap();
    assert_eq!(tasks[0].age, None);
}

#[test]
fn a_listed_note_carries_when_it_was_last_seen() {
    let (_dir, notebook) = notebook();
    let path = notebook.create_note("jott.notes", "Ideias", "Ideia").unwrap();
    notebook.mark_note_seen("jott.notes", &path).unwrap();

    let notes = notebook.notes_in("jott.notes", "").unwrap();
    let entry = notes.iter().find(|n| n.path == path).unwrap();
    assert!(entry.seen.is_some(), "the stamp did not reach the listing");
    assert_eq!(entry.age.map(|age| age.days), Some(0));
}

#[test]
fn a_note_nobody_opened_ages_from_its_own_dates() {
    let (dir, notebook) = notebook();
    let today = notebook.today();
    let born = today - Duration::days(45);
    std::fs::create_dir_all(dir.path().join("jott.notes/Ideias")).unwrap();
    std::fs::write(
        dir.path().join("jott.notes/Ideias/Velha.md"),
        format!("---\ncreated: {born}\n---\n\nTexto\n"),
    )
    .unwrap();

    let notes = notebook.notes_in("jott.notes", "").unwrap();
    let entry = notes.iter().find(|n| n.title == "Velha").unwrap();
    assert_eq!(entry.seen, None);
    // The mtime is today's — the file was just written — and it is allowed to
    // speak only because nothing has ever been seen (`core/age.rs`).
    assert_eq!(entry.age.map(|age| age.days), Some(0));
}

#[test]
fn the_inbox_goes_forgotten_sooner_than_a_space_someone_built() {
    let (dir, notebook) = notebook();
    let today = notebook.today();
    let born = today - Duration::days(10);
    let note = format!("---\ncreated: {born}\n---\n\nTexto\n");
    std::fs::write(dir.path().join("jott.notes/Inbox/Passando.md"), &note).unwrap();
    std::fs::create_dir_all(dir.path().join("jott.notes/Ideias")).unwrap();
    std::fs::write(dir.path().join("jott.notes/Ideias/Guardada.md"), &note).unwrap();
    // Both were seen ten days ago, so the mtime of the file just written does
    // not answer for either.
    let stamp = (born).and_hms_opt(9, 0, 0).unwrap();
    let mut seen = notebook.seen();
    seen.mark("jott.notes/Inbox/Passando.md", stamp);
    seen.mark("jott.notes/Ideias/Guardada.md", stamp);
    seen.save(dir.path().join(".jott")).unwrap();

    let notes = notebook.notes_in("jott.notes", "").unwrap();
    let band = |title: &str| {
        notes
            .iter()
            .find(|n| n.title == title)
            .unwrap()
            .age
            .unwrap()
            .band
    };
    assert_eq!(band("Passando"), Band::Forgotten);
    assert_eq!(band("Guardada"), Band::Stale);
}
