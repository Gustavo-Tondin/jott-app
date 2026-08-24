//! Phase 2 business rules: completing, undoing, list management, and the
//! day/week states.
//!
//! Same standard as the other integration tests — assertions look at the
//! files on disk, because the files are the product.

use std::path::Path;


use jott_core::config::{Config, RolloverMode};
use jott_core::state::Period;
use jott_core::{Error, Notebook, TaskList};

fn read(path: impl AsRef<Path>) -> String {
    std::fs::read_to_string(path).unwrap()
}

/// A notebook with one task in the Inbox, returned with its id.
fn notebook_with_task(dir: &Path, text: &str) -> (Notebook, String) {
    let notebook = Notebook::init(dir).unwrap();
    let mut inbox = notebook.inbox().unwrap();
    let id = inbox.add_text_with_id(text);
    inbox.save().unwrap();
    (notebook, id)
}

// ------------------------------------------------------------- completing

#[test]
fn completing_moves_the_task_to_completed_with_its_origin() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    let mut compras = notebook.open_list("jott.tasks/Compras.md").unwrap();
    let id = compras.add_text_with_id("Comprar leite");
    compras.save().unwrap();

    let task = notebook.complete_task("jott.tasks/Compras.md", &id).unwrap();
    assert!(task.done);
    assert_eq!(task.origin.as_deref(), Some("Compras"));

    let completed = read(dir.path().join("jott.tasks/completed.md"));
    assert!(completed.contains("- [x] Comprar leite"));
    assert!(completed.contains(&format!("id:{id}")));
    assert!(completed.contains("origin:Compras"));

    // And it really left the source file.
    assert!(!read(dir.path().join("jott.tasks/Compras.md")).contains("Comprar leite"));
}

#[test]
fn creating_stamps_created_and_completing_stamps_completed() {
    // Every task the app creates carries its creation date, and completing
    // stamps the completion date (2026-08-04) — both hidden in the comment,
    // both read by the space's by-date orderings. Undo clears the stamp.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    let today = jott_core::clock::civil_today();

    let position = notebook
        .create_task("jott.tasks/task-list.md", "Comprar leite")
        .unwrap();
    assert!(
        read(dir.path().join("jott.tasks/task-list.md")).contains(&format!("created:{today}")),
        "a created task is stamped with today's date"
    );

    // Creating from Today/This Week goes through the same stamp.
    notebook.add_task_in_period(Period::Day, "Da tela de hoje").unwrap();
    let inbox = read(dir.path().join("jott.tasks/task-list.md"));
    assert_eq!(inbox.matches(&format!("created:{today}")).count(), 2);

    let id = notebook.ensure_task_id("jott.tasks/task-list.md", position).unwrap();
    let done = notebook.complete_task("jott.tasks/task-list.md", &id).unwrap();
    assert_eq!(done.completed, Some(today));
    assert!(
        read(dir.path().join("jott.tasks/completed.md"))
            .contains(&format!("completed:{today}")),
        "completing stamps the completion date"
    );

    let undone = notebook
        .uncomplete_task("jott.tasks/completed.md", &id)
        .unwrap();
    assert_eq!(undone.completed, None, "undo clears the stamp");
    assert!(!read(dir.path().join("jott.tasks/task-list.md")).contains("completed:"));
}

#[test]
fn undoing_keeps_the_spawn_and_recompleting_does_not_duplicate() {
    // Every occurrence is its own item (2026-08-05, MS-To-Do-style): the undo
    // only restores — the spawn stays where it is. What stops the chain from
    // growing is the `spawned:` pointer: re-completing the restored task
    // finds its occurrence still alive and does not generate another.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    let inbox_path = dir.path().join("jott.tasks/task-list.md");
    std::fs::write(
        &inbox_path,
        "- [ ] Regar as plantas <!--id:a1-->\n  @2026-07-25\n  repeat: every-week\n",
    )
    .unwrap();

    notebook.complete_task("jott.tasks/task-list.md", "a1").unwrap();
    notebook
        .uncomplete_task("jott.tasks/completed.md", "a1")
        .unwrap();
    let inbox = read(&inbox_path);
    assert_eq!(
        inbox.matches("Regar as plantas").count(),
        2,
        "the spawn stays next to the restored original:\n{inbox}"
    );
    assert!(
        inbox.contains("spawned:"),
        "the restored original keeps its pointer:\n{inbox}"
    );

    notebook.complete_task("jott.tasks/task-list.md", "a1").unwrap();
    let inbox = read(&inbox_path);
    assert_eq!(
        inbox.matches("Regar as plantas").count(),
        1,
        "re-completing points at the existing spawn instead of growing one:\n{inbox}"
    );
    assert!(inbox.contains("@2026-08-01"), "the one left is the spawn");
}

#[test]
fn recompleting_after_the_chain_moved_on_does_not_regrow_it() {
    // The real-use duplication of 2026-08-05 (the screenshot): complete the
    // original, complete its spawn, undo the ORIGINAL, complete it again.
    // The 2026-08-04 delete-the-spawn undo could not see that @08-01 had
    // already been completed, so re-completing generated it a second time.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    let inbox_path = dir.path().join("jott.tasks/task-list.md");
    std::fs::write(
        &inbox_path,
        "- [ ] repeat <!--id:a1-->\n  @2026-07-31\n  repeat: every-day\n",
    )
    .unwrap();

    notebook.complete_task("jott.tasks/task-list.md", "a1").unwrap();
    let spawn_id = notebook.ensure_task_id("jott.tasks/task-list.md", 0).unwrap();
    notebook
        .complete_task("jott.tasks/task-list.md", &spawn_id)
        .unwrap();

    notebook
        .uncomplete_task("jott.tasks/completed.md", "a1")
        .unwrap();
    notebook.complete_task("jott.tasks/task-list.md", "a1").unwrap();

    let inbox = read(&inbox_path);
    let completed = read(dir.path().join("jott.tasks/completed.md"));
    assert_eq!(
        inbox.matches("@2026-08-01").count(),
        0,
        "@08-01 was already completed — it must not come back:\nINBOX:\n{inbox}"
    );
    assert_eq!(
        inbox.matches("- [ ] repeat").count(),
        1,
        "only @08-02, the newest occurrence, is open:\n{inbox}"
    );
    assert_eq!(
        completed.matches("- [x] repeat").count(),
        2,
        "@07-31 and @08-01, once each:\n{completed}"
    );
}

#[test]
fn a_legacy_completion_without_the_pointer_still_does_not_duplicate() {
    // Tasks completed before `spawned:` existed have no pointer. Re-completing
    // them falls back to an exact twin of the computed occurrence — open in
    // the list or already completed — before generating anything.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    let inbox_path = dir.path().join("jott.tasks/task-list.md");
    std::fs::write(
        &inbox_path,
        "- [ ] Regar as plantas <!--id:a1-->\n  @2026-07-25\n  repeat: every-week\n\
         - [ ] Regar as plantas <!--id:b2-->\n  @2026-08-01\n  repeat: every-week\n",
    )
    .unwrap();

    notebook.complete_task("jott.tasks/task-list.md", "a1").unwrap();

    let inbox = read(&inbox_path);
    assert_eq!(
        inbox.matches("@2026-08-01").count(),
        1,
        "the twin already scheduled @08-01 — no second copy:\n{inbox}"
    );
    let completed = read(dir.path().join("jott.tasks/completed.md"));
    assert!(
        completed.contains("spawned:b2"),
        "the completion adopts the twin as its spawn:\n{completed}"
    );
}

