//! The notebook's side of the "last seen" index (`crate::seen`): joins the
//! space and the address inside it into the ROOT-relative key the index uses,
//! and follows a note through the three moments the index must track (opened,
//! moved, gone). Every write is BEST EFFORT — a failed save is swallowed, and
//! "never leave a stale address behind" is upheld by the callers being few.

use super::*;

use crate::seen::Seen;

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

    /// Records that a note was looked at — opened in the editor, or written
    /// to. **Not** drawn on a board: see the module doc of `crate::seen`.
    pub fn mark_note_seen(&self, space: &str, relative: &str) -> Result<()> {
        self.ensure_writable()?;
        let mut seen = self.seen();
        if seen.mark(&address_of(space, relative), crate::clock::civil_now()) {
            seen.save(self.config_dir())?;
        }
        Ok(())
    }

    /// Follows an address that moved, so a rename does not read as "never
    /// opened". `from` and `to` are root-relative, and may name a folder.
    pub(super) fn seen_moved(&self, from: &str, to: &str) {
        let mut seen = self.seen();
        if seen.retarget(from, to) {
            let _ = seen.save(self.config_dir());
        }
    }

    /// Drops what the index knew about an address and everything under it.
    pub(super) fn seen_gone(&self, address: &str) {
        let mut seen = self.seen();
        if seen.forget(address) {
            let _ = seen.save(self.config_dir());
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
    /// went: keeps the index in step with what a text editor, a sync tool or
    /// an older build did. Nothing is rewritten when nothing is stale.
    pub fn prune_seen(&self) -> Result<usize> {
        self.ensure_writable()?;
        let mut seen = self.seen();
        let before = seen.entries().len();
        // An index with nothing in it has nothing to prune, and the walk it
        // would otherwise pay for is the whole notebook.
        if before == 0 {
            return Ok(0);
        }
        if !seen.keep_only(&self.note_addresses()?) {
            return Ok(0);
        }
        let dropped = before - seen.entries().len();
        seen.save(self.config_dir())?;
        Ok(dropped)
    }
}
