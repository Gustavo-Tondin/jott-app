//! A tasks space's order lives in its files: a sort rewrites the `.md`, every
//! write keeps it, a drag saves the custom order, and a file reordered by
//! someone else hands the space back to that order. Assertions read the
//! files, because the files are the order.

use chrono::NaiveDate;
use jott_core::task::Task;
use jott_core::Notebook;

mod common;
use common::{init, read};

const INBOX: &str = "jott.tasks/task-list.md";

fn day(offset: i64) -> NaiveDate {
    jott_core::clock::civil_today() + chrono::Duration::days(offset)
}

fn task(text: &str) -> Task {
    Task::new(text)
}

fn dated(text: &str, created: Option<i64>, due: Option<i64>) -> Task {
    let mut task = Task::new(text);
    task.created = created.map(day);
    task.due = due.map(day);
    task
}

/// Writes `tasks` into the list at `path` through the notebook, and answers
/// their ids in that order.
fn put(notebook: &Notebook, path: &str, tasks: Vec<Task>) -> Vec<String> {
    let mut list = notebook.open_list(path).unwrap();
    let mut ids = Vec::new();
    for task in tasks {
        let position = list.add(task);
        ids.push(list.ensure_id_at(position).unwrap());
    }
    list.save().unwrap();
    ids
}

fn texts(notebook: &Notebook, path: &str) -> Vec<String> {
    notebook
        .tasks_in(path)
        .unwrap()
        .into_iter()
        .map(|task| task.text)
        .collect()
}

/// The `sort`, `sortDirection` and `order` the space's config holds now.
fn arrangement(notebook: &Notebook, folder: &str) -> (Option<String>, Option<String>, Vec<String>) {
    let space = notebook
        .spaces()
        .unwrap()
        .into_iter()
        .find(|space| space.folder_name() == folder)
        .unwrap();
    (space.config.sort, space.config.sort_direction, space.config.order)
}

#[test]
fn a_sort_rewrites_the_file_and_keeps_what_sits_above_the_checklist() {
    let (dir, notebook) = init();
    let path = dir.path().join(INBOX);
    std::fs::write(
        &path,
        "# Mercado\n\nPara sábado.\n\n- [ ] banana\n- [ ] Abacate\n  maduro\n- [ ] cereja\n",
    )
    .unwrap();

    notebook.set_space_sort("jott.tasks", Some("name"), None).unwrap();
    let text = read(&path);
    assert!(
        text.starts_with("# Mercado\n\nPara sábado.\n\n- [ ] Abacate\n  maduro\n- [ ] banana\n"),
        "{text}"
    );
    // Reading the file gave nothing an id: arranging is not a reason to.
    assert!(!text.contains("id:"), "{text}");

    // ↑ turns it over, and choosing a sorting later keeps the direction.
    notebook.set_space_sort("jott.tasks", Some("name"), Some("up")).unwrap();
    assert_eq!(texts(&notebook, INBOX), vec!["cereja", "banana", "Abacate"]);
    notebook.set_space_sort("jott.tasks", Some("name"), None).unwrap();
    assert_eq!(arrangement(&notebook, "jott.tasks").1.as_deref(), Some("up"));
    notebook.set_space_sort("jott.tasks", Some("name"), Some("down")).unwrap();
    assert_eq!(arrangement(&notebook, "jott.tasks").1, None, "down is the default, not written");
}

#[test]
fn creation_runs_newest_first_and_due_soonest_first_with_the_undated_below() {
    let (_dir, notebook) = init();
    put(
        &notebook,
        INBOX,
        vec![
            dated("old, far", Some(-9), Some(20)),
            dated("new, undated 1", Some(-1), None),
            dated("mid, soon", Some(-5), Some(2)),
            dated("newest, undated 2", Some(0), None),
        ],
    );

    notebook.set_space_sort("jott.tasks", Some("created"), None).unwrap();
    assert_eq!(
        texts(&notebook, INBOX),
        vec!["newest, undated 2", "new, undated 1", "mid, soon", "old, far"]
    );

    // The undated keep, below the dated, the places they had among themselves.
    notebook.set_space_sort("jott.tasks", Some("due"), None).unwrap();
    assert_eq!(
        texts(&notebook, INBOX),
        vec!["mid, soon", "old, far", "newest, undated 2", "new, undated 1"]
    );
    notebook.set_space_sort("jott.tasks", Some("due"), Some("up")).unwrap();
    assert_eq!(
        texts(&notebook, INBOX),
        vec!["old, far", "mid, soon", "newest, undated 2", "new, undated 1"]
    );
}

