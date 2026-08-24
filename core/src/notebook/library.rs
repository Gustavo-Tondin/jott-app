//! The notebook seen from OUTSIDE — before it is opened, and after it is
//! closed.
//!
//! Every other module in `notebook/` answers questions about the notebook the
//! app is working in. This one answers the questions the PICKER asks about
//! notebooks it is not working in: what to draw on a card for each of them,
//! and the two things a picker may do to a notebook without entering it —
//! rename it and move it.
//!
//! Which notebooks the picker lists is not here. That is the machine's own
//! memory (`src-tauri/src/prefs.rs`), for the same reason the last notebook
//! is: a list of recently opened folders answers to a computer, and syncing
//! it would make two machines argue about paths that exist on only one of
//! them.
//!
//! **Nothing here writes to the notebook it is summarizing.** [`Notebook::open`]
//! deliberately does — it recreates the fixed spaces, clears expired trash and
//! rebuilds the completed index — and a picker drawing eight cards must not
//! touch eight notebooks on disk to do it. So the summary builds the value by
//! hand from the config, and every count below is a read.

use std::path::{Path, PathBuf};

use super::*;

/// One notebook, as a card on the picker draws it.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookSummary {
    pub path: PathBuf,
    /// The folder's name, which is what the user recognizes the notebook by —
    /// the same answer [`super::NotebookInfo`] gives for the open one.
    pub name: String,
    /// The accent chosen INSIDE this notebook, by name (`"orange"`), so the
    /// card can wear the colour of the place it opens. Empty means the
    /// notebook never chose one and reads as the app's own.
    ///
    /// Deliberately the notebook's, not the machine's: `settings::Display`
    /// lets this computer override the accent while it is open, and a picker
    /// painting every card in that one override would say nothing about the
    /// notebooks it is offering.
    pub accent_color: String,
    /// Open tasks across every tasks space — what is still to do in there.
    pub tasks: usize,
    /// Notes sitting in the Inbox of every notes space — what arrived and has
    /// not been filed.
    pub notes: usize,
    /// Written by a newer build: it can be opened, but only for reading.
    pub read_only: bool,
}

/// What the open notebook holds, in four numbers — the line Settings draws
/// under Notebook → Keeping so the user can see the size of what is theirs
/// (principle 4) without opening a file manager.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookContents {
    /// Every note in every notes space, filed or not.
    pub notes: usize,
    /// Open tasks across every tasks space — the same count the picker shows.
    pub tasks: usize,
    /// Files in the `assets/` library.
    pub files: usize,
    /// Bytes on disk under the whole root, hidden folders included: the trash
    /// and the config are part of what a backup has to carry.
    pub bytes: u64,
}

impl Notebook {
    /// The four numbers above, counted on demand. Notes are counted without
    /// being parsed (`NoteFolder::count`); the size walks the whole tree, so
    /// whoever asks should not ask on every render.
    pub fn contents(&self) -> Result<NotebookContents> {
        let mut notes = 0;
        for (_, folder) in self.note_folders()? {
            notes += folder.count("")?;
        }
        Ok(NotebookContents {
            notes,
            tasks: self.open_task_counts()?.values().sum(),
            files: self.assets().list()?.len(),
            bytes: bytes_under(&self.root)?,
        })
    }

    /// What a picker draws for a notebook it has not opened.
    ///
    /// Refuses a folder that is not a notebook — a picker's list is paths
    /// remembered from an earlier run, and a folder deleted or moved outside
    /// the app is simply no longer one. A notebook in the pre-phase-7 layout
    /// is NOT refused here: it carries a `.jott/`, it is still the user's
    /// notebook, and it summarizes to zero counts. Refusing it would drop it
    /// off the screen silently; opening it says why, which is the honest
    /// place for that message ([`Notebook::open`]).
    pub fn summarize(path: impl AsRef<Path>) -> Result<NotebookSummary> {
        let root = path.as_ref().to_path_buf();
        if !Self::is_notebook(&root) {
            return Err(Error::NotANotebook(root));
        }

        // Built by hand rather than by `open`: see the module header. The
        // config is a plain read, and `jsondoc` answers a missing or broken
        // file with the defaults instead of writing one back.
        let config = Config::load(root.join(NOTEBOOK_CONFIG_DIR).join("config.json"));
        let notebook = Self { root, config };

        Ok(NotebookSummary {
            path: notebook.root.clone(),
            name: crate::fsio::file_name_of(&notebook.root),
            accent_color: notebook.config.accent_color.clone(),
            tasks: notebook.open_task_counts()?.values().sum(),
            notes: notebook.notes_waiting()?,
            read_only: notebook.is_read_only(),
        })
    }

