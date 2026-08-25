//! The notebook's reminders: every open task that should ring, soonest first.

use crate::error::Result;
use crate::reminders::{self, Reminder};
use crate::COMPLETED_LIST;

use super::*;

impl Notebook {
    /// Every reminder in the notebook — the tasks' own and the automatic ones
    /// the config asks for — sorted soonest first, past ones included (the
    /// shell decides what "missed" means).
    ///
    /// Walks every list of every tasks space, so it is asked when something
    /// changed (the watcher says so), never on a render.
    pub fn reminders(&self) -> Result<Vec<Reminder>> {
        let config = self.config();
        let mut out = Vec::new();
        for list in self.list_paths()? {
            if list.name == COMPLETED_LIST {
                continue;
            }
            for (position, task) in self.open_list(&list.path)?.tasks().enumerate() {
                if let Some(reminder) = reminders::reminder_of(
                    &list.path,
                    position,
                    task,
                    config.auto_remind,
                    config.reminder_time,
                ) {
                    out.push(reminder);
                }
            }
        }
        reminders::sort(&mut out);
        Ok(out)
    }
}
