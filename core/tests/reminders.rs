//! What the notebook offers to ring, and what a device acknowledging a
//! reminder does to the other one. The ack is an index — `acks.<device>.json`
//! beside the other two — so "dismissed on the phone" travels as a file.

mod common;

use std::path::Path;

use jott_core::seen::{Index, Seen};
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
fn an_ack_left_by_another_device_silences_this_one() {
    let (_dir, notebook, list, id) = notebook_ringing_at("2026-07-24T18:00");
    write_acks(
        &notebook.config_dir(),
        "acks.phone1.json",
        &[(&reminders::ack_key(&list, &id), "2026-07-24T18:00")],
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
fn an_ack_never_goes_backwards() {
    let (_dir, notebook, list, id) = notebook_ringing_at("2026-07-25T09:00");
    let key = reminders::ack_key(&list, &id);
    let at = |text: &str| jott_core::task::parse_datetime(text).unwrap();

    notebook.ack_reminder(&list, &id, at("2026-07-25T09:00")).unwrap();
    // An older moment — a device coming back from a stale copy — must not
    // undo what is already acknowledged.
    notebook.ack_reminder(&list, &id, at("2026-07-24T18:00")).unwrap();
    let acks = Seen::load_of(notebook.config_dir(), Index::Acked);
    assert_eq!(acks.at(&key), Some(at("2026-07-25T09:00")));
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
    let alive = reminders::ack_key(&list, &id);
    write_acks(
        &notebook.config_dir(),
        "acks.json",
        &[
            (&alive, "2026-07-24T18:00"),
            ("Gone/task-list.md/zz99", "2026-07-24T18:00"),
        ],
    );

    assert_eq!(notebook.prune_seen().unwrap(), 1, "only the one with no list goes");
    let acks = Seen::load_of(notebook.config_dir(), Index::Acked);
    assert_eq!(acks.entries().len(), 1);
    assert!(acks.at(&alive).is_some());
}
