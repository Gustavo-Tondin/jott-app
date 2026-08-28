//! Stamping an age on what the notebook hands out.
//!
//! The rule itself is `crate::age`; this is the one place that FEEDS it —
//! today from the notebook's clock, the thresholds from its config, the "last
//! seen" from its index. A screen therefore never computes an age, and two
//! screens cannot disagree about one.
//!
//! Two shapes, because the two things being stamped know different amounts
//! about themselves. A task has only its creation date (spec 3.6b: no "seen"
//! for tasks), so stamping one is a pure function of the notebook's day. A
//! note has a seen stamp and a file on disk, so stamping a listing of them
//! loads the index ONCE and asks the disk for an mtime only where the index
//! has nothing — which is also the only case the mtime is allowed to speak
//! (`crate::age`).

use super::*;

use chrono::NaiveDate;

use crate::age::{Age, Thresholds};
use crate::notefolder::{NoteEntry, NOTES_INBOX};

impl Notebook {
    /// The notebook's age thresholds — `config.age`, and the only door to it.
    fn thresholds(&self) -> Thresholds {
        self.config.age
    }

    /// Stamps one task's age, in place. A task with no `created` gets none:
    /// the notebook adopts a creation date when it opens
    /// (`adopt_task_identity`), so this is a file written by another tool
    /// between then and now, and inventing an age for it would be a lie the
    /// card draws.
    pub(super) fn stamp_task(&self, task: &mut Task, today: NaiveDate) {
        task.age = task
            .created
            .map(|created| Age::of(today, created, None, None, self.thresholds()));
    }

    /// Stamps a whole listing of tasks, asking the clock once.
    pub(super) fn stamp_tasks<'a>(&self, tasks: impl IntoIterator<Item = &'a mut Task>) {
        let today = self.today();
        for task in tasks {
            self.stamp_task(task, today);
        }
    }

    /// Stamps a listing of notes from ONE notes space: the last time each was
    /// seen, and the age that follows from it.
    ///
    /// `space` is the space's root-relative address, because that is what the
    /// index is keyed by; the entries' own paths are relative to it.
    ///
    /// The Inbox reads against its own shorter deadline (spec 3.6c): things
    /// pass through an inbox, so a fortnight there means something a
    /// fortnight in a space someone built does not.
    pub(super) fn stamp_notes(&self, space: &str, entries: &mut [NoteEntry]) {
        if entries.is_empty() {
            return;
        }
        let today = self.today();
        let seen = self.seen();
        let thresholds = self.thresholds();
        let folder = self.note_folder(space).ok();

        for entry in entries.iter_mut() {
            entry.seen = seen.at(&super::seen::address_of(space, &entry.path));
            let Some(created) = entry.created else {
                // No creation date and no way to guess one: a note written by
                // hand outside the app. It still has a "seen" if this build
                // ever opened it, and that alone is what the card draws.
                continue;
            };
            // The mtime is the last resort, so it is only PAID for when there
            // is nothing better — one `stat` per never-opened note, none at
            // all on a notebook the app has been reading.
            let modified = match (entry.seen, folder.as_ref()) {
                (None, Some(folder)) => folder
                    .note_path(&entry.path)
                    .ok()
                    .and_then(|path| modified_on(&path)),
                _ => None,
            };
            let thresholds = if in_inbox(&entry.folder) {
                thresholds.in_inbox()
            } else {
                thresholds
            };
            entry.age = Some(Age::of(today, created, entry.seen, modified, thresholds));
        }
    }
}

/// Whether a note's folder inside its space IS the Inbox, or lives under it.
fn in_inbox(folder: &str) -> bool {
    folder == NOTES_INBOX || folder.starts_with(&format!("{NOTES_INBOX}/"))
}

/// The day a file was last written, as the local calendar reads it. `None`
/// where the filesystem will not say — the age simply falls back to `created`.
fn modified_on(path: &std::path::Path) -> Option<NaiveDate> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    let stamp: chrono::DateTime<chrono::Local> = modified.into();
    Some(stamp.date_naive())
}