#[test]
fn completing_keeps_the_task_in_today_and_this_week_pointing_at_completed() {
    // The period references a TASK, not a place (2026-08-06): ticking it in
    // Today must slide it into the screen's "Completed N" section, not make it
    // vanish. The reference follows the task into the folder's Completed.
    let dir = tempfile::tempdir().unwrap();
    let (notebook, id) = notebook_with_task(dir.path(), "Ligar pro dentista");

    notebook.pull_into(Period::Day, "jott.tasks/task-list.md", &id).unwrap();
    notebook.pull_into(Period::Week, "jott.tasks/task-list.md", &id).unwrap();

    notebook.complete_task("jott.tasks/task-list.md", &id).unwrap();

    for period in [Period::Day, Period::Week] {
        let state = notebook.open_state(period).unwrap().state;
        assert!(
            state.contains("jott.tasks/completed.md", &id),
            "{period:?} follows the task into Completed: {state:?}"
        );
        assert!(!state.contains("jott.tasks/task-list.md", &id));
    }

    // And the period still resolves it — as a done task, which is what the
    // screen splits into its Completed section.
    let listed = notebook.period_tasks(Period::Day).unwrap();
    assert_eq!(listed.len(), 1);
    assert!(listed[0].task.done);
    assert_eq!(listed[0].path, "jott.tasks/completed.md");

    // Undoing brings it back to the open list, reference and all.
    notebook.uncomplete_task("jott.tasks/completed.md", &id).unwrap();
    let state = notebook.open_state(Period::Day).unwrap().state;
    assert!(state.contains("jott.tasks/task-list.md", &id), "{state:?}");
}

#[test]
fn moving_a_task_to_another_list_takes_its_period_references_along() {
    // Same primitive, same rule: the inspector's "move to list" used to leave
    // the Day pointing at the old file, where the task no longer was — a
    // reference silently skipped on read, so the task just left Today.
    let dir = tempfile::tempdir().unwrap();
    let (notebook, id) = notebook_with_task(dir.path(), "Comprar leite");
    notebook.create_list("jott.tasks", "Compras").unwrap();

    notebook.pull_into(Period::Day, "jott.tasks/task-list.md", &id).unwrap();
    notebook
        .move_task(
            &id,
            "jott.tasks/task-list.md",
            "jott.tasks/Compras.md",
            jott_core::notebook::OriginAction::Clear,
        )
        .unwrap();

    let state = notebook.open_state(Period::Day).unwrap().state;
    assert!(state.contains("jott.tasks/Compras.md", &id), "{state:?}");
    assert_eq!(notebook.period_tasks(Period::Day).unwrap().len(), 1);
}

#[test]
fn a_period_keeps_the_order_the_user_dragged_and_its_own_sort() {
    // A period is not a folder, so there is no `.space.json`: the hand-made
    // order goes into the state file itself (it IS the day's list) and the
    // sorting preference into the notebook config (2026-08-06).
    let dir = tempfile::tempdir().unwrap();
    let mut notebook = Notebook::init(dir.path()).unwrap();

    let mut inbox = notebook.inbox().unwrap();
    let ids: Vec<String> = ["um", "dois", "três"]
        .iter()
        .map(|text| inbox.add_text_with_id(*text))
        .collect();
    inbox.save().unwrap();
    for id in &ids {
        notebook.pull_into(Period::Day, "jott.tasks/task-list.md", id).unwrap();
    }

    let refs = |order: [usize; 3]| {
        order
            .iter()
            .map(|i| jott_core::state::TaskRef::new("jott.tasks/task-list.md", &ids[*i]))
            .collect::<Vec<_>>()
    };
    notebook.set_period_order(Period::Day, &refs([2, 0, 1])).unwrap();

    let texts: Vec<String> = notebook
        .period_tasks(Period::Day)
        .unwrap()
        .into_iter()
        .map(|listed| listed.task.text)
        .collect();
    assert_eq!(texts, ["três", "um", "dois"]);

    // A reference the caller did not mention keeps its place at the end, so a
    // list that changed under the drag loses nothing.
    let mut extra = notebook.inbox().unwrap();
    let late = extra.add_text_with_id("tardia");
    extra.save().unwrap();
    notebook.pull_into(Period::Day, "jott.tasks/task-list.md", &late).unwrap();
    notebook.set_period_order(Period::Day, &refs([1, 0, 2])).unwrap();
    assert_eq!(notebook.open_state(Period::Day).unwrap().state.len(), 4);
    assert!(notebook
        .open_state(Period::Day)
        .unwrap()
        .state
        .contains("jott.tasks/task-list.md", &late));

    // And the sorting round-trips through the config, clearing back to none.
    assert_eq!(notebook.period_sort(Period::Day), None);
    notebook.set_period_sort(Period::Day, Some("name")).unwrap();
    assert_eq!(notebook.period_sort(Period::Day), Some("name"));
    assert!(read(dir.path().join(".jott/config.json")).contains("periodSort"));
    notebook.set_period_sort(Period::Day, None).unwrap();
    assert_eq!(notebook.period_sort(Period::Day), None);
    assert!(!read(dir.path().join(".jott/config.json")).contains("periodSort"));
}

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
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
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
    let dir = tempfile::tempdir().unwrap();
    let mut notebook = Notebook::init(dir.path()).unwrap();
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
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    std::fs::write(
        dir.path().join("jott.tasks/completed.md"),
        "- [x] escrita à mão <!--id:aa origin:Inbox-->\n",
    )
    .unwrap();

    assert_eq!(notebook.reap_completed().unwrap(), 0);
    assert_eq!(completed_ids(&notebook), vec!["aa".to_string()]);
}

#[test]
fn undoing_sends_the_task_back_to_its_origin_list() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    let mut compras = notebook.open_list("jott.tasks/Compras.md").unwrap();
    let id = compras.add_text_with_id("Comprar leite");
    compras.save().unwrap();

    notebook.complete_task("jott.tasks/Compras.md", &id).unwrap();
    let task = notebook.uncomplete_task("jott.tasks/completed.md", &id).unwrap();

    assert!(!task.done);
    assert_eq!(task.origin, None, "origin is consumed by the undo");

    let compras = read(dir.path().join("jott.tasks/Compras.md"));
    assert!(compras.contains("- [ ] Comprar leite"));
    assert!(!read(dir.path().join("jott.tasks/completed.md")).contains("Comprar leite"));
}

#[test]
fn undoing_recreates_an_origin_list_that_was_deleted_outside_the_app() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    let mut compras = notebook.open_list("jott.tasks/Compras.md").unwrap();
    let id = compras.add_text_with_id("Comprar leite");
    compras.save().unwrap();
    notebook.complete_task("jott.tasks/Compras.md", &id).unwrap();

    // The user deletes the list in the file manager while the task sits in
    // Completed.
    std::fs::remove_file(dir.path().join("jott.tasks/Compras.md")).unwrap();

    notebook.uncomplete_task("jott.tasks/completed.md", &id).unwrap();
    assert!(read(dir.path().join("jott.tasks/Compras.md")).contains("Comprar leite"));
}

#[test]
fn undoing_a_task_without_a_usable_origin_falls_back_to_the_inbox() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();

    // Written by hand in Obsidian: done, with an id, but no origin.
    std::fs::write(
        dir.path().join("jott.tasks/completed.md"),
        "- [x] Pagar internet <!--id:abc123-->\n",
    )
    .unwrap();

    notebook.uncomplete_task("jott.tasks/completed.md", "abc123").unwrap();
    assert!(read(dir.path().join("jott.tasks/task-list.md")).contains("Pagar internet"));
}

#[test]
fn undoing_an_unknown_id_fails_without_touching_anything() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();

    let err = notebook.uncomplete_task("jott.tasks/completed.md", "nope").unwrap_err();
    assert!(matches!(err, Error::TaskNotFound(_)));
}

// ----------------------------------------------------------------- reading

#[test]
fn reading_a_hand_written_list_leaves_the_file_exactly_as_it_was() {
    // Changed in 2026-07-20: reading used to stamp an id on every task, which
    // put a comment on lines the user never asked about. Now the id arrives
    // only when something needs to address the task.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    let original = "# Minha lista\n\n- [ ] escrita no Obsidian\n";
    std::fs::write(dir.path().join("jott.tasks/task-list.md"), original).unwrap();

    let tasks = notebook.tasks_in("jott.tasks/task-list.md").unwrap();
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].id, None);
    assert_eq!(read(dir.path().join("jott.tasks/task-list.md")), original);

    // Acting on it is what makes it addressable — and the heading survives.
    let id = notebook.ensure_task_id("jott.tasks/task-list.md", 0).unwrap();
    let on_disk = read(dir.path().join("jott.tasks/task-list.md"));
    assert!(on_disk.contains(&format!("id:{id}")));
    assert!(on_disk.contains("# Minha lista"));

    notebook.complete_task("jott.tasks/task-list.md", &id).unwrap();
}

