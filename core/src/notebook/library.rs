//! The notebook seen from OUTSIDE: what the picker draws on a card for a
//! notebook it is not working in, and the two things it may do without
//! entering it — rename and move. Which notebooks it lists is the machine's
//! memory (`src-tauri/src/prefs.rs`). **Nothing here writes to the notebook
//! it summarizes** — unlike [`Notebook::open`] — so the summary is built by hand.

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
    /// The accent chosen INSIDE this notebook, by name (`"orange"`); empty
    /// means the app's own. The notebook's, not the machine's: a picker
    /// painting every card in this computer's `settings::Display` override
    /// would say nothing about the notebooks it offers.
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

    /// What a picker draws for a notebook it has not opened. Refuses a folder
    /// that is not a notebook (deleted or moved outside the app). A
    /// pre-phase-7 notebook is NOT refused here: it summarizes to zero counts,
    /// and opening it is what says why ([`Notebook::open`]).
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

    /// How many notes sit in the Inbox of every notes space — what came in
    /// and has not been put away. A space whose Inbox the user deleted counts
    /// zero rather than failing (a missing directory is an empty one, `fsio::dir_paths`).
    fn notes_waiting(&self) -> Result<usize> {
        let mut waiting = 0;
        for (_, folder) in self.note_folders()? {
            waiting += folder.count(crate::notefolder::NOTES_INBOX)?;
        }
        Ok(waiting)
    }

    /// Renames a notebook the app does not have open, by renaming its folder
    /// (the name IS the folder; nothing inside points at its own root).
    /// Returns the new path, which the caller has to remember. Refuses to
    /// overwrite: `fs::rename` would replace an EMPTY directory at the destination.
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

    /// Moves a notebook the app does not have open into another folder; same
    /// contract as [`Notebook::rename_at`]. `into` comes from a folder picker,
    /// so only the unrecoverable is checked: not a folder, name taken, or INSIDE
    /// the notebook. Across drives the OS refuses (`fs::rename`) — never copied here.
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
