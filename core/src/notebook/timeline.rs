//! The notebook's side of the durable log (`crate::timeline`): writing what
//! the app did (accurate), sweeping on open for what it did not see (late:
//! logged as gone today), and reading it back with live titles. Every write
//! is best effort and silent — failing to append must never fail the
//! operation; the sweep corrects a line the disk disagrees with.

use super::*;

use chrono::NaiveDate;

use crate::timeline::{self, Event, Item, Kind, Record};

impl Notebook {
    // ------------------------------------------------------------- writing

    /// Appends lines, swallowing any failure (see the module doc).
    pub(super) fn log_timeline(&self, records: Vec<Record>) {
        if records.is_empty() || self.is_read_only() {
            return;
        }
        let _ = timeline::append(self.config_dir(), &records);
    }

    /// Now, as the log stamps a line.
    fn logged_at() -> chrono::NaiveDateTime {
        crate::clock::civil_now()
    }

    /// A note was born.
    pub(super) fn logged_note_born(&self, space: &str, relative: &str, created: NaiveDate) {
        let path = super::seen::address_of(space, relative);
        let title = crate::notefolder::title_of(relative);
        self.log_timeline(vec![Record::created(
            Self::logged_at(),
            Kind::Note,
            path,
            created,
            title,
        )]);
    }

    /// A note changed address.
    pub(super) fn logged_note_moved(&self, from: &str, to: &str) {
        if from == to {
            return;
        }
        self.log_timeline(vec![Record::moved(Self::logged_at(), Kind::Note, from, to)]);
    }

    /// A note went, or came back.
    pub(super) fn logged_note_gone(&self, address: &str, event: Event) {
        self.log_timeline(vec![Record::gone(Self::logged_at(), Kind::Note, address, event)]);
    }

    /// A task changed list. Silent when the task has no id — it cannot be
    /// followed without one, and the sweep will pick it up.
    pub(super) fn logged_task_moved(&self, id: Option<&str>, from: &str, to: &str) {
        let (Some(id), true) = (id, from != to) else {
            return;
        };
        self.log_timeline(vec![
            Record::moved(Self::logged_at(), Kind::Task, from, to).with_id(id)
        ]);
    }

    /// A task went, or came back.
    pub(super) fn logged_task_gone(&self, id: &str, list: &str, event: Event) {
        self.log_timeline(vec![
            Record::gone(Self::logged_at(), Kind::Task, list, event).with_id(id)
        ]);
    }

    /// A task was ticked: it now sits in `list` (the space's Completed), and
    /// `on` is the civil day stamped in its `completed:`.
    pub(super) fn logged_task_completed(&self, id: &str, list: &str, on: NaiveDate) {
        self.log_timeline(vec![Record::completed(Self::logged_at(), list, on).with_id(id)]);
    }

    /// A task was unticked and is back in `list`.
    pub(super) fn logged_task_reopened(&self, id: &str, list: &str) {
        self.log_timeline(vec![Record::reopened(Self::logged_at(), list).with_id(id)]);
    }

    /// Everything the log has under `from` follows the folder to `to`. The
    /// lines come from the LOG, not the disk: what must be repointed is what
    /// the log believes is there, and the disk has already moved.
    pub(super) fn logged_moved_under(&self, from: &str, to: &str) {
        if from == to {
            return;
        }
        let under = format!("{from}/");
        let at = Self::logged_at();
        let records: Vec<Record> = self
            .timeline_items()
            .into_iter()
            .filter(|item| item.alive() && item.path.starts_with(&under))
            .map(|item| {
                let landed = format!("{to}/{}", &item.path[under.len()..]);
                let record = Record::moved(at, item.kind, &item.path, landed);
                match &item.id {
                    Some(id) => record.with_id(id),
                    None => record,
                }
            })
            .collect();
        self.log_timeline(records);
    }

    /// Everything the log has under `prefix` is gone — a deleted space.
    pub(super) fn logged_gone_under(&self, prefix: &str) {
        let under = format!("{prefix}/");
        let at = Self::logged_at();
        let records: Vec<Record> = self
            .timeline_items()
            .into_iter()
            .filter(|item| item.alive() && (item.path == prefix || item.path.starts_with(&under)))
            .map(|item| {
                let record = Record::gone(at, item.kind, &item.path, Event::Deleted);
                match &item.id {
                    Some(id) => record.with_id(id),
                    None => record,
                }
            })
            .collect();
        self.log_timeline(records);
    }

