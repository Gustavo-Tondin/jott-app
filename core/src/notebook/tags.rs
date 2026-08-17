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

    /// Sets (or creates) a tag's colour; an empty colour clears it.
    pub fn set_tag(&self, name: &str, color: Option<String>) -> Result<()> {
        self.ensure_writable()?;
        let mut tags = self.tags();
        tags.set(name, color);
        tags.save(self.tags_path())
    }

    /// Forgets a tag's colour (the `#word` text in tasks stays).
    pub fn remove_tag(&self, name: &str) -> Result<()> {
        self.ensure_writable()?;
        let mut tags = self.tags();
        tags.remove(name);
        tags.save(self.tags_path())
    }
}
