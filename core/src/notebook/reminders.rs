//! The notebook's reminders: every open task that should ring, soonest first,
//! minus the ones some device has already dealt with.

use chrono::NaiveDateTime;

use crate::error::Result;
use crate::reminders::{self, Reminder};
use crate::seen::{Index, Seen};
use crate::COMPLETED_LIST;

use super::*;

impl Notebook {
    /// Every reminder in the notebook — the moments tasks asked for — sorted
    /// soonest first, past ones included (the shell decides what "missed"
    /// means). A moment already acknowledged on ANY device is left out: that
    /// is what keeps the second machine quiet about what the first rang.
    ///
    /// Walks every list of every tasks space, so it is asked when something
    /// changed (the watcher says so), never on a render.
    pub fn reminders(&self) -> Result<Vec<Reminder>> {
        let acked = self.acks();
        let mut out = Vec::new();
        for list in self.list_paths()? {
            if list.name == COMPLETED_LIST {
                continue;
            }
            for (position, task) in self.open_list(&list.path)?.tasks().enumerate() {
                if acked_already(&acked, &list.path, task) {
                    continue;
                }
                out.extend(reminders::reminder_of(&list.path, position, task));
            }
        }
        reminders::sort(&mut out);
        Ok(out)
    }

    /// The reminders every device has already shown and dealt with. Read from
    /// disk on every call, like [`Self::seen`] and for the same reason.
    fn acks(&self) -> Seen {
        Seen::load_of(self.config_dir(), Index::Acked)
    }

    /// Records that a task's reminder was shown and dealt with here. The
    /// stamp is the moment the task ASKED for, never "when it was dismissed":
    /// only that is monotonic, and a `remind:` moved later reads as the new
    /// reminder it is. A task without an id cannot be named across devices,
    /// so the caller has none to hand over.
    pub fn ack_reminder(&self, list: &str, id: &str, at: NaiveDateTime) -> Result<()> {
        self.ensure_writable()?;
        let mut acks = self.acks();
        if acks.advance(&reminders::ack_key(list, id), at) {
            acks.save(self.config_dir())?;
        }
        Ok(())
    }
}

/// Whether the moment this task asks for has already been acknowledged.
fn acked_already(acks: &Seen, list: &str, task: &crate::task::Task) -> bool {
    let (Some(at), Some(id)) = (task.remind, task.id.as_deref()) else {
        return false;
    };
    acks.at(&reminders::ack_key(list, id))
        .is_some_and(|acked| acked >= at)
}
