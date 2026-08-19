//! The notes side of a notebook: which folders hold notes, and the one
//! operation on a note the notebook itself owns.
//!
//! Reading and writing a note is [`crate::notefolder::NoteFolder`]'s job;
//! deleting is here because it goes through the trash, which is the
//! notebook's.

use crate::error::{Error, IoContext, Result};

use crate::search::{HitKind, SearchHit};

use super::*;

impl Notebook {
    /// Every notes space's folder in the notebook, with its root-relative
    /// prefix — the notes counterpart of [`Notebook::task_folders`].
    pub fn note_folders(&self) -> Result<Vec<(String, crate::notefolder::NoteFolder)>> {
        Ok(self
            .typed_space_dirs("notes")?
            .into_iter()
            .map(|(prefix, dir)| (prefix, crate::notefolder::NoteFolder::new(dir)))
            .collect())
    }

    /// The notes folder at a root-relative address, e.g. `Notes`.
    pub fn note_folder(&self, prefix: &str) -> Result<crate::notefolder::NoteFolder> {
        self.note_folders()?
            .into_iter()
            .find(|(at, _)| at == prefix)
            .map(|(_, folder)| folder)
            .ok_or_else(|| Error::InvalidNotePath(prefix.to_string()))
    }

    /// Deletes a note (a file inside a notes space), sending it to the trash.
    pub fn delete_note(&self, folder: &str, relative: &str) -> Result<()> {
        self.ensure_writable()?;
        let note_folder = self.note_folder(folder)?;
        let abs = note_folder.note_path(relative)?;
        self.trash_path(&abs)
    }

    /// Moves a note to another notes space, into `to_folder` inside it.
    ///
    /// The counterpart of `NoteFolder::move_to`, which only ever moves within
    /// one space — a space cannot reach into another, and should not: crossing
    /// the border is the notebook's business, because the notebook is what
    /// knows both sides. Returns the new address, relative to the space it
    /// landed in.
    ///
    /// Nothing in the note is rewritten. Asset addresses are relative to the
    /// notebook ROOT (`assets/x.png`, user call 2026-08-18), so an image keeps
    /// pointing at the same file however far the note travels — which is the
    /// whole reason that form was chosen over `../../assets/x.png`.
    pub fn move_note_to_space(
        &self,
        from_space: &str,
        relative: &str,
        to_space: &str,
        to_folder: &str,
    ) -> Result<String> {
        self.ensure_writable()?;
        let source_space = self.note_folder(from_space)?;
        let source = source_space.note_path(relative)?;
        let target_space = self.note_folder(to_space)?;

        if from_space == to_space {
            // The same move, within one space — no reason to have two code
            // paths for it, and `move_to` is the one with the tests.
            return source_space.move_to(relative, to_folder);
        }

        let dir = target_space.folder_path(to_folder)?;
        std::fs::create_dir_all(&dir).ctx(&dir)?;
        let name = source
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        // A note of the same name already there is not overwritten — the same
        // free-name dance every other move in the app goes through.
        let target = crate::fsio::free_name(&dir, &name);
        std::fs::rename(&source, &target).ctx(&target)?;
        Ok(crate::relpath::relative_slash(target_space.dir(), &target))
    }

    // ------------------------------------------------------------ assets

    /// The notebook's image library (`assets/`).
    pub fn assets(&self) -> crate::assets::Assets {
        crate::assets::Assets::new(self.root.join(crate::assets::ASSETS_DIR))
    }

    /// Writes an image into the library, returning its root-relative address —
    /// the address a note carries.
    pub fn import_asset(&self, file_name: &str, bytes: &[u8]) -> Result<String> {
        self.ensure_writable()?;
        self.assets().import(file_name, bytes)
    }

