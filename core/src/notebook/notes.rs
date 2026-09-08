//! The notes side of a notebook: which folders hold notes, and the guarded
//! doors to a note. Reading and writing a note is
//! [`crate::notefolder::NoteFolder`]'s job; the trash is the notebook's.

use crate::error::{Error, IoContext, Result};

use crate::notefolder::NoteEntry;
use crate::search::{HitKind, SearchHit};

/// A folder of notes, as a screen lists it: where it is, and what the space
/// remembers about it (crate::space::FolderSettings).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct NoteFolderEntry {
    /// Address relative to the space (`Clientes`, `Clientes/2026`).
    pub path: String,
    /// A palette name, or none — then the folder reads as the space's colour.
    pub color: Option<String>,
    pub pinned: bool,
}

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

    /// The notes of a space, as a board lists them (optionally filtered by
    /// `query`), stamped with when each was last seen and how old that makes
    /// it. The board, the Home's inbox and the Home's day all come through here.
    pub fn notes_in(&self, space: &str, query: &str) -> Result<Vec<NoteEntry>> {
        let mut entries = self.note_folder(space)?.search(query)?;
        self.stamp_notes(space, &mut entries);
        Ok(entries)
    }

    /// Every note of a space's Inbox, stamped (the Home's widened view).
    pub fn inbox_notes_in(&self, space: &str) -> Result<Vec<NoteEntry>> {
        let mut entries = self.note_folder(space)?.inbox_notes()?;
        self.stamp_notes(space, &mut entries);
        Ok(entries)
    }

    /// The notes of a space created today, stamped (the Home's day).
    pub fn notes_created_today_in(&self, space: &str) -> Result<Vec<NoteEntry>> {
        let mut entries = self.note_folder(space)?.created_on(self.today())?;
        self.stamp_notes(space, &mut entries);
        Ok(entries)
    }

    /// Every folder of a notes space, with what the space remembers about it
    /// (`crate::space::FolderSettings`) — one answer, so no screen keeps the
    /// disk and `.space.json` in step itself.
    pub fn note_folder_entries(&self, space: &str) -> Result<Vec<NoteFolderEntry>> {
        let settings = self.open_space(space)?.config.folders;
        Ok(self
            .note_folder(space)?
            .folders()?
            .into_iter()
            .map(|path| {
                let own = settings.get(&path).cloned().unwrap_or_default();
                NoteFolderEntry {
                    path,
                    color: own.color,
                    pinned: own.pinned,
                }
            })
            .collect())
    }

    /// Changes what the space remembers about one of its folders. An entry
    /// left with nothing to say is removed, so clearing a colour leaves the
    /// file as it was before the colour was ever chosen.
    pub fn set_note_folder(
        &self,
        space: &str,
        folder: &str,
        change: impl FnOnce(&mut crate::space::FolderSettings),
    ) -> Result<()> {
        self.ensure_writable()?;
        self.with_space_config(space, |config| {
            let entry = config.folders.entry(folder.to_string()).or_default();
            change(entry);
            if entry.is_empty() {
                config.folders.remove(folder);
            }
        })
    }

    /// Renames a folder of notes, carrying its colour and its pin along
    /// (half of what a folder IS lives in the space's config). Subfolders
    /// travel too — they are keyed by a path that starts with the old one.
    pub fn rename_note_folder(&self, space: &str, folder: &str, name: &str) -> Result<String> {
        self.ensure_writable()?;
        let moved = self.note_folder(space)?.rename_folder(folder, name)?;
        self.move_folder_settings(space, folder, Some(&moved))?;
        let (was, now) = (seen::address_of(space, folder), seen::address_of(space, &moved));
        self.seen_moved(&was, &now);
        self.logged_moved_under(&was, &now);
        Ok(moved)
    }

    /// Deletes a folder of notes (what was inside moves up a level), and
    /// forgets what the space remembered about it.
    pub fn delete_note_folder(&self, space: &str, folder: &str) -> Result<usize> {
        self.ensure_writable()?;
        let moved = self.note_folder(space)?.delete_folder(folder)?;
        // The subfolders moved UP rather than away, so their settings are not
        // dropped — they are re-keyed to where they landed.
        self.move_folder_settings(space, folder, None)?;
        // And so is what the "seen" index knew about the notes inside.
        let (parent, _) = crate::relpath::split_parent(folder);
        let (was, now) = (
            seen::address_of(space, folder),
            seen::address_of(space, parent),
        );
        self.seen_moved(&was, &now);
        self.logged_moved_under(&was, &now);
        Ok(moved)
    }

    /// Re-keys the settings of `from` and everything under it. `to` is where
    /// the folder itself went; `None` means it is gone and its children moved
    /// up to its parent (which is what deleting a folder does).
    fn move_folder_settings(&self, space: &str, from: &str, to: Option<&str>) -> Result<()> {
        self.with_space_config(space, |config| {
            let prefix = format!("{from}/");
            let touched: Vec<String> = config
                .folders
                .keys()
                .filter(|key| *key == from || key.starts_with(&prefix))
                .cloned()
                .collect();
            let (parent, _) = crate::relpath::split_parent(from);
            for key in touched {
                let Some(settings) = config.folders.remove(&key) else {
                    continue;
                };
                let landed = match (key == from, to) {
                    // The folder itself, renamed.
                    (true, Some(to)) => Some(to.to_string()),
                    // The folder itself, deleted: nothing is left to carry.
                    (true, None) => None,
                    // Something under it.
                    (false, Some(to)) => Some(format!("{to}/{}", &key[prefix.len()..])),
                    (false, None) => Some(if parent.is_empty() {
                        key[prefix.len()..].to_string()
                    } else {
                        format!("{parent}/{}", &key[prefix.len()..])
                    }),
                };
                if let Some(landed) = landed {
                    config.folders.insert(landed, settings);
                }
            }
        })
    }

    // The guarded doors to a note: `NoteFolder` has no idea whether the
    // notebook may write (`ensure_writable` lives here), so every write the
    // interface asks for goes through the notebook, never a bare `NoteFolder`.

    /// Replaces a note's body. The folder adopts today as its creation date if
    /// it does not have one — the lazy frontmatter's one writing moment.
    pub fn write_note(&self, space: &str, path: &str, body: &str) -> Result<()> {
        self.ensure_writable()?;
        self.note_folder(space)?.write(path, body, self.today())?;
        // Editing is seeing. The other half — opening one — is the bridge's
        // call, since only it can tell reading-to-show from reading-to-scan.
        let _ = self.mark_note_seen(space, path);
        Ok(())
    }

    /// Creates a note and returns its address.
    pub fn create_note(&self, space: &str, in_folder: &str, title: &str) -> Result<String> {
        self.ensure_writable()?;
        let path = self.note_folder(space)?.create(in_folder, title, self.today())?;
        self.logged_note_born(space, &path, self.today());
        Ok(path)
    }

    /// Files a quickly-captured text as a note, returning its address.
    pub fn quick_capture_note(&self, space: &str, in_folder: &str, text: &str) -> Result<String> {
        self.ensure_writable()?;
        let path = self.note_folder(space)?.quick_capture(in_folder, text, self.today())?;
        self.logged_note_born(space, &path, self.today());
        Ok(path)
    }

    /// Moves a note to another folder inside the same space. Returns the new
    /// address. Crossing into another space is [`Notebook::move_note_to_space`].
    pub fn move_note(&self, space: &str, path: &str, to_folder: &str) -> Result<String> {
        self.ensure_writable()?;
        let moved = self.note_folder(space)?.move_to(path, to_folder)?;
        let (was, now) = (seen::address_of(space, path), seen::address_of(space, &moved));
        self.seen_moved(&was, &now);
        self.logged_note_moved(&was, &now);
        Ok(moved)
    }

    /// Keeps a note at the top of the board, or stops.
    pub fn set_note_pinned(&self, space: &str, path: &str, pinned: bool) -> Result<()> {
        self.ensure_writable()?;
        self.note_folder(space)?.set_pinned(path, pinned)
    }

    /// Replaces a note's tags — its subjects, in the `tags:` property.
    pub fn set_note_tags(&self, space: &str, path: &str, tags: &[String]) -> Result<()> {
        self.ensure_writable()?;
        self.note_folder(space)?.set_tags(path, tags)
    }

    /// Sets — or clears, with `None` — a note's banner.
    pub fn set_note_banner(
        &self,
        space: &str,
        path: &str,
        banner: Option<crate::note::Banner>,
    ) -> Result<()> {
        self.ensure_writable()?;
        self.note_folder(space)?.set_banner(path, banner)
    }

    /// Creates a folder of notes inside a space.
    pub fn create_note_folder(&self, space: &str, path: &str) -> Result<()> {
        self.ensure_writable()?;
        self.note_folder(space)?.create_folder(path)
    }

    /// Deletes a note (a file inside a notes space), sending it to the trash.
    pub fn delete_note(&self, folder: &str, relative: &str) -> Result<()> {
        self.ensure_writable()?;
        let note_folder = self.note_folder(folder)?;
        let abs = note_folder.note_path(relative)?;
        self.trash_path(&abs)?;
        let address = seen::address_of(folder, relative);
        self.seen_gone(&address);
        self.logged_note_gone(&address, crate::timeline::Event::Deleted);
        Ok(())
    }

    /// Copies a note beside itself, returning the new address.
    pub fn duplicate_note(&self, folder: &str, relative: &str) -> Result<String> {
        self.ensure_writable()?;
        let copy = self.note_folder(folder)?.duplicate(relative)?;
        // A copy is a new thing, born today — it is not the note it came from
        // wearing a second address.
        self.logged_note_born(folder, &copy, self.today());
        Ok(copy)
    }

    /// Moves a note to another notes space, into `to_folder` inside it;
    /// returns the new address, relative to the space it landed in. Nothing
    /// in the note is rewritten: asset addresses are relative to the notebook
    /// ROOT, so an image keeps pointing at the same file however far it travels.
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
            // Within one space, `move_note` is the path that keeps the index
            // pointing at the note.
            return self.move_note(from_space, relative, to_folder);
        }

        let dir = target_space.folder_path(to_folder)?;
        std::fs::create_dir_all(&dir).ctx(&dir)?;
        let name = crate::fsio::file_name_of(&source);
        // A note of the same name already there is not overwritten — the same
        // free-name dance every other move in the app goes through.
        let target = crate::fsio::free_name(&dir, &name);
        std::fs::rename(&source, &target).ctx(&target)?;
        let landed = crate::relpath::relative_slash(target_space.dir(), &target);
        let (was, now) = (
            seen::address_of(from_space, relative),
            seen::address_of(to_space, &landed),
        );
        self.seen_moved(&was, &now);
        self.logged_note_moved(&was, &now);
        Ok(landed)
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

    /// Sends an asset to the notebook's trash — never `remove_file`: the
    /// notes that pointed at it draw a missing image until it comes back.
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

    /// Renames a note, and follows it into every note that links to it: a
    /// note link carries the TITLE (`crate::links`), which goes stale the
    /// instant it is renamed. The rename happens first — rewriting links to a
    /// note that failed to be renamed would point them at nothing.
    pub fn rename_note(&self, folder: &str, path: &str, title: &str) -> Result<String> {
        self.ensure_writable()?;
        let notes = self.note_folder(folder)?;
        let was = crate::notefolder::title_of(path);
        let moved = notes.rename(path, title)?;
        let now = crate::notefolder::title_of(&moved);
        self.retarget_note_links(&was, &now)?;
        let (before, after) = (seen::address_of(folder, path), seen::address_of(folder, &moved));
        self.seen_moved(&before, &after);
        self.logged_note_moved(&before, &after);
        Ok(moved)
    }

    /// Points every `[[link]]` at `new` instead of `old`, notebook-wide: a
    /// note in one space may well link to one in another.
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

    /// Renames a file of the library, and follows it everywhere (which forms
    /// are rewritten: [`crate::links`]; the banner apart, since the core lifts
    /// it off the body; a task's attachment as a field). The file moves first;
    /// a colliding name is suffixed, and the address returned is the one taken.
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
        let mut taken = crate::fsio::file_name_of(&target);
        if taken.is_empty() {
            taken = wanted;
        }

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

        for list in self.list_paths()? {
            let mut tasks = self.open_list(&list.path)?;
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
        Ok(())
    }

    /// Where each file of the library is used, keyed by its address; a file
    /// nobody points at has no entry. A place is a [`SearchHit`], the shape
    /// the interface already draws and opens. **Matched by exact reference,
    /// not by parsing**: `[[/name]]` or `assets/name`, one pass per file per note.
    pub fn asset_usage(&self) -> Result<std::collections::HashMap<String, Vec<SearchHit>>> {
        let mut used: std::collections::HashMap<String, Vec<SearchHit>> =
            std::collections::HashMap::new();
        let names: Vec<String> = self.assets().list()?.into_iter().map(|a| a.name).collect();
        if names.is_empty() {
            return Ok(used);
        }
        let labels = self.space_labels()?;

        for (prefix, folder) in self.note_folders()? {
            let space = space_label_of(&labels, &prefix);
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

        for list in self.list_paths()? {
            let space = space_label_of(&labels, &list.prefix);
            for task in self.open_list(&list.path)?.tasks() {
                for file in &task.files {
                    used.entry(file.address.clone()).or_default().push(SearchHit {
                        kind: HitKind::Task,
                        path: list.path.clone(),
                        folder: String::new(),
                        id: task.id.clone(),
                        title: task.text.clone(),
                        snippet: String::new(),
                        space: space.clone(),
                        container: list.name.clone(),
                        done: task.done,
                    });
                }
            }
        }

        Ok(used)
    }
}

/// The name a rename asks for, checked as a file name. An extension left
/// off is taken from the old name: `IMG_2049.jpg` → `férias` means `férias.jpg`.
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
