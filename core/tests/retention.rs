//! What expires and what comes back: the Completed clearing itself,
//! the trash and its restores, and the reaper. Nothing is destroyed.

use std::path::Path;

use jott_core::Notebook;

mod common;
use common::{init, read};

// ------------------------------------------- the Completed clears itself

/// A Completed.md holding one task per given completion date.
fn write_completed(dir: &Path, dates: &[(&str, &str)]) {
    let mut text = String::new();
    for (id, date) in dates {
        text.push_str(&format!(
            "- [x] task {id} <!--id:{id} completed:{date} origin:Inbox-->\n"
        ));
    }
    std::fs::write(dir.join("jott.tasks/completed.md"), text).unwrap();
}

fn completed_ids(notebook: &Notebook) -> Vec<String> {
    notebook
        .open_list("jott.tasks/completed.md")
        .unwrap()
        .tasks()
        .filter_map(|task| task.id.clone())
        .collect()
}

#[test]
fn the_completed_clears_itself_after_the_retention_window() {
    // 2026-08-06: a Completed that only grows is a Completed nobody reads.
    // Nothing is destroyed — what expires goes to the internal trash, where
    // the trash retention then applies.
    let (dir, notebook) = init();
    let today = jott_core::clock::civil_today();
    let old = (today - chrono::Duration::days(31)).to_string();
    let recent = (today - chrono::Duration::days(29)).to_string();

    write_completed(
        dir.path(),
        &[("aa", old.as_str()), ("bb", recent.as_str())],
    );

    assert_eq!(notebook.reap_completed().unwrap(), 1);
    assert_eq!(completed_ids(&notebook), vec!["bb".to_string()]);
    assert!(
        notebook
            .trash_entries()
            .iter()
            .any(|entry| entry.label == "task aa"),
        "the expired task is recoverable, not gone"
    );
}

#[test]
fn a_retention_of_zero_keeps_the_completed_forever() {
    let (dir, mut notebook) = init();
    let mut config = notebook.config().clone();
    config.completed_retention_days = 0;
    notebook.set_config(config).unwrap();

    let ancient = (jott_core::clock::civil_today() - chrono::Duration::days(4000)).to_string();
    write_completed(dir.path(), &[("aa", ancient.as_str())]);

    assert_eq!(notebook.reap_completed().unwrap(), 0);
    assert_eq!(completed_ids(&notebook), vec!["aa".to_string()]);
}

#[test]
fn a_completed_task_with_no_stamp_is_never_reaped() {
    // Written by hand, or by a build older than the stamp: the app has no
    // idea how old it is, so guessing would throw away someone's record.
    let (dir, notebook) = init();
    std::fs::write(
        dir.path().join("jott.tasks/completed.md"),
        "- [x] escrita à mão <!--id:aa origin:Inbox-->\n",
    )
    .unwrap();

    assert_eq!(notebook.reap_completed().unwrap(), 0);
    assert_eq!(completed_ids(&notebook), vec!["aa".to_string()]);
}

// ------------------------------------------ the trash and what comes back

#[test]
fn a_trashed_list_can_be_restored() {
    let (dir, nb) = init();
    nb.create_list("jott.tasks", "Obra").unwrap();
    std::fs::write(dir.path().join("jott.tasks/Obra.md"), "# Obra\n").unwrap();

    nb.delete_list("jott.tasks/Obra.md").unwrap();
    assert!(!dir.path().join("jott.tasks/Obra.md").exists());

    let entries = nb.trash_entries();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].origin, "jott.tasks/Obra.md");

    nb.restore_from_trash(&entries[0].id).unwrap();
    assert!(dir.path().join("jott.tasks/Obra.md").is_file());
    assert!(nb.trash_entries().is_empty());
}