    // ------------------------------------------------------------- reading

    /// Everything the log adds up to, ghosts included.
    fn timeline_items(&self) -> Vec<Item> {
        timeline::resolve(&timeline::read(self.config_dir()))
    }

    /// What the notebook has held between two days, newest first. A thing is
    /// IN the window when born in it OR ticked in it (a task finished in the
    /// next year belongs to that year's "completed"). Live items get their
    /// current title and their space (`Item::space`); ghosts keep the birth
    /// title. Ask on screen open, never per render: reads the whole log.
    pub fn timeline(&self, from: Option<NaiveDate>, to: Option<NaiveDate>) -> Result<Vec<Item>> {
        let within = |day: NaiveDate| {
            from.is_none_or(|first| day >= first) && to.is_none_or(|last| day <= last)
        };
        let mut items: Vec<Item> = self
            .timeline_items()
            .into_iter()
            .filter(Item::visible)
            .filter(|item| within(item.created) || item.completed.is_some_and(within))
            .collect();

        // The longest space path that prefixes the address. A ghost whose
        // whole space is gone gets none, and the screen shows it plain.
        let mut spaces: Vec<String> = self
            .spaces()?
            .iter()
            .map(|space| crate::relpath::relative_slash(&self.root, space.root()))
            .collect();
        spaces.sort_by_key(|path| std::cmp::Reverse(path.len()));
        for item in items.iter_mut() {
            item.space = spaces
                .iter()
                .find(|space| {
                    item.path.as_str() == space.as_str()
                        || item
                            .path
                            .strip_prefix(space.as_str())
                            .is_some_and(|rest| rest.starts_with('/'))
                })
                .cloned();
        }

        // The live titles, one pass per list rather than one per task.
        let mut lists: std::collections::HashMap<String, Vec<(usize, String)>> =
            std::collections::HashMap::new();
        for (index, item) in items.iter_mut().enumerate() {
            if !item.alive() {
                continue;
            }
            match (item.kind, item.id.clone()) {
                // A note is titled by its file; the log's copy is the birth one.
                (Kind::Note, _) => item.title = crate::notefolder::title_of(&item.path),
                (Kind::Task, Some(id)) => {
                    lists.entry(item.path.clone()).or_default().push((index, id))
                }
                (Kind::Task, None) => {}
            }
        }
        for (path, wanted) in lists {
            let Ok(list) = self.open_list(&path) else {
                continue;
            };
            for (index, id) in wanted {
                if let Some(task) = list.find(&id) {
                    items[index].title = task.text.clone();
                }
            }
        }

        items.sort_by(|a, b| b.created.cmp(&a.created).then_with(|| a.title.cmp(&b.title)));
        Ok(items)
    }

    /// The years the log has a file for, newest first — the year pills.
    pub fn timeline_years(&self) -> Vec<i32> {
        timeline::years(self.config_dir())
    }

    /// Forgets one thing from the log — every line about it, in every year.
    /// The only rewrite the log gets (`timeline::remove`). Not an action of
    /// the history: Ctrl+Z bringing a line back would defeat the point of
    /// asking. Returns how many lines went.
    pub fn forget_from_timeline(&self, key: &timeline::Key) -> Result<usize> {
        self.ensure_writable()?;
        timeline::remove(self.config_dir(), key)
    }

    // --------------------------------------------------------------- sweep

