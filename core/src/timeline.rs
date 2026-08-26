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
}

impl Event {
    fn as_str(self) -> &'static str {
        match self {
            Self::Created => "created",
            Self::Moved => "moved",
            Self::Deleted => "deleted",
            Self::Restored => "restored",
        }
    }

    fn parse(text: &str) -> Option<Self> {
        match text {
            "created" => Some(Self::Created),
            "moved" => Some(Self::Moved),
            "deleted" => Some(Self::Deleted),
            "restored" => Some(Self::Restored),
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
/// Identical lines from different files count once.
pub fn read(config_dir: impl AsRef<Path>) -> Vec<Record> {
    let dir = dir_of(config_dir);
    let Ok(paths) = crate::fsio::dir_paths(&dir) else {
        return Vec::new();
    };
    let mut seen = BTreeSet::new();
    let mut records = Vec::new();
    for path in paths {
        if path.extension().is_none_or(|ext| ext != "jsonl") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        for line in text.lines() {
            let Some(record) = Record::parse(line) else {
                continue;
            };
            if seen.insert(record.clone()) {
                records.push(record);
            }
        }
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
    let mut items: Vec<Item> = Vec::new();
    // A task is found by id; a note by where it is right now, which is what
    // each `moved` updates. Both maps point into `items`.
    let mut by_id: HashMap<String, usize> = HashMap::new();
    let mut by_path: HashMap<String, usize> = HashMap::new();

    for record in records {
        // Which entry this line is about. A task's id is the whole answer; a
        // note's is the address the line names — `from` when it is moving.
        let at_path = record.from.clone().unwrap_or_else(|| record.path.clone());
        let found = match (record.kind, &record.id) {
            (Kind::Task, Some(id)) => by_id.get(id).copied(),
            (Kind::Task, None) => None,
            (Kind::Note, _) => by_path.get(&at_path).copied(),
        };

        match record.event {
            Event::Created => {
                let Some(created) = record.created else {
                    continue;
                };
                // A second birth for a live thing is a duplicate line, not a
                // second thing — but a birth at an address whose last
                // occupant is gone IS a new note in an old place.
                if found.is_some_and(|index| items[index].alive()) {
                    continue;
                }
                items.push(Item {
                    kind: record.kind,
                    id: record.id.clone(),
                    path: record.path.clone(),
                    created,
                    title: record.title.clone().unwrap_or_default(),
                    deleted: None,
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
            }
            Event::Moved => {
                let Some(index) = found else { continue };
                if record.kind == Kind::Note {
                    by_path.remove(&at_path);
                    by_path.insert(record.path.clone(), index);
                }
                items[index].path = record.path.clone();
            }
            Event::Deleted => {
                let Some(index) = found else { continue };
                items[index].deleted = Some(record.at.date());
            }
            Event::Restored => {
                let Some(index) = found else { continue };
                items[index].deleted = None;
                items[index].path = record.path.clone();
                if record.kind == Kind::Note {
                    by_path.insert(record.path.clone(), index);
                }
            }
        }
    }
    items
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(day: u32, hour: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 8, day)
            .unwrap()
            .and_hms_opt(hour, 0, 0)
            .unwrap()
    }

    fn day(d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 8, d).unwrap()
    }

    fn note_born(d: u32, path: &str) -> Record {
        Record::created(at(d, 9), Kind::Note, path, day(d), "Ideia")
    }

    #[test]
    fn a_line_survives_the_round_trip() {
        for record in [
            note_born(20, "jott.notes/a.md"),
            Record::moved(at(21, 9), Kind::Note, "jott.notes/a.md", "Pessoal/a.md"),
            Record::gone(at(22, 9), Kind::Note, "Pessoal/a.md", Event::Deleted),
            Record::created(at(20, 9), Kind::Task, "jott.tasks/task-list.md", day(1), "pão")
                .with_id("abc123"),
        ] {
            let text = record.render();
            assert!(!text.contains('\n'), "{text}");
            assert_eq!(Record::parse(&text), Some(record));
        }
    }

    #[test]
    fn a_line_this_build_cannot_read_is_skipped_and_not_guessed_at() {
        for line in [
            "",
            "   ",
            "{ half a li",
            r#"{"v":2,"at":"2026-08-20T09:00","event":"created","kind":"note","path":"a.md"}"#,
            r#"{"v":1,"at":"2026-08-20T09:00","event":"exploded","kind":"note","path":"a.md"}"#,
            r#"{"v":1,"at":"2026-08-20T09:00","event":"created","kind":"whiteboard","path":"a.md"}"#,
            r#"{"v":1,"at":"whenever","event":"created","kind":"note","path":"a.md"}"#,
        ] {
            assert_eq!(Record::parse(line), None, "{line}");
        }
    }

    #[test]
    fn a_newer_builds_extra_keys_ride_along_untouched() {
        // Nothing is ever rewritten, so an unknown key survives by simply
        // being left where it is. What matters is that it does not stop the
        // line being read.
        let line = r#"{"v":1,"at":"2026-08-20T09:00","event":"created","kind":"note",
            "path":"a.md","created":"2026-08-20","title":"Ideia","mood":"blue"}"#
            .replace('\n', "");
        let record = Record::parse(&line).unwrap();
        assert_eq!(record.title.as_deref(), Some("Ideia"));
    }

    #[test]
    fn lines_land_in_the_file_for_their_year() {
        let dir = tempfile::tempdir().unwrap();
        let last_year = NaiveDate::from_ymd_opt(2025, 12, 31)
            .unwrap()
            .and_hms_opt(23, 59, 0)
            .unwrap();
        append(
            dir.path(),
            &[
                note_born(20, "jott.notes/a.md"),
                Record::created(last_year, Kind::Note, "jott.notes/b.md", day(20), "Velha"),
            ],
        )
        .unwrap();
        assert!(dir_of(dir.path()).join("2026.jsonl").is_file());
        assert!(dir_of(dir.path()).join("2025.jsonl").is_file());
    }

    #[test]
    fn appending_never_touches_the_lines_already_there() {
        let dir = tempfile::tempdir().unwrap();
        append(dir.path(), &[note_born(20, "jott.notes/a.md")]).unwrap();
        let first = std::fs::read_to_string(dir_of(dir.path()).join("2026.jsonl")).unwrap();
        append(dir.path(), &[note_born(21, "jott.notes/b.md")]).unwrap();
        let both = std::fs::read_to_string(dir_of(dir.path()).join("2026.jsonl")).unwrap();
        assert!(both.starts_with(&first), "{both}");
        assert_eq!(both.lines().count(), 2);
    }

    #[test]
    fn a_torn_last_line_costs_only_that_line() {
        let dir = tempfile::tempdir().unwrap();
        append(
            dir.path(),
            &[note_born(20, "jott.notes/a.md"), note_born(21, "jott.notes/b.md")],
        )
        .unwrap();
        let path = dir_of(dir.path()).join("2026.jsonl");
        let text = std::fs::read_to_string(&path).unwrap();
        std::fs::write(&path, format!("{text}{{\"v\":1,\"at\":\"2026-08-2")).unwrap();

        assert_eq!(read(dir.path()).len(), 2);
    }

    #[test]
    fn a_sync_conflict_copy_is_read_too_and_identical_lines_count_once() {
        let dir = tempfile::tempdir().unwrap();
        append(dir.path(), &[note_born(20, "jott.notes/a.md")]).unwrap();
        let path = dir_of(dir.path()).join("2026.jsonl");
        let mine = std::fs::read_to_string(&path).unwrap();
        // What a sync tool leaves behind: the same file, plus the other
        // machine's line.
        std::fs::write(
            dir_of(dir.path()).join("2026 (conflicted copy 2026-08-21).jsonl"),
            format!("{mine}{}\n", note_born(21, "jott.notes/b.md").render()),
        )
        .unwrap();

        let records = read(dir.path());
        assert_eq!(records.len(), 2, "{records:?}");
        assert_eq!(records[0].path, "jott.notes/a.md");
        assert_eq!(records[1].path, "jott.notes/b.md");
    }

    #[test]
    fn an_empty_folder_reads_as_an_empty_log() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read(dir.path()).is_empty());
        assert!(resolve(&[]).is_empty());
    }

    #[test]
    fn a_note_that_moved_twice_is_still_one_thing() {
        let items = resolve(&[
            note_born(20, "jott.notes/a.md"),
            Record::moved(at(21, 9), Kind::Note, "jott.notes/a.md", "jott.notes/2026/a.md"),
            Record::moved(at(22, 9), Kind::Note, "jott.notes/2026/a.md", "Pessoal/a.md"),
        ]);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].path, "Pessoal/a.md");
        assert_eq!(items[0].created, day(20));
        assert!(items[0].alive());
    }

    #[test]
    fn a_task_is_followed_by_its_id_and_not_by_its_list() {
        let items = resolve(&[
            Record::created(at(20, 9), Kind::Task, "jott.tasks/task-list.md", day(20), "pão")
                .with_id("abc"),
            Record::moved(at(21, 9), Kind::Task, "jott.tasks/task-list.md", "Mercado/task-list.md")
                .with_id("abc"),
        ]);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].path, "Mercado/task-list.md");
        assert_eq!(items[0].id.as_deref(), Some("abc"));
    }

    #[test]
    fn what_was_deleted_stays_as_a_ghost_with_the_day_it_went() {
        let items = resolve(&[
            note_born(20, "jott.notes/a.md"),
            Record::gone(at(25, 9), Kind::Note, "jott.notes/a.md", Event::Deleted),
        ]);
        assert_eq!(items[0].deleted, Some(day(25)));
        assert!(!items[0].alive());
        assert!(items[0].visible(), "a ghost from another day is shown");
        // The ghost still hangs on the day it was BORN, not the day it went.
        assert_eq!(items[0].created, day(20));
    }

    #[test]
    fn created_and_deleted_on_the_same_day_never_happened() {
        let items = resolve(&[
            note_born(20, "jott.notes/a.md"),
            Record::gone(at(20, 18), Kind::Note, "jott.notes/a.md", Event::Deleted),
        ]);
        assert!(!items[0].visible());
    }

    #[test]
    fn restoring_from_the_trash_puts_the_ghost_away() {
        let items = resolve(&[
            note_born(20, "jott.notes/a.md"),
            Record::gone(at(25, 9), Kind::Note, "jott.notes/a.md", Event::Deleted),
            Record::gone(at(26, 9), Kind::Note, "jott.notes/a.md", Event::Restored),
        ]);
        assert!(items[0].alive());
        assert!(items[0].visible());
    }

    #[test]
    fn a_new_note_at_a_dead_notes_address_is_a_new_note() {
        let items = resolve(&[
            note_born(20, "jott.notes/a.md"),
            Record::gone(at(21, 9), Kind::Note, "jott.notes/a.md", Event::Deleted),
            Record::created(at(25, 9), Kind::Note, "jott.notes/a.md", day(25), "Outra"),
        ]);
        assert_eq!(items.len(), 2);
        assert_eq!(items[1].title, "Outra");
        assert!(items[1].alive());
        assert!(!items[0].alive());
    }

    #[test]
    fn a_duplicate_birth_of_a_live_thing_is_one_thing() {
        let items = resolve(&[note_born(20, "jott.notes/a.md"), note_born(20, "jott.notes/a.md")]);
        assert_eq!(items.len(), 1);
    }

    #[test]
    fn a_line_about_something_that_was_never_born_is_ignored() {
        // The axis is the creation date; an entry with none has nowhere to
        // be drawn, and inventing one would put it on the wrong day forever.
        let items = resolve(&[
            Record::gone(at(20, 9), Kind::Note, "jott.notes/ghost.md", Event::Deleted),
            Record::moved(at(21, 9), Kind::Note, "a.md", "b.md"),
        ]);
        assert!(items.is_empty());
    }
}