#[test]
fn a_new_task_lands_where_the_sort_puts_it_and_the_setting_breaks_ties() {
    let (_dir, notebook) = init();
    put(&notebook, INBOX, vec![task("b"), task("d")]);
    notebook.set_space_sort("jott.tasks", Some("name"), None).unwrap();
    assert_eq!(notebook.create_task(INBOX, "c").unwrap(), 1, "the position is where it landed");
    notebook.create_task(INBOX, "a").unwrap();
    assert_eq!(texts(&notebook, INBOX), vec!["a", "b", "c", "d"]);

    // Creation is by day, so everything made today ties: on top goes before
    // the other ones of today, at the bottom after them.
    let (_dir, mut notebook) = init();
    put(
        &notebook,
        INBOX,
        vec![dated("older", Some(-3), None), dated("today 1", Some(0), None)],
    );
    notebook.set_space_sort("jott.tasks", Some("created"), None).unwrap();
    notebook.create_task(INBOX, "on top").unwrap();
    let mut config = notebook.config().clone();
    config.new_tasks_on_top = false;
    notebook.set_config(config).unwrap();
    notebook.create_task(INBOX, "at the bottom").unwrap();
    assert_eq!(
        texts(&notebook, INBOX),
        vec!["on top", "today 1", "at the bottom", "older"]
    );
}

#[test]
fn dragging_saves_the_custom_order_and_custom_puts_it_back() {
    let (dir, notebook) = init();
    let ids = put(&notebook, INBOX, vec![task("a"), task("b"), task("c")]);
    notebook.set_space_sort("jott.tasks", Some("name"), None).unwrap();

    // A drag is a custom order whatever sort was on, and it is the file.
    notebook
        .set_space_order("jott.tasks", vec![ids[2].clone(), ids[0].clone(), ids[1].clone()])
        .unwrap();
    assert_eq!(texts(&notebook, INBOX), vec!["c", "a", "b"]);
    assert_eq!(arrangement(&notebook, "jott.tasks").0.as_deref(), Some("custom"));

    // Off to another sort and back: Custom brings the drag back, with what
    // was created since on top.
    notebook.set_space_sort("jott.tasks", Some("name"), None).unwrap();
    notebook.create_task(INBOX, "z new").unwrap();
    assert_eq!(texts(&notebook, INBOX), vec!["a", "b", "c", "z new"]);
    notebook.set_space_sort("jott.tasks", Some("custom"), None).unwrap();
    assert_eq!(texts(&notebook, INBOX), vec!["z new", "c", "a", "b"]);
    assert!(read(dir.path().join(INBOX)).starts_with("- [ ] z new"));
}

#[test]
fn pinned_tasks_lead_the_file_and_sort_among_themselves() {
    let (_dir, notebook) = init();
    let ids = put(&notebook, INBOX, vec![task("c"), task("a"), task("b")]);
    notebook.set_task_pinned(INBOX, &ids[2], true).unwrap();
    // Custom: the pinned block on top, everything else where it was.
    assert_eq!(texts(&notebook, INBOX), vec!["b", "c", "a"]);

    notebook.set_task_pinned(INBOX, &ids[0], true).unwrap();
    notebook.set_space_sort("jott.tasks", Some("name"), None).unwrap();
    assert_eq!(texts(&notebook, INBOX), vec!["b", "c", "a"]);
    notebook.set_space_sort("jott.tasks", Some("name"), Some("up")).unwrap();
    assert_eq!(texts(&notebook, INBOX), vec!["c", "b", "a"]);
}

#[test]
fn every_write_keeps_the_sort_renaming_included() {
    let (_dir, notebook) = init();
    let ids = put(&notebook, INBOX, vec![task("a"), task("b"), task("c")]);
    notebook.set_space_sort("jott.tasks", Some("name"), None).unwrap();
    notebook.edit_task_text(INBOX, &ids[2], "0 first".into()).unwrap();
    assert_eq!(texts(&notebook, INBOX), vec!["0 first", "a", "b"]);
    // A duplicate ties with its original and stays right below it.
    notebook.duplicate_task(INBOX, &ids[0]).unwrap();
    assert_eq!(texts(&notebook, INBOX), vec!["0 first", "a", "a", "b"]);
}

#[test]
fn completed_keeps_the_order_things_were_ticked_in_and_undo_lands_by_the_sort() {
    let (dir, notebook) = init();
    let ids = put(
        &notebook,
        INBOX,
        vec![
            dated("far", None, Some(20)),
            dated("soon", None, Some(2)),
            dated("undated", None, None),
        ],
    );
    notebook.set_space_sort("jott.tasks", Some("due"), None).unwrap();
    notebook.complete_task(INBOX, &ids[0]).unwrap();
    notebook.complete_task(INBOX, &ids[1]).unwrap();
    let completed = read(dir.path().join("jott.tasks/completed.md"));
    assert!(completed.find("far").unwrap() < completed.find("soon").unwrap(), "{completed}");

    notebook.uncomplete_task("jott.tasks/completed.md", &ids[0]).unwrap();
    assert_eq!(texts(&notebook, INBOX), vec!["far", "undated"]);
}

