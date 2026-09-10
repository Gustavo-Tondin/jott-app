//! Tasks on disk: completing and undoing, reading hand-written lists,
//! renaming and deleting lists, repeats, counts, sync conflicts and the
//! read-only notebook. Assertions look at the files, because the files
//! are the product.

use std::path::Path;

use jott_core::{Error, Notebook, TaskList};

mod common;
use common::{add_in_today, ahead, init, notebook_with_task, read};

// ------------------------------------------------------------- completing

#[test]
fn completing_moves_the_task_to_completed_with_its_origin() {
    let (dir, notebook) = init();
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
    let (dir, notebook) = init();
    let today = jott_core::clock::civil_today();

    let position = notebook
        .create_task("jott.tasks/task-list.md", "Comprar leite")
        .unwrap();
    assert!(
        read(dir.path().join("jott.tasks/task-list.md")).contains(&format!("created:{today}")),
        "a created task is stamped with today's date"
    );

    // Creating from the day goes through the same stamp.
    add_in_today(&notebook, "Da tela de hoje").unwrap();
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
    let (dir, notebook) = init();
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
fn a_freely_task_keeps_one_open_copy_and_piles_up_in_completed() {
    // `repeat: freely` has no period: every completion leaves another copy in
    // Completed and puts exactly one undated copy back in the list.
    let (dir, notebook) = init();
    let inbox_path = dir.path().join("jott.tasks/task-list.md");
    std::fs::write(
        &inbox_path,
        "- [ ] Lavar a louça <!--id:a1-->\n  repeat: freely\n",
    )
    .unwrap();

    notebook.complete_task("jott.tasks/task-list.md", "a1").unwrap();
    let inbox = read(&inbox_path);
    assert_eq!(
        inbox.matches("- [ ] Lavar a louça").count(),
        1,
        "one open copy comes back:\n{inbox}"
    );
    assert!(inbox.contains("repeat: freely"), "it keeps repeating:\n{inbox}");
    assert!(!inbox.contains('@'), "and it comes back undated:\n{inbox}");
    assert!(
        inbox.contains(&format!("created:{}", notebook.today())),
        "marked with the day it came back:\n{inbox}"
    );

    // Complete the new one too: a second line in Completed, still one open.
    let spawn_id = notebook.ensure_task_id("jott.tasks/task-list.md", 0).unwrap();
    notebook
        .complete_task("jott.tasks/task-list.md", &spawn_id)
        .unwrap();

    let inbox = read(&inbox_path);
    let completed = read(dir.path().join("jott.tasks/completed.md"));
    assert_eq!(
        inbox.matches("- [ ] Lavar a louça").count(),
        1,
        "still one open copy:\n{inbox}"
    );
    assert_eq!(
        completed.matches("- [x] Lavar a louça").count(),
        2,
        "Completed keeps every one of them:\n{completed}"
    );
}

#[test]
fn restoring_a_freely_task_takes_the_copy_it_left_behind() {
    // Undo of a `freely` completion: the task comes back and the occurrence
    // its completion wrote goes to the trash — one open at a time.
    let (dir, notebook) = init();
    let inbox_path = dir.path().join("jott.tasks/task-list.md");
    std::fs::write(
        &inbox_path,
        "- [ ] Regar as plantas <!--id:a1-->\n  repeat: freely\n",
    )
    .unwrap();

    notebook.complete_task("jott.tasks/task-list.md", "a1").unwrap();
    notebook
        .uncomplete_task("jott.tasks/completed.md", "a1")
        .unwrap();

    let inbox = read(&inbox_path);
    assert_eq!(
        inbox.matches("Regar as plantas").count(),
        1,
        "the restored task is the only one open:\n{inbox}"
    );
    assert!(inbox.contains("id:a1"), "and it is the original:\n{inbox}");
    assert!(
        !inbox.contains("spawned:"),
        "its pointer went with the copy:\n{inbox}"
    );
    // Nothing is destroyed: the copy is in the trash.
    assert!(
        !notebook.trash_entries().is_empty(),
        "the removed copy waits in the trash"
    );

    // And re-completing it starts the chain again, without duplicating.
    notebook.complete_task("jott.tasks/task-list.md", "a1").unwrap();
    let inbox = read(&inbox_path);
    assert_eq!(
        inbox.matches("- [ ] Regar as plantas").count(),
        1,
        "one open copy again:\n{inbox}"
    );
}

#[test]
fn recompleting_after_the_chain_moved_on_does_not_regrow_it() {
    // The real-use duplication of 2026-08-05 (the screenshot): complete the
    // original, complete its spawn, undo the ORIGINAL, complete it again.
    // The 2026-08-04 delete-the-spawn undo could not see that @08-01 had
    // already been completed, so re-completing generated it a second time.
    let (dir, notebook) = init();
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
    let (dir, notebook) = init();
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
fn completing_keeps_the_task_in_today_and_in_the_plan_pointing_at_completed() {
    // A day references a TASK, not a place (2026-08-06): ticking it in
    // Today must slide it into the screen's "Completed N" section, not make it
    // vanish. The reference follows the task into the folder's Completed —
    // in today's state and in the plan alike.
    let (_dir, notebook, id) = notebook_with_task("Ligar pro dentista");
    let tomorrow = ahead(&notebook, 1);

    notebook.pull_into_day(None, "jott.tasks/task-list.md", &id).unwrap();
    notebook.pull_into_day(tomorrow, "jott.tasks/task-list.md", &id).unwrap();

    notebook.complete_task("jott.tasks/task-list.md", &id).unwrap();

    let state = notebook.open_state().unwrap().state;
    assert!(
        state.contains("jott.tasks/completed.md", &id),
        "today follows the task into Completed: {state:?}"
    );
    assert!(!state.contains("jott.tasks/task-list.md", &id));
    let plan = notebook.open_plan().unwrap().plan;
    assert!(plan.contains(tomorrow.unwrap(), "jott.tasks/completed.md", &id), "{plan:?}");
    // A day ahead holds only what is still to do: ticked, the task is done
    // with that day (user call, 2026-09-04).
    assert!(notebook.day_tasks(tomorrow).unwrap().is_empty());

    // And the period still resolves it — as a done task, which is what the
    // screen splits into its Completed section.
    let listed = notebook.day_tasks(None).unwrap();
    assert_eq!(listed.len(), 1);
    assert!(listed[0].task.done);
    assert_eq!(listed[0].path, "jott.tasks/completed.md");

    // Undoing brings it back to the open list, reference and all.
    notebook.uncomplete_task("jott.tasks/completed.md", &id).unwrap();
    let state = notebook.open_state().unwrap().state;
    assert!(state.contains("jott.tasks/task-list.md", &id), "{state:?}");
}

#[test]
fn moving_a_task_to_another_list_takes_its_period_references_along() {
    // Same primitive, same rule: the inspector's "move to list" used to leave
    // the Day pointing at the old file, where the task no longer was — a
    // reference silently skipped on read, so the task just left Today.
    let (_dir, notebook, id) = notebook_with_task("Comprar leite");
    notebook.create_list("jott.tasks", "Compras").unwrap();

    notebook.pull_into_day(None, "jott.tasks/task-list.md", &id).unwrap();
    notebook
        .move_task(
            &id,
            "jott.tasks/task-list.md",
            "jott.tasks/Compras.md",
            jott_core::notebook::OriginAction::Clear,
        )
        .unwrap();

    let state = notebook.open_state().unwrap().state;
    assert!(state.contains("jott.tasks/Compras.md", &id), "{state:?}");
    assert_eq!(notebook.day_tasks(None).unwrap().len(), 1);
}

#[test]
fn a_period_keeps_the_order_the_user_dragged_and_its_own_sort() {
    // A period is not a folder, so there is no `.space.json`: the hand-made
    // order goes into the state file itself (it IS the day's list) and the
    // sorting preference into the notebook config (2026-08-06).
    let (dir, mut notebook) = init();

    let mut inbox = notebook.inbox().unwrap();
    let ids: Vec<String> = ["um", "dois", "três"]
        .iter()
        .map(|text| inbox.add_text_with_id(*text))
        .collect();
    inbox.save().unwrap();
    for id in &ids {
        notebook.pull_into_day(None, "jott.tasks/task-list.md", id).unwrap();
    }

    let refs = |order: [usize; 3]| {
        order
            .iter()
            .map(|i| jott_core::state::TaskRef::new("jott.tasks/task-list.md", &ids[*i]))
            .collect::<Vec<_>>()
    };
    notebook.set_day_order(None, &refs([2, 0, 1])).unwrap();

    let texts: Vec<String> = notebook
        .day_tasks(None)
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
    notebook.pull_into_day(None, "jott.tasks/task-list.md", &late).unwrap();
    notebook.set_day_order(None, &refs([1, 0, 2])).unwrap();
    assert_eq!(notebook.open_state().unwrap().state.len(), 4);
    assert!(notebook
        .open_state()
        .unwrap()
        .state
        .contains("jott.tasks/task-list.md", &late));

    // And the sorting round-trips through the config, clearing back to none.
    assert_eq!(notebook.day_sort(), None);
    notebook.set_day_sort(Some("name")).unwrap();
    assert_eq!(notebook.day_sort(), Some("name"));
    assert!(read(dir.path().join(".jott/config.json")).contains("daySort"));
    notebook.set_day_sort(None).unwrap();
    assert_eq!(notebook.day_sort(), None);
    assert!(!read(dir.path().join(".jott/config.json")).contains("periodSort"));
}

#[test]
fn undoing_sends_the_task_back_to_its_origin_list() {
    let (dir, notebook) = init();
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
    let (dir, notebook) = init();
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
    let (dir, notebook) = init();

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
    let (_dir, notebook) = init();

    let err = notebook.uncomplete_task("jott.tasks/completed.md", "nope").unwrap_err();
    assert!(matches!(err, Error::TaskNotFound(_)));
}

// ----------------------------------------------------------------- reading

#[test]
fn reading_a_hand_written_list_leaves_the_file_exactly_as_it_was() {
    // Changed in 2026-07-20: reading used to stamp an id on every task, which
    // put a comment on lines the user never asked about. Now the id arrives
    // only when something needs to address the task.
    let (dir, notebook) = init();
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
    let (dir, notebook) = init();
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
    let (dir, notebook, id) = notebook_with_task("Comprar leite");
    notebook.pull_into_day(None, "jott.tasks/task-list.md", &id).unwrap();

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

    let pulled = notebook.day_tasks(None).unwrap();
    assert_eq!(pulled.len(), 1, "the reference must not become ambiguous");
    assert_eq!(pulled[0].task.id.as_deref(), Some(id.as_str()));
}

#[test]
fn moving_a_task_into_a_list_that_already_uses_its_id() {
    // Ids are unique per file, so two lists can legitimately hold the same
    // one. Completing both must not merge them into a single line.
    let (dir, notebook) = init();
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
    let (dir, _) = init();
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
    let (dir, notebook) = init();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    let mut compras = notebook.open_list("jott.tasks/Compras.md").unwrap();
    let done_id = compras.add_text_with_id("Comprar leite");
    let pulled_id = compras.add_text_with_id("Comprar pão");
    compras.save().unwrap();

    notebook.complete_task("jott.tasks/Compras.md", &done_id).unwrap();
    notebook.pull_into_day(None, "jott.tasks/Compras.md", &pulled_id).unwrap();

    notebook.rename_list("jott.tasks/Compras.md", "Mercado").unwrap();

    assert!(dir.path().join("jott.tasks/Mercado.md").is_file());
    assert!(!dir.path().join("jott.tasks/Compras.md").exists());
    assert!(read(dir.path().join("jott.tasks/completed.md")).contains("origin:Mercado"));

    let state = notebook.open_state().unwrap();
    assert!(state.state.contains("jott.tasks/Mercado.md", &pulled_id));

    // The undo still works, which is the whole point of repointing origins.
    notebook.uncomplete_task("jott.tasks/completed.md", &done_id).unwrap();
    assert!(read(dir.path().join("jott.tasks/Mercado.md")).contains("Comprar leite"));
}

#[test]
fn default_lists_cannot_be_renamed_or_deleted() {
    let (_dir, notebook) = init();

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
    let (dir, notebook) = init();
    notebook.create_list("jott.tasks", "Compras").unwrap();
    notebook.create_list("jott.tasks", "Mercado").unwrap();

    assert!(notebook.rename_list("jott.tasks/Compras.md", "Mercado").is_err());
    // Neither file was harmed.
    assert!(dir.path().join("jott.tasks/Compras.md").is_file());
    assert!(dir.path().join("jott.tasks/Mercado.md").is_file());
}

#[test]
fn deleting_a_list_rescues_its_tasks_into_the_inbox() {
    let (dir, notebook) = init();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    let mut compras = notebook.open_list("jott.tasks/Compras.md").unwrap();
    let id = compras.add_text_with_id("Comprar leite");
    compras.add_text("Comprar pão");
    compras.save().unwrap();
    notebook.pull_into_day(None, "jott.tasks/Compras.md", &id).unwrap();

    let rescued = notebook.delete_list("jott.tasks/Compras.md").unwrap();

    assert_eq!(rescued, 2);
    assert!(!dir.path().join("jott.tasks/Compras.md").exists());

    let inbox = read(dir.path().join("jott.tasks/task-list.md"));
    assert!(inbox.contains("Comprar leite"));
    assert!(inbox.contains("Comprar pão"));

    // A task that was pulled into Today stays pulled, now via the Inbox.
    let state = notebook.open_state().unwrap();
    assert!(state.state.contains("jott.tasks/task-list.md", &id));
}

#[test]
fn deleting_a_list_rescues_tasks_that_never_earned_an_id() {
    // Caught while making ids lazy: the rescue used to iterate over ids, so
    // every task without one — which is now most of them — was deleted with
    // the file.
    let (dir, notebook) = init();
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
    let (_dir, notebook) = init();

    for evil in ["../escape", "sub/dir", ".hidden", ""] {
        assert!(notebook.rename_list(evil, "Ok").is_err(), "{evil:?}");
        assert!(notebook.delete_list(evil).is_err(), "{evil:?}");
    }
}

// ----------------------------------------------------------- recorrência

#[test]
fn completing_a_repeating_task_leaves_the_next_one_behind() {
    let (dir, notebook) = init();
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
    let (_dir, notebook, id) = notebook_with_task("Comprar leite");

    notebook.complete_task("jott.tasks/task-list.md", &id).unwrap();

    assert!(notebook.tasks_in("jott.tasks/task-list.md").unwrap().is_empty());
}

// ------------------------------------------------------------- contagem

#[test]
fn counts_only_the_open_tasks_of_each_list() {
    let (_dir, notebook) = init();
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
    let (dir, notebook) = init();
    let original = "- [ ] escrita à mão, sem id\n";
    std::fs::write(dir.path().join("jott.tasks/task-list.md"), original).unwrap();

    assert_eq!(notebook.open_task_counts().unwrap().get("jott.tasks/task-list.md"), Some(&1));
    assert_eq!(read(dir.path().join("jott.tasks/task-list.md")), original);
}

#[test]
fn a_conflict_copy_is_not_counted_as_a_list() {
    let (dir, notebook) = init();
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
    let (dir, notebook) = init();
    write_conflict(dir.path(), "task-list", "- [ ] versão do celular\n");

    let names: Vec<String> = notebook.lists().unwrap().into_iter().map(|l| l.name).collect();
    assert_eq!(names, vec!["completed", "task-list"]);
}

#[test]
fn conflicts_are_reported_with_the_list_they_belong_to() {
    let (dir, notebook) = init();
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
    let (_dir, notebook) = init();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    assert!(notebook.conflicts().unwrap().is_empty());
}

#[test]
fn a_conflict_on_a_state_file_is_reported_too() {
    // Two devices planning the same day is exactly when this happens.
    let (dir, notebook) = init();
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
    let (dir, notebook) = init();
    let path = write_conflict(dir.path(), "Inbox", "- [ ] versão do celular\n");

    notebook.conflicts().unwrap();
    notebook.tasks_in("jott.tasks/task-list.md").unwrap();

    assert_eq!(read(&path), "- [ ] versão do celular\n");
}

// -------------------------------------------------------------- read-only

#[test]
fn a_notebook_from_a_newer_app_refuses_every_write() {
    let (dir, notebook, id) = notebook_with_task("Comprar leite");
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
    assert!(notebook.pull_into_day(None, "jott.tasks/task-list.md", &id).is_err());
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
    let (dir, mut notebook) = init();
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
    // Roadmap's exit criterion: create → plan for tomorrow → pull into the
    // day → complete → undo, checked against the files.
    let (dir, notebook) = init();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    let mut compras = notebook.open_list("jott.tasks/Compras.md").unwrap();
    let id = compras.add_text_with_id("Comprar leite");
    compras.save().unwrap();

    let tomorrow = ahead(&notebook, 1).unwrap();
    notebook.pull_into_day(Some(tomorrow), "jott.tasks/Compras.md", &id).unwrap();
    notebook.pull_into_day(None, "jott.tasks/Compras.md", &id).unwrap();

    assert!(notebook
        .open_plan()
        .unwrap()
        .plan
        .contains(tomorrow, "jott.tasks/Compras.md", &id));
    assert!(notebook
        .open_state()
        .unwrap()
        .state
        .contains("jott.tasks/Compras.md", &id));

    notebook.complete_task("jott.tasks/Compras.md", &id).unwrap();

    assert!(read(dir.path().join("jott.tasks/completed.md")).contains("- [x] Comprar leite"));
    // The references followed it into Completed rather than being dropped.
    assert!(notebook
        .open_state()
        .unwrap()
        .state
        .contains("jott.tasks/completed.md", &id));
    assert!(notebook
        .open_plan()
        .unwrap()
        .plan
        .contains(tomorrow, "jott.tasks/completed.md", &id));

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
    let (dir, notebook) = init();
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
    let (_dir, notebook) = init();
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
    let (dir, notebook) = init();
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

// ------------------------------------------------- tags and the Completed

#[test]
fn tags_keep_their_colours() {
    let (dir, nb) = init();
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
    let (dir, nb) = init();
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

// ------------------------------------------------------ where a new task lands

#[test]
fn a_new_task_lands_on_top_unless_the_notebook_says_bottom() {
    let (_dir, mut notebook, _) = notebook_with_task("Primeira");
    let inbox = "jott.tasks/task-list.md";

    // The default: above the first (2026-09-08).
    assert_eq!(notebook.create_task(inbox, "Segunda").unwrap(), 0);
    let texts: Vec<String> = notebook.tasks_in(inbox).unwrap().into_iter().map(|t| t.text).collect();
    assert_eq!(texts, vec!["Segunda", "Primeira"]);

    let mut config = notebook.config().clone();
    config.new_tasks_on_top = false;
    notebook.set_config(config).unwrap();

    assert_eq!(notebook.create_task(inbox, "Terceira").unwrap(), 2);
    let texts: Vec<String> = notebook.tasks_in(inbox).unwrap().into_iter().map(|t| t.text).collect();
    assert_eq!(texts, vec!["Segunda", "Primeira", "Terceira"]);

    let mut config = notebook.config().clone();
    config.new_tasks_on_top = true;
    notebook.set_config(config).unwrap();

    // The day's door obeys the same setting.
    add_in_today(&notebook, "Quarta").unwrap();
    let texts: Vec<String> = notebook.tasks_in(inbox).unwrap().into_iter().map(|t| t.text).collect();
    assert_eq!(texts[0], "Quarta");
}

#[test]
fn on_top_keeps_whatever_the_user_wrote_above_the_checklist() {
    let (dir, mut notebook) = init();
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
fn a_day_puts_what_arrives_where_the_setting_says() {
    let (_dir, mut notebook) = init();
    let tomorrow = ahead(&notebook, 1);
    let inbox = "jott.tasks/task-list.md";
    let day_texts = |notebook: &Notebook, day| -> Vec<String> {
        notebook.day_tasks(day).unwrap().into_iter().map(|t| t.task.text).collect()
    };
    let pull = |notebook: &Notebook, day, text: &str| {
        let position = notebook.create_task(inbox, text).unwrap();
        let id = notebook.ensure_task_id(inbox, position).unwrap();
        notebook.pull_into_day(day, inbox, &id).unwrap();
    };

    // The default is on top, for today and for a day ahead alike.
    pull(&notebook, None, "Primeira");
    pull(&notebook, None, "Segunda");
    assert_eq!(day_texts(&notebook, None), vec!["Segunda", "Primeira"]);
    pull(&notebook, tomorrow, "Amanhã 1");
    pull(&notebook, tomorrow, "Amanhã 2");
    assert_eq!(day_texts(&notebook, tomorrow), vec!["Amanhã 2", "Amanhã 1"]);

    let mut config = notebook.config().clone();
    config.new_tasks_on_top = false;
    notebook.set_config(config).unwrap();
    pull(&notebook, None, "Terceira");
    assert_eq!(day_texts(&notebook, None), vec!["Segunda", "Primeira", "Terceira"]);
}

#[test]
fn a_space_arranged_by_hand_puts_the_new_task_first_in_its_order() {
    // `custom` draws an id it does not know LAST, so on top has to reach the
    // saved order as well as the file.
    let (dir, notebook, first) = notebook_with_task("Primeira");
    let inbox = "jott.tasks/task-list.md";
    notebook.set_space_order("jott.tasks", vec![first.clone()]).unwrap();

    let position = notebook.create_task(inbox, "Nova").unwrap();
    let fresh = notebook.ensure_task_id(inbox, position).unwrap();
    let config = read(dir.path().join("jott.tasks/.space.json"));
    let at = |id: &str| config.find(&format!("\"{id}\"")).expect(&config);
    assert!(at(&fresh) < at(&first), "{config}");
}

// ------------------------------------------------------------ every list

#[test]
fn every_open_task_of_the_notebook_comes_arranged_by_space() {
    // The fixed Tasks screen's "every list" (2026-09-04): flat, spaces in
    // the sidebar's order, lists in theirs, nothing done and nothing from a
    // Completed list.
    let (_dir, notebook) = init();
    notebook.create_space("Obra", "tasks").unwrap();
    notebook.create_list("jott.tasks", "Compras").unwrap();

    let mut inbox = notebook.inbox().unwrap();
    inbox.add_text_with_id("Da Inbox");
    let done = inbox.add_text_with_id("Feita");
    inbox.save().unwrap();
    notebook.complete_task("jott.tasks/task-list.md", &done).unwrap();

    let mut compras = notebook.open_list("jott.tasks/Compras.md").unwrap();
    compras.add_text_with_id("Das compras");
    compras.save().unwrap();

    let mut obra = notebook.open_list("Obra/task-list.md").unwrap();
    obra.add_text_with_id("Da obra");
    obra.save().unwrap();

    let all: Vec<(String, String)> = notebook
        .all_tasks()
        .unwrap()
        .into_iter()
        .map(|listed| (listed.path, listed.task.text))
        .collect();

    // The fixed space leads, as it does in the sidebar; the user's follow in
    // the order the sidebar draws them.
    assert_eq!(
        all,
        vec![
            ("jott.tasks/Compras.md".to_string(), "Das compras".to_string()),
            ("jott.tasks/task-list.md".to_string(), "Da Inbox".to_string()),
            ("Obra/task-list.md".to_string(), "Da obra".to_string()),
        ]
    );
}
