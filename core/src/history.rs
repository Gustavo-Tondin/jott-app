//! The session's history of actions on a notebook — what `Ctrl+Z` undoes.
//!
//! The notebook is a folder of text files, and every action the app offers
//! ends as a change to some of them: a delete moves a note into `.jott/trash/`
//! and adds a line to `trash.json`, a reorder rewrites `config.json`, a
//! completion moves a line between two `.md` files. So instead of teaching
//! fifty commands how to undo themselves — a rename that also repoints the
//! links in six other notes would need a very careful inverse — the history
//! records what each action DID to the files: the bytes every touched file
//! held before, and the bytes it holds after. Undo writes the "before" back,
//! redo the "after". One rule serves every action, including the ones not
//! written yet.
//!
//! It is a session thing: it lives in memory, per open notebook, and dies with
//! the window. Nothing about it reaches the disk, and a notebook opened twice
//! (two windows) has two histories that do not know each other — which is
//! also why an entry checks, before it is undone, that the files still hold
//! what it left there (`Error::Stale`): a sync tool, the other window or a
//! hand edit may have moved on, and undoing over that would destroy the
//! newer text.
//!
//! What is recorded is the notebook's TEXT files (`.md`, `.json`, `.txt`, up
//! to [`MAX_FILE_BYTES`]) and its directories. Anything else — the pictures
//! of `assets/`, a file too big — is watched by size and date only: an action
//! that changes one of those is not recorded at all, because an undo that put
//! the notes back but not the picture they point at would be half an undo.
//! The library screen keeps its own trash for that.
//!
//! The note being typed is deliberately NOT in here: the editor has its own
//! history (CodeMirror's), and the app one would fight it — see the bridge,
//! which does not route `write_note` through `record`. The same goes for the
//! task inspector's saves. Those writes are still the app's own, though, and
//! [`History::absorb`] folds them into the entry they land on: after "create
//! task" and a priority typed into the inspector, undo takes the task away
//! and redo brings it back WITH the priority — and neither is refused as a
//! change from outside.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;

use crate::error::{Error, IoContext, Result};
use crate::fsio;

/// How many actions the history keeps. Beyond it the oldest is forgotten.
pub const MAX_ENTRIES: usize = 100;
/// How many bytes of "before" and "after" the history holds at most; the
/// oldest entries go first. A delete of a large space is a few hundred
/// kilobytes — this is a cap against pathological notebooks, not a budget.
pub const MAX_TOTAL_BYTES: usize = 32 * 1024 * 1024;
/// A text file larger than this is watched, not recorded (see the module
/// doc). Notes are the small ones of the day; a megabyte is a book.
pub const MAX_FILE_BYTES: u64 = 1024 * 1024;

/// The extensions whose content is recorded.
const TEXT_EXTENSIONS: [&str; 3] = ["md", "json", "txt"];

/// The session history of one open notebook.
#[derive(Default)]
pub struct History {
    entries: Vec<Entry>,
    /// `entries[..done]` can be undone (the last one first);
    /// `entries[done..]` can be redone (the first one first).
    done: usize,
    /// The bytes read on the previous scan, by relative path, keyed on the
    /// file's size and date so an unchanged file is never read twice. Two
    /// scans per action over a notebook of a thousand notes would otherwise
    /// read a thousand files each.
    cache: HashMap<PathBuf, Cached>,
    /// The sum of every entry's bytes, against [`MAX_TOTAL_BYTES`].
    bytes: usize,
    /// The notebook as the last scan left it — what `absorb` diffs against.
    last: Option<Tree>,
}

struct Cached {
    stamp: Stamp,
    content: Arc<[u8]>,
}

/// What a file looked like without reading it.
#[derive(Clone, Copy, PartialEq, Eq)]
struct Stamp {
    modified: Option<SystemTime>,
    len: u64,
}

/// One action, as the changes it made.
#[derive(Debug)]
pub struct Entry {
    /// The action's name — the bridge passes the command's, and the screen
    /// turns it into words ("Undo: Delete note").
    label: String,
    files: Vec<FileChange>,
    /// Directories that appeared (`created`) or vanished (`removed`), for the
    /// empty ones no file change would bring back or take away.
    created_dirs: Vec<PathBuf>,
    removed_dirs: Vec<PathBuf>,
}

