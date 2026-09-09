//! A folder of notes — what a `notes` space owns. The counterpart of
//! [`crate::folder::TaskFolder`], and deliberately not a generalisation of
//! it: notes are whole documents in a free folder tree, lists are lines with
//! state in a flat folder. Shared infrastructure (atomic writes, safe paths,
//! the watcher), never a shared type.

use std::path::{Path, PathBuf};

use chrono::{NaiveDate, NaiveDateTime};

use crate::error::{Error, IoContext, Result};
use crate::note::Note;
use crate::relpath;

/// Default folder for loose notes (spec 5).
pub const NOTES_INBOX: &str = "Inbox";

const EXTENSION: &str = "md";

/// A note as a listing shows it: address, title, and enough to draw a card.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteEntry {
    /// Address relative to the space folder (`Ideias/receita.md`).
    pub path: String,
    /// The file stem — notes are titled by their file name, like lists.
    pub title: String,
    /// Folder holding it, relative to the space (`""` at the root).
    pub folder: String,
    pub preview: String,
    pub created: Option<NaiveDate>,
    pub pinned: bool,
    /// The note's subjects (`tags:` in its properties) — what the card's
    /// badges draw and a `#name` search answers with.
    pub tags: Vec<String>,
    /// The head of the note, when it has one (`crate::note::Banner`). The card
    /// draws it; a note without one is a card with a title and nothing above
    /// it, which is the default.
    pub banner: Option<crate::note::Banner>,
    /// When a person last had this note open (`crate::seen`), or `None` for a
    /// note this build has never seen opened. Filled by the notebook, which
    /// is the only thing that holds the index — a folder on its own knows
    /// nothing about it.
    pub seen: Option<chrono::NaiveDateTime>,
    /// How old the note is, banded (`crate::age`). Filled beside `seen`, and
    /// `None` on a note with no creation date, which is the one case where
    /// the app has nothing to count from.
    pub age: Option<crate::age::Age>,
}

/// A directory holding notes and folders of notes. Cheap to build: it is a
/// path, not a cache — every method reads the disk.
#[derive(Debug, Clone)]
pub struct NoteFolder {
    dir: PathBuf,
}

impl NoteFolder {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Resolves a note address relative to this folder.
    pub fn note_path(&self, relative: &str) -> Result<PathBuf> {
        let invalid = || Error::InvalidNotePath(relative.to_string());
        if !relative.ends_with(&format!(".{EXTENSION}")) {
            return Err(invalid());
        }
        relpath::safe_join(&self.dir, relative).ok_or_else(invalid)
    }

    /// Resolves a folder address relative to this folder. `""` is the root.
    pub fn folder_path(&self, relative: &str) -> Result<PathBuf> {
        if relative.is_empty() {
            return Ok(self.dir.clone());
        }
        relpath::safe_join(&self.dir, relative)
            .ok_or_else(|| Error::InvalidNotePath(relative.to_string()))
    }

    /// Recreates the default `Inbox` folder when missing, the same courtesy
    /// the two fixed files of a tasks space get. Called on every open (for
    /// the fixed Notes space) and when a notes space is created.
    pub fn ensure_default_folders(&self) -> Result<()> {
        let inbox = self.dir.join(NOTES_INBOX);
        std::fs::create_dir_all(&inbox).ctx(&inbox)?;
        Ok(())
    }

    /// Every folder in the subtree, relative to this one, alphabetically.
    pub fn folders(&self) -> Result<Vec<String>> {
        let mut found = Vec::new();
        self.walk(&self.dir, &mut |path, relative| {
            if path.is_dir() {
                found.push(relative.to_string());
            }
            Ok(())
        })?;
        found.sort();
        Ok(found)
    }