#[test]
fn a_restored_task_comes_back_where_it_was() {
    // Restoring used to append to the end (2026-08-14): the trash always
    // recorded the index, and putting the task back anywhere else quietly
    // reshuffled a list the user had arranged by hand.
    let (dir, nb) = init();
    let list = "jott.tasks/task-list.md";
    std::fs::write(
        dir.path().join(list),
        "- [ ] Primeira\n- [ ] Do meio <!--id:mid001-->\n  Uma descrição\n- [ ] Última\n",
    )
    .unwrap();

    nb.delete_task(list, "mid001").unwrap();
    let texts: Vec<String> = nb.tasks_in(list).unwrap().into_iter().map(|t| t.text).collect();
    assert_eq!(texts, ["Primeira", "Última"]);

    let entry = nb.trash_entries().into_iter().next().unwrap();
    nb.restore_from_trash(&entry.id).unwrap();

    let restored = nb.tasks_in(list).unwrap();
    let texts: Vec<&str> = restored.iter().map(|t| t.text.as_str()).collect();
    assert_eq!(texts, ["Primeira", "Do meio", "Última"], "de volta ao meio");
    // And whole: the description came back with it.
    assert_eq!(restored[1].description, vec!["Uma descrição".to_string()]);
    assert_eq!(restored[1].id.as_deref(), Some("mid001"));
}

#[test]
fn restoring_a_task_into_a_shorter_list_appends_instead_of_failing() {
    // The file may have been edited by hand while the task sat in the trash.
    let (dir, nb) = init();
    let list = "jott.tasks/task-list.md";
    std::fs::write(
        dir.path().join(list),
        "- [ ] Uma\n- [ ] Duas\n- [ ] Três <!--id:c003-->\n",
    )
    .unwrap();

    nb.delete_task(list, "c003").unwrap();
    std::fs::write(dir.path().join(list), "- [ ] Uma\n").unwrap();

    let entry = nb.trash_entries().into_iter().next().unwrap();
    nb.restore_from_trash(&entry.id).unwrap();

    let texts: Vec<String> = nb.tasks_in(list).unwrap().into_iter().map(|t| t.text).collect();
    assert_eq!(texts, ["Uma", "Três"]);
}

#[test]
fn the_reaper_clears_items_past_the_retention_window() {
    use jott_core::trash::Trash;
    let (dir, nb) = init();

    // Hand-place a file dated well in the past directly in the trash.
    std::fs::write(dir.path().join("jott.tasks/Ghost.md"), "x\n").unwrap();
    let mut trash = Trash::open(dir.path().join(".jott/trash"));
    let old = "2000-01-01".parse().unwrap();
    trash
        .trash_file(&dir.path().join("jott.tasks/Ghost.md"), "jott.tasks/Ghost.md", old)
        .unwrap();
    assert_eq!(nb.trash_entries().len(), 1);

    nb.reap_trash().unwrap();
    assert!(nb.trash_entries().is_empty(), "the 30-day window elapsed");
}

#[test]
fn a_deleted_task_restores_as_a_real_task_not_raw_text() {
    let (dir, nb) = init();
    let mut inbox = nb.inbox().unwrap();
    let id = inbox.add_text_with_id("task 1");
    inbox.save().unwrap();

    nb.delete_task("jott.tasks/task-list.md", &id).unwrap();
    assert!(!read(dir.path().join("jott.tasks/task-list.md")).contains("task 1"));

    let entries = nb.trash_entries();
    assert_eq!(entries.len(), 1);
    nb.restore_from_trash(&entries[0].id).unwrap();

    // Back as a proper task — text "task 1", not a task whose text is the
    // whole "- [ ] task 1" markdown line.
    let restored = nb.tasks_in("jott.tasks/task-list.md").unwrap();
    assert_eq!(restored.len(), 1);
    assert_eq!(restored[0].text, "task 1");
    assert!(!restored[0].text.contains("- [ ]"));
}

#[test]
fn a_trashed_item_can_be_deleted_for_good_and_the_trash_emptied() {
    let (dir, nb) = init();
    for name in ["Obra", "Casa", "Viagem"] {
        nb.create_list("jott.tasks", name).unwrap();
        nb.delete_list(&format!("jott.tasks/{name}.md")).unwrap();
    }
    let items = dir.path().join(".jott/trash/items");
    assert_eq!(std::fs::read_dir(&items).unwrap().count(), 3);

    let entries = nb.trash_entries();
    let stored = entries[0].stored.clone().unwrap();
    nb.purge_from_trash(&entries[0].id).unwrap();
    assert_eq!(nb.trash_entries().len(), 2);
    assert!(!items.join(stored).exists(), "the stored file goes with the entry");
    assert!(nb.restore_from_trash(&entries[0].id).is_err(), "gone is gone");

    assert_eq!(nb.empty_trash().unwrap(), 2);
    assert!(nb.trash_entries().is_empty());
    assert_eq!(std::fs::read_dir(&items).unwrap().count(), 0);
    assert!(nb.purge_from_trash("nope").is_err());
}
