//! The notebook's own trash, in `.jott/trash/` (reestruturação 2026-07-30).
//!
//! Deleting never destroys (principle 4): a note, list, widget, space,
//! group — or a single task line — is *moved* here, with a record of where it
//! came from, so the user can bring it back (Ctrl+Z, or the Trash screen) until
//! a retention window (default 30 days) elapses and the reaper clears it.
//!
//! This replaces the OS trash the app used before, which (a) does not exist on
//! Android and (b) does not travel with a synced notebook. The trash living
//! inside `.jott/` is portable and syncs with everything else.
//!
//! Everything here is pure with respect to the clock: `today` is passed in, so
//! the deletion stamp and the reaper are testable. [`crate::notebook`] supplies
//! it via [`crate::clock::civil_today`].

use std::path::{Path, PathBuf};

use chrono::NaiveDate;
use serde_json::{Map, Value};

use crate::error::{IoContext, Result};

/// What a trashed item is, so restore knows how to bring it back.
#[derive(Debug, Clone, PartialEq)]
pub enum TrashKind {
    /// A moved file or folder: `stored` names it inside `items/`, `origin` is
    /// its root-relative home.
    File,
    /// A removed task: its rendered lines go back into the list at `origin`
    /// (a root-relative list address) at `index`.
    Task,
}

/// One record in the trash index.
#[derive(Debug, Clone)]
pub struct TrashEntry {
    pub id: String,
    pub kind: TrashKind,
    /// Root-relative home: the folder/file path for a File, the list path for a Task.
    pub origin: String,
    /// What the user reads in the Trash screen.
    pub label: String,
    /// Deletion date (ISO), the start of the retention countdown.
    pub deleted: String,
    /// File only: the item's name inside `items/`.
    pub stored: Option<String>,
    /// Task only: the rendered lines removed.
    pub content: Option<Vec<String>>,
    /// Task only: the line index the task sat at.
    pub index: Option<usize>,
}

/// The trash directory and its index, in memory.
pub struct Trash {
    dir: PathBuf,
    entries: Vec<TrashEntry>,
}

impl Trash {
    /// Opens (or prepares) the trash rooted at `dir` (`.jott/trash`).
    pub fn open(dir: impl Into<PathBuf>) -> Self {
        let dir = dir.into();
        let entries = read_index(&dir.join("trash.json"));
        Self { dir, entries }
    }

    fn items_dir(&self) -> PathBuf {
        self.dir.join("items")
    }

    fn index_path(&self) -> PathBuf {
        self.dir.join("trash.json")
    }

    pub fn entries(&self) -> &[TrashEntry] {
        &self.entries
    }

    /// An id no entry in the index is using yet.
    fn next_id(&self) -> String {
        let taken: std::collections::HashSet<String> =
            self.entries.iter().map(|e| e.id.clone()).collect();
        crate::id::generate_unique(&taken)
    }