#[test]
fn a_task_arriving_from_elsewhere_lands_where_the_target_sort_puts_it() {
    let (_dir, notebook) = init();
    notebook.create_list("jott.tasks", "Compras").unwrap();
    put(&notebook, INBOX, vec![task("a"), task("c")]);
    let moving = put(&notebook, "jott.tasks/Compras.md", vec![task("b"), task("d")]);
    notebook.set_space_sort("jott.tasks", Some("name"), None).unwrap();

    notebook
        .move_task(&moving[0], "jott.tasks/Compras.md", INBOX, jott_core::OriginAction::Keep)
        .unwrap();
    assert_eq!(texts(&notebook, INBOX), vec!["a", "b", "c"]);

    // A deleted list's tasks too, and more than one keeps its own order.
    notebook.set_space_sort("jott.tasks", Some("custom"), None).unwrap();
    notebook.create_list("jott.tasks", "Velha").unwrap();
    put(&notebook, "jott.tasks/Velha.md", vec![task("x"), task("y")]);
    notebook.delete_list("jott.tasks/Velha.md").unwrap();
    assert_eq!(texts(&notebook, INBOX)[..2], ["x", "y"]);
}

#[test]
fn a_move_by_hand_turns_a_sorted_space_to_custom() {
    let (_dir, notebook) = init();
    let ids = put(&notebook, INBOX, vec![task("a"), task("b"), task("c")]);
    notebook.set_space_sort("jott.tasks", Some("name"), None).unwrap();
    notebook.move_task_to(INBOX, 2, 0).unwrap();
    assert_eq!(texts(&notebook, INBOX), vec!["c", "a", "b"]);
    let (sort, _, order) = arrangement(&notebook, "jott.tasks");
    assert_eq!(sort.as_deref(), Some("custom"));
    assert_eq!(order, vec![ids[2].clone(), ids[0].clone(), ids[1].clone()]);
}

/// Rewrites the list the way an editor would: the task lines reversed.
fn reverse_by_hand(path: &std::path::Path) {
    let text = read(path);
    let mut lines: Vec<&str> = text.lines().collect();
    lines.reverse();
    std::fs::write(path, lines.join("\n") + "\n").unwrap();
}

#[test]
fn a_list_reordered_outside_the_app_turns_its_space_to_custom() {
    let (dir, notebook) = init();
    let path = dir.path().join(INBOX);
    let ids = put(&notebook, INBOX, vec![task("a"), task("b"), task("c")]);
    notebook.set_space_sort("jott.tasks", Some("name"), None).unwrap();

    // Still in order: nothing gives way.
    assert!(notebook.yield_to_file_order(Some(std::slice::from_ref(&path))).unwrap().is_empty());

    reverse_by_hand(&path);
    let before = read(&path);
    assert_eq!(
        notebook.yield_to_file_order(Some(std::slice::from_ref(&path))).unwrap(),
        vec!["jott.tasks".to_string()]
    );
    let (sort, _, order) = arrangement(&notebook, "jott.tasks");
    assert_eq!(sort.as_deref(), Some("custom"));
    assert_eq!(order, vec![ids[2].clone(), ids[1].clone(), ids[0].clone()]);
    assert_eq!(read(&path), before, "the file is the order now; it is not rewritten");

    // A note, a Completed or a file outside any space changes nothing.
    notebook.set_space_sort("jott.tasks", Some("name"), None).unwrap();
    let elsewhere = [
        dir.path().join("jott.tasks/completed.md"),
        dir.path().join("jott.notes/Inbox/idea.md"),
        std::path::PathBuf::from("/somewhere/else.md"),
    ];
    assert!(notebook.yield_to_file_order(Some(&elsewhere)).unwrap().is_empty());
}

#[test]
fn a_list_reordered_while_the_app_was_closed_is_found_on_open() {
    let (dir, notebook) = init();
    let path = dir.path().join(INBOX);
    put(&notebook, INBOX, vec![task("a"), task("b"), task("c")]);
    notebook.set_space_sort("jott.tasks", Some("name"), None).unwrap();
    drop(notebook);

    reverse_by_hand(&path);
    let notebook = Notebook::open(dir.path()).unwrap();
    assert_eq!(arrangement(&notebook, "jott.tasks").0.as_deref(), Some("custom"));
    // Opening saved the list (ids, dates) without sorting it back.
    assert_eq!(texts(&notebook, INBOX), vec!["c", "b", "a"]);
}

#[test]
fn every_list_on_the_tasks_screen_reads_in_the_tasks_sort() {
    let (_dir, notebook) = init();
    notebook.create_list("jott.tasks", "Compras").unwrap();
    put(&notebook, INBOX, vec![task("d"), task("b")]);
    put(&notebook, "jott.tasks/Compras.md", vec![task("c"), task("a")]);
    notebook.set_space_sort("jott.tasks", Some("name"), None).unwrap();
    let all: Vec<String> = notebook
        .all_tasks()
        .unwrap()
        .into_iter()
        .map(|listed| listed.task.text)
        .collect();
    assert_eq!(all, vec!["a", "b", "c", "d"]);
}

#[test]
fn a_notes_space_sort_rewrites_no_file() {
    let (dir, notebook) = init();
    notebook.create_space("Ideias", "notes").unwrap();
    let note = dir.path().join("Ideias/Inbox/b.md");
    std::fs::write(&note, "b").unwrap();
    notebook.set_space_sort("Ideias", Some("name"), Some("up")).unwrap();
    assert_eq!(read(&note), "b");
    assert_eq!(arrangement(&notebook, "Ideias").0.as_deref(), Some("name"));
}