impl Entry {
    pub fn label(&self) -> &str {
        &self.label
    }

    fn touches(&self, path: &Path) -> bool {
        self.files.iter().any(|c| c.path == path)
    }

    fn bytes(&self) -> usize {
        self.files
            .iter()
            .map(|c| c.before.as_ref().map_or(0, |b| b.len()) + c.after.as_ref().map_or(0, |a| a.len()))
            .sum()
    }
}

#[derive(Debug)]
struct FileChange {
    /// Root-relative.
    path: PathBuf,
    /// `None` when the file did not exist.
    before: Option<Arc<[u8]>>,
    after: Option<Arc<[u8]>>,
}

/// A notebook as one scan sees it.
struct Tree {
    text: BTreeMap<PathBuf, Arc<[u8]>>,
    /// Everything else, by stamp alone.
    other: BTreeMap<PathBuf, Stamp>,
    dirs: BTreeSet<PathBuf>,
}

impl History {
    pub fn new() -> Self {
        Self::default()
    }

    /// Runs `action` and records what it changed under `root`, as one entry
    /// named `label`. Whatever could be redone is forgotten: a new action
    /// after an undo is a fork, and the other branch is gone.
    ///
    /// The action's own error passes through unrecorded. A scan that fails
    /// (a folder that cannot be read) does not stop the action either — the
    /// user asked for the action, not for its history — it just leaves no
    /// entry behind.
    pub fn record<T>(
        &mut self,
        root: &Path,
        label: &str,
        action: impl FnOnce() -> Result<T>,
    ) -> Result<T> {
        let before = self.scan(root).ok();
        let result = action()?;
        let Some(before) = before else {
            return Ok(result);
        };
        let Ok(after) = self.scan(root) else {
            return Ok(result);
        };
        if let Some(entry) = diff(label, &before, &after) {
            self.push(entry);
        }
        self.last = Some(after);
        Ok(result)
    }

    /// Folds a write the app made WITHOUT recording it — the editor's save,
    /// the inspector's — into the history: the last recorded action that
    /// touched each changed file now ends where that write left it, so undo
    /// still runs (back to before the action) and redo brings the file back
    /// with the quiet write included. A redoable action resting on such a
    /// file is forgotten: the file has moved on under it.
    ///
    /// Without this, every quiet write would make the entry before it look
    /// like a change from outside, and `undo` would refuse it as stale.
    pub fn absorb(&mut self, root: &Path) -> Result<()> {
        let now = self.scan(root)?;
        if let Some(last) = self.last.take() {
            for path in last.text.keys().chain(now.text.keys()).collect::<BTreeSet<_>>() {
                let old = last.text.get(path);
                let new = now.text.get(path);
                let same = match (old, new) {
                    (Some(a), Some(b)) => Arc::ptr_eq(a, b) || a == b,
                    (None, None) => true,
                    _ => false,
                };
                if same {
                    continue;
                }
                if self.entries[self.done..].iter().any(|e| e.touches(path)) {
                    self.drop_redo();
                }
                if let Some(entry) = self.entries[..self.done]
                    .iter_mut()
                    .rev()
                    .find(|e| e.touches(path))
                {
                    let old_bytes = entry.bytes();
                    for change in entry.files.iter_mut().filter(|c| c.path == *path) {
                        change.after = new.cloned();
                    }
                    self.bytes = self.bytes + entry.bytes() - old_bytes;
                }
            }
        }
        self.last = Some(now);
        Ok(())
    }

    /// The name of the action `undo` would take back, if any.
    pub fn undoable(&self) -> Option<&str> {
        self.done
            .checked_sub(1)
            .and_then(|i| self.entries.get(i))
            .map(Entry::label)
    }

    /// The name of the action `redo` would do again, if any.
    pub fn redoable(&self) -> Option<&str> {
        self.entries.get(self.done).map(Entry::label)
    }