    /// Every note in the subtree, ready to list: pinned first, then newest,
    /// then by title. Reading **never writes** — which is why `created` is
    /// adopted on save and not here.
    pub fn notes(&self) -> Result<Vec<NoteEntry>> {
        let mut found: Vec<NoteEntry> = Vec::new();
        self.walk(&self.dir, &mut |path, relative| {
            if !is_note_file(path) {
                return Ok(());
            }
            let text = std::fs::read_to_string(path).ctx(path)?;
            let note = Note::parse(&text);
            let (folder, title) = split_relative(relative);
            let preview = note.preview(&title);
            found.push(NoteEntry {
                path: relative.to_string(),
                title,
                folder,
                preview,
                created: note.created,
                pinned: note.pinned,
                tags: note.tags,
                banner: note.banner,
                // Stamped by the notebook on the way out (`notebook::age`):
                // reading a folder answers what is in it, and how old that is
                // is a question about the notebook around it.
                seen: None,
                age: None,
            });
            Ok(())
        })?;

        found.sort_by(|a, b| {
            b.pinned
                .cmp(&a.pinned)
                .then_with(|| b.created.cmp(&a.created))
                .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
        });
        Ok(found)
    }

    /// How many notes live under `relative`, without reading a single one —
    /// the picker asks this of every notebook it lists (`Notebook::summarize`),
    /// and `notes()` parses every file, the wrong price for a number on a card.
    pub fn count(&self, relative: &str) -> Result<usize> {
        let dir = self.folder_path(relative)?;
        let mut found = 0;
        self.walk(&dir, &mut |path, _| {
            if is_note_file(path) {
                found += 1;
            }
            Ok(())
        })?;
        Ok(found)
    }

    /// Every note's address, without reading a single one — for the parts of
    /// the app that key on the address alone (the "last seen" index,
    /// `crate::seen`) and would parse every file to learn nothing they use.
    pub fn note_paths(&self) -> Result<Vec<String>> {
        let mut found = Vec::new();
        self.walk(&self.dir, &mut |path, relative| {
            if is_note_file(path) {
                found.push(relative.to_string());
            }
            Ok(())
        })?;
        Ok(found)
    }

    /// Notes whose title or text matches `query`. An empty query is every
    /// note, so the search box starts showing everything.
    pub fn search(&self, query: &str) -> Result<Vec<NoteEntry>> {
        let needle = query.trim().to_lowercase();
        if needle.is_empty() {
            return self.notes();
        }

        let mut found = Vec::new();
        for entry in self.notes()? {
            if entry.title.to_lowercase().contains(&needle) {
                found.push(entry);
                continue;
            }
            // Only now pay for reading the body.
            let note = self.read(&entry.path)?;
            if note.matches(&needle) {
                found.push(entry);
            }
        }
        Ok(found)
    }

    /// Notes created on `date` — what the Home screen shows. The Home has no
    /// notes of its own: it is a view filtered by `created`, so nothing moves
    /// on the turn of the day. A note with no `created` (written outside the
    /// app) never shows up here — inventing a date would be worse.
    pub fn created_on(&self, date: NaiveDate) -> Result<Vec<NoteEntry>> {
        Ok(self
            .notes()?
            .into_iter()
            .filter(|note| note.created == Some(date))
            .collect())
    }

    /// Every note of the Inbox, whatever day it was written — the Home's other
    /// mode (`homeShowsAllInboxNotes`). Still a VIEW: nothing is moved or written.
    pub fn inbox_notes(&self) -> Result<Vec<NoteEntry>> {
        Ok(self
            .notes()?
            .into_iter()
            .filter(|note| note.folder == NOTES_INBOX)
            .collect())
    }

    /// Writes a note from a single blob of text — the Home's quick capture.
    ///
    /// The first line becomes the title, the whole text the body: someone
    /// jotting an idea types the idea, not a file name. Returns the address.
    pub fn quick_capture(
        &self,
        folder: &str,
        text: &str,
        today: NaiveDate,
    ) -> Result<String> {
        let title = title_from(text);
        let path = self.create(folder, &title, today)?;
        self.write(&path, text, today)?;
        Ok(path)
    }

    pub fn read(&self, relative: &str) -> Result<Note> {
        let path = self.note_path(relative)?;
        let text = std::fs::read_to_string(&path).ctx(&path)?;
        Ok(Note::parse(&text))
    }

    /// Replaces a note's body, adopting `today` as its creation date if it
    /// does not have one yet — the lazy frontmatter's one writing moment.
    pub fn write(&self, relative: &str, body: &str, today: NaiveDate) -> Result<()> {
        let path = self.note_path(relative)?;
        let mut note = match std::fs::read_to_string(&path) {
            Ok(text) => Note::parse(&text),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Note::default(),
            Err(e) => return Err(Error::Io { path, source: e }),
        };
        note.body = body.to_string();
        note.adopt_created(today);
        crate::fsio::write_atomically(&path, note.render().as_bytes())
    }

