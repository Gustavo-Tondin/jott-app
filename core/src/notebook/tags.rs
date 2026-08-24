//! The tag catalogue: the colours the user chose for `#words`.
//!
//! The tags themselves live in the task text, in the files. This is only
//! their appearance, which is a preference and therefore config.

use std::path::PathBuf;

use crate::error::Result;

use super::*;

impl Notebook {
    // ------------------------------------------------------------------- tags

    fn tags_path(&self) -> PathBuf {
        self.config_dir().join("tags.json")
    }

    /// The user's tag catalogue (names + colours).
    pub fn tags(&self) -> crate::tags::Tags {
        crate::tags::Tags::load(self.tags_path())
    }

    /// Every tag in use in the notebook's tasks, with how many carry it —
    /// including the ones the catalogue never coloured. Sorted by count,
    /// then by name, so the screen can print it as it comes.
    ///
    /// Walks every list of every tasks space: a number, not a search, so
    /// it is asked when the Tags screen opens, never on each render.
    pub fn tag_usage(&self) -> Result<Vec<crate::tags::TagUsage>> {
        let mut counts = std::collections::BTreeMap::<String, usize>::new();
        for list in self.list_paths()? {
            for task in self.open_list(&list.path)?.tasks() {
                for tag in &task.tags {
                    *counts.entry(tag.clone()).or_default() += 1;
                }
            }
        }
        let mut usage: Vec<_> = counts
            .into_iter()
            .map(|(name, count)| crate::tags::TagUsage { name, count })
            .collect();
        usage.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
        Ok(usage)
    }

    /// Loads the catalogue, lets `change` edit it, and writes it back.
    fn with_tags(&self, change: impl FnOnce(&mut crate::tags::Tags)) -> Result<()> {
        self.ensure_writable()?;
        let mut tags = self.tags();
        change(&mut tags);
        tags.save(self.tags_path())
    }

    /// Sets (or creates) a tag's colour; an empty colour clears it.
    pub fn set_tag(&self, name: &str, color: Option<String>) -> Result<()> {
        self.with_tags(|tags| tags.set(name, color))
    }

    /// Forgets a tag's colour (the `#word` text in tasks stays).
    pub fn remove_tag(&self, name: &str) -> Result<()> {
        self.with_tags(|tags| tags.remove(name))
    }
}
