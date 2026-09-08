//! The log of everything the notebook ever held — `.jott/timeline/<year>.jsonl`.
//!
//! The Timeline screen reads THIS, not the files (architecture agreed with
//! the user on 2026-08-26, spec 3.6). The reason is the ghost: a note deleted
//! last month should still show up on the day it was born, as a mention with
//! no content — and no walk over the files can tell you about a file that is
//! not there. So every thing that is born gets a line, and every thing that
//! moves, goes or comes back gets another.
//!
//! Four properties hold this together, and each one is load-bearing:
//!
//! - **Append only.** The app never rewrites, compacts or removes a line.
//!   That is what makes the log safe without a backup: the worst a crash can
//!   do is leave a torn line at the end, which the reader skips. It is also
//!   why this folder is DURABLE — `.jott/index/` is the rebuildable one, and
//!   a ghost rebuilds from nothing.
//! - **Existence is derived.** No line says "this note exists"; the LAST
//!   event about a thing says where it is and whether it is still there.
//! - **The reader unions every `*.jsonl` in the folder**, sync conflict
//!   copies included, and dedupes. Two devices appending to the same year is
//!   then extra data rather than lost data — the notebook is its own backup
//!   (principle 4).
//! - **What it cannot read, it ignores.** An unknown event, an unknown kind,
//!   a line from a `v: 2` writer, a half-written line: skipped, never fatal.
//!   A newer build's extra keys survive for free, because nothing here ever
//!   writes a line back.
//!
//! Identity is not the same on both sides, and cannot be: a task is its `id:`
//! (which is why every task gets one when the notebook opens), and a note is
//! its file — the root-relative path, chained forward by each `moved`.

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
    /// A task was ticked — the only event carrying `on`, the civil day it
    /// was completed (the task's own `completed:` when the sweep adopts one
    /// finished before the log existed, which is why it is not just `at`).
    Completed,
    /// A completed task was unticked and went back to its list. The
    /// Timeline counts the STATE, not the history: reopened, it leaves the
    /// month's "completed" line, and ticking it again puts it back.
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
    /// The day it was born — `created` only. Not the same as `at`: a notebook
    /// swept for the first time stamps today's line with yesterday's
    /// creation.
    pub created: Option<NaiveDate>,
    /// What it was called when it was born — `created` only. This is what a
    /// ghost has instead of content.
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
    /// What it was called when it was born. For something still on disk the
    /// caller replaces this with the current title; for a ghost it is all
    /// there is.
    pub title: String,
    /// The day it went, when it is gone. `None` means it is still there.
    pub deleted: Option<NaiveDate>,
    /// The day a task was ticked, while it stays ticked. Cleared by
    /// `reopened`, untouched by `deleted`: a finished task thrown away
    /// still counts as finished in the month it was.
    pub completed: Option<NaiveDate>,
    /// The space it belongs to (root-relative path), when the notebook could
    /// tell. `resolve` leaves it empty — the log knows addresses, not
    /// spaces — and `Notebook::timeline` fills it, so the screen never
    /// derives a space from a path.
    pub space: Option<String>,
}

impl Item {
    /// Whether it still exists.
    pub fn alive(&self) -> bool {
        self.deleted.is_none()
    }

    /// Whether the Timeline shows it at all.
    ///
    /// Something created and deleted on the SAME day never happened, as far
    /// as the screen is concerned (user call, 2026-08-26): a note opened by
    /// mistake and thrown away an hour later is not a memory, it is noise on
    /// the day you were working. Deleted any later, it stays as a ghost.
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

/// Adds lines to the log, each into its year's file.
///
/// **The one append in the app.** Everywhere else writes whole files through
/// `fsio::write_atomically`, because everywhere else the file has a current
/// value; here the file IS the history, and rewriting it to add a line would
/// be a chance to lose every line before it.
pub fn append(config_dir: impl AsRef<Path>, records: &[Record]) -> Result<()> {
    if records.is_empty() {
        return Ok(());
    }
    use std::io::Write;

    let dir = dir_of(config_dir);
    std::fs::create_dir_all(&dir).ctx(&dir)?;

    // Grouped so a sweep writing four hundred lines opens one file, not four
    // hundred.
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

/// Every line the folder holds, in the order things happened.
///
/// The union of all `*.jsonl` in there — **sync conflict copies included**,
/// which is the point: two machines appending to `2026.jsonl` produce
/// `2026.jsonl` and `2026 (conflicted copy).jsonl`, and both are the truth.
/// Identical lines from different files count once — but the SAME file
/// saying the same thing twice is two things that happened (a task ticked,
/// unticked and ticked again inside one minute writes two identical
/// `completed` lines, and dropping the second would leave it open).
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
    // Stable, so lines written in the same minute keep the order they were
    // written in — `created` before the `moved` that follows it.
    records.sort_by_key(|record| record.at);
    records
}

/// What the log adds up to: one entry per thing, with where it ended up.
///
/// A line about something with no birth is skipped rather than invented: the
/// Timeline's axis is the creation date, and an entry without one has nowhere
/// to be drawn.
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

/// Forgets one thing: every line about it leaves every file of the log.
///
/// **The one rewrite of the log, and it is the user's** (2026-08-27) — the
/// Timeline's "Remove from timeline", always behind a confirmation, the way
/// purging the trash is. Nothing else in the app rewrites these files. Each
/// touched file goes through `write_atomically` with a `.bak` beside it;
/// lines this build cannot read are kept as they are, since they are not
/// ours to judge. Returns how many lines went.
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