    /// Takes back the last action; answers its name, or `None` when there is
    /// nothing to take back.
    ///
    /// An entry whose files no longer hold what the action left is refused
    /// with [`Error::Stale`] and dropped — with everything before it, since
    /// those rest on the same files. Refusing is the point: the newer text
    /// came from somewhere, and it is not the app's to overwrite.
    pub fn undo(&mut self, root: &Path) -> Result<Option<String>> {
        let Some(index) = self.done.checked_sub(1) else {
            return Ok(None);
        };
        let entry = &self.entries[index];
        if let Err(e) = check_holds(root, entry, |c| c.after.as_deref()) {
            self.forget_through(index);
            return Err(e);
        }
        apply(root, entry, |c| c.before.as_deref(), &entry.created_dirs, &entry.removed_dirs)?;
        self.done = index;
        self.last = self.scan(root).ok();
        Ok(Some(self.entries[index].label.clone()))
    }

    /// Does the last undone action again; answers its name, or `None`.
    ///
    /// Same guard as [`History::undo`], the other way round: the files must
    /// still hold what the undo wrote.
    pub fn redo(&mut self, root: &Path) -> Result<Option<String>> {
        let Some(entry) = self.entries.get(self.done) else {
            return Ok(None);
        };
        if let Err(e) = check_holds(root, entry, |c| c.before.as_deref()) {
            // What comes after rests on this one; none of it can be redone.
            self.drop_redo();
            return Err(e);
        }
        apply(root, entry, |c| c.after.as_deref(), &entry.removed_dirs, &entry.created_dirs)?;
        self.done += 1;
        self.last = self.scan(root).ok();
        Ok(Some(self.entries[self.done - 1].label.clone()))
    }

    /// Forgets everything. The cache stays: it is about the files, not about
    /// the actions.
    pub fn clear(&mut self) {
        self.entries.clear();
        self.done = 0;
        self.bytes = 0;
    }

    fn push(&mut self, entry: Entry) {
        self.drop_redo();
        self.bytes += entry.bytes();
        self.entries.push(entry);
        self.done = self.entries.len();
        while self.entries.len() > 1
            && (self.entries.len() > MAX_ENTRIES || self.bytes > MAX_TOTAL_BYTES)
        {
            let oldest = self.entries.remove(0);
            self.bytes -= oldest.bytes();
            self.done -= 1;
        }
    }

    fn drop_redo(&mut self) {
        for entry in self.entries.drain(self.done..) {
            self.bytes -= entry.bytes();
        }
    }

    /// Drops `entries[..=index]` — an entry that went stale, and everything
    /// older, which it was built on top of.
    fn forget_through(&mut self, index: usize) {
        for entry in self.entries.drain(..=index) {
            self.bytes -= entry.bytes();
        }
        self.done -= index + 1;
    }

    /// Reads the notebook: every file's bytes (text) or stamp (the rest), and
    /// every directory, all root-relative.
    fn scan(&mut self, root: &Path) -> Result<Tree> {
        let mut tree = Tree {
            text: BTreeMap::new(),
            other: BTreeMap::new(),
            dirs: BTreeSet::new(),
        };
        let mut pending = vec![root.to_path_buf()];
        while let Some(dir) = pending.pop() {
            for path in fsio::dir_paths(&dir)? {
                // Symlinks are not followed: one pointing outside the
                // notebook would make "the notebook's files" a lie, and one
                // pointing inside would be counted twice.
                let meta = std::fs::symlink_metadata(&path).ctx(&path)?;
                let relative = path.strip_prefix(root).unwrap_or(&path).to_path_buf();
                if meta.file_type().is_symlink() {
                    continue;
                }
                if meta.is_dir() {
                    // Another tool's own folder, never the notebook's content.
                    if fsio::file_name_of(&path) == ".git" {
                        continue;
                    }
                    tree.dirs.insert(relative);
                    pending.push(path);
                    continue;
                }
                // Our own atomic writes pass through `*.tmp`; the watcher
                // ignores those and so does this.
                if path.extension().is_some_and(|ext| ext == "tmp") {
                    continue;
                }
                let stamp = Stamp {
                    modified: meta.modified().ok(),
                    len: meta.len(),
                };
                if is_text(&path) && meta.len() <= MAX_FILE_BYTES {
                    let content = self.read_cached(&path, &relative, stamp)?;
                    tree.text.insert(relative, content);
                } else {
                    tree.other.insert(relative, stamp);
                }
            }
        }
        Ok(tree)
    }

