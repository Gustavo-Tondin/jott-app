//! The way out of the notebook — and the way back.
//!
//! Nothing the app deletes is destroyed: a file, a folder or a task goes to
//! `.jott/trash/`, and can be restored to the line it was on.

use crate::error::{Error, IoContext, Result};
use crate::list::TaskList;

use super::*;

impl Notebook {
    // ------------------------------------------------------------------ trash

    /// The notebook's own trash, rooted at `.jott/trash/`.
    pub(super) fn trash(&self) -> crate::trash::Trash {
        crate::trash::Trash::open(self.config_dir().join("trash"))
    }

    /// Moves a file or folder into the notebook's trash, recording its origin.
    /// The single door every file/folder deletion goes through now — no more
    /// OS trash (which Android lacks and a synced folder cannot carry).
    pub(super) fn trash_path(&self, abs: &std::path::Path) -> Result<()> {
        let origin = crate::relpath::relative_slash(&self.root, abs);
        self.trash()
            .trash_file(abs, &origin, crate::clock::civil_today())?;
        Ok(())
    }

    /// The trashed items awaiting restore or expiry, newest first.
    pub fn trash_entries(&self) -> Vec<crate::trash::TrashEntry> {
        let mut entries = self.trash().entries().to_vec();
        entries.reverse();
        entries
    }

    /// Days before an entry is cleared, by the reaper's own arithmetic.
    /// `None` when it is kept forever (retention 0).
    pub fn trash_days_left(&self, entry: &crate::trash::TrashEntry) -> Option<i64> {
        crate::trash::days_left(
            entry,
            self.config.trash_retention_days,
            crate::clock::civil_today(),
        )
    }

    /// Clears items whose retention window elapsed. Run on open.
    pub fn reap_trash(&self) -> Result<()> {
        self.trash()
            .reap(self.config.trash_retention_days, crate::clock::civil_today())
    }

    /// Deletes one trashed item for good (user's call, 2026-08-21).
    pub fn purge_from_trash(&self, id: &str) -> Result<()> {
        self.ensure_writable()?;
        match self.trash().purge(id) {
            Some(_) => Ok(()),
            None => Err(Error::TaskNotFound(id.to_string())),
        }
    }

    /// Empties the trash for good. Returns how many items went.
    pub fn empty_trash(&self) -> Result<usize> {
        self.ensure_writable()?;
        self.trash().purge_all()
    }

    /// Brings a trashed item back to where it came from. A collision at the
    /// origin is suffixed, never overwritten.
    pub fn restore_from_trash(&self, id: &str) -> Result<()> {
        self.ensure_writable()?;
        let mut trash = self.trash();
        let Some(entry) = trash.take(id) else {
            return Err(Error::TaskNotFound(id.to_string()));
        };
        match entry.kind {
            crate::trash::TrashKind::File => {
                let stored = entry.stored.clone().unwrap_or_default();
                let source = trash.stored_path(&stored);
                let dest = self.root.join(&entry.origin);
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent).ctx(parent)?;
                }
                let mut name = crate::fsio::file_name_of(&dest);
                if name.is_empty() {
                    name = "restored".to_string();
                }
                let final_dest = if dest.exists() {
                    crate::fsio::free_name(dest.parent().unwrap_or(&self.root), &name)
                } else {
                    dest
                };
                std::fs::rename(&source, &final_dest).ctx(&final_dest)?;
                // The log knows it by the address it was deleted from; if the
                // name was taken and it landed beside it, that is a move.
                self.logged_note_gone(&entry.origin, crate::timeline::Event::Restored);
                let landed = crate::relpath::relative_slash(&self.root, &final_dest);
                self.logged_note_moved(&entry.origin, &landed);
            }
            crate::trash::TrashKind::Task => {
                // A deleted task goes back to its origin list, **at the line it
                // sat on** (2026-08-14) — the trash always recorded the index,
                // and restoring to the end quietly reshuffled a list the user
                // had arranged by hand.
                //
                // The stored lines are the task as it was rendered, so they are
                // parsed back into a task rather than pasted as text:
                // `add_text` would wrap `- [ ] foo` into a task whose own TEXT
                // is `- [ ] foo`.
                if let Some(lines) = &entry.content {
                    let mut list = self.open_list(&entry.origin)?;
                    let restored = TaskList::from_text(&lines.join("\n"));
                    let mut at = entry.index.unwrap_or(usize::MAX);
                    for line in restored.lines() {
                        match line {
                            crate::list::Line::Task(task) => {
                                if let Some(id) = task.id.as_deref() {
                                    self.logged_task_gone(
                                        id,
                                        &entry.origin,
                                        crate::timeline::Event::Restored,
                                    );
                                }
                                list.insert_line_at(at, task.clone());
                                at = at.saturating_add(1);
                            }
                            // A line the parser did not read as a task cannot be
                            // put back through the task API; dropping it would
                            // lose the user's text, so it goes back as it was.
                            crate::list::Line::Raw(raw) => {
                                list.insert_raw_at(at, raw.clone());
                                at = at.saturating_add(1);
                            }
                        }
                    }
                    list.save()?;
                }
            }
        }
        let _ = self.refresh_completed_index();
        Ok(())
    }
}
