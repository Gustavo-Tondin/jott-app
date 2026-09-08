//! The durable log of everything the notebook ever held —
//! `.jott/timeline/<year>.jsonl`. The Timeline reads THIS, not the files, so a
//! deleted thing still shows as a ghost. Append only; existence is derived
//! from the LAST line about a thing; every `*.jsonl` is unioned (conflict
//! copies too); what cannot be read is skipped. Task = `id:`, note = path.

use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};

use chrono::{Datelike, NaiveDate, NaiveDateTime};

use crate::error::{IoContext, Result};

/// The durable log's folder, inside `.jott/`.
pub const TIMELINE_DIR: &str = "timeline";

/// The line format this build writes and reads. A line carrying anything else
/// is a line from another version of the app, and is skipped rather than
/// guessed at.
pub const LINE_VERSION: u64 = 1;

/// What a line is about.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Note,
    Task,
}

impl Kind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Note => "note",
            Self::Task => "task",
        }
    }

    fn parse(text: &str) -> Option<Self> {
        match text {
            "note" => Some(Self::Note),
            "task" => Some(Self::Task),
            _ => None,
        }
    }
}

/// What happened to it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Event {
    /// It came into existence — the only event carrying `created` and `title`.
    Created,
    /// It changed address: a note renamed or moved, a task changing list, or
    /// anything under a space that was renamed.
    Moved,
    /// It went to the trash, or off the disk entirely.
    Deleted,
    /// It came back from the trash.
    Restored,
    /// A task was ticked — the only event carrying `on`, the civil day it was
    /// completed (the task's own `completed:` when the sweep adopts one
    /// finished before the log existed, so not just `at`).
    Completed,
    /// A completed task unticked. The Timeline counts the STATE, not the
    /// history: reopened, it leaves the month's "completed" count.
    Reopened,
}

impl Event {
    fn as_str(self) -> &'static str {
        match self {
            Self::Created => "created",
            Self::Moved => "moved",
            Self::Deleted => "deleted",
            Self::Restored => "restored",
            Self::Completed => "completed",
            Self::Reopened => "reopened",
        }
    }

    fn parse(text: &str) -> Option<Self> {
        match text {
            "created" => Some(Self::Created),
            "moved" => Some(Self::Moved),
            "deleted" => Some(Self::Deleted),
            "restored" => Some(Self::Restored),
            "completed" => Some(Self::Completed),
            "reopened" => Some(Self::Reopened),
            _ => None,
        }
    }
}

/// One line of the log.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Record {
    /// When the line was written — local wall clock, to the minute, in the
    /// app's one date-and-time format (`crate::task::render_datetime`).
    pub at: NaiveDateTime,
    pub event: Event,
    pub kind: Kind,
    /// Where the thing is as of this line. For a task, the list holding it.
    pub path: String,
    /// A task's `id:`. Absent for a note, whose identity is its path.
    pub id: Option<String>,
    /// Where it came from — `moved` only.
    pub from: Option<String>,
    /// The day it was born — `created` only. Not `at`: a first sweep stamps
    /// today's line with an older creation.
    pub created: Option<NaiveDate>,
    /// What it was called when born — `created` only; all a ghost has.
    pub title: Option<String>,
    /// The day a task was completed — `completed` only. Absent reads as the
    /// day of `at`.
    pub on: Option<NaiveDate>,
}

impl Record {
    /// A birth.
    pub fn created(
        at: NaiveDateTime,
        kind: Kind,
        path: impl Into<String>,
        created: NaiveDate,
        title: impl Into<String>,
    ) -> Self {
        Self {
            at,
            event: Event::Created,
            kind,
            path: path.into(),
            id: None,
            from: None,
            created: Some(created),
            title: Some(title.into()),
            on: None,
        }
    }

    /// A change of address.
    pub fn moved(
        at: NaiveDateTime,
        kind: Kind,
        from: impl Into<String>,
        to: impl Into<String>,
    ) -> Self {
        Self {
            at,
            event: Event::Moved,
            kind,
            path: to.into(),
            id: None,
            from: Some(from.into()),
            created: None,
            title: None,
            on: None,
        }
    }