#[test]
fn a_line_copy_pasted_with_its_id_gets_a_fresh_one() {
    // Reported from real use: duplicating a line in the editor duplicates the
    // id comment too, and then the second copy cannot be addressed at all.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    std::fs::write(
        dir.path().join("jott.tasks/task-list.md"),
        "- [ ] Comprar leite <!--id:abc123-->\n- [ ] Comprar leite <!--id:abc123-->\n",
    )
    .unwrap();

    let tasks = notebook.tasks_in("jott.tasks/task-list.md").unwrap();

    assert_eq!(tasks.len(), 2, "both lines must survive");
    let first = tasks[0].id.clone().unwrap();
    let second = tasks[1].id.clone().unwrap();
    assert_eq!(first, "abc123", "the first copy keeps the id");
    assert_ne!(second, first, "the second copy gets its own");

    // Both are now independently addressable.
    notebook.complete_task("jott.tasks/task-list.md", &second).unwrap();
    let left = notebook.tasks_in("jott.tasks/task-list.md").unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].id.as_deref(), Some(first.as_str()));
}

#[test]
fn a_reference_keeps_pointing_at_the_task_it_was_created_for() {
    // The exact sequence that surfaced the bug: pull a task into the day,
    // then duplicate its line by hand.
    let dir = tempfile::tempdir().unwrap();
    let (notebook, id) = notebook_with_task(dir.path(), "Comprar leite");
    notebook.pull_into(Period::Day, "jott.tasks/task-list.md", &id).unwrap();

    let line = format!("- [ ] Comprar leite <!--id:{id}-->");
    std::fs::write(
        dir.path().join("jott.tasks/task-list.md"),
        format!("{line}\n{line}\n"),
    )
    .unwrap();

    let tasks = notebook.tasks_in("jott.tasks/task-list.md").unwrap();
    assert_eq!(tasks.len(), 2);
    assert_eq!(
        tasks[0].id.as_deref(),
        Some(id.as_str()),
        "the first line keeps the id so the day's reference stays valid"
    );

    let pulled = notebook.period_tasks(Period::Day).unwrap();
    assert_eq!(pulled.len(), 1, "the reference must not become ambiguous");
    assert_eq!(pulled[0].task.id.as_deref(), Some(id.as_str()));
}

#[test]
fn moving_a_task_into_a_list_that_already_uses_its_id() {
    // Ids are unique per file, so two lists can legitimately hold the same
    // one. Completing both must not merge them into a single line.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    std::fs::write(
        dir.path().join("jott.tasks/task-list.md"),
        "- [ ] Da Inbox <!--id:mesmo1-->\n",
    )
    .unwrap();
    std::fs::write(
        dir.path().join("jott.tasks/Compras.md"),
        "- [ ] De Compras <!--id:mesmo1-->\n",
    )
    .unwrap();

    notebook.complete_task("jott.tasks/task-list.md", "mesmo1").unwrap();
    notebook.complete_task("jott.tasks/Compras.md", "mesmo1").unwrap();

    let completed = notebook.tasks_in("jott.tasks/completed.md").unwrap();
    assert_eq!(completed.len(), 2, "neither task may be swallowed");

    let ids: std::collections::HashSet<_> =
        completed.iter().map(|t| t.id.clone().unwrap()).collect();
    assert_eq!(ids.len(), 2, "ids inside one file must be distinct");

    // And each still knows where to go back to.
    let origins: std::collections::HashSet<_> =
        completed.iter().map(|t| t.origin.clone().unwrap()).collect();
    assert_eq!(
        origins,
        ["task-list".to_string(), "Compras".to_string()].into_iter().collect()
    );
}

#[test]
fn reading_a_read_only_notebook_does_not_adopt_ids() {
    let dir = tempfile::tempdir().unwrap();
    Notebook::init(dir.path()).unwrap();
    std::fs::write(
        dir.path().join("jott.tasks/task-list.md"),
        "- [ ] sem id\n",
    )
    .unwrap();
    std::fs::write(
        dir.path().join(".jott/config.json"),
        r#"{ "schemaVersion": 99 }"#,
    )
    .unwrap();

    let notebook = Notebook::open(dir.path()).unwrap();
    let tasks = notebook.tasks_in("jott.tasks/task-list.md").unwrap();

    assert_eq!(tasks.len(), 1);
    assert!(tasks[0].id.is_none(), "read-only must not write ids");
    assert_eq!(read(dir.path().join("jott.tasks/task-list.md")), "- [ ] sem id\n");
}

// ------------------------------------------------------------------ lists

#[test]
fn renaming_a_list_repoints_completed_origins_and_states() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    let mut compras = notebook.open_list("jott.tasks/Compras.md").unwrap();
    let done_id = compras.add_text_with_id("Comprar leite");
    let pulled_id = compras.add_text_with_id("Comprar pão");
    compras.save().unwrap();

    notebook.complete_task("jott.tasks/Compras.md", &done_id).unwrap();
    notebook.pull_into(Period::Day, "jott.tasks/Compras.md", &pulled_id).unwrap();

    notebook.rename_list("jott.tasks/Compras.md", "Mercado").unwrap();

    assert!(dir.path().join("jott.tasks/Mercado.md").is_file());
    assert!(!dir.path().join("jott.tasks/Compras.md").exists());
    assert!(read(dir.path().join("jott.tasks/completed.md")).contains("origin:Mercado"));

    let state = notebook.open_state(Period::Day).unwrap();
    assert!(state.state.contains("jott.tasks/Mercado.md", &pulled_id));

    // The undo still works, which is the whole point of repointing origins.
    notebook.uncomplete_task("jott.tasks/completed.md", &done_id).unwrap();
    assert!(read(dir.path().join("jott.tasks/Mercado.md")).contains("Comprar leite"));
}

#[test]
fn default_lists_cannot_be_renamed_or_deleted() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();

    for path in ["jott.tasks/task-list.md", "jott.tasks/completed.md"] {
        assert!(matches!(
            notebook.rename_list(path, "Outra").unwrap_err(),
            Error::Protected(_)
        ));
        assert!(matches!(
            notebook.delete_list(path).unwrap_err(),
            Error::Protected(_)
        ));
    }
}

#[test]
fn renaming_onto_an_existing_list_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    notebook.create_list("jott.tasks", "Compras").unwrap();
    notebook.create_list("jott.tasks", "Mercado").unwrap();

    assert!(notebook.rename_list("jott.tasks/Compras.md", "Mercado").is_err());
    // Neither file was harmed.
    assert!(dir.path().join("jott.tasks/Compras.md").is_file());
    assert!(dir.path().join("jott.tasks/Mercado.md").is_file());
}

#[test]
fn deleting_a_list_rescues_its_tasks_into_the_inbox() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    let mut compras = notebook.open_list("jott.tasks/Compras.md").unwrap();
    let id = compras.add_text_with_id("Comprar leite");
    compras.add_text("Comprar pão");
    compras.save().unwrap();
    notebook.pull_into(Period::Day, "jott.tasks/Compras.md", &id).unwrap();

    let rescued = notebook.delete_list("jott.tasks/Compras.md").unwrap();

    assert_eq!(rescued, 2);
    assert!(!dir.path().join("jott.tasks/Compras.md").exists());

    let inbox = read(dir.path().join("jott.tasks/task-list.md"));
    assert!(inbox.contains("Comprar leite"));
    assert!(inbox.contains("Comprar pão"));

    // A task that was pulled into Today stays pulled, now via the Inbox.
    let state = notebook.open_state(Period::Day).unwrap();
    assert!(state.state.contains("jott.tasks/task-list.md", &id));
}

