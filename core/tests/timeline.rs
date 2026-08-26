//! The durable log against a real notebook (F4 of the time axis, spec 3.6).
//!
//! What is being proved here is the promise the Timeline screen makes: it
//! shows everything the notebook has ever held, on the day it was born,
//! including the things that are no longer there.

use jott_core::timeline::{self, Event, Kind, Record};
use jott_core::{Notebook, NOTES_DIR};

const INBOX: &str = "jott.tasks/task-list.md";

fn today() -> chrono::NaiveDate {
    jott_core::clock::civil_today()
}

fn days_ago(n: i64) -> chrono::NaiveDate {
    today() - chrono::Duration::days(n)
}

fn notebook() -> (tempfile::TempDir, Notebook) {
    let dir = tempfile::tempdir().unwrap();
    let nb = Notebook::init(dir.path()).unwrap();
    (dir, nb)
}

/// Everything the log says, unfiltered by date.
fn all(nb: &Notebook) -> Vec<jott_core::TimelineItem> {
    nb.timeline(None, None).unwrap()
}

#[test]
fn a_note_lands_on_the_timeline_the_day_it_is_written() {
    let (_dir, nb) = notebook();
    nb.create_note(NOTES_DIR, "Inbox", "Ideia").unwrap();

    let items = all(&nb);
    assert_eq!(items.len(), 1, "{items:?}");
    assert_eq!(items[0].kind, Kind::Note);
    assert_eq!(items[0].title, "Ideia");
    assert_eq!(items[0].created, today());
    assert!(items[0].alive());
}

#[test]
fn a_task_lands_on_it_too_and_is_followed_into_completed() {
    let (_dir, nb) = notebook();
    nb.create_task(INBOX, "comprar pão").unwrap();

    let items = all(&nb);
    assert_eq!(items.len(), 1, "{items:?}");
    let id = items[0].id.clone().expect("a task is born with an id");
    assert_eq!(items[0].path, INBOX);

    // Completing moves it to the space's Completed — the same thing, in a
    // different place. A completed task stays on the Timeline by its
    // creation date (spec 3.6).
    nb.complete_task(INBOX, &id).unwrap();
    let items = all(&nb);
    assert_eq!(items.len(), 1, "{items:?}");
    assert_eq!(items[0].path, "jott.tasks/completed.md");
    assert_eq!(items[0].created, today());
}

#[test]
fn renaming_and_moving_a_note_keeps_it_one_thing() {
    let (dir, nb) = notebook();
    let path = nb.create_note(NOTES_DIR, "Inbox", "Ideia").unwrap();
    let renamed = nb.rename_note(NOTES_DIR, &path, "Outra").unwrap();
    nb.create_note_folder(NOTES_DIR, "2026").unwrap();
    nb.move_note(NOTES_DIR, &renamed, "2026").unwrap();

    let items = all(&nb);
    assert_eq!(items.len(), 1, "{items:?}");
    assert_eq!(items[0].path, "jott.notes/2026/Outra.md");
    // The live title is the CURRENT one, not the one it was born with.
    assert_eq!(items[0].title, "Outra");
    assert!(dir.path().join("jott.notes/2026/Outra.md").exists());
}

#[test]
fn something_deleted_the_day_it_was_made_never_happened() {
    let (_dir, nb) = notebook();
    let path = nb.create_note(NOTES_DIR, "Inbox", "Engano").unwrap();
    nb.delete_note(NOTES_DIR, &path).unwrap();

    assert!(all(&nb).is_empty(), "an accident is not a memory");
}

