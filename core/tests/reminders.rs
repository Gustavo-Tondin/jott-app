//! What the notebook offers to ring, and what a device acknowledging a
//! reminder does to the other one. The ack is an index — `acks.<device>.json`
//! beside the other two — so "dismissed on the phone" travels as a file.

mod common;

use std::path::Path;

use jott_core::seen::{Index, Seen};
use jott_core::task::parse_datetime;
use jott_core::{reminders, Notebook};

/// A notebook with one Inbox task asking to be rung at `at`.
fn notebook_ringing_at(at: &str) -> (tempfile::TempDir, Notebook, String, String) {
    let (dir, notebook, id) = common::notebook_with_task("Ligar pro dentista");
    let list = Notebook::inbox_path();
    notebook
        .set_task_fields(
            &list,
            &id,
            jott_core::task::TaskFields {
                remind: Some(Some(at.to_string())),
                ..Default::default()
            },
        )
        .unwrap();
    (dir, notebook, list, id)
}

/// Writes an ack file straight into the notebook's index — what a sync tool
/// would leave there. `name` is the whole file name, so a test can play
/// another device (`acks.phone1.json`) or this one (`acks.json`).
fn write_acks(config_dir: &Path, name: &str, entries: &[(&str, &str)]) {
    let index = config_dir.join(jott_core::seen::INDEX_DIR);
    std::fs::create_dir_all(&index).unwrap();
    let body: Vec<String> = entries
        .iter()
        .map(|(key, at)| format!("{key:?}:{at:?}"))
        .collect();
    std::fs::write(index.join(name), format!("{{{}}}", body.join(","))).unwrap();
}

fn ringing(notebook: &Notebook) -> Vec<String> {
    notebook
        .reminders()
        .unwrap()
        .into_iter()
        .map(|reminder| reminder.at)
        .collect()
}

#[test]
fn a_task_rings_until_some_device_acknowledges_it() {
    let (_dir, notebook, list, id) = notebook_ringing_at("2026-07-24T18:00");
    assert_eq!(ringing(&notebook), ["2026-07-24T18:00"]);

    notebook
        .ack_reminder(&list, &id, jott_core::task::parse_datetime("2026-07-24T18:00").unwrap())
        .unwrap();
    assert!(ringing(&notebook).is_empty());
}