    /// Moves a file or folder into the trash, recording where it came from.
    /// `origin` is the item's root-relative home (for restore).
    pub fn trash_file(&mut self, abs: &Path, origin: &str, today: NaiveDate) -> Result<String> {
        let items = self.items_dir();
        std::fs::create_dir_all(&items).ctx(&items)?;
        let name = abs
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "deleted".to_string());
        let target = crate::fsio::free_name(&items, &name);
        std::fs::rename(abs, &target).ctx(&target)?;
        let stored = target
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let id = self.next_id();
        self.entries.push(TrashEntry {
            id: id.clone(),
            kind: TrashKind::File,
            origin: origin.to_string(),
            label: name,
            deleted: today.to_string(),
            stored: Some(stored),
            content: None,
            index: None,
        });
        self.save()?;
        Ok(id)
    }

    /// Records a removed task (its rendered lines) so it can go back to its
    /// list at the position it held.
    pub fn trash_task(
        &mut self,
        list: &str,
        index: usize,
        content: Vec<String>,
        label: &str,
        today: NaiveDate,
    ) -> Result<String> {
        std::fs::create_dir_all(&self.dir).ctx(&self.dir)?;
        let id = self.next_id();
        self.entries.push(TrashEntry {
            id: id.clone(),
            kind: TrashKind::Task,
            origin: list.to_string(),
            label: label.to_string(),
            deleted: today.to_string(),
            stored: None,
            content: Some(content),
            index: Some(index),
        });
        self.save()?;
        Ok(id)
    }

    /// Takes an entry out of the index and returns it, so the caller can put it
    /// back where it belongs. The stored file, if any, is left in `items/` for
    /// the caller to move.
    pub fn take(&mut self, id: &str) -> Option<TrashEntry> {
        let pos = self.entries.iter().position(|e| e.id == id)?;
        let entry = self.entries.remove(pos);
        let _ = self.save();
        Some(entry)
    }

    /// The absolute path of a stored file inside `items/`.
    pub fn stored_path(&self, stored: &str) -> PathBuf {
        self.items_dir().join(stored)
    }

    /// Permanently removes every entry whose retention window has elapsed.
    /// `retention_days` is the countdown length; `today` the current civil day.
    pub fn reap(&mut self, retention_days: i64, today: NaiveDate) -> Result<()> {
        let expired: Vec<TrashEntry> = self
            .entries
            .iter()
            .filter(|e| is_expired(e, retention_days, today))
            .cloned()
            .collect();
        if expired.is_empty() {
            return Ok(());
        }
        for entry in &expired {
            if let Some(stored) = &entry.stored {
                let path = self.stored_path(stored);
                if path.is_dir() {
                    let _ = std::fs::remove_dir_all(&path);
                } else {
                    let _ = std::fs::remove_file(&path);
                }
            }
        }
        self.entries
            .retain(|e| !is_expired(e, retention_days, today));
        self.save()
    }

    fn save(&self) -> Result<()> {
        std::fs::create_dir_all(&self.dir).ctx(&self.dir)?;
        crate::fsio::write_atomically(&self.index_path(), render_index(&self.entries).as_bytes())
    }
}

/// Whether an entry is past its retention window.
fn is_expired(entry: &TrashEntry, retention_days: i64, today: NaiveDate) -> bool {
    match entry.deleted.parse::<NaiveDate>() {
        Ok(deleted) => (today - deleted).num_days() >= retention_days,
        // An unparseable date is treated as not-yet-expired: never delete on a
        // guess.
        Err(_) => false,
    }
}

fn read_index(path: &Path) -> Vec<TrashEntry> {
    // Same tolerant read as every other file in `.jott/`: missing, unreadable
    // or malformed all mean "nothing in the trash", never a failure to open.
    crate::jsondoc::load(path)
        .get("items")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(parse_entry).collect())
        .unwrap_or_default()
}

fn parse_entry(value: &Value) -> Option<TrashEntry> {
    let obj = value.as_object()?;
    let id = obj.get("id")?.as_str()?.to_string();
    let kind = match obj.get("kind").and_then(Value::as_str)? {
        "task" => TrashKind::Task,
        _ => TrashKind::File,
    };
    Some(TrashEntry {
        id,
        kind,
        origin: obj.get("origin").and_then(Value::as_str).unwrap_or_default().to_string(),
        label: obj.get("label").and_then(Value::as_str).unwrap_or_default().to_string(),
        deleted: obj.get("deleted").and_then(Value::as_str).unwrap_or_default().to_string(),
        stored: obj.get("stored").and_then(Value::as_str).map(str::to_string),
        content: obj.get("content").and_then(Value::as_array).map(|lines| {
            lines
                .iter()
                .filter_map(|l| l.as_str().map(str::to_string))
                .collect()
        }),
        index: obj.get("index").and_then(Value::as_u64).map(|n| n as usize),
    })
}

fn render_index(entries: &[TrashEntry]) -> String {
    let items: Vec<Value> = entries
        .iter()
        .map(|e| {
            let mut obj = Map::new();
            obj.insert("id".into(), Value::from(e.id.clone()));
            obj.insert(
                "kind".into(),
                Value::from(match e.kind {
                    TrashKind::File => "file",
                    TrashKind::Task => "task",
                }),
            );
            obj.insert("origin".into(), Value::from(e.origin.clone()));
            obj.insert("label".into(), Value::from(e.label.clone()));
            obj.insert("deleted".into(), Value::from(e.deleted.clone()));
            if let Some(stored) = &e.stored {
                obj.insert("stored".into(), Value::from(stored.clone()));
            }
            if let Some(content) = &e.content {
                obj.insert("content".into(), Value::from(content.clone()));
            }
            if let Some(index) = e.index {
                obj.insert("index".into(), Value::from(index as u64));
            }
            Value::Object(obj)
        })
        .collect();
    crate::fsio::pretty_json(&serde_json::json!({ "schemaVersion": 1, "items": items }))
}