#[test]
fn something_deleted_later_stays_as_a_ghost_on_the_day_it_was_born() {
    let (dir, _fresh) = notebook();
    // Born a week ago, as far as the log is concerned.
    timeline::append(
        dir.path().join(".jott"),
        &[Record::created(
            days_ago(7).and_hms_opt(9, 0, 0).unwrap(),
            Kind::Note,
            "jott.notes/Velha.md",
            days_ago(7),
            "Velha",
        )],
    )
    .unwrap();
    std::fs::write(dir.path().join("jott.notes/Velha.md"), "texto\n").unwrap();
    let nb = Notebook::open(dir.path()).unwrap();
    assert_eq!(all(&nb).len(), 1);

    nb.delete_note(NOTES_DIR, "Velha.md").unwrap();
    let items = all(&nb);
    assert_eq!(items.len(), 1, "the ghost stays: {items:?}");
    assert!(!items[0].alive());
    assert_eq!(items[0].created, days_ago(7), "on the day it was BORN");
    assert_eq!(items[0].title, "Velha", "with the name it had");
}

#[test]
fn restoring_from_the_trash_puts_the_ghost_away() {
    let (dir, _fresh) = notebook();
    timeline::append(
        dir.path().join(".jott"),
        &[Record::created(
            days_ago(7).and_hms_opt(9, 0, 0).unwrap(),
            Kind::Note,
            "jott.notes/Velha.md",
            days_ago(7),
            "Velha",
        )],
    )
    .unwrap();
    std::fs::write(dir.path().join("jott.notes/Velha.md"), "texto\n").unwrap();
    let nb = Notebook::open(dir.path()).unwrap();
    nb.delete_note(NOTES_DIR, "Velha.md").unwrap();
    assert!(!all(&nb)[0].alive());

    let trashed = nb.trash_entries();
    nb.restore_from_trash(&trashed[0].id).unwrap();
    let items = all(&nb);
    assert_eq!(items.len(), 1, "{items:?}");
    assert!(items[0].alive(), "back from the trash is back on the timeline");
}

#[test]
fn a_notebook_older_than_the_log_arrives_with_its_history() {
    // The point of the sweep: a notebook written before any of this existed
    // must not read as "nothing ever happened here".
    let dir = tempfile::tempdir().unwrap();
    Notebook::init(dir.path()).unwrap();
    std::fs::write(
        dir.path().join("jott.notes/Antiga.md"),
        format!("---\ncreated: {}\n---\n\ntexto\n", days_ago(30)),
    )
    .unwrap();
    std::fs::write(
        dir.path().join(INBOX),
        format!("- [ ] antiga <!--created:{}-->\n", days_ago(20)),
    )
    .unwrap();

    let nb = Notebook::open(dir.path()).unwrap();
    let items = all(&nb);
    assert_eq!(items.len(), 2, "{items:?}");
    let note = items.iter().find(|i| i.kind == Kind::Note).unwrap();
    let task = items.iter().find(|i| i.kind == Kind::Task).unwrap();
    assert_eq!(note.created, days_ago(30), "the note's own date, not today");
    assert_eq!(task.created, days_ago(20), "the task's own date, not today");
    assert!(task.id.is_some(), "and it earned an id on the way in");
}

#[test]
fn a_note_deleted_outside_the_app_is_noticed_on_the_next_open() {
    let (dir, nb) = notebook();
    let path = nb.create_note(NOTES_DIR, "Inbox", "Ideia").unwrap();
    // Backdate the birth, so the ghost is not swallowed by the same-day rule.
    let log = dir.path().join(".jott/timeline");
    let year = std::fs::read_dir(&log).unwrap().next().unwrap().unwrap().path();
    let text = std::fs::read_to_string(&year).unwrap();
    std::fs::write(&year, text.replace(&today().to_string(), &days_ago(9).to_string())).unwrap();

    std::fs::remove_file(dir.path().join(NOTES_DIR).join(&path)).unwrap();
    let nb = Notebook::open(dir.path()).unwrap();

    let items = all(&nb);
    assert_eq!(items.len(), 1, "{items:?}");
    assert!(!items[0].alive(), "gone from disk is gone: {items:?}");
}

