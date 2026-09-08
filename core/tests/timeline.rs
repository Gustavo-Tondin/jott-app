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

// ---------------------------------------------------------------- completed
// The Timeline's month has a "tasks completed" line (wireframe of
// 2026-08-27), and it counts the STATE: ticked is in, unticked is out.

const COMPLETED: &str = "jott.tasks/completed.md";

#[test]
fn ticking_a_task_dates_its_completion_and_unticking_forgets_it() {
    let (_dir, nb) = notebook();
    nb.create_task(INBOX, "comprar pão").unwrap();
    let id = all(&nb)[0].id.clone().unwrap();
    assert_eq!(all(&nb)[0].completed, None);

    nb.complete_task(INBOX, &id).unwrap();
    let items = all(&nb);
    assert_eq!(items.len(), 1, "{items:?}");
    assert_eq!(items[0].completed, Some(today()));
    assert_eq!(items[0].path, COMPLETED);

    nb.uncomplete_task(COMPLETED, &id).unwrap();
    let items = all(&nb);
    assert_eq!(items[0].completed, None, "reopened: {items:?}");
    assert_eq!(items[0].path, INBOX);

    nb.complete_task(INBOX, &id).unwrap();
    assert_eq!(all(&nb)[0].completed, Some(today()), "and ticked again");
}

#[test]
fn a_finished_task_thrown_away_still_counts_as_finished() {
    let (_dir, nb) = notebook();
    nb.create_task(INBOX, "comprar pão").unwrap();
    let id = all(&nb)[0].id.clone().unwrap();
    nb.complete_task(INBOX, &id).unwrap();
    nb.delete_task(COMPLETED, &id).unwrap();

    // Born and deleted today: invisible — so ask the log directly.
    let items = timeline::resolve(&timeline::read(_dir.path().join(".jott")));
    assert_eq!(items.len(), 1, "{items:?}");
    assert!(!items[0].alive());
    assert_eq!(items[0].completed, Some(today()), "the month keeps its count");
}

#[test]
fn the_window_holds_what_was_ticked_in_it_even_when_born_before() {
    // The screen asks one year at a time. A task from last year finished
    // this year is this year's "completed" line — filtered by birth alone it
    // would be nowhere.
    let (dir, _fresh) = notebook();
    let long_ago = days_ago(400);
    timeline::append(
        dir.path().join(".jott"),
        &[
            Record::created(
                long_ago.and_hms_opt(9, 0, 0).unwrap(),
                Kind::Task,
                INBOX,
                long_ago,
                "velha",
            )
            .with_id("old001"),
            Record::completed(today().and_hms_opt(9, 0, 0).unwrap(), COMPLETED, today())
                .with_id("old001"),
        ],
    )
    .unwrap();
    let nb = Notebook::open(dir.path()).unwrap();

    let recent = nb.timeline(Some(days_ago(30)), None).unwrap();
    let found = recent.iter().find(|item| item.id.as_deref() == Some("old001"));
    assert!(found.is_some(), "ticked inside the window: {recent:?}");
    assert_eq!(found.unwrap().created, long_ago, "born outside it");

    let old = nb.timeline(None, Some(days_ago(300))).unwrap();
    assert!(
        old.iter().any(|item| item.id.as_deref() == Some("old001")),
        "and in the window it was born in: {old:?}"
    );
}

#[test]
fn a_notebook_older_than_the_completed_line_arrives_with_its_completions() {
    // Finished before the log knew how to say so (or ticked by hand in the
    // file): the sweep logs it with the day the task's own `completed:` says.
    let (dir, nb) = notebook();
    nb.create_task(INBOX, "comprar pão").unwrap();
    let id = all(&nb)[0].id.clone().unwrap();
    nb.complete_task(INBOX, &id).unwrap();
    drop(nb);

    // Forget the log entirely; the files stay.
    std::fs::remove_dir_all(timeline::dir_of(dir.path().join(".jott"))).unwrap();
    let nb = Notebook::open(dir.path()).unwrap();
    let items = all(&nb);
    assert_eq!(items.len(), 1, "{items:?}");
    assert_eq!(items[0].completed, Some(today()));
    assert_eq!(items[0].path, COMPLETED);

    // And a task unticked by hand is reopened by the next sweep.
    nb.uncomplete_task(COMPLETED, &id).unwrap();
    assert_eq!(all(&nb)[0].completed, None);
}