    fn read_cached(&mut self, path: &Path, relative: &Path, stamp: Stamp) -> Result<Arc<[u8]>> {
        if let Some(cached) = self.cache.get(relative) {
            if cached.stamp == stamp {
                return Ok(Arc::clone(&cached.content));
            }
        }
        let content: Arc<[u8]> = std::fs::read(path).ctx(path)?.into();
        self.cache.insert(
            relative.to_path_buf(),
            Cached {
                stamp,
                content: Arc::clone(&content),
            },
        );
        Ok(content)
    }
}

fn is_text(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| TEXT_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
}

/// What changed between two scans, as an entry — or `None` when nothing did,
/// or when something did that cannot be recorded (a file that is watched by
/// stamp only, see the module doc).
fn diff(label: &str, before: &Tree, after: &Tree) -> Option<Entry> {
    if before.other != after.other {
        return None;
    }
    let mut files = Vec::new();
    for path in before.text.keys().chain(after.text.keys()).collect::<BTreeSet<_>>() {
        let old = before.text.get(path);
        let new = after.text.get(path);
        let same = match (old, new) {
            (Some(a), Some(b)) => Arc::ptr_eq(a, b) || a == b,
            (None, None) => true,
            _ => false,
        };
        if !same {
            files.push(FileChange {
                path: path.clone(),
                before: old.cloned(),
                after: new.cloned(),
            });
        }
    }
    let created_dirs: Vec<PathBuf> = after.dirs.difference(&before.dirs).cloned().collect();
    let removed_dirs: Vec<PathBuf> = before.dirs.difference(&after.dirs).cloned().collect();
    if files.is_empty() && created_dirs.is_empty() && removed_dirs.is_empty() {
        return None;
    }
    Some(Entry {
        label: label.to_string(),
        files,
        created_dirs,
        removed_dirs,
    })
}

/// Refuses an entry whose files no longer hold what `expected` says.
fn check_holds(
    root: &Path,
    entry: &Entry,
    expected: impl Fn(&FileChange) -> Option<&[u8]>,
) -> Result<()> {
    for change in &entry.files {
        let path = root.join(&change.path);
        let current = match std::fs::read(&path) {
            Ok(bytes) => Some(bytes),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(Error::Io { path, source: e }),
        };
        if current.as_deref() != expected(change) {
            return Err(Error::Stale(entry.label.clone()));
        }
    }
    Ok(())
}

/// Writes every file of `entry` to what `target` says (`None` removes it),
/// then takes `dirs_to_remove` away (deepest first, only where empty) and
/// puts `dirs_to_create` back.
fn apply(
    root: &Path,
    entry: &Entry,
    target: impl Fn(&FileChange) -> Option<&[u8]>,
    dirs_to_remove: &[PathBuf],
    dirs_to_create: &[PathBuf],
) -> Result<()> {
    for change in &entry.files {
        let path = root.join(&change.path);
        match target(change) {
            Some(bytes) => fsio::write_atomically(&path, bytes)?,
            None => {
                match std::fs::remove_file(&path) {
                    Ok(()) => {}
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                    Err(e) => return Err(Error::Io { path, source: e }),
                }
                prune_empty_parents(root, &path);
            }
        }
    }
    let mut removing: Vec<&PathBuf> = dirs_to_remove.iter().collect();
    removing.sort_by_key(|d| std::cmp::Reverse(d.components().count()));
    for dir in removing {
        // Not empty means something else lives there now; leaving it is the
        // right answer, not an error.
        let _ = std::fs::remove_dir(root.join(dir));
    }
    for dir in dirs_to_create {
        let path = root.join(dir);
        std::fs::create_dir_all(&path).ctx(&path)?;
    }
    Ok(())
}