#[test]
fn deleting_a_list_rescues_tasks_that_never_earned_an_id() {
    // Caught while making ids lazy: the rescue used to iterate over ids, so
    // every task without one — which is now most of them — was deleted with
    // the file.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    notebook.create_list("jott.tasks", "Compras").unwrap();
    std::fs::write(
        dir.path().join("jott.tasks/Compras.md"),
        "- [ ] sem id nenhum\n  @2026-07-25 #casa\n- [ ] outra sem id\n",
    )
    .unwrap();

    let rescued = notebook.delete_list("jott.tasks/Compras.md").unwrap();

    assert_eq!(rescued, 2);
    let inbox = read(dir.path().join("jott.tasks/task-list.md"));
    assert!(inbox.contains("sem id nenhum"));
    assert!(inbox.contains("outra sem id"));
    assert!(inbox.contains("@2026-07-25 #casa"), "campos vêm junto");
}

#[test]
fn path_traversal_is_still_refused_by_the_new_operations() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();

    for evil in ["../escape", "sub/dir", ".hidden", ""] {
        assert!(notebook.rename_list(evil, "Ok").is_err(), "{evil:?}");
        assert!(notebook.delete_list(evil).is_err(), "{evil:?}");
    }
}

// ------------------------------------------------------------ day and week

#[test]
fn pulling_a_task_writes_a_reference_not_a_copy() {
    let dir = tempfile::tempdir().unwrap();
    let (notebook, id) = notebook_with_task(dir.path(), "Comprar leite");

    assert!(notebook.pull_into(Period::Week, "jott.tasks/task-list.md", &id).unwrap());

    let state = read(dir.path().join(".jott/weekly-state.json"));
    assert!(state.contains(&id));
    // The text must live in exactly one place: the list file.
    assert!(!state.contains("Comprar leite"));
}

#[test]
fn pulling_the_same_task_twice_is_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    let (notebook, id) = notebook_with_task(dir.path(), "Comprar leite");

    assert!(notebook.pull_into(Period::Day, "jott.tasks/task-list.md", &id).unwrap());
    assert!(!notebook.pull_into(Period::Day, "jott.tasks/task-list.md", &id).unwrap());
    assert_eq!(notebook.open_state(Period::Day).unwrap().state.len(), 1);
}

#[test]
fn pulling_a_task_that_does_not_exist_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();

    let err = notebook.pull_into(Period::Day, "jott.tasks/task-list.md", "ghost").unwrap_err();
    assert!(matches!(err, Error::TaskNotFound(_)));
    assert!(!dir.path().join(".jott/daily-state.json").exists());
}

#[test]
fn removing_from_a_period_leaves_the_task_alone() {
    let dir = tempfile::tempdir().unwrap();
    let (notebook, id) = notebook_with_task(dir.path(), "Comprar leite");

    notebook.pull_into(Period::Day, "jott.tasks/task-list.md", &id).unwrap();
    assert!(notebook.remove_from(Period::Day, "jott.tasks/task-list.md", &id).unwrap());

    assert!(notebook.open_state(Period::Day).unwrap().state.is_empty());
    assert!(read(dir.path().join("jott.tasks/task-list.md")).contains("Comprar leite"));
}

#[test]
fn a_task_created_in_today_is_physically_written_to_the_inbox() {
    // Spec 3: Day and Week never store content of their own.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();

    let id = notebook
        .add_task_in_period(Period::Day, "Responder e-mail")
        .unwrap();

    let inbox = read(dir.path().join("jott.tasks/task-list.md"));
    assert!(inbox.contains("- [ ] Responder e-mail"));
    assert!(inbox.contains(&format!("id:{id}")));

    let state = notebook.open_state(Period::Day).unwrap();
    assert!(state.state.contains("jott.tasks/task-list.md", &id));
}

#[test]
fn the_state_rolls_over_when_the_notebook_is_reopened_later() {
    let dir = tempfile::tempdir().unwrap();
    let (notebook, id) = notebook_with_task(dir.path(), "Comprar leite");
    notebook.pull_into(Period::Day, "jott.tasks/task-list.md", &id).unwrap();

    // Simulate the app having been closed since an old day, by rewriting the
    // state's date the way it would look on disk.
    let path = dir.path().join(".jott/daily-state.json");
    let mut state: serde_json::Value =
        serde_json::from_str(&read(&path)).unwrap();
    state["date"] = serde_json::json!("2020-01-01");
    std::fs::write(&path, state.to_string()).unwrap();

    let reopened = Notebook::open(dir.path()).unwrap();
    let rolled = reopened.open_state(Period::Day).unwrap();

    // Default mode is reset: the day starts empty...
    assert!(rolled.state.is_empty());
    assert_eq!(rolled.state.date, reopened.today());
    // ...and the task itself is untouched, back to being a suggestion.
    assert!(read(dir.path().join("jott.tasks/task-list.md")).contains("Comprar leite"));
}

#[test]
fn carry_mode_keeps_the_pulled_tasks_across_the_turn() {
    let dir = tempfile::tempdir().unwrap();
    let (mut notebook, id) = notebook_with_task(dir.path(), "Comprar leite");

    let mut config = Config::default();
    config.rollover.daily.mode = RolloverMode::Carry;
    notebook.set_config(config).unwrap();

    notebook.pull_into(Period::Day, "jott.tasks/task-list.md", &id).unwrap();

    let path = dir.path().join(".jott/daily-state.json");
    let mut state: serde_json::Value = serde_json::from_str(&read(&path)).unwrap();
    state["date"] = serde_json::json!("2020-01-01");
    std::fs::write(&path, state.to_string()).unwrap();

    let reopened = Notebook::open(dir.path()).unwrap();
    let rolled = reopened.open_state(Period::Day).unwrap();

    assert!(rolled.state.contains("jott.tasks/task-list.md", &id));
    assert_eq!(rolled.state.date, reopened.today());
}

// ------------------------------------------------------------- sugestões

#[test]
fn the_day_suggests_the_week_first_then_the_other_lists() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    let mut inbox = notebook.inbox().unwrap();
    let solta = inbox.add_text_with_id("Tarefa solta");
    inbox.save().unwrap();

    let mut compras = notebook.open_list("jott.tasks/Compras.md").unwrap();
    let da_semana = compras.add_text_with_id("Escolhida pra semana");
    compras.save().unwrap();

    notebook
        .pull_into(Period::Week, "jott.tasks/Compras.md", &da_semana)
        .unwrap();

    let suggestions = notebook.suggestions_for(Period::Day).unwrap();
    let ids: Vec<_> = suggestions
        .iter()
        .map(|s| s.task.id.clone().unwrap())
        .collect();

    // What the user already chose for the week comes first.
    assert_eq!(ids, vec![da_semana.clone(), solta]);
    assert_eq!(suggestions[0].path, "jott.tasks/Compras.md");
}

#[test]
fn a_task_already_pulled_is_not_suggested_again() {
    let dir = tempfile::tempdir().unwrap();
    let (notebook, id) = notebook_with_task(dir.path(), "Comprar leite");

    assert_eq!(notebook.suggestions_for(Period::Day).unwrap().len(), 1);
    notebook.pull_into(Period::Day, "jott.tasks/task-list.md", &id).unwrap();
    assert!(notebook.suggestions_for(Period::Day).unwrap().is_empty());
}

#[test]
fn completed_tasks_are_never_suggested() {
    let dir = tempfile::tempdir().unwrap();
    let (notebook, id) = notebook_with_task(dir.path(), "Comprar leite");

    notebook.complete_task("jott.tasks/task-list.md", &id).unwrap();

    assert!(notebook.suggestions_for(Period::Day).unwrap().is_empty());
    assert!(notebook.suggestions_for(Period::Week).unwrap().is_empty());
}