// -------------------------------------------------------------------- space

#[test]
fn every_item_is_told_its_space() {
    let (_dir, nb) = notebook();
    nb.create_note(NOTES_DIR, "Inbox", "Ideia").unwrap();
    nb.create_task(INBOX, "pão").unwrap();
    for item in all(&nb) {
        let expected = match item.kind {
            Kind::Note => "jott.notes",
            Kind::Task => "jott.tasks",
        };
        assert_eq!(item.space.as_deref(), Some(expected), "{item:?}");
    }
}

// ---------------------------------------------------------- years and remove

#[test]
fn the_years_are_the_files_the_log_has() {
    let (dir, nb) = notebook();
    assert_eq!(nb.timeline_years(), Vec::<i32>::new());
    nb.create_note(NOTES_DIR, "Inbox", "Ideia").unwrap();
    let this_year = today().format("%Y").to_string().parse::<i32>().unwrap();
    assert_eq!(nb.timeline_years(), vec![this_year]);

    // An older year, and a sync conflict copy of it.
    let folder = timeline::dir_of(dir.path().join(".jott"));
    std::fs::write(folder.join("2019.jsonl"), "").unwrap();
    std::fs::write(folder.join("2019 (conflicted copy).jsonl"), "").unwrap();
    assert_eq!(nb.timeline_years(), vec![this_year, 2019], "newest first, once each");
}

#[test]
fn removing_one_thing_from_the_timeline_leaves_every_other_line_as_it_was() {
    let (dir, nb) = notebook();
    let keep = nb.create_note(NOTES_DIR, "Inbox", "Fica").unwrap();
    let gone = nb.create_note(NOTES_DIR, "Inbox", "Some").unwrap();
    nb.rename_note(NOTES_DIR, &gone, "Sumiu").unwrap();
    nb.create_task(INBOX, "pão").unwrap();
    let task_id = all(&nb)
        .iter()
        .find(|item| item.kind == Kind::Task)
        .and_then(|item| item.id.clone())
        .unwrap();

    let year = timeline::dir_of(dir.path().join(".jott"))
        .join(format!("{}.jsonl", today().format("%Y")));
    let before = std::fs::read_to_string(&year).unwrap();
    let survivors: Vec<&str> = before
        .lines()
        .filter(|line| !line.contains("Some.md") && !line.contains("Sumiu.md"))
        .collect();

    let removed = nb
        .forget_from_timeline(&timeline::Key::Note("jott.notes/Inbox/Sumiu.md".into()))
        .unwrap();
    assert_eq!(removed, 2, "the birth and the rename");

    let after = std::fs::read_to_string(&year).unwrap();
    assert_eq!(after.lines().collect::<Vec<_>>(), survivors, "byte for byte");
    assert!(year.with_extension("jsonl.bak").is_file(), "with a backup beside it");
    let titles: Vec<String> = all(&nb).into_iter().map(|item| item.title).collect();
    assert!(titles.contains(&"Fica".to_string()), "{titles:?}");
    assert!(!titles.iter().any(|t| t == "Sumiu"), "{titles:?}");
    let _ = keep;

    // A task goes by its id, and asking twice is harmless.
    assert_eq!(nb.forget_from_timeline(&timeline::Key::Task(task_id.clone())).unwrap(), 1);
    assert_eq!(nb.forget_from_timeline(&timeline::Key::Task(task_id)).unwrap(), 0);
    assert!(all(&nb).iter().all(|item| item.kind == Kind::Note));
}

/// The log's own lines and files, without a notebook: the round trip of
/// a record, the file a year lands in, and how the records resolve.
mod lines {
    use chrono::{NaiveDate, NaiveDateTime};

    use jott_core::timeline::*;

