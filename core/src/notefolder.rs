//! A folder of notes — what a `notes` space owns.
//!
//! The counterpart of [`crate::folder::TaskFolder`], and deliberately not a
//! generalisation of it: notes are whole documents in a free folder tree,
//! lists are lines with state in a flat folder. Sharing a type would be the
//! wrong abstraction (spec 5 — separate worlds); sharing the *infrastructure*
//! — atomic writes, safe paths, the watcher — is the right one.

use std::path::{Path, PathBuf};

use chrono::NaiveDate;

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
    /// The head of the note, when it has one (`crate::note::Banner`). The card
    /// draws it; a note without one is a card with a title and nothing above
    /// it, which is the default.
    pub banner: Option<crate::note::Banner>,
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
    /// `Inbox.md` gets on the tasks side.
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

    /// Every note in the subtree, ready to list.
    ///
    /// Sorted the way a board reads: pinned first, then newest, then by
    /// title. Reading **never writes** — a folder browsed is a folder
    /// untouched, which is why `created` is adopted on save and not here.
    pub fn notes(&self) -> Result<Vec<NoteEntry>> {
        let mut found: Vec<NoteEntry> = Vec::new();
        self.walk(&self.dir, &mut |path, relative| {
            if !is_note_file(path) {
                return Ok(());
            }
            let text = std::fs::read_to_string(path).ctx(path)?;
            let note = Note::parse(&text);
            let (folder, title) = split_relative(relative);
            found.push(NoteEntry {
                path: relative.to_string(),
                title,
                folder,
                preview: note.preview(),
                created: note.created,
                pinned: note.pinned,
                banner: note.banner,
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

    /// Notes created on `date` — what the Home screen shows.
    ///
    /// The Home has **no notes of its own** (spec 5): it is a view of the
    /// inbox filtered by `created`, so nothing is ever moved on the turn of
    /// the day. A note written by hand outside the app has no `created` and
    /// therefore never shows up here — correct, since the app has no idea
    /// when it was written and inventing a date would be worse.
    pub fn created_on(&self, date: NaiveDate) -> Result<Vec<NoteEntry>> {
        Ok(self
            .notes()?
            .into_iter()
            .filter(|note| note.created == Some(date))
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
        let name = file
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let relative = join_relative(folder, &name);
        let mut note = Note::default();
        note.adopt_created(today);
        crate::fsio::write_atomically(&self.note_path(&relative)?, note.render().as_bytes())?;
        Ok(relative)
    }

    // Deleting a note is **not** here on purpose. It goes through
    // `Notebook::delete_note`, which files the note in the notebook's own
    // trash (`.jott/trash/`) with a record of where it came from, so it can be
    // restored. A `NoteFolder::delete` that reached the OS trash lived here
    // until 2026-08-04: a second way out, with no restore, that Android does
    // not have and a synced notebook cannot carry.

    /// Renames a note inside its folder, returning the new address.
    pub fn rename(&self, relative: &str, title: &str) -> Result<String> {
        let title = sanitize_title(title)?;
        let source = self.note_path(relative)?;
        let (folder, _) = split_relative(relative);
        let target_relative = join_relative(&folder, &format!("{title}.{EXTENSION}"));
        let target = self.note_path(&target_relative)?;

        if target == source {
            return Ok(target_relative);
        }
        if target.exists() {
            return Err(Error::InvalidNotePath(format!("{title} already exists")));
        }
        std::fs::rename(&source, &target).ctx(&target)?;
        Ok(target_relative)
    }

    /// Moves a note to another folder, returning the new address.
    pub fn move_to(&self, relative: &str, folder: &str) -> Result<String> {
        let source = self.note_path(relative)?;
        let (_, title) = split_relative(relative);
        let dir = self.folder_path(folder)?;
        std::fs::create_dir_all(&dir).ctx(&dir)?;

        let target_relative = join_relative(folder, &format!("{title}.{EXTENSION}"));
        let target = self.note_path(&target_relative)?;
        if target == source {
            return Ok(target_relative);
        }
        if target.exists() {
            return Err(Error::InvalidNotePath(format!(
                "{title} already exists in {folder}"
            )));
        }
        std::fs::rename(&source, &target).ctx(&target)?;
        Ok(target_relative)
    }

    /// Copies a note beside itself, returning the new address.
    ///
    /// The file is copied VERBATIM — frontmatter, banner and body. A duplicate
    /// of a note is that note, including the day it says it was written on:
    /// stamping today's date on it would make the copy claim to be something
    /// it is not, and the one thing that has to differ (the name, which is the
    /// title) is decided by `free_name` the same way every other collision in
    /// the app is.
    pub fn duplicate(&self, relative: &str) -> Result<String> {
        let source = self.note_path(relative)?;
        let (folder, title) = split_relative(relative);
        let dir = self.folder_path(&folder)?;
        let target = crate::fsio::free_name(&dir, &format!("{title}.{EXTENSION}"));
        let bytes = std::fs::read(&source).ctx(&source)?;
        crate::fsio::write_atomically(&target, &bytes)?;
        Ok(crate::relpath::relative_slash(&self.dir, &target))
    }

    /// Sets — or clears, with `None` — the note's banner.
    ///
    /// Reads, changes the one line, writes: everything else in the file,
    /// frontmatter and body alike, is exactly what it was. The same shape as
    /// `set_pinned`, and for the same reason: the file is the user's.
    pub fn set_banner(&self, relative: &str, banner: Option<crate::note::Banner>) -> Result<()> {
        let path = self.note_path(relative)?;
        let text = std::fs::read_to_string(&path).ctx(&path)?;
        let mut note = Note::parse(&text);
        note.banner = banner;
        crate::fsio::write_atomically(&path, note.render().as_bytes())
    }

    /// Writes a body and/or a banner in one pass, leaving alone whatever is
    /// `None` — for a rewrite that follows a renamed file into every note
    /// that mentions it (2026-08-19).
    ///
    /// Not `write`: that one adopts a creation date, which is right when a
    /// person edits a note and wrong when the app is only repointing a link.
    /// A note the app touched on its own account should look untouched.
    pub fn rewrite(
        &self,
        relative: &str,
        body: Option<String>,
        banner: Option<crate::note::Banner>,
    ) -> Result<()> {
        if body.is_none() && banner.is_none() {
            return Ok(());
        }
        let path = self.note_path(relative)?;
        let text = std::fs::read_to_string(&path).ctx(&path)?;
        let mut note = Note::parse(&text);
        if let Some(body) = body {
            note.body = body;
        }
        if let Some(banner) = banner {
            note.banner = Some(banner);
        }
        crate::fsio::write_atomically(&path, note.render().as_bytes())
    }

    pub fn set_pinned(&self, relative: &str, pinned: bool) -> Result<()> {
        let path = self.note_path(relative)?;
        let text = std::fs::read_to_string(&path).ctx(&path)?;
        let mut note = Note::parse(&text);
        note.pinned = pinned;
        crate::fsio::write_atomically(&path, note.render().as_bytes())
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

    /// Deletes a folder, **moving what was inside up to its parent**.
    ///
    /// Deleting a folder is a filing decision, not a decision to throw notes
    /// away — the same rule `delete_list` follows on the tasks side
    /// (principle 2: the data is the user's). Subfolders move up whole, so
    /// the structure below survives too. Returns how many entries moved.
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
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
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

/// Splits a note address into folder and title: `Ideias/receita.md` →
/// (`Ideias`, `receita`).
/// The title a note's address ends in — the file stem, which is how a note
/// is named in this app and what a `[[link]]` carries.
pub fn title_of(relative: &str) -> String {
    let leaf = relative.rsplit('/').next().unwrap_or(relative);
    leaf.strip_suffix(&format!(".{EXTENSION}")).unwrap_or(leaf).to_string()
}

fn split_relative(relative: &str) -> (String, String) {
    let stem = relative.strip_suffix(".md").unwrap_or(relative);
    match stem.rsplit_once('/') {
        Some((folder, title)) => (folder.to_string(), title.to_string()),
        None => (String::new(), stem.to_string()),
    }
}

/// Splits a folder address into parent and name: `Clientes/Acme` →
/// (`Clientes`, `Acme`).
fn split_folder(relative: &str) -> (String, String) {
    match relative.rsplit_once('/') {
        Some((parent, name)) => (parent.to_string(), name.to_string()),
        None => (String::new(), relative.to_string()),
    }
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