    /// Keeps the note AS IT IS ON DISK beside itself, under the name Syncthing
    /// gives a conflicting copy (`Ideia.sync-conflict-20260909-031448-JOTTAPP.md`),
    /// so the app's own conflict handling shows it. For the moment an editor
    /// is about to write over a version somebody else left there. Answers
    /// the copy's address; `None` when there is nothing on disk to keep.
    pub fn keep_conflict_copy(&self, relative: &str, now: NaiveDateTime) -> Result<Option<String>> {
        let path = self.note_path(relative)?;
        let bytes = match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(Error::Io { path, source: e }),
        };
        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let name = format!(
            "{stem}{}{}-JOTTAPP.{EXTENSION}",
            crate::conflict::MARKER,
            now.format("%Y%m%d-%H%M%S")
        );
        let dir = path.parent().unwrap_or(&self.dir);
        let copy = crate::fsio::free_name(dir, &name);
        crate::fsio::write_atomically(&copy, &bytes)?;
        Ok(Some(relpath::relative_slash(&self.dir, &copy)))
    }

    /// Creates a note in `folder`, returning its address.
    ///
    /// A title that collides gets a numeric suffix rather than overwriting
    /// what is there — losing a note to a name clash would be silent.
    pub fn create(&self, folder: &str, title: &str, today: NaiveDate) -> Result<String> {
        let title = sanitize_title(title)?;
        let dir = self.folder_path(folder)?;
        std::fs::create_dir_all(&dir).ctx(&dir)?;

        // A colliding title is suffixed, never overwritten — the same free-name
        // dance every move in the app goes through (`fsio::free_name`).
        let file = crate::fsio::free_name(&dir, &format!("{title}.{EXTENSION}"));
        let name = crate::fsio::file_name_of(&file);
        let relative = join_relative(folder, &name);
        let mut note = Note::default();
        note.adopt_created(today);
        crate::fsio::write_atomically(&self.note_path(&relative)?, note.render().as_bytes())?;
        Ok(relative)
    }

    // Deleting a note is **not** here on purpose: `Notebook::delete_note`
    // files it in `.jott/trash/` with a record of where it came from, so it
    // can be restored. A door to the OS trash would be a second way out with
    // no restore, one Android does not have and a synced notebook cannot carry.

    /// Renames a note inside its folder, returning the new address.
    pub fn rename(&self, relative: &str, title: &str) -> Result<String> {
        let title = sanitize_title(title)?;
        let source = self.note_path(relative)?;
        let (folder, _) = split_relative(relative);
        self.relocate_note(&source, &folder, &title, || {
            Error::InvalidNotePath(format!("{title} already exists"))
        })
    }

    /// Moves a note to another folder, returning the new address.
    pub fn move_to(&self, relative: &str, folder: &str) -> Result<String> {
        let source = self.note_path(relative)?;
        let (_, title) = split_relative(relative);
        let dir = self.folder_path(folder)?;
        std::fs::create_dir_all(&dir).ctx(&dir)?;
        self.relocate_note(&source, folder, &title, || {
            Error::InvalidNotePath(format!("{title} already exists in {folder}"))
        })
    }

    /// The move under `rename` and `move_to`: the note at `source` becomes
    /// `folder/title.md`. Landing on itself is a no-op; landing on another
    /// note is refused with the caller's own error, since each door words the
    /// collision differently.
    fn relocate_note(
        &self,
        source: &Path,
        folder: &str,
        title: &str,
        taken: impl FnOnce() -> Error,
    ) -> Result<String> {
        let target_relative = join_relative(folder, &format!("{title}.{EXTENSION}"));
        let target = self.note_path(&target_relative)?;

        if target == *source {
            return Ok(target_relative);
        }
        if target.exists() {
            return Err(taken());
        }
        std::fs::rename(source, &target).ctx(&target)?;
        Ok(target_relative)
    }

    /// Copies a note beside itself, returning the new address. The file is
    /// copied VERBATIM — frontmatter, banner and body: a duplicate claims the
    /// day the original was written on, not today. Only the name differs,
    /// decided by `free_name` like every other collision.
    pub fn duplicate(&self, relative: &str) -> Result<String> {
        let source = self.note_path(relative)?;
        let (folder, title) = split_relative(relative);
        let dir = self.folder_path(&folder)?;
        let target = crate::fsio::free_name(&dir, &format!("{title}.{EXTENSION}"));
        let bytes = std::fs::read(&source).ctx(&source)?;
        crate::fsio::write_atomically(&target, &bytes)?;
        Ok(crate::relpath::relative_slash(&self.dir, &target))
    }

    /// Sets — or clears, with `None` — the note's banner. Reads, changes the
    /// one line, writes: everything else in the file is exactly what it was.
    pub fn set_banner(&self, relative: &str, banner: Option<crate::note::Banner>) -> Result<()> {
        self.edit(relative, |note| note.banner = banner)
    }

    /// Reads a note, lets `change` mutate it, writes it back — behind every
    /// setter that edits one field. `write` is deliberately not one of them:
    /// it tolerates a missing file and adopts a creation date, right for a
    /// person's edit and wrong for the app's own bookkeeping.
    fn edit(&self, relative: &str, change: impl FnOnce(&mut Note)) -> Result<()> {
        let path = self.note_path(relative)?;
        let text = std::fs::read_to_string(&path).ctx(&path)?;
        let mut note = Note::parse(&text);
        change(&mut note);
        crate::fsio::write_atomically(&path, note.render().as_bytes())
    }

    /// Writes a body and/or a banner in one pass, leaving alone whatever is
    /// `None` — for a rewrite that follows a renamed file into every note
    /// that mentions it. Not `write`: that one adopts a creation date, and a
    /// note the app touched on its own account should look untouched.
    pub fn rewrite(
        &self,
        relative: &str,
        body: Option<String>,
        banner: Option<crate::note::Banner>,
    ) -> Result<()> {
        if body.is_none() && banner.is_none() {
            return Ok(());
        }
        self.edit(relative, |note| {
            if let Some(body) = body {
                note.body = body;
            }
            if let Some(banner) = banner {
                note.banner = Some(banner);
            }
        })
    }

    pub fn set_pinned(&self, relative: &str, pinned: bool) -> Result<()> {
        self.edit(relative, |note| note.pinned = pinned)
    }

    /// Replaces a note's tags (its `tags:` property); an empty list takes
    /// the property out of the file.
    pub fn set_tags(&self, relative: &str, tags: &[String]) -> Result<()> {
        self.edit(relative, |note| note.set_tags(tags))
    }

    pub fn create_folder(&self, relative: &str) -> Result<()> {
        let path = self.folder_path(relative)?;
        std::fs::create_dir_all(&path).ctx(&path)?;
        Ok(())
    }

    /// Renames a folder in place, keeping its parent. Returns the new
    /// address.
    pub fn rename_folder(&self, relative: &str, name: &str) -> Result<String> {
        self.refuse_if_protected(relative)?;
        let name = sanitize_title(name)?;
        let source = self.folder_path(relative)?;
        if !source.is_dir() {
            return Err(Error::InvalidNotePath(relative.to_string()));
        }

        let (parent, _) = split_folder(relative);
        let target_relative = join_relative(&parent, &name);
        let target = self.folder_path(&target_relative)?;
        if target == source {
            return Ok(target_relative);
        }
        if target.exists() {
            return Err(Error::InvalidNotePath(format!("{name} already exists")));
        }
        std::fs::rename(&source, &target).ctx(&target)?;
        Ok(target_relative)
    }

    /// Deletes a folder, **moving what was inside up to its parent**: a
    /// filing decision, not a decision to throw notes away (same rule as
    /// `delete_list`). Subfolders move up whole. Returns how many moved.
    pub fn delete_folder(&self, relative: &str) -> Result<usize> {
        self.refuse_if_protected(relative)?;
        let dir = self.folder_path(relative)?;
        if !dir.is_dir() || relative.is_empty() {
            return Err(Error::InvalidNotePath(relative.to_string()));
        }

        let (parent, _) = split_folder(relative);
        let parent_dir = self.folder_path(&parent)?;
        let mut moved = 0;

        // The folder is known to exist (checked above), so the empty-on-missing
        // behaviour of `dir_paths` never applies here.
        for path in crate::fsio::dir_paths(&dir)? {
            let name = crate::fsio::file_name_of(&path);
            let target = crate::fsio::free_name(&parent_dir, &name);
            std::fs::rename(&path, &target).ctx(&target)?;
            moved += 1;
        }

        // Only the now-empty folder goes away. `remove_dir`, not
        // `remove_dir_all`: if anything is still in there, something went
        // wrong above and erasing it would be the worst possible recovery.
        std::fs::remove_dir(&dir).ctx(&dir)?;
        Ok(moved)
    }

    /// The space's `Inbox` is recreated on every open, so renaming or
    /// deleting it would only confuse the user.
    fn refuse_if_protected(&self, relative: &str) -> Result<()> {
        if relative == NOTES_INBOX {
            return Err(Error::Protected(relative.to_string()));
        }
        Ok(())
    }

    /// Walks the subtree, skipping hidden entries and sync conflicts.
    fn walk(
        &self,
        dir: &Path,
        visit: &mut impl FnMut(&Path, &str) -> Result<()>,
    ) -> Result<()> {
        for path in crate::fsio::dir_paths(dir)? {
            // A hidden entry is the app's or another tool's business, and a
            // conflicting copy is not a note the user wrote.
            if crate::fsio::is_hidden(&path) || crate::conflict::is_conflict_file(&path) {
                continue;
            }

            let relative = relpath::relative_slash(&self.dir, &path);
            visit(&path, &relative)?;
            if path.is_dir() {
                self.walk(&path, visit)?;
            }
        }
        Ok(())
    }
}