    /// A departure (`Event::Deleted`) or a return (`Event::Restored`).
    pub fn gone(at: NaiveDateTime, kind: Kind, path: impl Into<String>, event: Event) -> Self {
        Self {
            at,
            event,
            kind,
            path: path.into(),
            id: None,
            from: None,
            created: None,
            title: None,
            on: None,
        }
    }

    /// A task ticked on `on`, now sitting in the Completed list at `path`.
    /// Always about a task — a note has no such state.
    pub fn completed(at: NaiveDateTime, path: impl Into<String>, on: NaiveDate) -> Self {
        Self {
            at,
            event: Event::Completed,
            kind: Kind::Task,
            path: path.into(),
            id: None,
            from: None,
            created: None,
            title: None,
            on: Some(on),
        }
    }

    /// A task unticked, back in the list at `path`.
    pub fn reopened(at: NaiveDateTime, path: impl Into<String>) -> Self {
        Self {
            at,
            event: Event::Reopened,
            kind: Kind::Task,
            path: path.into(),
            id: None,
            from: None,
            created: None,
            title: None,
            on: None,
        }
    }

    /// The same line, about the task with this id. Chained onto the three
    /// constructors above, since a task's identity is never its path.
    pub fn with_id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    /// The line as it goes on disk — one JSON object, no newline.
    pub fn render(&self) -> String {
        let mut doc = serde_json::Map::new();
        doc.insert("v".into(), LINE_VERSION.into());
        doc.insert("at".into(), crate::task::render_datetime(self.at).into());
        doc.insert("event".into(), self.event.as_str().into());
        doc.insert("kind".into(), self.kind.as_str().into());
        doc.insert("path".into(), self.path.clone().into());
        for (key, value) in [("id", &self.id), ("from", &self.from), ("title", &self.title)] {
            if let Some(value) = value {
                doc.insert(key.into(), value.clone().into());
            }
        }
        if let Some(created) = self.created {
            doc.insert("created".into(), created.to_string().into());
        }
        if let Some(on) = self.on {
            doc.insert("on".into(), on.to_string().into());
        }
        serde_json::Value::Object(doc).to_string()
    }

    /// Reads a line back, or `None` when it is not one this build understands.
    pub fn parse(line: &str) -> Option<Self> {
        let line = line.trim();
        if line.is_empty() {
            return None;
        }
        let doc: serde_json::Value = serde_json::from_str(line).ok()?;
        let doc = doc.as_object()?;
        if doc.get("v").and_then(serde_json::Value::as_u64) != Some(LINE_VERSION) {
            return None;
        }
        let text = |key: &str| doc.get(key).and_then(|v| v.as_str()).map(str::to_string);
        Some(Self {
            at: crate::task::parse_datetime(doc.get("at")?.as_str()?)?,
            event: Event::parse(doc.get("event")?.as_str()?)?,
            kind: Kind::parse(doc.get("kind")?.as_str()?)?,
            path: text("path")?,
            id: text("id"),
            from: text("from"),
            created: text("created").and_then(|d| d.parse().ok()),
            title: text("title"),
            on: text("on").and_then(|d| d.parse().ok()),
        })
    }

    /// The file a line belongs in: one per calendar year of `at`.
    fn file_name(&self) -> String {
        format!("{}.jsonl", self.at.year())
    }
}

/// A thing the notebook has held, as the log remembers it.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub kind: Kind,
    /// A task's id; absent for a note.
    pub id: Option<String>,
    /// Where it is now — or where it was when it went.
    pub path: String,
    /// The day it was born. The Timeline's one axis.
    pub created: NaiveDate,
    /// The title at birth. The caller replaces it with the current one for
    /// something still on disk; for a ghost it is all there is.
    pub title: String,
    /// The day it went, when it is gone. `None` means it is still there.
    pub deleted: Option<NaiveDate>,
    /// The day a task was ticked, while it stays ticked. Cleared by
    /// `reopened`, untouched by `deleted`: a finished task thrown away
    /// still counts as finished in the month it was.
    pub completed: Option<NaiveDate>,
    /// The space it belongs to (root-relative). `resolve` leaves it empty and
    /// `Notebook::timeline` fills it: the screen never derives it from a path.
    pub space: Option<String>,
}

impl Item {
    /// Whether it still exists.
    pub fn alive(&self) -> bool {
        self.deleted.is_none()
    }