#[test]
fn the_week_suggests_from_the_lists_only() {
    // The week is not fed by the day — pulling into today does not remove a
    // task from the week's suggestions.
    let dir = tempfile::tempdir().unwrap();
    let (notebook, id) = notebook_with_task(dir.path(), "Comprar leite");

    notebook.pull_into(Period::Day, "jott.tasks/task-list.md", &id).unwrap();

    let week = notebook.suggestions_for(Period::Week).unwrap();
    assert_eq!(week.len(), 1);
    assert_eq!(week[0].task.id.as_deref(), Some(id.as_str()));
}

#[test]
fn period_tasks_resolves_references_to_real_tasks() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    let mut compras = notebook.open_list("jott.tasks/Compras.md").unwrap();
    let id = compras.add_text_with_id("Comprar leite");
    compras.save().unwrap();
    notebook.pull_into(Period::Day, "jott.tasks/Compras.md", &id).unwrap();

    let pulled = notebook.period_tasks(Period::Day).unwrap();
    assert_eq!(pulled.len(), 1);
    assert_eq!(pulled[0].path, "jott.tasks/Compras.md");
    assert_eq!(pulled[0].task.text, "Comprar leite");
}

#[test]
fn a_reference_to_a_task_deleted_elsewhere_is_skipped() {
    // The notebook is shared with other editors; a stale reference is normal.
    let dir = tempfile::tempdir().unwrap();
    let (notebook, id) = notebook_with_task(dir.path(), "Comprar leite");
    notebook.pull_into(Period::Day, "jott.tasks/task-list.md", &id).unwrap();

    // Someone deletes the line in Obsidian.
    std::fs::write(dir.path().join("jott.tasks/task-list.md"), "").unwrap();

    assert!(notebook.period_tasks(Period::Day).unwrap().is_empty());
}

// ------------------------------------------------------ urgência e grupos

/// Writes a list where dates are relative to today, so the test does not go
/// stale when the calendar moves.
fn write_dated_list(dir: &Path, list: &str, entries: &[(&str, i64)]) {
    let today = chrono::Local::now().date_naive();
    let body: String = entries
        .iter()
        .map(|(text, offset)| {
            let due = today + chrono::Duration::days(*offset);
            format!("- [ ] {text}\n  @{due}\n")
        })
        .collect();
    // The fixed tasks space is a folder of its own, so its lists are written
    // inside it and never at the notebook root.
    std::fs::write(
        dir.join("jott.tasks").join(format!("{list}.md")),
        body,
    )
    .unwrap();
}

#[test]
fn suggestions_come_grouped_by_why_they_are_offered() {
    use jott_core::notebook::SuggestionGroup;

    let dir = tempfile::tempdir().unwrap();
    let mut notebook = Notebook::init(dir.path()).unwrap();
    // What is under test is how a suggestion is GROUPED, and since 2026-08-14 a
    // dated task is already in the day and therefore not suggested at all. So
    // this asks the question the old way round: dates that only rank.
    let mut config = notebook.config().clone();
    config.dated_tasks_join_period = false;
    notebook.set_config(config).unwrap();
    write_dated_list(
        dir.path(),
        "Inbox",
        &[
            ("Bem no futuro", 30),
            ("Vencida ontem", -1),
            ("Daqui a dois dias", 2),
            ("Para hoje", 0),
        ],
    );

    let suggestions = notebook.grouped_suggestions(Period::Day).unwrap();
    let by_text = |text: &str| {
        suggestions
            .iter()
            .find(|s| s.task.text == text)
            .unwrap_or_else(|| panic!("{text} não sugerida"))
            .group
    };

    assert_eq!(by_text("Vencida ontem"), SuggestionGroup::Urgent);
    assert_eq!(by_text("Para hoje"), SuggestionGroup::Urgent);
    assert_eq!(by_text("Daqui a dois dias"), SuggestionGroup::Soon);
    assert_eq!(by_text("Bem no futuro"), SuggestionGroup::Lists);

    // And the urgent ones really come first on screen.
    assert_eq!(suggestions[0].group, SuggestionGroup::Urgent);
    assert!(
        suggestions.windows(2).all(|w| w[0].group <= w[1].group),
        "grupos fora de ordem: {:?}",
        suggestions.iter().map(|s| s.group).collect::<Vec<_>>()
    );
}

#[test]
fn a_task_taken_out_of_the_day_comes_back_as_a_recent_suggestion() {
    // 2026-08-17: taking something out of Today is not the same as never
    // having planned it, and until now the way back was to find it again in
    // the middle of its list.
    use jott_core::notebook::SuggestionGroup;

    let dir = tempfile::tempdir().unwrap();
    let (notebook, id) = notebook_with_task(dir.path(), "Arrumar o site");
    let inbox = Notebook::inbox_path();

    // A second task nobody ever pulled, so the two groups can be told apart.
    let mut list = notebook.open_list(&inbox).unwrap();
    list.add_text_with_id("Comprar café");
    list.save().unwrap();

    notebook.pull_into(Period::Day, &inbox, &id).unwrap();
    // While it is in the day it is not offered at all.
    assert!(
        notebook
            .grouped_suggestions(Period::Day)
            .unwrap()
            .iter()
            .all(|s| s.task.text != "Arrumar o site"),
        "uma tarefa que já está no dia não é sugestão"
    );

    notebook.remove_from(Period::Day, &inbox, &id).unwrap();

    let suggestions = notebook.grouped_suggestions(Period::Day).unwrap();
    let group_of = |text: &str| {
        suggestions
            .iter()
            .find(|s| s.task.text == text)
            .unwrap_or_else(|| panic!("{text} não sugerida"))
            .group
    };
    assert_eq!(group_of("Arrumar o site"), SuggestionGroup::Recent);
    assert_eq!(group_of("Comprar café"), SuggestionGroup::Lists);
    // And it is offered before the plain list entries.
    assert_eq!(suggestions[0].task.text, "Arrumar o site");

    // Pulled back in, it stops being a departure — nothing left to offer.
    notebook.pull_into(Period::Day, &inbox, &id).unwrap();
    notebook.remove_from(Period::Day, &inbox, &id).unwrap();
    notebook.pull_into(Period::Day, &inbox, &id).unwrap();
    assert!(
        notebook
            .grouped_suggestions(Period::Day)
            .unwrap()
            .iter()
            .all(|s| s.group != SuggestionGroup::Recent),
        "o histórico devia esquecer o que voltou para o dia"
    );
}

#[test]
fn the_week_remembers_its_own_departures_for_the_day_too() {
    // "Was in Today or Week and left" is one question with two sources: what
    // was taken out of the week is just as good a candidate for today.
    use jott_core::notebook::SuggestionGroup;

    let dir = tempfile::tempdir().unwrap();
    let (notebook, id) = notebook_with_task(dir.path(), "Revisar proposta");
    let inbox = Notebook::inbox_path();

    notebook.pull_into(Period::Week, &inbox, &id).unwrap();
    notebook.remove_from(Period::Week, &inbox, &id).unwrap();

    let suggestions = notebook.grouped_suggestions(Period::Day).unwrap();
    assert_eq!(suggestions[0].group, SuggestionGroup::Recent);
    assert_eq!(suggestions[0].task.text, "Revisar proposta");
}

#[test]
fn the_urgent_tag_counts_as_much_as_a_date() {
    use jott_core::notebook::SuggestionGroup;

    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    std::fs::write(
        dir.path().join("jott.tasks/task-list.md"),
        "- [ ] Sem data, mas urgente\n  #urgent\n",
    )
    .unwrap();

    let suggestions = notebook.grouped_suggestions(Period::Day).unwrap();
    assert_eq!(suggestions[0].group, SuggestionGroup::Urgent);
}