#[test]
fn a_reminder_says_where_its_task_lives_and_when_it_is_due() {
    let (_dir, notebook, list, id) = notebook_ringing_at("2026-07-24T18:00");
    let reminder = &notebook.reminders().unwrap()[0];
    assert_eq!(reminder.place, "Tasks", "the main list reads as its space");
    assert_eq!(reminder.due, None);

    notebook
        .set_task_fields(
            &list,
            &id,
            jott_core::task::TaskFields {
                due: Some(Some("2026-07-25".to_string())),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(notebook.reminders().unwrap()[0].due.as_deref(), Some("2026-07-25"));
}

#[test]
fn an_ack_left_by_another_device_silences_this_one() {
    let (_dir, notebook, list, id) = notebook_ringing_at("2026-07-24T18:00");
    write_acks(
        &notebook.config_dir(),
        "acks.phone1.json",
        &[(
            &reminders::ack_key(&list, &id, parse_datetime("2026-07-24T18:00").unwrap()),
            "2026-07-24T18:00",
        )],
    );
    assert!(ringing(&notebook).is_empty(), "the phone already rang it");
}

#[test]
fn a_reminder_moved_later_is_a_new_one() {
    let (_dir, notebook, list, id) = notebook_ringing_at("2026-07-24T18:00");
    notebook
        .ack_reminder(&list, &id, jott_core::task::parse_datetime("2026-07-24T18:00").unwrap())
        .unwrap();

    notebook
        .set_task_fields(
            &list,
            &id,
            jott_core::task::TaskFields {
                remind: Some(Some("2026-07-25T09:00".into())),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(ringing(&notebook), ["2026-07-25T09:00"]);
}

#[test]
fn a_reminder_moved_earlier_rings_again() {
    let (_dir, notebook, list, id) = notebook_ringing_at("2026-07-25T09:00");
    notebook
        .ack_reminder(&list, &id, parse_datetime("2026-07-25T09:00").unwrap())
        .unwrap();
    assert!(ringing(&notebook).is_empty());

    notebook
        .set_task_fields(
            &list,
            &id,
            jott_core::task::TaskFields {
                remind: Some(Some("2026-07-24T18:00".into())),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(
        ringing(&notebook),
        ["2026-07-24T18:00"],
        "moved to any other moment, the reminder is a new one"
    );
}

#[test]
fn an_ack_names_the_moment_it_acknowledged() {
    let (_dir, notebook, list, id) = notebook_ringing_at("2026-07-24T18:00");
    let at = parse_datetime("2026-07-24T18:00").unwrap();
    notebook.ack_reminder(&list, &id, at).unwrap();

    let acks = Seen::load_of(notebook.config_dir(), Index::Acked);
    let keys: Vec<&String> = acks.entries().keys().collect();
    assert_eq!(keys, [&format!("{list}/{id}@2026-07-24T18:00")]);
    assert_eq!(acks.at(keys[0]), Some(at));
}

#[test]
fn an_ack_in_the_old_shape_is_ignored() {
    // What a build before the moment joined the key left behind: it names
    // no reminder any more, and nothing migrates it.
    let (_dir, notebook, list, id) = notebook_ringing_at("2026-07-24T18:00");
    write_acks(
        &notebook.config_dir(),
        "acks.phone1.json",
        &[(&format!("{list}/{id}"), "2026-07-24T18:00")],
    );
    assert_eq!(ringing(&notebook), ["2026-07-24T18:00"]);
}

#[test]
fn renaming_the_space_carries_the_ack_along() {
    let (_dir, mut notebook) = common::init();
    let space = notebook.create_space("Compras", "tasks").unwrap();
    let list = format!("{space}/task-list.md");
    let mut tasks = notebook.open_list(&list).unwrap();
    let id = tasks.add_text_with_id("Ligar pro dentista");
    tasks.save().unwrap();
    notebook
        .set_task_fields(
            &list,
            &id,
            jott_core::task::TaskFields {
                remind: Some(Some("2026-07-24T18:00".into())),
                ..Default::default()
            },
        )
        .unwrap();
    notebook
        .ack_reminder(&list, &id, jott_core::task::parse_datetime("2026-07-24T18:00").unwrap())
        .unwrap();
    assert!(ringing(&notebook).is_empty());

    notebook.rename_space(&space, "Mercado").unwrap();
    assert!(
        ringing(&notebook).is_empty(),
        "the ack has to follow the list, or the reminder comes back from the dead"
    );
}

#[test]
fn a_sweep_drops_the_acks_of_a_list_that_is_gone() {
    let (_dir, notebook, list, id) = notebook_ringing_at("2026-07-24T18:00");
    let alive = reminders::ack_key(&list, &id, parse_datetime("2026-07-24T18:00").unwrap());
    write_acks(
        &notebook.config_dir(),
        "acks.json",
        &[
            (&alive, "2026-07-24T18:00"),
            ("Gone/task-list.md/zz99@2026-07-24T18:00", "2026-07-24T18:00"),
        ],
    );

    assert_eq!(notebook.prune_seen().unwrap(), 1, "only the one with no list goes");
    let acks = Seen::load_of(notebook.config_dir(), Index::Acked);
    assert_eq!(acks.entries().len(), 1);
    assert!(acks.at(&alive).is_some());
}

#[test]
fn pruning_drops_the_acks_of_tasks_that_are_gone() {
    let (_dir, notebook, list, id) = notebook_ringing_at("2026-07-24T18:00");
    let at = parse_datetime("2026-07-24T18:00").unwrap();
    notebook.ack_reminder(&list, &id, at).unwrap();
    assert_eq!(notebook.prune_seen().unwrap(), 0, "the task is still open and asking");

    notebook.complete_task(&list, &id).unwrap();
    assert_eq!(notebook.prune_seen().unwrap(), 1, "a completed task rings no more");
    let acks = Seen::load_of(notebook.config_dir(), Index::Acked);
    assert!(acks.entries().is_empty());
}

#[test]
fn pruning_drops_the_ack_of_a_reminder_that_moved_and_the_old_shape() {
    let (_dir, notebook, list, id) = notebook_ringing_at("2026-07-24T18:00");
    let at = |text: &str| parse_datetime(text).unwrap();
    notebook.ack_reminder(&list, &id, at("2026-07-24T18:00")).unwrap();
    write_acks(
        &notebook.config_dir(),
        "acks.phone1.json",
        &[(&format!("{list}/{id}"), "2026-07-24T18:00")],
    );
    notebook
        .set_task_fields(
            &list,
            &id,
            jott_core::task::TaskFields {
                remind: Some(Some("2026-07-25T09:00".into())),
                ..Default::default()
            },
        )
        .unwrap();

    assert_eq!(notebook.prune_seen().unwrap(), 2, "the moved moment and the old shape");
    // Each device sweeps only its own file: the phone's line stays in the
    // phone's file until the phone sweeps, and names no reminder meanwhile.
    let acks = Seen::load_of(notebook.config_dir(), Index::Acked);
    let keys: Vec<&String> = acks.entries().keys().collect();
    assert_eq!(keys, [&format!("{list}/{id}")]);
    assert_eq!(ringing(&notebook), ["2026-07-25T09:00"]);
}
