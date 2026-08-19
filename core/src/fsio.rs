//! The one way anything in Jott writes a file.
//!
//! Every write is atomic — tmp file, then rename — because a sync tool may
//! read the file at any instant, and a half-written list or config is a
//! corrupted notebook. This used to live in three near-identical copies
//! (lists, config, machine prefs); one helper means the next kind of file
//! (notes, space configs) cannot accidentally skip the dance.
//!
//! The invariant test in `core/tests/invariants.rs` enforces that no other
//! module calls `std::fs::write` directly.

use std::path::{Path, PathBuf};

use crate::error::{Error, IoContext, Result};

/// Writes `bytes` to `path` atomically, creating parent folders as needed.
///
/// The temporary lands next to the target as `<name>.tmp`, which is what the
/// notebook watcher knows to ignore — using another suffix would make every
/// save look like an external change.
pub fn write_atomically(path: impl AsRef<Path>, bytes: &[u8]) -> Result<()> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ctx(parent)?;
    }

    let name = file_name_of(path);
    let tmp = path.with_file_name(format!("{name}.tmp"));

    std::fs::write(&tmp, bytes).ctx(&tmp)?;
    std::fs::rename(&tmp, path).ctx(path)?;
    Ok(())
}

/// Everything directly inside `dir`, as absolute paths.
///
/// **A missing folder is an empty folder, not an error.** That is the rule the
/// whole app already followed — a tasks space with no lists yet, a notebook
/// whose `Notes/` the user deleted, a group with nothing in it — written out
/// seven times, once per caller. Written once, the next caller cannot get it
/// subtly wrong.
///
/// Order is whatever the filesystem gives; callers that show these to the user
/// sort them.
pub fn dir_paths(dir: impl AsRef<Path>) -> Result<Vec<PathBuf>> {
    let dir = dir.as_ref();
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(source) => {
            return Err(Error::Io {
                path: dir.to_path_buf(),
                source,
            })
        }
    };

    let mut paths = Vec::new();
    for entry in entries {
        paths.push(entry.ctx(dir)?.path());
    }
    Ok(paths)
}

/// The last component of a path, as an owned string — empty when the path
/// has none (a root, or one ending in `..`).
///
/// This exact shape was hand-rolled eleven times across the crate, three of
/// them as named private helpers (one of which said "stem" and returned the
/// name). Callers that need a different fallback for the empty case say so
/// at the call site, where the fallback is visible.
pub fn file_name_of(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// True for a dot-file or dot-folder.
///
/// Hidden entries are the app's business (`.jott`, `.space.json`) or
/// another tool's (`.git`, `.stfolder`) — never the user's content.
pub fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .is_some_and(|name| name.to_string_lossy().starts_with('.'))
}

/// Renders a JSON document the way every file in `.jott/` is written:
/// pretty-printed, with a trailing newline so the file ends like a text file
/// and `git diff` has a last line to show.
///
/// Six callers used to spell this out with six different fallback strings. A
/// `Value` cannot fail to serialize (its numbers are always finite and its keys
/// always strings), so the fallback is a formality — one is enough.
pub fn pretty_json(doc: &serde_json::Value) -> String {
    let mut text = serde_json::to_string_pretty(doc).unwrap_or_else(|_| "{}".to_string());
    text.push('\n');
    text
}

// The OS trash lived here until 2026-08-04, behind a `MEMO_TRASH_DIR`
// override. The 2026-07-30 restructure gave the notebook its own trash
// (`.jott/trash/`, see [`crate::trash`]), and two ways out of a notebook is one
// too many: the desktop trash does not exist on Android, does not travel with a
// synced notebook, and cannot restore a file to where it came from. Every
// deletion now goes through `Notebook`, which files what it removes.

/// A free path in `dir` for `name`, suffixed until nothing is overwritten.
pub fn free_name(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, extension) = match name.rsplit_once('.') {
        Some((stem, ext)) => (stem.to_string(), format!(".{ext}")),
        None => (name.to_string(), String::new()),
    };
    for attempt in 2.. {
        let candidate = dir.join(format!("{stem} {attempt}{extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!("the loop returns as soon as a name is free")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_creates_parents() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a/b/list.md");

        write_atomically(&path, b"- [ ] task\n").unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "- [ ] task\n");
        assert!(
            !path.with_file_name("list.md.tmp").exists(),
            "the temporary must be gone after the rename"
        );
    }

    #[test]
    fn a_missing_folder_reads_as_an_empty_folder() {
        // Seven callers depend on this: a tasks space with no lists yet, a
        // notebook whose Notes/ was deleted outside the app, a group with
        // nothing in it. None may fail to open over a folder that is not there.
        let dir = tempfile::tempdir().unwrap();
        assert!(dir_paths(dir.path().join("nao-existe")).unwrap().is_empty());

        std::fs::write(dir.path().join("Inbox.md"), b"").unwrap();
        let paths = dir_paths(dir.path()).unwrap();
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0].file_name().unwrap(), "Inbox.md");
    }

    #[test]
    fn hidden_entries_are_recognized_by_the_leading_dot() {
        assert!(is_hidden(Path::new("/notebook/.jott")));
        assert!(is_hidden(Path::new("/notebook/Tasks/.space.json")));
        assert!(!is_hidden(Path::new("/notebook/Tasks")));
        assert!(!is_hidden(Path::new("/notebook/Projeto v2.0.md")));
    }

    #[test]
    fn the_temporary_has_the_extension_the_watcher_ignores() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Inbox.md");
        let tmp = path.with_file_name("Inbox.md.tmp");
        assert_eq!(tmp.extension().unwrap(), "tmp");
    }
}