    /// Reconciles the log with the disk on open; returns how many lines it
    /// wrote. Unknown on disk → `created` with its REAL date (`created:`,
    /// frontmatter, mtime last). Alive in the log but absent → `deleted`
    /// today. A task in another list → `moved`; a note moved outside the app
    /// cannot be matched (its identity IS the address): one gone, one born.
    pub fn sweep_timeline(&self) -> Result<usize> {
        self.ensure_writable()?;
        let items = self.timeline_items();
        let at = Self::logged_at();
        let mut lines: Vec<Record> = Vec::new();

        // ---- notes: keyed by address. The map answers: never heard of it
        // (born), heard of it and gone (restored), heard of it and here.
        let mut known_notes: std::collections::HashMap<&str, bool> =
            std::collections::HashMap::new();
        for item in items.iter().filter(|item| item.kind == Kind::Note) {
            known_notes.insert(item.path.as_str(), item.alive());
        }
        let mut on_disk = std::collections::HashSet::new();
        for (prefix, folder) in self.note_folders()? {
            for relative in folder.note_paths()? {
                let address = super::seen::address_of(&prefix, &relative);
                match known_notes.get(address.as_str()) {
                    Some(true) => {}
                    // Back from the trash by hand, or a folder restored whole.
                    Some(false) => {
                        lines.push(Record::gone(at, Kind::Note, &address, Event::Restored))
                    }
                    None => {
                        // The only notes the sweep parses are unknown ones.
                        let born = folder
                            .read(&relative)
                            .ok()
                            .and_then(|note| note.created)
                            .unwrap_or_else(|| self.file_day(&folder.dir().join(&relative)));
                        lines.push(Record::created(
                            at,
                            Kind::Note,
                            &address,
                            born,
                            crate::notefolder::title_of(&relative),
                        ));
                    }
                }
                on_disk.insert(address);
            }
        }
        for (address, alive) in &known_notes {
            if *alive && !on_disk.contains(*address) {
                lines.push(Record::gone(at, Kind::Note, *address, Event::Deleted));
            }
        }

        // ---- tasks: keyed by id, so a move can actually be followed.
        let mut known_tasks: std::collections::HashMap<&str, (&str, bool)> =
            std::collections::HashMap::new();
        let mut known_done: std::collections::HashSet<&str> = std::collections::HashSet::new();
        for item in items.iter().filter(|item| item.kind == Kind::Task) {
            if let Some(id) = item.id.as_deref() {
                known_tasks.insert(id, (item.path.as_str(), item.alive()));
                if item.completed.is_some() {
                    known_done.insert(id);
                }
            }
        }
        let mut seen_tasks = std::collections::HashSet::new();
        for address in self.list_paths()? {
            let Ok(list) = self.open_list(&address.path) else {
                continue;
            };
            for task in list.tasks() {
                let Some(id) = task.id.as_deref() else {
                    // No id, cannot be followed; `adopt_task_identity` hands
                    // one to every task on open.
                    continue;
                };
                seen_tasks.insert(id.to_string());
                match known_tasks.get(id) {
                    None => lines.push(
                        Record::created(
                            at,
                            Kind::Task,
                            &address.path,
                            task.created.unwrap_or_else(crate::clock::civil_today),
                            &task.text,
                        )
                        .with_id(id),
                    ),
                    Some((_, false)) => lines
                        .push(Record::gone(at, Kind::Task, &address.path, Event::Restored).with_id(id)),
                    Some((known, true)) if *known != address.path => lines
                        .push(Record::moved(at, Kind::Task, *known, &address.path).with_id(id)),
                    Some(_) => {}
                }
                // The ticked state, reconciled the same way: finished but never
                // logged → `completed` on the day its `completed:` says;
                // logged finished but open again → `reopened`.
                match (task.done, known_done.contains(id)) {
                    (true, false) => lines.push(
                        Record::completed(
                            at,
                            &address.path,
                            task.completed.unwrap_or_else(crate::clock::civil_today),
                        )
                        .with_id(id),
                    ),
                    (false, true) => {
                        lines.push(Record::reopened(at, &address.path).with_id(id))
                    }
                    _ => {}
                }
            }
        }
        for (id, (path, alive)) in &known_tasks {
            if *alive && !seen_tasks.contains(*id) {
                lines.push(Record::gone(at, Kind::Task, *path, Event::Deleted).with_id(*id));
            }
        }

        let written = lines.len();
        self.log_timeline(lines);
        Ok(written)
    }

    /// The file's mtime as a birth date — the sweep's last resort, and a poor
    /// one (sync tools rewrite it). Today when even that cannot be read.
    fn file_day(&self, path: &std::path::Path) -> NaiveDate {
        std::fs::metadata(path)
            .and_then(|meta| meta.modified())
            .map(crate::clock::civil_date_of)
            .unwrap_or_else(|_| crate::clock::civil_today())
    }
}