    /// Whether the Timeline shows it at all: created and deleted on the SAME
    /// day never happened; deleted any later, it stays as a ghost.
    pub fn visible(&self) -> bool {
        match self.deleted {
            None => true,
            Some(day) => day != self.created,
        }
    }
}

/// Where the log lives for a notebook's `.jott/`.
pub fn dir_of(config_dir: impl AsRef<Path>) -> PathBuf {
    config_dir.as_ref().join(TIMELINE_DIR)
}

/// Adds lines to the log, each into its year's file. The one append in the
/// app: the file IS the history, and rewriting it to add a line would be a
/// chance to lose every line before it.
pub fn append(config_dir: impl AsRef<Path>, records: &[Record]) -> Result<()> {
    if records.is_empty() {
        return Ok(());
    }
    use std::io::Write;

    let dir = dir_of(config_dir);
    std::fs::create_dir_all(&dir).ctx(&dir)?;

    // Grouped per file so a big sweep opens each year once.
    let mut by_file: HashMap<String, String> = HashMap::new();
    for record in records {
        let text = by_file.entry(record.file_name()).or_default();
        text.push_str(&record.render());
        text.push('\n');
    }
    for (name, text) in by_file {
        let path = dir.join(name);
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .ctx(&path)?;
        file.write_all(text.as_bytes()).ctx(&path)?;
    }
    Ok(())
}

/// Every line the folder holds, in the order things happened: the union of
/// all `*.jsonl`, sync conflict copies included. Identical lines from
/// different files count once; the SAME file repeating a line is two events
/// (ticked, unticked, ticked again within a minute must not collapse).
pub fn read(config_dir: impl AsRef<Path>) -> Vec<Record> {
    let dir = dir_of(config_dir);
    let Ok(paths) = crate::fsio::dir_paths(&dir) else {
        return Vec::new();
    };
    let mut seen_elsewhere: BTreeSet<Record> = BTreeSet::new();
    let mut records = Vec::new();
    for path in paths {
        if path.extension().is_none_or(|ext| ext != "jsonl") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let mut in_this_file = Vec::new();
        for line in text.lines() {
            let Some(record) = Record::parse(line) else {
                continue;
            };
            if !seen_elsewhere.contains(&record) {
                in_this_file.push(record);
            }
        }
        seen_elsewhere.extend(in_this_file.iter().cloned());
        records.extend(in_this_file);
    }
    // Stable: lines from the same minute keep their written order.
    records.sort_by_key(|record| record.at);
    records
}

/// What the log adds up to: one entry per thing, with where it ended up. A
/// line about something never born is skipped: no creation date, no place
/// on the axis.
pub fn resolve(records: &[Record]) -> Vec<Item> {
    resolve_indexed(records).0
}

/// The calendar years the log has a file for, newest first — the Timeline's
/// year pills. A sync conflict copy (`2026 (conflicted copy).jsonl`) counts
/// for its year, like `read` counts its lines.
pub fn years(config_dir: impl AsRef<Path>) -> Vec<i32> {
    let dir = dir_of(config_dir);
    let Ok(paths) = crate::fsio::dir_paths(&dir) else {
        return Vec::new();
    };
    let mut years: Vec<i32> = paths
        .iter()
        .filter(|path| path.extension().is_some_and(|ext| ext == "jsonl"))
        .filter_map(|path| path.file_stem()?.to_str().map(str::to_string))
        .filter_map(|stem| {
            let digits: String = stem.chars().take_while(char::is_ascii_digit).collect();
            digits.parse::<i32>().ok()
        })
        .collect();
    years.sort_unstable_by(|a, b| b.cmp(a));
    years.dedup();
    years
}

/// Which thing a "remove from the Timeline" is about: a task by its id, a
/// note by the address it holds NOW (the chain of `moved` is followed back).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Key {
    Task(String),
    Note(String),
}

