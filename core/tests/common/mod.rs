//! Fixtures shared by the task, plan and retention suites.
#![allow(dead_code)]

use std::path::Path;

use jott_core::Notebook;

/// A fresh notebook in a folder that lives as long as the test.
pub fn init() -> (tempfile::TempDir, Notebook) {
    let dir = tempfile::tempdir().unwrap();
    let notebook = Notebook::init(dir.path()).unwrap();
    (dir, notebook)
}

pub fn read(path: impl AsRef<Path>) -> String {
    std::fs::read_to_string(path).unwrap()
}

/// A day ahead of the notebook's today, for planning.
pub fn ahead(notebook: &Notebook, days: i64) -> Option<chrono::NaiveDate> {
    Some(notebook.today() + chrono::Duration::days(days))
}

/// Creates a task in the Inbox and pulls it into today — the three
/// primitives the app's composer chains (services/taskCompose.js).
pub fn add_in_today(notebook: &Notebook, text: &str) -> jott_core::Result<String> {
    let inbox = Notebook::inbox_path();
    let position = notebook.create_task(&inbox, text)?;
    let id = notebook.ensure_task_id(&inbox, position)?;
    notebook.pull_into_day(None, &inbox, &id)?;
    Ok(id)
}

/// A notebook with one task in the Inbox, returned with its id.
pub fn notebook_with_task(text: &str) -> (tempfile::TempDir, Notebook, String) {
    let (dir, notebook) = init();
    let mut inbox = notebook.inbox().unwrap();
    let id = inbox.add_text_with_id(text);
    inbox.save().unwrap();
    (dir, notebook, id)
}