#[test]
fn the_automatic_urgency_can_be_switched_off() {
    // For people who do not want the interface flagging deadlines on its own.
    use jott_core::notebook::SuggestionGroup;

    let dir = tempfile::tempdir().unwrap();
    let mut notebook = Notebook::init(dir.path()).unwrap();
    write_dated_list(dir.path(), "Inbox", &[("Vencida ontem", -1)]);

    let mut config = notebook.config().clone();
    config.auto_urgent_by_date = false;
    // Same reason as the grouping test: a dated task is in the day now, and
    // this one is about whether a date FLAGS, not about where it lands.
    config.dated_tasks_join_period = false;
    notebook.set_config(config).unwrap();

    let suggestions = notebook.grouped_suggestions(Period::Day).unwrap();
    assert_ne!(
        suggestions[0].group,
        SuggestionGroup::Urgent,
        "a data não deve marcar sozinha quando a opção está desligada"
    );

    // The hand-written tag still counts.
    std::fs::write(
        dir.path().join("jott.tasks/task-list.md"),
        "- [ ] Vencida ontem\n  #urgent\n",
    )
    .unwrap();
    let suggestions = notebook.grouped_suggestions(Period::Day).unwrap();
    assert_eq!(suggestions[0].group, SuggestionGroup::Urgent);
}

#[test]
fn a_dated_task_joins_the_day_without_ever_being_written_into_it() {
    // The rule flipped on 2026-08-14 (spec 3.3.1): a date used to change only
    // the ORDER of the suggestions, so a task written for today sat in a list
    // until the user went looking for it — the app quietly failing at the one
    // thing a date is for.
    //
    // What did NOT change: the state file. The task is added when the period is
    // READ, so the turn of the day has nothing to clean up and un-dating a task
    // takes it straight back out.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    write_dated_list(dir.path(), "Inbox", &[("Vencida ontem", -1)]);

    let day = notebook.period_tasks(Period::Day).unwrap();
    assert_eq!(day.len(), 1, "uma tarefa com data entra no dia sozinha");
    assert_eq!(day[0].task.text, "Vencida ontem");

    assert!(
        notebook.open_state(Period::Day).unwrap().state.is_empty(),
        "e entra sem nada ser gravado no estado"
    );
    // It is in the day, so it is no longer something to suggest putting there.
    assert_eq!(notebook.grouped_suggestions(Period::Day).unwrap().len(), 0);
}

#[test]
fn switching_the_option_off_gives_the_manual_day_back() {
    // The old rule is still there for whoever wants it: the day as a 100%
    // deliberate choice.
    let dir = tempfile::tempdir().unwrap();
    let mut notebook = Notebook::init(dir.path()).unwrap();
    let mut config = notebook.config().clone();
    config.dated_tasks_join_period = false;
    notebook.set_config(config).unwrap();
    write_dated_list(dir.path(), "Inbox", &[("Vencida ontem", -1)]);

    assert!(notebook.period_tasks(Period::Day).unwrap().is_empty());
    assert_eq!(notebook.grouped_suggestions(Period::Day).unwrap().len(), 1);
}

#[test]
fn a_task_dated_later_this_week_joins_the_week_but_not_the_day() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    // Far enough ahead to be another day, close enough to still be this week
    // only when it is — the week's own end is what decides.
    let ahead = (jott_core::Notebook::current_week(&notebook) + chrono::Duration::days(6)
        - notebook.today())
    .num_days();
    write_dated_list(dir.path(), "Inbox", &[("Entrega", ahead as i64)]);

    let day: Vec<String> = notebook
        .period_tasks(Period::Day)
        .unwrap()
        .into_iter()
        .map(|listed| listed.task.text)
        .collect();
    let week: Vec<String> = notebook
        .period_tasks(Period::Week)
        .unwrap()
        .into_iter()
        .map(|listed| listed.task.text)
        .collect();

    assert!(!day.contains(&"Entrega".to_string()) || ahead == 0);
    assert!(week.contains(&"Entrega".to_string()));
}

#[test]
fn a_completed_dated_task_stays_out_of_the_day() {
    // A date on a finished task is history, not a plan.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    write_dated_list(dir.path(), "Inbox", &[("Vencida ontem", -1)]);
    let id = notebook.ensure_task_id("jott.tasks/Inbox.md", 0).unwrap();
    notebook.complete_task("jott.tasks/Inbox.md", &id).unwrap();

    assert!(notebook.period_tasks(Period::Day).unwrap().is_empty());
}

// ----------------------------------------------------------- recorrência

#[test]
fn completing_a_repeating_task_leaves_the_next_one_behind() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    std::fs::write(
        dir.path().join("jott.tasks/task-list.md"),
        "- [ ] Pagar aluguel <!--id:rent01-->\n  @2026-07-01 #casa\n  repeat: every-month\n",
    )
    .unwrap();

    notebook.complete_task("jott.tasks/task-list.md", "rent01").unwrap();

    // The finished one moved out, with its date and tag intact...
    let completed = read(dir.path().join("jott.tasks/completed.md"));
    assert!(completed.contains("- [x] Pagar aluguel"));
    assert!(completed.contains("@2026-07-01"));

    // ...and next month's is waiting, anchored on the 1st, not on today.
    let inbox = read(dir.path().join("jott.tasks/task-list.md"));
    assert!(inbox.contains("- [ ] Pagar aluguel"), "inbox:\n{inbox}");
    assert!(inbox.contains("@2026-08-01"), "inbox:\n{inbox}");
    assert!(inbox.contains("#casa"));
    assert!(inbox.contains("repeat: every-month"));
    // Every occurrence is its own item (2026-08-05): the spawn is born with
    // an id, and the completed copy points at it — the chain's memory.
    assert!(
        inbox.contains("id:"),
        "the spawn is born addressable:\n{inbox}"
    );
    assert!(
        completed.contains("spawned:"),
        "the completed copy remembers what it generated:\n{completed}"
    );
}

#[test]
fn completing_a_normal_task_leaves_nothing_behind() {
    let dir = tempfile::tempdir().unwrap();
    let (notebook, id) = notebook_with_task(dir.path(), "Comprar leite");

    notebook.complete_task("jott.tasks/task-list.md", &id).unwrap();

    assert!(notebook.tasks_in("jott.tasks/task-list.md").unwrap().is_empty());
}

// ------------------------------------------------------------- contagem

#[test]
fn counts_only_the_open_tasks_of_each_list() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    let mut compras = notebook.open_list("jott.tasks/Compras.md").unwrap();
    compras.add_text("Comprar leite");
    let done = compras.add_text_with_id("Comprar pão");
    compras.save().unwrap();
    notebook.complete_task("jott.tasks/Compras.md", &done).unwrap();

    let counts = notebook.open_task_counts().unwrap();

    assert_eq!(counts.get("jott.tasks/Compras.md"), Some(&1), "só a tarefa em aberto");
    assert_eq!(counts.get("jott.tasks/task-list.md"), Some(&0));
    assert_eq!(
        counts.get("jott.tasks/completed.md"),
        None,
        "a lista de concluídas não tem contagem — tudo nela está feito"
    );
}

#[test]
fn counting_does_not_write_to_the_notebook() {
    // Counting is a read. Adopting ids here would rewrite every file in the
    // notebook just because the sidebar rendered.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    let original = "- [ ] escrita à mão, sem id\n";
    std::fs::write(dir.path().join("jott.tasks/task-list.md"), original).unwrap();

    assert_eq!(notebook.open_task_counts().unwrap().get("jott.tasks/task-list.md"), Some(&1));
    assert_eq!(read(dir.path().join("jott.tasks/task-list.md")), original);
}

#[test]
fn a_conflict_copy_is_not_counted_as_a_list() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    std::fs::write(
        dir.path()
            .join("jott.tasks/Inbox.sync-conflict-20260720-143000-K3F7NLM.md"),
        "- [ ] versão do celular\n",
    )
    .unwrap();

    let counts = notebook.open_task_counts().unwrap();
    assert_eq!(counts.len(), 1, "só a Inbox de verdade: {counts:?}");
}

// ---------------------------------------------------- conflitos de sync

