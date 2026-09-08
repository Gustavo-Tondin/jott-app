//! The one way anything in Jott writes a file.
//!
//! Every write is atomic — tmp file, then rename — because a sync tool may
//! read the file at any instant, and a half-written file is a corrupted
//! notebook. `core/tests/invariants.rs` forbids `std::fs::write` elsewhere.

use std::path::{Path, PathBuf};

use crate::error::{Error, IoContext, Result};

/// Writes `bytes` to `path` atomically, creating parent folders as needed.
/// The temporary lands next to the target as `<name>.tmp`, the one suffix
/// the notebook watcher ignores; another would make every save look external.
pub fn write_atomically(path: impl AsRef<Path>, bytes: &[u8]) -> Result<()> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ctx(parent)?;
    }

    let name = file_name_of(path);
    let tmp = path.with_file_name(format!("{name}.tmp"));

    std::fs::write(&tmp, bytes).ctx(&tmp)?;
    std::fs::rename(&tmp, path).ctx(path)?;
    // What the app writes, the app's own watcher must not report back to it
    // (`crate::selfwrite`); the stamp is read here, while it is still ours.
    crate::selfwrite::remember(path);
    Ok(())
}

/// Everything directly inside `dir`, as absolute paths. A missing folder is
/// an EMPTY folder, not an error — a tasks space with no lists yet, a deleted
/// `Notes/`, an empty group. Order is the filesystem's; callers sort.
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
/// has none (a root, or one ending in `..`). A caller that needs another
/// fallback for the empty case says so at the call site.
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
/// pretty-printed, with a trailing newline. A `Value` cannot fail to
/// serialize, so the fallback is a formality.
pub fn pretty_json(doc: &serde_json::Value) -> String {
    let mut text = serde_json::to_string_pretty(doc).unwrap_or_else(|_| "{}".to_string());
    text.push('\n');
    text
}

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