fn is_note_file(path: &Path) -> bool {
    path.is_file() && path.extension().is_some_and(|ext| ext == EXTENSION)
}

/// The title a note's address ends in — the file stem, which is how a note
/// is named in this app and what a `[[link]]` carries.
pub fn title_of(relative: &str) -> String {
    let leaf = crate::relpath::leaf_of(relative);
    leaf.strip_suffix(&format!(".{EXTENSION}")).unwrap_or(leaf).to_string()
}

/// Splits a note address into folder and title: `Ideias/receita.md` →
/// (`Ideias`, `receita`).
fn split_relative(relative: &str) -> (String, String) {
    let stem = relative
        .strip_suffix(&format!(".{EXTENSION}"))
        .unwrap_or(relative);
    split_folder(stem)
}

/// Splits a folder address into parent and name: `Clientes/Acme` →
/// (`Clientes`, `Acme`).
fn split_folder(relative: &str) -> (String, String) {
    let (parent, name) = crate::relpath::split_parent(relative);
    (parent.to_string(), name.to_string())
}

fn join_relative(folder: &str, name: &str) -> String {
    if folder.is_empty() {
        name.to_string()
    } else {
        format!("{folder}/{name}")
    }
}

/// The title a blob of text gets when the user did not give one: its first
/// non-empty line, trimmed to something that reads as a name.
fn title_from(text: &str) -> String {
    const MAX: usize = 60;
    let first = text
        .lines()
        .map(str::trim)
        // A pasted markdown heading is still the title, without its `#`.
        .map(|line| line.trim_start_matches('#').trim())
        .find(|line| !line.is_empty())
        .unwrap_or_default();

    let mut title = String::new();
    for word in first.split_whitespace() {
        if !title.is_empty() && title.len() + word.len() + 1 > MAX {
            break;
        }
        if !title.is_empty() {
            title.push(' ');
        }
        title.push_str(word);
    }
    // Only when there is genuinely nothing to name it after.
    if title.is_empty() {
        "Untitled".to_string()
    } else {
        title
    }
}

/// A title becomes a file name, so it has to survive being one.
fn sanitize_title(title: &str) -> Result<String> {
    let cleaned = title.trim().replace(['/', '\\', '\0'], "-");
    let cleaned = cleaned.trim().trim_start_matches('.').trim().to_string();
    if cleaned.is_empty() {
        return Err(Error::InvalidNotePath(title.to_string()));
    }
    Ok(cleaned)
}