/// The file Syncthing leaves behind when two devices edited the same list.
fn write_conflict(dir: &Path, list: &str, contents: &str) -> std::path::PathBuf {
    let path = dir
        .join("jott.tasks")
        .join(format!("{list}.sync-conflict-20260720-143000-K3F7NLM.md"));
    std::fs::write(&path, contents).unwrap();
    path
}

#[test]
fn a_conflict_copy_is_not_shown_as_a_list() {
    // The bug this prevents: the leftover file used to appear in the sidebar
    // as a list called "task-list.sync-conflict-20260720-143000-K3F7NLM".
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    write_conflict(dir.path(), "task-list", "- [ ] versão do celular\n");

    let names: Vec<String> = notebook.lists().unwrap().into_iter().map(|l| l.name).collect();
    assert_eq!(names, vec!["completed", "task-list"]);
}

#[test]
fn conflicts_are_reported_with_the_list_they_belong_to() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    let path = write_conflict(dir.path(), "task-list", "- [ ] versão do celular\n");

    let conflicts = notebook.conflicts().unwrap();

    assert_eq!(conflicts.len(), 1);
    assert_eq!(conflicts[0].path, path);
    assert_eq!(conflicts[0].list.as_deref(), Some("task-list"));
    assert_eq!(
        conflicts[0].original,
        Some(dir.path().join("jott.tasks/task-list.md")),
        "the user needs to know which file it conflicts with"
    );
    // And the address the interface hands back to reveal it: root-relative,
    // slashes, the copy itself (folder_of turns a file into its folder).
    assert_eq!(
        conflicts[0].relative.as_deref(),
        Some("jott.tasks/task-list.sync-conflict-20260720-143000-K3F7NLM.md")
    );
}

#[test]
fn a_notebook_without_conflicts_reports_none() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    assert!(notebook.conflicts().unwrap().is_empty());
}

#[test]
fn a_conflict_on_a_state_file_is_reported_too() {
    // Two devices planning the same day is exactly when this happens.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    std::fs::write(
        dir.path()
            .join(".jott/daily-state.sync-conflict-20260720-143000-K3F7NLM.json"),
        "{}",
    )
    .unwrap();

    let conflicts = notebook.conflicts().unwrap();
    assert_eq!(conflicts.len(), 1);
    assert_eq!(conflicts[0].list, None, "a state file is not a list");
}

#[test]
fn the_conflicting_copy_is_left_untouched() {
    // Detect and report — never resolve. Deleting the wrong side loses work.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    let path = write_conflict(dir.path(), "Inbox", "- [ ] versão do celular\n");

    notebook.conflicts().unwrap();
    notebook.tasks_in("jott.tasks/task-list.md").unwrap();

    assert_eq!(read(&path), "- [ ] versão do celular\n");
}

// -------------------------------------------------------------- read-only

#[test]
fn a_notebook_from_a_newer_app_refuses_every_write() {
    let dir = tempfile::tempdir().unwrap();
    let (notebook, id) = notebook_with_task(dir.path(), "Comprar leite");
    drop(notebook);

    std::fs::write(
        dir.path().join(".jott/config.json"),
        r#"{ "schemaVersion": 99, "somethingNew": true }"#,
    )
    .unwrap();

    let notebook = Notebook::open(dir.path()).unwrap();
    assert!(notebook.is_read_only());

    // Reading still works — the user can see their tasks.
    assert_eq!(notebook.inbox().unwrap().tasks().count(), 1);

    // Writing does not, so a newer app's fields are never destroyed.
    assert!(notebook.complete_task("jott.tasks/task-list.md", &id).is_err());
    assert!(notebook.create_list("jott.tasks", "Compras").is_err());
    assert!(notebook.pull_into(Period::Day, "jott.tasks/task-list.md", &id).is_err());
    assert!(notebook.add_task_in_period(Period::Day, "nova").is_err());
    assert!(notebook.delete_list("jott.tasks/Compras.md").is_err());

    // These used to be composed in the bridge from unguarded primitives
    // (`TaskList::save`, `NoteFolder::write`), which is how a read-only
    // notebook was written into anyway. Every one of them now goes through
    // the notebook, where the guard lives (2026-08-19).
    assert!(notebook
        .edit_task_text("jott.tasks/task-list.md", &id, "novo texto".into())
        .is_err());
    assert!(notebook
        .set_task_fields(
            "jott.tasks/task-list.md",
            &id,
            jott_core::task::TaskFields::default(),
        )
        .is_err());
    assert!(notebook.move_task_to("jott.tasks/task-list.md", 0, 0).is_err());
    assert!(notebook.write_note("jott.notes", "Inbox/a.md", "corpo").is_err());
    assert!(notebook.create_note("jott.notes", "Inbox", "Nova").is_err());
    assert!(notebook.quick_capture_note("jott.notes", "Inbox", "texto").is_err());
    assert!(notebook.move_note("jott.notes", "Inbox/a.md", "").is_err());
    assert!(notebook.set_note_pinned("jott.notes", "Inbox/a.md", true).is_err());
    assert!(notebook.set_note_banner("jott.notes", "Inbox/a.md", None).is_err());
    assert!(notebook.create_note_folder("jott.notes", "Ideias").is_err());
    assert!(notebook
        .set_note_folder("jott.notes", "Inbox", |it| it.pinned = true)
        .is_err());

    // And the unknown key is still on disk, untouched.
    assert!(read(dir.path().join(".jott/config.json")).contains("somethingNew"));
}

#[test]
fn a_config_written_outside_the_app_takes_effect_on_reload() {
    // The bridge calls `reload_config` when the watcher reports the file
    // changed. Without it, a preference synced in from another machine was
    // announced and then ignored until the app restarted.
    let dir = tempfile::tempdir().unwrap();
    let mut notebook = Notebook::init(dir.path()).unwrap();
    assert_eq!(notebook.config().accent_color, "");

    std::fs::write(
        dir.path().join(".jott/config.json"),
        r#"{ "schemaVersion": 1, "accentColor": "orange" }"#,
    )
    .unwrap();

    notebook.reload_config();
    assert_eq!(notebook.config().accent_color, "orange");
}

// ------------------------------------------------------- full phase-2 flow

#[test]
fn the_whole_phase_two_scenario_end_to_end() {
    // Roadmap's exit criterion: create → pull into the week → pull into the
    // day → complete → undo, checked against the files.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    let mut compras = notebook.open_list("jott.tasks/Compras.md").unwrap();
    let id = compras.add_text_with_id("Comprar leite");
    compras.save().unwrap();

    notebook.pull_into(Period::Week, "jott.tasks/Compras.md", &id).unwrap();
    notebook.pull_into(Period::Day, "jott.tasks/Compras.md", &id).unwrap();

    assert!(notebook
        .open_state(Period::Week)
        .unwrap()
        .state
        .contains("jott.tasks/Compras.md", &id));
    assert!(notebook
        .open_state(Period::Day)
        .unwrap()
        .state
        .contains("jott.tasks/Compras.md", &id));

    notebook.complete_task("jott.tasks/Compras.md", &id).unwrap();

    assert!(read(dir.path().join("jott.tasks/completed.md")).contains("- [x] Comprar leite"));
    // The references followed it into Completed rather than being dropped.
    for period in [Period::Day, Period::Week] {
        assert!(notebook
            .open_state(period)
            .unwrap()
            .state
            .contains("jott.tasks/completed.md", &id));
    }

    notebook.uncomplete_task("jott.tasks/completed.md", &id).unwrap();

    let compras = TaskList::load(dir.path().join("jott.tasks/Compras.md")).unwrap();
    let task = compras.find(&id).unwrap();
    assert_eq!(task.text, "Comprar leite");
    assert!(!task.done);
    assert!(read(dir.path().join("jott.tasks/completed.md")).trim().is_empty());
}

// ------------------------------------------------------------------
// Spaced list names, end to end (structural analysis 2026-07, item 2.2).
// The fixtures elsewhere mostly use one-word names, which is exactly how the
// origin truncation shipped unseen. This one drives the whole cycle on disk.