/// Removes the now-empty folders above a file that was taken away, up to
/// (never including) the root — a space folder whose marker and lists went
/// back into the trash should not stay behind as an empty shell.
fn prune_empty_parents(root: &Path, path: &Path) {
    let mut dir = path.parent();
    while let Some(d) = dir {
        if d == root || !d.starts_with(root) {
            break;
        }
        if std::fs::remove_dir(d).is_err() {
            break;
        }
        dir = d.parent();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &Path, rel: &str, text: &str) {
        fsio::write_atomically(root.join(rel), text.as_bytes()).unwrap();
    }

    fn read(root: &Path, rel: &str) -> Option<String> {
        std::fs::read_to_string(root.join(rel)).ok()
    }

    #[test]
    fn an_edit_is_undone_and_redone_byte_for_byte() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "a/note.md", "one\n");
        let mut history = History::new();

        history
            .record(root, "edit", || {
                write(root, "a/note.md", "two\n");
                Ok(())
            })
            .unwrap();
        assert_eq!(history.undoable(), Some("edit"));
        assert_eq!(history.redoable(), None);

        assert_eq!(history.undo(root).unwrap().as_deref(), Some("edit"));
        assert_eq!(read(root, "a/note.md").as_deref(), Some("one\n"));
        assert_eq!(history.undoable(), None);
        assert_eq!(history.redoable(), Some("edit"));

        assert_eq!(history.redo(root).unwrap().as_deref(), Some("edit"));
        assert_eq!(read(root, "a/note.md").as_deref(), Some("two\n"));
        assert_eq!(history.redo(root).unwrap(), None);
    }

    #[test]
    fn a_created_file_is_removed_on_undo_with_its_empty_folder() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "keep.md", "");
        let mut history = History::new();

        history
            .record(root, "create", || {
                write(root, "new/deeper/note.md", "hi");
                Ok(())
            })
            .unwrap();
        history.undo(root).unwrap();
        assert!(!root.join("new").exists());
        assert!(root.join("keep.md").exists());

        history.redo(root).unwrap();
        assert_eq!(read(root, "new/deeper/note.md").as_deref(), Some("hi"));
    }

    #[test]
    fn a_removed_file_comes_back_on_undo() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "gone.md", "bye");
        let mut history = History::new();

        history
            .record(root, "delete", || {
                std::fs::remove_file(root.join("gone.md")).unwrap();
                Ok(())
            })
            .unwrap();
        history.undo(root).unwrap();
        assert_eq!(read(root, "gone.md").as_deref(), Some("bye"));
    }

    #[test]
    fn an_empty_folder_is_a_change_too() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut history = History::new();

        history
            .record(root, "folder", || {
                std::fs::create_dir_all(root.join("empty")).unwrap();
                Ok(())
            })
            .unwrap();
        assert_eq!(history.undoable(), Some("folder"));
        history.undo(root).unwrap();
        assert!(!root.join("empty").exists());
        history.redo(root).unwrap();
        assert!(root.join("empty").is_dir());
    }

    #[test]
    fn an_action_that_touches_a_binary_is_not_recorded() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut history = History::new();

        history
            .record(root, "import", || {
                write(root, "assets/pic.png", "PNG");
                write(root, "note.md", "![](assets/pic.png)");
                Ok(())
            })
            .unwrap();
        assert_eq!(history.undoable(), None);
    }

    #[test]
    fn an_action_that_changes_nothing_leaves_no_entry() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "note.md", "same");
        let mut history = History::new();

        history
            .record(root, "noop", || {
                write(root, "note.md", "same");
                Ok(())
            })
            .unwrap();
        assert_eq!(history.undoable(), None);
    }

    #[test]
    fn a_failed_action_leaves_no_entry() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut history = History::new();

        let result: Result<()> = history.record(root, "fail", || {
            write(root, "note.md", "half");
            Err(Error::Protected("x".into()))
        });
        assert!(result.is_err());
        assert_eq!(history.undoable(), None);
    }

    #[test]
    fn a_file_changed_outside_refuses_the_undo_and_forgets_it() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "note.md", "one");
        let mut history = History::new();

        history
            .record(root, "first", || {
                write(root, "note.md", "two");
                Ok(())
            })
            .unwrap();
        history
            .record(root, "second", || {
                write(root, "note.md", "three");
                Ok(())
            })
            .unwrap();
        write(root, "note.md", "synced from elsewhere");

        let err = history.undo(root).unwrap_err();
        assert!(matches!(err, Error::Stale(ref label) if label == "second"));
        assert_eq!(read(root, "note.md").as_deref(), Some("synced from elsewhere"));
        // Both rested on that file: nothing older is offered either.
        assert_eq!(history.undoable(), None);
    }

    #[test]
    fn a_new_action_after_an_undo_forgets_the_redo() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "note.md", "one");
        let mut history = History::new();

        history
            .record(root, "a", || {
                write(root, "note.md", "two");
                Ok(())
            })
            .unwrap();
        history.undo(root).unwrap();
        history
            .record(root, "b", || {
                write(root, "note.md", "three");
                Ok(())
            })
            .unwrap();
        assert_eq!(history.redoable(), None);
        assert_eq!(history.undoable(), Some("b"));
        history.undo(root).unwrap();
        assert_eq!(read(root, "note.md").as_deref(), Some("one"));
    }

    #[test]
    fn the_oldest_entries_fall_off_the_end() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut history = History::new();
        for i in 0..(MAX_ENTRIES + 5) {
            history
                .record(root, &format!("edit {i}"), || {
                    write(root, "note.md", &i.to_string());
                    Ok(())
                })
                .unwrap();
        }
        assert_eq!(history.entries.len(), MAX_ENTRIES);
        assert_eq!(history.undoable(), Some(format!("edit {}", MAX_ENTRIES + 4).as_str()));
        let mut undone = 0;
        while history.undo(root).unwrap().is_some() {
            undone += 1;
        }
        assert_eq!(undone, MAX_ENTRIES);
        assert_eq!(read(root, "note.md").as_deref(), Some("4"));
    }

    #[test]
    fn a_quiet_write_is_absorbed_into_the_action_before_it() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut history = History::new();

        history
            .record(root, "create", || {
                write(root, "list.md", "- [ ] task\n");
                Ok(())
            })
            .unwrap();
        // The inspector saves a field: not an action, but the app's own.
        write(root, "list.md", "- [ ] task !2\n");
        history.absorb(root).unwrap();

        assert_eq!(history.undo(root).unwrap().as_deref(), Some("create"));
        assert!(!root.join("list.md").exists());
        history.redo(root).unwrap();
        assert_eq!(read(root, "list.md").as_deref(), Some("- [ ] task !2\n"));
    }

    #[test]
    fn a_quiet_write_under_a_redoable_action_forgets_the_redo() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "note.md", "one");
        let mut history = History::new();

        history
            .record(root, "pin", || {
                write(root, "note.md", "two");
                Ok(())
            })
            .unwrap();
        history.undo(root).unwrap();
        write(root, "note.md", "typed after the undo");
        history.absorb(root).unwrap();
        assert_eq!(history.redoable(), None);
    }

    #[test]
    fn the_cache_spares_rereading_an_untouched_file() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "note.md", "one");
        let mut history = History::new();
        let first = history.scan(root).unwrap();
        let second = history.scan(root).unwrap();
        assert!(Arc::ptr_eq(
            &first.text[Path::new("note.md")],
            &second.text[Path::new("note.md")]
        ));
    }

    #[test]
    fn a_symlink_and_a_git_folder_are_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, ".git/HEAD", "ref");
        write(root, "note.md", "x");
        #[cfg(unix)]
        std::os::unix::fs::symlink(root.join("note.md"), root.join("link.md")).unwrap();
        let mut history = History::new();
        let tree = history.scan(root).unwrap();
        assert!(tree.text.contains_key(Path::new("note.md")));
        assert!(!tree.text.contains_key(Path::new("link.md")));
        assert!(!tree.text.contains_key(Path::new(".git/HEAD")));
        assert!(!tree.dirs.contains(Path::new(".git")));
    }
}
