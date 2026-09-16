//! The notebook's side of the "last seen" index (`crate::seen`): joins the
//! space and the address inside it into the ROOT-relative key the index uses,
//! and follows a note through the three moments the index must track (opened,
//! moved, gone). Every write is BEST EFFORT — a failed save is swallowed, and
//! "never leave a stale address behind" is upheld by the callers being few.

use super::*;

use crate::seen::{Index, Seen};

/// The root-relative address of a note, from the two halves the app speaks in.
/// Either half may be empty, and the join must not leave a stray separator:
/// an address ending in `/` matches nothing.
pub(super) fn address_of(space: &str, relative: &str) -> String {
    match (space.is_empty(), relative.is_empty()) {
        (true, _) => relative.to_string(),
        (false, true) => space.to_string(),
        (false, false) => format!("{space}/{relative}"),
    }
}

impl Notebook {
    /// The "last seen" index, read from disk on every call: two windows on the
    /// same notebook each hold a `Notebook`, and a cached copy would have them
    /// overwriting each other's stamps.
    pub fn seen(&self) -> Seen {
        Seen::load(self.config_dir())
    }

    /// When each note was last WRITTEN (`Index::Edited`) — what brings a note
    /// written before today into the Home's day. Read like [`Self::seen`].
    pub fn edited(&self) -> Seen {
        Seen::load_of(self.config_dir(), Index::Edited)
    }

    /// Records that a note was looked at — opened in the editor, or written
    /// to. **Not** drawn on a board: see the module doc of `crate::seen`.
    pub fn mark_note_seen(&self, space: &str, relative: &str) -> Result<()> {
        self.stamp(Index::Seen, space, relative)
    }

    /// Records that a note was written to — the editor's save, never an open.
    pub fn mark_note_edited(&self, space: &str, relative: &str) -> Result<()> {
        self.stamp(Index::Edited, space, relative)
    }

    fn stamp(&self, index: Index, space: &str, relative: &str) -> Result<()> {
        self.ensure_writable()?;
        let mut stamps = Seen::load_of(self.config_dir(), index);
        if stamps.mark(&address_of(space, relative), crate::clock::civil_now()) {
            stamps.save(self.config_dir())?;
        }
        Ok(())
    }

    /// Follows an address that moved, so a rename does not read as "never
    /// opened". `from` and `to` are root-relative, and may name a folder.
    pub(super) fn seen_moved(&self, from: &str, to: &str) {
        for index in Index::ALL {
            let mut stamps = Seen::load_of(self.config_dir(), index);
            if stamps.retarget(from, to) {
                let _ = stamps.save(self.config_dir());
            }
        }
    }

    /// Drops what the indexes knew about an address and everything under it.
    pub(super) fn seen_gone(&self, address: &str) {
        for index in Index::ALL {
            let mut stamps = Seen::load_of(self.config_dir(), index);
            if stamps.forget(address) {
                let _ = stamps.save(self.config_dir());
            }
        }
    }

    /// Every note in the notebook, by root-relative address, without parsing
    /// one of them.
    fn note_addresses(&self) -> Result<std::collections::HashSet<String>> {
        let mut found = std::collections::HashSet::new();
        for (prefix, folder) in self.note_folders()? {
            for path in folder.note_paths()? {
                found.insert(address_of(&prefix, &path));
            }
        }
        Ok(found)
    }

    /// Drops index entries for notes no longer on disk, and answers how many
    /// went: keeps the indexes in step with what a text editor, a sync tool
    /// or an older build did. Nothing is rewritten when nothing is stale.
    ///
    /// The two indexes keyed by a note's address (`Index::NOTES`) are swept
    /// against the notes; the acks, keyed by a task's reminder, against the
    /// reminders still asked for (`prune_acks`).
    pub fn prune_seen(&self) -> Result<usize> {
        self.ensure_writable()?;
        let mut alive = None;
        let mut dropped = 0;
        for index in Index::NOTES {
            let mut stamps = Seen::load_of(self.config_dir(), index);
            let before = stamps.entries().len();
            // An index with nothing in it has nothing to prune, and the walk
            // it would otherwise pay for is the whole notebook.
            if before == 0 {
                continue;
            }
            if alive.is_none() {
                alive = Some(self.note_addresses()?);
            }
            if stamps.keep_only(alive.as_ref().expect("filled just above")) {
                dropped += before - stamps.entries().len();
                stamps.save(self.config_dir())?;
            }
        }
        Ok(dropped + self.prune_acks()?)
    }

    /// Drops every ack that no open task's `remind:` asks for any more: the
    /// list is gone, the task was completed or deleted, the reminder moved,
    /// or the key is in the shape an older build wrote. What is left is
    /// exactly what `Notebook::reminders` would otherwise offer again.
    fn prune_acks(&self) -> Result<usize> {
        let mut acks = Seen::load_of(self.config_dir(), Index::Acked);
        let before = acks.entries().len();
        if before == 0 {
            return Ok(0);
        }
        let mut alive = std::collections::HashSet::new();
        for list in self.list_paths()? {
            if list.name == crate::COMPLETED_LIST {
                continue;
            }
            for task in self.open_list(&list.path)?.tasks() {
                if let (false, Some(at), Some(id)) = (task.done, task.remind, task.id.as_deref()) {
                    alive.insert(crate::reminders::ack_key(&list.path, id, at));
                }
            }
        }
        if !acks.keep_only(&alive) {
            return Ok(0);
        }
        acks.save(self.config_dir())?;
        Ok(before - acks.entries().len())
    }
}