#[test]
fn completing_and_undoing_in_a_spaced_list_round_trips() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = jott_core::Notebook::init(dir.path()).unwrap();
    notebook.create_list("jott.tasks", "Meu Mercado").unwrap();

    let mut list = notebook.open_list("jott.tasks/Meu Mercado.md").unwrap();
    let id = list.add_text_with_id("Comprar arroz");
    list.save().unwrap();

    notebook.complete_task("jott.tasks/Meu Mercado.md", &id).unwrap();
    let completed =
        std::fs::read_to_string(dir.path().join("jott.tasks/completed.md")).unwrap();
    assert!(
        completed.contains("origin:\"Meu Mercado\""),
        "the spaced origin must be quoted on disk: {completed}"
    );

    notebook.uncomplete_task("jott.tasks/completed.md", &id).unwrap();
    let back = notebook.open_list("jott.tasks/Meu Mercado.md").unwrap();
    assert!(
        back.find(&id).is_some(),
        "undo must land in the original spaced list"
    );
    // And no truncated ghost list may appear.
    assert!(
        !dir.path().join("jott.tasks/Meu.md").exists(),
        "undo must not create a list named after the first word"
    );
}

#[test]
fn a_quote_in_a_list_name_is_refused() {
    // `"` is the comment quote character; a name carrying it would break the
    // parsing of every task completed from that list.
    let dir = tempfile::tempdir().unwrap();
    let notebook = jott_core::Notebook::init(dir.path()).unwrap();
    assert!(matches!(
        notebook.create_list("jott.tasks", "Mi\"casa"),
        Err(jott_core::Error::InvalidListName(_))
    ));
}

#[test]
fn a_deleted_list_keeps_the_prose_the_rescue_cannot_carry() {
    // The rescue moves the *tasks* to the Inbox — but a list file also holds
    // whatever the user wrote around them: a heading, a note to self. That
    // is theirs too, so the file goes to the trash rather than being erased.
    let dir = tempfile::tempdir().unwrap();
    let notebook = jott_core::Notebook::init(dir.path()).unwrap();
    notebook.create_list("jott.tasks", "Obra").unwrap();
    std::fs::write(
        dir.path().join("jott.tasks/Obra.md"),
        "# Obra da casa\n\nFalar com o Jorge antes de comprar.\n\n- [ ] Cimento\n",
    )
    .unwrap();

    let rescued = notebook.delete_list("jott.tasks/Obra.md").unwrap();
    assert_eq!(rescued, 1, "the task moved to the Inbox");
    assert!(std::fs::read_to_string(dir.path().join("jott.tasks/task-list.md"))
        .unwrap()
        .contains("Cimento"));

    // And the prose the rescue could not carry is still recoverable — now in
    // the notebook's own internal trash (reestruturação 2026-07-30), not the OS
    // trash.
    let trashed =
        std::fs::read_to_string(dir.path().join(".jott/trash/items/Obra.md")).unwrap();
    assert!(trashed.contains("# Obra da casa"));
    assert!(trashed.contains("Falar com o Jorge"));
}

// ---------------------------------------------- reestruturação 2026-07-30: B

#[test]
fn a_trashed_list_can_be_restored() {
    let dir = tempfile::tempdir().unwrap();
    let nb = jott_core::Notebook::init(dir.path()).unwrap();
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
    let dir = tempfile::tempdir().unwrap();
    let nb = jott_core::Notebook::init(dir.path()).unwrap();
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
    let dir = tempfile::tempdir().unwrap();
    let nb = jott_core::Notebook::init(dir.path()).unwrap();
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
    let dir = tempfile::tempdir().unwrap();
    let nb = jott_core::Notebook::init(dir.path()).unwrap();

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
fn tags_keep_their_colours() {
    let dir = tempfile::tempdir().unwrap();
    let nb = jott_core::Notebook::init(dir.path()).unwrap();
    nb.set_tag("work", Some("#0080FF".into())).unwrap();
    nb.set_tag("home", Some("#8CEC71".into())).unwrap();
    let tags = nb.tags();
    assert_eq!(tags.tags().len(), 2);
    assert!(tags.tags().iter().any(|t| t.name == "work" && t.color.as_deref() == Some("#0080FF")));

    nb.remove_tag("work").unwrap();
    assert_eq!(nb.tags().tags().len(), 1);
    assert!(dir.path().join(".jott/tags.json").is_file());
}

#[test]
fn completed_aggregates_across_spaces_and_writes_the_index() {
    let dir = tempfile::tempdir().unwrap();
    let nb = jott_core::Notebook::init(dir.path()).unwrap();
    nb.create_space("Project", "tasks").unwrap();

    // Complete one task in each space's list.
    let mut inbox = nb.inbox().unwrap();
    let id1 = inbox.add_text_with_id("pessoal");
    inbox.save().unwrap();
    nb.complete_task("jott.tasks/task-list.md", &id1).unwrap();

    std::fs::write(dir.path().join("Project/Project.md"), "- [ ] projeto\n").unwrap();
    let id2 = nb.ensure_task_id("Project/Project.md", 0).unwrap();
    nb.complete_task("Project/Project.md", &id2).unwrap();

    let all = nb.completed_all().unwrap();
    let texts: Vec<&str> = all.iter().map(|l| l.task.text.as_str()).collect();
    assert!(texts.contains(&"pessoal"));
    assert!(texts.contains(&"projeto"));

    let index = std::fs::read_to_string(dir.path().join(".jott/completed.json")).unwrap();
    assert!(index.contains("Project/completed.md"));
}

#[test]
fn a_deleted_task_restores_as_a_real_task_not_raw_text() {
    let dir = tempfile::tempdir().unwrap();
    let nb = jott_core::Notebook::init(dir.path()).unwrap();
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

// ------------------------------------------------------ where a new task lands

#[test]
fn a_new_task_lands_at_the_bottom_unless_the_notebook_says_top() {
    let dir = tempfile::tempdir().unwrap();
    let (mut notebook, _) = notebook_with_task(dir.path(), "Primeira");
    let inbox = "jott.tasks/task-list.md";

    assert_eq!(notebook.create_task(inbox, "Segunda").unwrap(), 1);
    let texts: Vec<String> = notebook.tasks_in(inbox).unwrap().into_iter().map(|t| t.text).collect();
    assert_eq!(texts, vec!["Primeira", "Segunda"]);

    let mut config = notebook.config().clone();
    config.new_tasks_on_top = true;
    notebook.set_config(config).unwrap();

    assert_eq!(notebook.create_task(inbox, "Terceira").unwrap(), 0);
    let texts: Vec<String> = notebook.tasks_in(inbox).unwrap().into_iter().map(|t| t.text).collect();
    assert_eq!(texts, vec!["Terceira", "Primeira", "Segunda"]);

    // The period door obeys the same setting.
    notebook.add_task_in_period(Period::Day, "Quarta").unwrap();
    let texts: Vec<String> = notebook.tasks_in(inbox).unwrap().into_iter().map(|t| t.text).collect();
    assert_eq!(texts[0], "Quarta");
}

#[test]
fn on_top_keeps_whatever_the_user_wrote_above_the_checklist() {
    let dir = tempfile::tempdir().unwrap();
    let mut notebook = Notebook::init(dir.path()).unwrap();
    let path = dir.path().join("jott.tasks/task-list.md");
    std::fs::write(&path, "# Minhas tarefas\n\nUma nota antes.\n\n- [ ] Primeira\n").unwrap();

    let mut config = notebook.config().clone();
    config.new_tasks_on_top = true;
    notebook.set_config(config).unwrap();
    notebook.create_task("jott.tasks/task-list.md", "Nova").unwrap();

    let text = read(&path);
    assert!(text.starts_with("# Minhas tarefas\n\nUma nota antes.\n\n- [ ] Nova"), "{text}");
}

#[test]
fn a_trashed_item_can_be_deleted_for_good_and_the_trash_emptied() {
    let dir = tempfile::tempdir().unwrap();
    let nb = jott_core::Notebook::init(dir.path()).unwrap();
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
