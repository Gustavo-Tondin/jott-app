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

    /// Copies a note beside itself, returning the new address.
    ///
    /// Here as well as on the folder because writing is the notebook's gate:
    /// a read-only notebook (a newer schema) must refuse it, and the folder
    /// itself does not know whether it may write.
    pub fn duplicate_note(&self, folder: &str, relative: &str) -> Result<String> {
        self.ensure_writable()?;
        self.note_folder(folder)?.duplicate(relative)
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

    /// Renames a note, and follows it into every note that links to it.
    ///
    /// A note link carries the TITLE (`crate::links`, and the reason is in
    /// `embeds.js`), which is what survives a note being MOVED — and what goes
    /// stale the instant it is renamed. This is the other half of that trade,
    /// paid here so the user never sees the cost (user call, 2026-08-19).
    ///
    /// The rename happens first: rewriting links to a note that failed to be
    /// renamed would point them at nothing.
    pub fn rename_note(&self, folder: &str, path: &str, title: &str) -> Result<String> {
        self.ensure_writable()?;
        let notes = self.note_folder(folder)?;
        let was = crate::notefolder::title_of(path);
        let moved = notes.rename(path, title)?;
        let now = crate::notefolder::title_of(&moved);
        self.retarget_note_links(&was, &now)?;
        Ok(moved)
    }

    /// Points every `[[link]]` at `new` instead of `old`, notebook-wide.
    ///
    /// The whole notebook and not one space: a note in Design may well link to
    /// one in Pessoal, and a link that only worked inside its own space would
    /// be a different feature from the one the brackets promise.
    fn retarget_note_links(&self, old: &str, new: &str) -> Result<()> {
        if old == new {
            return Ok(());
        }
        for (_, folder) in self.note_folders()? {
            for entry in folder.notes()? {
                let note = folder.read(&entry.path)?;
                if let Some(body) = crate::links::retarget_note(&note.body, old, new) {
                    folder.rewrite(&entry.path, Some(body), None)?;
                }
            }
        }
        Ok(())
    }

    /// Renames a file of the library, and follows it everywhere.
    ///
    /// **The whole point is the "and follows it"** (user call, 2026-08-19): a
    /// rename that left `[[/foto.jpg]]` pointing at a name nobody has any more
    /// would be a rename that broke every note using the file — the same
    /// question the delete dialog answers by warning, answered here by simply
    /// not breaking anything.
    ///
    /// Which forms are rewritten, and why not all of them, is written down in
    /// [`crate::links`]. The banner is retargeted separately because the core
    /// lifts it off the body; a task's attachment is a field, and is moved as
    /// one.
    ///
    /// The file moves first: if the move fails there is nothing to point at,
    /// and rewriting the notes would have been a lie. A colliding name is
    /// suffixed, never overwritten, and the address that comes back is the one
    /// the file actually took.
    pub fn rename_asset(&self, address: &str, new_name: &str) -> Result<String> {
        self.ensure_writable()?;
        let assets = self.assets();
        let old_name = crate::assets::name_of(address)
            .ok_or_else(|| Error::InvalidAssetPath(address.to_string()))?
            .to_string();
        let wanted = clean_asset_name(new_name, &old_name)?;
        if wanted == old_name {
            return Ok(address.to_string());
        }

        let source = assets.file(address)?;
        let target = crate::fsio::free_name(assets.dir(), &wanted);
        std::fs::rename(&source, &target).ctx(&target)?;
        let taken = target
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or(wanted);

        self.retarget_asset(&old_name, &taken)?;
        Ok(crate::assets::address(&taken))
    }

    /// Points every note and task at `new` instead of `old`.
    fn retarget_asset(&self, old: &str, new: &str) -> Result<()> {
        let was = crate::assets::address(old);
        let now = crate::assets::address(new);

        for (_, folder) in self.note_folders()? {
            for entry in folder.notes()? {
                let note = folder.read(&entry.path)?;
                let body = crate::links::retarget_file(&note.body, old, new);
                let banner = match &note.banner {
                    Some(crate::note::Banner::Image(address)) if address == &was => {
                        Some(crate::note::Banner::Image(now.clone()))
                    }
                    _ => None,
                };
                if body.is_none() && banner.is_none() {
                    continue;
                }
                folder.rewrite(&entry.path, body, banner)?;
            }
        }

        for (prefix, folder) in self.task_folders()? {
            for list in folder.list_names()? {
                let path = format!("{prefix}/{list}.md");
                let mut tasks = self.open_list(&path)?;
                let mut touched = false;
                for task in tasks.tasks_mut() {
                    for file in &mut task.files {
                        if file.address != was {
                            continue;
                        }
                        // A label the user wrote by hand is theirs and stays;
                        // one that was only ever the file's name follows it.
                        if file.label == old {
                            file.label = new.to_string();
                        }
                        file.address = now.clone();
                        touched = true;
                    }
                }
                if touched {
                    tasks.save()?;
                }
            }
        }
        Ok(())
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

/// The name a rename asks for, checked as a file name.
///
/// An extension left off is taken from the old name rather than refused: a
/// person renaming `IMG_2049.jpg` to `férias` means `férias.jpg`, and making
/// them retype `.jpg` is making them do the app's arithmetic.
fn clean_asset_name(wanted: &str, old: &str) -> Result<String> {
    let wanted = wanted.trim();
    let with_extension = match (wanted.rsplit_once('.'), old.rsplit_once('.')) {
        (None, Some((_, extension))) => format!("{wanted}.{extension}"),
        _ => wanted.to_string(),
    };
    if with_extension.is_empty() || !crate::relpath::is_safe_leaf(&with_extension) {
        return Err(Error::InvalidAssetPath(wanted.to_string()));
    }
    Ok(with_extension)
}

/// Whether a note's body points at the library file called `name`, in either
/// of the two shapes a body can carry it: this app's own `[[/name]]`, and the
/// plain address a markdown link (or a hand-written note) uses.
fn mentions(body: &str, name: &str) -> bool {
    body.contains(&format!("[[/{name}]]")) || body.contains(&crate::assets::address(name))
}