#[test]
fn renaming_a_space_carries_everything_under_it() {
    let dir = tempfile::tempdir().unwrap();
    Notebook::init(dir.path()).unwrap();
    std::fs::create_dir_all(dir.path().join("Trabalho")).unwrap();
    std::fs::write(
        dir.path().join("Trabalho/.space.json"),
        r#"{"schemaVersion":1,"type":"notes"}"#,
    )
    .unwrap();
    let mut nb = Notebook::open(dir.path()).unwrap();
    nb.create_note("Trabalho", "", "Briefing").unwrap();
    nb.rename_space("Trabalho", "Clientes").unwrap();

    let items = all(&nb);
    assert_eq!(items.len(), 1, "{items:?}");
    assert_eq!(items[0].path, "Clientes/Briefing.md");
    assert!(items[0].alive());
}

#[test]
fn the_log_is_only_ever_appended_to() {
    let (dir, nb) = notebook();
    let path = nb.create_note(NOTES_DIR, "Inbox", "Ideia").unwrap();
    let year = jott_core::timeline::dir_of(dir.path().join(".jott"))
        .join(format!("{}.jsonl", today().format("%Y")));
    let after_birth = std::fs::read_to_string(&year).unwrap();

    nb.rename_note(NOTES_DIR, &path, "Outra").unwrap();
    let after_rename = std::fs::read_to_string(&year).unwrap();
    assert!(
        after_rename.starts_with(&after_birth),
        "the birth line must still be there, byte for byte:\n{after_rename}"
    );
    assert!(after_rename.len() > after_birth.len());
}

#[test]
fn the_dates_asked_for_are_the_ones_answered() {
    let (dir, _nb) = notebook();
    let config = dir.path().join(".jott");
    timeline::append(
        &config,
        &[
            Record::created(
                days_ago(30).and_hms_opt(9, 0, 0).unwrap(),
                Kind::Note,
                "jott.notes/Velha.md",
                days_ago(30),
                "Velha",
            ),
            Record::created(
                days_ago(2).and_hms_opt(9, 0, 0).unwrap(),
                Kind::Note,
                "jott.notes/Nova.md",
                days_ago(2),
                "Nova",
            ),
            // And a ghost, so the window is not just filtering live things.
            Record::gone(
                days_ago(1).and_hms_opt(9, 0, 0).unwrap(),
                Kind::Note,
                "jott.notes/Velha.md",
                Event::Deleted,
            ),
        ],
    )
    .unwrap();
    let nb = Notebook::open(dir.path()).unwrap();

    let recent = nb.timeline(Some(days_ago(7)), None).unwrap();
    assert_eq!(recent.len(), 1, "{recent:?}");
    assert_eq!(recent[0].title, "Nova");

    let old = nb.timeline(None, Some(days_ago(7))).unwrap();
    assert_eq!(old.len(), 1, "{old:?}");
    assert_eq!(old[0].title, "Velha");
    assert!(!old[0].alive(), "and it is still a ghost");
}

#[test]
fn undoing_an_action_never_rewrites_the_log() {
    // The log is append-only, and `Ctrl+Z` is not an exception: rolling a
    // line back would delete history that is meant to outlive the session.
    let (dir, mut nb) = notebook();
    let mut history = jott_core::History::new();
    let path = nb.create_note(NOTES_DIR, "Inbox", "Ideia").unwrap();
    let year = jott_core::timeline::dir_of(dir.path().join(".jott"))
        .join(format!("{}.jsonl", today().format("%Y")));

    nb.record(&mut history, "rename_note", |nb| {
        nb.rename_note(NOTES_DIR, &path, "Outra")
    })
    .unwrap();
    let after_rename = std::fs::read_to_string(&year).unwrap();
    assert_eq!(nb.undo(&mut history).unwrap().as_deref(), Some("rename_note"));
    assert_eq!(
        std::fs::read_to_string(&year).unwrap(),
        after_rename,
        "the undo restored the note, not the log"
    );
}