    /// How many notes sit in the Inbox of every notes space.
    ///
    /// The Inbox is where a note lands when nobody said where it goes
    /// (`notefolder::NOTES_INBOX`), so this number is the one the picker
    /// promises: what came in and has not been put away. A space whose Inbox
    /// the user deleted counts zero rather than failing — the folder comes
    /// back on the next open, and a missing directory is an empty one
    /// everywhere else in the core (`fsio::dir_paths`).
    fn notes_waiting(&self) -> Result<usize> {
        let mut waiting = 0;
        for (_, folder) in self.note_folders()? {
            waiting += folder.count(crate::notefolder::NOTES_INBOX)?;
        }
        Ok(waiting)
    }

    /// Renames a notebook the app does not have open, by renaming its folder.
    ///
    /// The notebook's name IS its folder name (that is what `summarize`
    /// reads), so there is nothing else to write — and nothing inside the
    /// notebook points at its own root, so no link can break.
    ///
    /// Returns the new path, which the caller has to remember: whoever was
    /// holding the old one — a list of recents, the last-opened preference —
    /// is now holding a path that does not exist.
    ///
    /// Refuses to overwrite. `fs::rename` would happily replace an EMPTY
    /// directory at the destination, and "rename" is not a word that may cost
    /// someone a folder.
    pub fn rename_at(path: impl AsRef<Path>, name: &str) -> Result<PathBuf> {
        let root = path.as_ref().to_path_buf();
        if !Self::is_notebook(&root) {
            return Err(Error::NotANotebook(root));
        }
        // The name is typed by the user, so it is a LEAF and never a path:
        // `../x` here would move the notebook while claiming to rename it.
        if !crate::relpath::is_safe_leaf(name) {
            return Err(Error::InvalidFolderName(name.to_string()));
        }
        let parent = root
            .parent()
            .ok_or_else(|| Error::InvalidFolderName(name.to_string()))?;
        let target = parent.join(name);
        if target == root {
            return Ok(root);
        }
        if target.exists() {
            return Err(Error::InvalidFolderName(format!(
                "{name} already exists here"
            )));
        }
        std::fs::rename(&root, &target).ctx(&target)?;
        Ok(target)
    }

    /// Moves a notebook the app does not have open into another folder.
    ///
    /// Same contract as [`Notebook::rename_at`]: the folder travels whole, the
    /// new path comes back, and nothing at the destination is overwritten.
    ///
    /// `into` is a folder of the MACHINE, so it is not judged the way an
    /// address inside a notebook is — it comes from a folder picker, not from
    /// a text field. What is checked is what a rename cannot recover from: a
    /// destination that is not a folder, one that already holds something by
    /// this name, and a destination INSIDE the notebook being moved, which
    /// would ask the folder to contain itself.
    ///
    /// A move across drives is refused by the operating system rather than
    /// copied here: `fs::rename` cannot cross a filesystem, and a copy that
    /// failed halfway would leave the notebook in two places with no way to
    /// tell which one is whole. The error carries the system's own words.
    pub fn move_at(path: impl AsRef<Path>, into: impl AsRef<Path>) -> Result<PathBuf> {
        let root = path.as_ref().to_path_buf();
        let into = into.as_ref().to_path_buf();
        if !Self::is_notebook(&root) {
            return Err(Error::NotANotebook(root));
        }
        if !into.is_dir() {
            return Err(Error::InvalidFolderName(into.display().to_string()));
        }
        // Canonicalized on both sides: `/home/me/nb/../nb` is inside `/home/me/nb`
        // and does not `starts_with` it as written. A path that cannot be
        // canonicalized is one that does not exist, and both were checked above.
        let (real_root, real_into) = (
            std::fs::canonicalize(&root).ctx(&root)?,
            std::fs::canonicalize(&into).ctx(&into)?,
        );
        if real_into.starts_with(&real_root) {
            return Err(Error::InvalidFolderName(
                "a notebook cannot be moved inside itself".to_string(),
            ));
        }
        let leaf = crate::fsio::file_name_of(&root);
        let target = into.join(&leaf);
        if target.exists() {
            return Err(Error::InvalidFolderName(format!(
                "{leaf} already exists there"
            )));
        }
        std::fs::rename(&root, &target).ctx(&target)?;
        Ok(target)
    }
}

/// The size of every file under `dir`, recursively — hidden entries too.
fn bytes_under(dir: &Path) -> Result<u64> {
    let mut total = 0;
    for entry in std::fs::read_dir(dir).ctx(dir)? {
        let entry = entry.ctx(dir)?;
        let path = entry.path();
        let meta = entry.metadata().ctx(&path)?;
        if meta.is_dir() {
            total += bytes_under(&path)?;
        } else {
            total += meta.len();
        }
    }
    Ok(total)
}