    fn at(day: u32, hour: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 8, day)
            .unwrap()
            .and_hms_opt(hour, 0, 0)
            .unwrap()
    }

    fn day(d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 8, d).unwrap()
    }

    fn note_born(d: u32, path: &str) -> Record {
        Record::created(at(d, 9), Kind::Note, path, day(d), "Ideia")
    }

    #[test]
    fn a_line_survives_the_round_trip() {
        for record in [
            note_born(20, "jott.notes/a.md"),
            Record::moved(at(21, 9), Kind::Note, "jott.notes/a.md", "Pessoal/a.md"),
            Record::gone(at(22, 9), Kind::Note, "Pessoal/a.md", Event::Deleted),
            Record::created(at(20, 9), Kind::Task, "jott.tasks/task-list.md", day(1), "pão")
                .with_id("abc123"),
        ] {
            let text = record.render();
            assert!(!text.contains('\n'), "{text}");
            assert_eq!(Record::parse(&text), Some(record));
        }
    }

    #[test]
    fn a_line_this_build_cannot_read_is_skipped_and_not_guessed_at() {
        for line in [
            "",
            "   ",
            "{ half a li",
            r#"{"v":2,"at":"2026-08-20T09:00","event":"created","kind":"note","path":"a.md"}"#,
            r#"{"v":1,"at":"2026-08-20T09:00","event":"exploded","kind":"note","path":"a.md"}"#,
            r#"{"v":1,"at":"2026-08-20T09:00","event":"created","kind":"whiteboard","path":"a.md"}"#,
            r#"{"v":1,"at":"whenever","event":"created","kind":"note","path":"a.md"}"#,
        ] {
            assert_eq!(Record::parse(line), None, "{line}");
        }
    }

    #[test]
    fn a_newer_builds_extra_keys_ride_along_untouched() {
        // Nothing is ever rewritten, so an unknown key survives by simply
        // being left where it is. What matters is that it does not stop the
        // line being read.
        let line = r#"{"v":1,"at":"2026-08-20T09:00","event":"created","kind":"note",
            "path":"a.md","created":"2026-08-20","title":"Ideia","mood":"blue"}"#
            .replace('\n', "");
        let record = Record::parse(&line).unwrap();
        assert_eq!(record.title.as_deref(), Some("Ideia"));
    }

    #[test]
    fn lines_land_in_the_file_for_their_year() {
        let dir = tempfile::tempdir().unwrap();
        let last_year = NaiveDate::from_ymd_opt(2025, 12, 31)
            .unwrap()
            .and_hms_opt(23, 59, 0)
            .unwrap();
        append(
            dir.path(),
            &[
                note_born(20, "jott.notes/a.md"),
                Record::created(last_year, Kind::Note, "jott.notes/b.md", day(20), "Velha"),
            ],
        )
        .unwrap();
        assert!(dir_of(dir.path()).join("2026.jsonl").is_file());
        assert!(dir_of(dir.path()).join("2025.jsonl").is_file());
    }

    #[test]
    fn appending_never_touches_the_lines_already_there() {
        let dir = tempfile::tempdir().unwrap();
        append(dir.path(), &[note_born(20, "jott.notes/a.md")]).unwrap();
        let first = std::fs::read_to_string(dir_of(dir.path()).join("2026.jsonl")).unwrap();
        append(dir.path(), &[note_born(21, "jott.notes/b.md")]).unwrap();
        let both = std::fs::read_to_string(dir_of(dir.path()).join("2026.jsonl")).unwrap();
        assert!(both.starts_with(&first), "{both}");
        assert_eq!(both.lines().count(), 2);
    }

    #[test]
    fn a_torn_last_line_costs_only_that_line() {
        let dir = tempfile::tempdir().unwrap();
        append(
            dir.path(),
            &[note_born(20, "jott.notes/a.md"), note_born(21, "jott.notes/b.md")],
        )
        .unwrap();
        let path = dir_of(dir.path()).join("2026.jsonl");
        let text = std::fs::read_to_string(&path).unwrap();
        std::fs::write(&path, format!("{text}{{\"v\":1,\"at\":\"2026-08-2")).unwrap();

        assert_eq!(read(dir.path()).len(), 2);
    }

    #[test]
    fn a_sync_conflict_copy_is_read_too_and_identical_lines_count_once() {
        let dir = tempfile::tempdir().unwrap();
        append(dir.path(), &[note_born(20, "jott.notes/a.md")]).unwrap();
        let path = dir_of(dir.path()).join("2026.jsonl");
        let mine = std::fs::read_to_string(&path).unwrap();
        // What a sync tool leaves behind: the same file, plus the other
        // machine's line.
        std::fs::write(
            dir_of(dir.path()).join("2026 (conflicted copy 2026-08-21).jsonl"),
            format!("{mine}{}\n", note_born(21, "jott.notes/b.md").render()),
        )
        .unwrap();

        let records = read(dir.path());
        assert_eq!(records.len(), 2, "{records:?}");
        assert_eq!(records[0].path, "jott.notes/a.md");
        assert_eq!(records[1].path, "jott.notes/b.md");
    }

    #[test]
    fn an_empty_folder_reads_as_an_empty_log() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read(dir.path()).is_empty());
        assert!(resolve(&[]).is_empty());
    }

    #[test]
    fn a_note_that_moved_twice_is_still_one_thing() {
        let items = resolve(&[
            note_born(20, "jott.notes/a.md"),
            Record::moved(at(21, 9), Kind::Note, "jott.notes/a.md", "jott.notes/2026/a.md"),
            Record::moved(at(22, 9), Kind::Note, "jott.notes/2026/a.md", "Pessoal/a.md"),
        ]);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].path, "Pessoal/a.md");
        assert_eq!(items[0].created, day(20));
        assert!(items[0].alive());
    }

    #[test]
    fn a_task_is_followed_by_its_id_and_not_by_its_list() {
        let items = resolve(&[
            Record::created(at(20, 9), Kind::Task, "jott.tasks/task-list.md", day(20), "pão")
                .with_id("abc"),
            Record::moved(at(21, 9), Kind::Task, "jott.tasks/task-list.md", "Mercado/task-list.md")
                .with_id("abc"),
        ]);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].path, "Mercado/task-list.md");
        assert_eq!(items[0].id.as_deref(), Some("abc"));
    }

    #[test]
    fn what_was_deleted_stays_as_a_ghost_with_the_day_it_went() {
        let items = resolve(&[
            note_born(20, "jott.notes/a.md"),
            Record::gone(at(25, 9), Kind::Note, "jott.notes/a.md", Event::Deleted),
        ]);
        assert_eq!(items[0].deleted, Some(day(25)));
        assert!(!items[0].alive());
        assert!(items[0].visible(), "a ghost from another day is shown");
        // The ghost still hangs on the day it was BORN, not the day it went.
        assert_eq!(items[0].created, day(20));
    }

    #[test]
    fn created_and_deleted_on_the_same_day_never_happened() {
        let items = resolve(&[
            note_born(20, "jott.notes/a.md"),
            Record::gone(at(20, 18), Kind::Note, "jott.notes/a.md", Event::Deleted),
        ]);
        assert!(!items[0].visible());
    }

    #[test]
    fn restoring_from_the_trash_puts_the_ghost_away() {
        let items = resolve(&[
            note_born(20, "jott.notes/a.md"),
            Record::gone(at(25, 9), Kind::Note, "jott.notes/a.md", Event::Deleted),
            Record::gone(at(26, 9), Kind::Note, "jott.notes/a.md", Event::Restored),
        ]);
        assert!(items[0].alive());
        assert!(items[0].visible());
    }

    #[test]
    fn a_new_note_at_a_dead_notes_address_is_a_new_note() {
        let items = resolve(&[
            note_born(20, "jott.notes/a.md"),
            Record::gone(at(21, 9), Kind::Note, "jott.notes/a.md", Event::Deleted),
            Record::created(at(25, 9), Kind::Note, "jott.notes/a.md", day(25), "Outra"),
        ]);
        assert_eq!(items.len(), 2);
        assert_eq!(items[1].title, "Outra");
        assert!(items[1].alive());
        assert!(!items[0].alive());
    }

    #[test]
    fn a_duplicate_birth_of_a_live_thing_is_one_thing() {
        let items = resolve(&[note_born(20, "jott.notes/a.md"), note_born(20, "jott.notes/a.md")]);
        assert_eq!(items.len(), 1);
    }

    #[test]
    fn a_line_about_something_that_was_never_born_is_ignored() {
        // The axis is the creation date; an entry with none has nowhere to
        // be drawn, and inventing one would put it on the wrong day forever.
        let items = resolve(&[
            Record::gone(at(20, 9), Kind::Note, "jott.notes/ghost.md", Event::Deleted),
            Record::moved(at(21, 9), Kind::Note, "a.md", "b.md"),
        ]);
        assert!(items.is_empty());
    }
}
