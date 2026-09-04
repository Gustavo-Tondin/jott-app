//! The file watcher, against the real filesystem.
//!
//! These tests talk to the OS notification API, so they wait on a timeout
//! instead of asserting immediately — an event that arrives in 5ms on one
//! machine takes 200ms on another.

use std::time::Duration;

use jott_core::watcher::Change;
use jott_core::Notebook;

/// Generous on purpose: a slow CI box failing this test would say nothing
/// about the code.
const WAIT: Duration = Duration::from_secs(5);

/// Waits for a change matching `wanted`, ignoring unrelated noise (the OS
/// reports directory updates alongside file ones).
fn wait_for(
    watcher: &jott_core::NotebookWatcher,
    wanted: impl Fn(&Change) -> bool,
) -> Option<Change> {
    let deadline = std::time::Instant::now() + WAIT;
    while std::time::Instant::now() < deadline {
        let remaining = deadline - std::time::Instant::now();
        match watcher.next_within(remaining) {
            Some(change) if wanted(&change) => return Some(change),
            Some(_) => continue,
            None => return None,
        }
    }
    None
}

#[test]
fn reports_a_list_edited_outside_the_app() {
    // The Syncthing / Obsidian scenario: someone else writes the file.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    let watcher = notebook.watch().unwrap();

    std::fs::write(
        dir.path().join("jott.tasks/task-list.md"),
        "- [ ] escrita externa\n",
    )
    .unwrap();

    let change = wait_for(&watcher, |c| c.list_name().as_deref() == Some("task-list"));
    assert!(
        matches!(change, Some(Change::List { .. })),
        "expected a change to the task list, got {change:?}"
    );
}

#[test]
fn reports_a_new_list_appearing() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    let watcher = notebook.watch().unwrap();

    std::fs::write(dir.path().join("jott.tasks/Compras.md"), "").unwrap();

    let change = wait_for(&watcher, |c| c.list_name().as_deref() == Some("Compras"));
    assert!(change.is_some(), "a new list should be reported");
}

#[test]
fn reports_the_config_changing() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    let watcher = notebook.watch().unwrap();

    std::fs::write(
        dir.path().join(".jott/config.json"),
        r#"{"schemaVersion": 1}"#,
    )
    .unwrap();

    assert_eq!(
        wait_for(&watcher, |c| matches!(c, Change::Config)),
        Some(Change::Config)
    );
}

#[test]
fn the_apps_own_writes_do_not_surface_as_temporary_files() {
    // Atomic saves go through `*.md.tmp`; those must never reach the app.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    let watcher = notebook.watch().unwrap();

    notebook.create_task(&Notebook::inbox_path(), "nova").unwrap();
    wait_for(&watcher, |c| c.list_name().as_deref() == Some("Tasks"));

    // Drain whatever else the OS queued and check none of it is a temp file.
    for change in watcher.drain() {
        let path = match &change {
            Change::List { path }
            | Change::State { path }
            | Change::Conflict { path }
            | Change::Theme { path }
            | Change::Other { path } => path.clone(),
            Change::Config => continue,
        };
        assert!(
            path.extension().is_none_or(|ext| ext != "tmp"),
            "temporary file leaked to the app: {path:?}"
        );
    }
}

#[test]
fn a_conflict_appearing_is_reported_as_a_conflict() {
    // Syncthing dropping a conflicting copy is the one file event the user
    // must never miss — it is the only case where work can be lost silently.
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    let watcher = notebook.watch().unwrap();

    std::fs::write(
        dir.path()
            .join("jott.tasks/Inbox.sync-conflict-20260720-143000-K3F7NLM.md"),
        "- [ ] versão do celular\n",
    )
    .unwrap();

    let change = wait_for(&watcher, |c| matches!(c, Change::Conflict { .. }));
    assert!(
        change.is_some(),
        "a conflict copy must not be reported as a new list, got {change:?}"
    );
}

#[test]
fn drain_deduplicates_repeated_events_for_the_same_file() {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    let watcher = notebook.watch().unwrap();

    let path = dir.path().join("jott.tasks/task-list.md");
    for i in 0..5 {
        std::fs::write(&path, format!("- [ ] escrita {i}\n")).unwrap();
    }

    // Let the events land before draining.
    wait_for(&watcher, |c| c.list_name().as_deref() == Some("Tasks"));
    std::thread::sleep(Duration::from_millis(200));

    let inbox_changes = watcher
        .drain()
        .into_iter()
        .filter(|c| c.list_name().as_deref() == Some("Tasks"))
        .count();
    assert!(
        inbox_changes <= 1,
        "five writes to one file should collapse, got {inbox_changes}"
    );
}