/// Forgets one thing: every line about it leaves every file of the log. The
/// one rewrite of the log, and only the user's "Remove from timeline" calls
/// it. Each touched file is rewritten atomically with a `.bak` beside it;
/// lines this build cannot read are kept. Returns how many lines went.
pub fn remove(config_dir: impl AsRef<Path>, key: &Key) -> Result<usize> {
    let dir = dir_of(&config_dir);
    let records = read(&config_dir);
    let (items, owner) = resolve_indexed(&records);
    let Some(target) = items.iter().position(|item| match key {
        Key::Task(id) => item.kind == Kind::Task && item.id.as_deref() == Some(id),
        Key::Note(path) => item.kind == Kind::Note && &item.path == path,
    }) else {
        return Ok(0);
    };
    let doomed: BTreeSet<&Record> = records
        .iter()
        .zip(owner.iter())
        .filter(|(_, owner)| **owner == Some(target))
        .map(|(record, _)| record)
        .collect();
    if doomed.is_empty() {
        return Ok(0);
    }

    let Ok(paths) = crate::fsio::dir_paths(&dir) else {
        return Ok(0);
    };
    let mut removed = 0;
    for path in paths {
        if path.extension().is_none_or(|ext| ext != "jsonl") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let mut kept = String::with_capacity(text.len());
        let mut dropped = 0;
        for line in text.lines() {
            let goes = Record::parse(line).is_some_and(|record| doomed.contains(&record));
            if goes {
                dropped += 1;
            } else {
                kept.push_str(line);
                kept.push('\n');
            }
        }
        if dropped == 0 {
            continue;
        }
        let backup = path.with_extension("jsonl.bak");
        let _ = std::fs::copy(&path, &backup);
        crate::fsio::write_atomically(&path, kept.as_bytes())?;
        removed += dropped;
    }
    Ok(removed)
}

/// `resolve`, also saying which item each line ended up belonging to
/// (`None` for a line about nothing — never born, or born twice).
fn resolve_indexed(records: &[Record]) -> (Vec<Item>, Vec<Option<usize>>) {
    let mut items: Vec<Item> = Vec::new();
    let mut owner: Vec<Option<usize>> = Vec::with_capacity(records.len());
    let mut by_id: HashMap<String, usize> = HashMap::new();
    let mut by_path: HashMap<String, usize> = HashMap::new();

    for record in records {
        let at_path = record.from.clone().unwrap_or_else(|| record.path.clone());
        let found = match (record.kind, &record.id) {
            (Kind::Task, Some(id)) => by_id.get(id).copied(),
            (Kind::Task, None) => None,
            (Kind::Note, _) => by_path.get(&at_path).copied(),
        };
        let mut about: Option<usize> = None;

        match record.event {
            Event::Created => {
                if let Some(created) = record.created {
                    if let Some(index) = found.filter(|index| items[*index].alive()) {
                        // The duplicate birth is still the same thing's line.
                        about = Some(index);
                    } else {
                        items.push(Item {
                            kind: record.kind,
                            id: record.id.clone(),
                            path: record.path.clone(),
                            created,
                            title: record.title.clone().unwrap_or_default(),
                            deleted: None,
                            completed: None,
                            space: None,
                        });
                        let index = items.len() - 1;
                        match &record.id {
                            Some(id) => {
                                by_id.insert(id.clone(), index);
                            }
                            None => {
                                by_path.insert(record.path.clone(), index);
                            }
                        }
                        about = Some(index);
                    }
                }
            }
            Event::Moved => {
                if let Some(index) = found {
                    if record.kind == Kind::Note {
                        by_path.remove(&at_path);
                        by_path.insert(record.path.clone(), index);
                    }
                    items[index].path = record.path.clone();
                    about = Some(index);
                }
            }
            Event::Deleted => {
                if let Some(index) = found {
                    items[index].deleted = Some(record.at.date());
                    about = Some(index);
                }
            }
            Event::Restored => {
                if let Some(index) = found {
                    items[index].deleted = None;
                    items[index].path = record.path.clone();
                    if record.kind == Kind::Note {
                        by_path.insert(record.path.clone(), index);
                    }
                    about = Some(index);
                }
            }
            Event::Completed => {
                if let Some(index) = found {
                    items[index].completed =
                        Some(record.on.unwrap_or_else(|| record.at.date()));
                    items[index].path = record.path.clone();
                    about = Some(index);
                }
            }
            Event::Reopened => {
                if let Some(index) = found {
                    items[index].completed = None;
                    items[index].path = record.path.clone();
                    about = Some(index);
                }
            }
        }
        owner.push(about);
    }
    (items, owner)
}