    /// Sends an asset to the notebook's trash.
    ///
    /// Never `remove_file`: an image can be the banner of a note written a
    /// year ago, and a deletion that cannot be undone is exactly the kind this
    /// app does not do (the same rule notes, tasks and lists follow). The
    /// notes that pointed at it now point at nothing — which the interface
    /// draws as a missing image, and the trash is where it comes back from.
    pub fn delete_asset(&self, address: &str) -> Result<()> {
        self.ensure_writable()?;
        let abs = self.assets().file(address)?;
        self.trash_path(&abs)
    }

    /// The file an asset address names, or an error when the address is not
    /// one of the library's. The one door the interface resolves through.
    pub fn asset_file(&self, address: &str) -> Result<std::path::PathBuf> {
        self.assets().file(address)
    }

    /// Where each file of the library is used, keyed by its address.
    ///
    /// The Images screen asks this so it can say which files are carrying
    /// their weight and which are only taking up room — and, for the ones
    /// that are, offer the way to what uses them (user call, 2026-08-19). A
    /// file nobody points at simply has no entry.
    ///
    /// A place is a [`SearchHit`], and deliberately so: it is the shape the
    /// interface already knows how to draw and how to OPEN, from the search
    /// box. A second shape meaning the same thing would be a second thing to
    /// keep in step.
    ///
    /// **Matched by exact reference, not by parsing.** For each file name the
    /// text is asked whether it carries `[[/name]]` (what this app writes) or
    /// `assets/name` (a markdown link, a banner, a note written by hand). The
    /// cost is one pass per file per note, which for a library of tens and a
    /// notebook of hundreds is milliseconds on a screen opened rarely — and
    /// what is bought is that a name can never be half-read out of a link.
    pub fn asset_usage(&self) -> Result<std::collections::HashMap<String, Vec<SearchHit>>> {
        let mut used: std::collections::HashMap<String, Vec<SearchHit>> =
            std::collections::HashMap::new();
        let names: Vec<String> = self.assets().list()?.into_iter().map(|a| a.name).collect();
        if names.is_empty() {
            return Ok(used);
        }
        let labels = self.space_labels()?;
        let label_of =
            |prefix: &String| labels.get(prefix).cloned().unwrap_or_else(|| prefix.clone());

        for (prefix, folder) in self.note_folders()? {
            let space = label_of(&prefix);
            for entry in folder.notes()? {
                let note = folder.read(&entry.path)?;
                // The banner is not part of the body — the core lifts it off
                // (`Note::parse`) — so a note whose only use of a file is its
                // banner would otherwise read as not using it at all.
                let banner = match &note.banner {
                    Some(crate::note::Banner::Image(address)) => address.clone(),
                    _ => String::new(),
                };
                for name in &names {
                    if !mentions(&note.body, name) && banner != crate::assets::address(name) {
                        continue;
                    }
                    used.entry(crate::assets::address(name)).or_default().push(SearchHit {
                        kind: HitKind::Note,
                        path: entry.path.clone(),
                        folder: prefix.clone(),
                        id: None,
                        title: entry.title.clone(),
                        snippet: String::new(),
                        space: space.clone(),
                        container: entry.folder.clone(),
                        done: false,
                    });
                }
            }
        }

        for (prefix, folder) in self.task_folders()? {
            let space = label_of(&prefix);
            for list in folder.list_names()? {
                let path = format!("{prefix}/{list}.md");
                for task in self.open_list(&path)?.tasks() {
                    for file in &task.files {
                        used.entry(file.address.clone()).or_default().push(SearchHit {
                            kind: HitKind::Task,
                            path: path.clone(),
                            folder: String::new(),
                            id: task.id.clone(),
                            title: task.text.clone(),
                            snippet: String::new(),
                            space: space.clone(),
                            container: list.clone(),
                            done: task.done,
                        });
                    }
                }
            }
        }

        Ok(used)
    }
}

/// Whether a note's body points at the library file called `name`, in either
/// of the two shapes a body can carry it: this app's own `[[/name]]`, and the
/// plain address a markdown link (or a hand-written note) uses.
fn mentions(body: &str, name: &str) -> bool {
    body.contains(&format!("[[/{name}]]")) || body.contains(&crate::assets::address(name))
}
