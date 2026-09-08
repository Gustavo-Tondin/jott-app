//! The notebook's side of the "last seen" index (`crate::seen`).
//!
//! The index is keyed by ROOT-relative address (`jott.notes/ideia.md`) while
//! every note operation speaks in two halves — the space and the address
//! inside it. Joining the two is this module's whole job, plus the three
//! moments the index has to follow a note: it is opened, it moves, it goes.
//!
//! Every write in here is **best effort**. Losing a "seen" stamp costs the
//! age of one note; refusing to rename a note because an index could not be
//! written would cost the user their rename. So a failure to save is
//! swallowed on purpose, and the invariant that matters — never leave a stale
//! address behind — is upheld by the callers being few and named.

use super::*;

use crate::seen::Seen;

/// The root-relative address of a note, from the two halves the app speaks in.
///
/// Either half may be empty — a note at a space's root, or the notebook root
/// itself — and the join must not leave a stray separator behind: an address
/// ending in `/` matches nothing, which is how a whole folder of stamps went
/// missing the first time a folder was deleted.
pub(super) fn address_of(space: &str, relative: &str) -> String {
    match (space.is_empty(), relative.is_empty()) {
        (true, _) => relative.to_string(),
        (false, true) => space.to_string(),
        (false, false) => format!("{space}/{relative}"),
    }
}

impl Notebook {
    /// The "last seen" index of this notebook.
    ///
    /// Read from disk on every call rather than cached: it is a small file,
    /// two windows on the same notebook each hold their own `Notebook`, and a
    /// cached copy would have them overwriting each other's stamps.
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

    /// Drops index entries for notes that are no longer on disk, and answers
    /// how many went.
    ///
    /// The named callers above keep the index in step with what the APP does;
    /// this is what keeps it in step with what a text editor, a sync tool or
    /// an older build did. Nothing is rewritten when nothing is stale, so a
    /// notebook that is only ever touched through the app never pays for it.
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
