//! The last content this device knew a file to hold in COMMON with the other
//! devices — the third side of a three-way merge. Without it, "who changed
//! what" is a guess, and a merge that guesses loses work.
//!
//! It lives OUTSIDE the notebook, in the machine's own data folder: inside
//! `.jott/` it would sync, and syncing a per-device memory doubles the
//! traffic to say nothing. So a notebook opened on a device that has never
//! seen it has no base, and its first conflict goes to the banner.
//!
//! What NEVER writes here is the app's own save. A base that followed our
//! writes would be "my version", and the merge would degenerate into "the
//! other device wins" — losing exactly the field this device edited. It
//! moves on what arrives from outside, and on a decision already taken
//! (a merge, an Adopt, a Discard).

use std::path::{Path, PathBuf};

use crate::error::Result;
use crate::fsio::write_atomically;

/// One notebook's base, as a folder mirroring the notebook's own addresses.
#[derive(Debug, Clone)]
pub struct Base {
    dir: PathBuf,
}

impl Base {
    /// The base of the notebook at `notebook_root`, under `dir` — one folder
    /// per notebook, named after it so the folder is readable, and keyed by a
    /// digest of the full path so two notebooks with the same leaf name are
    /// two bases.
    pub fn new(dir: impl AsRef<Path>, notebook_root: &Path) -> Self {
        Self {
            dir: dir.as_ref().join(folder_for(notebook_root)),
        }
    }

    /// What this device last knew `relative` to hold in common; `None` when
    /// it has never seen it.
    pub fn of(&self, relative: &str) -> Option<Vec<u8>> {
        std::fs::read(self.file(relative)?).ok()
    }

    /// Whether this device already knows a common version of `relative` —
    /// asked before reading the file it would record, so an open after the
    /// first one costs a `stat` per file and nothing more.
    pub fn has(&self, relative: &str) -> bool {
        self.file(relative).is_some_and(|path| path.exists())
    }

    /// Records `bytes` as the new common content of `relative`.
    pub fn record(&self, relative: &str, bytes: &[u8]) -> Result<()> {
        match self.file(relative) {
            Some(path) => write_atomically(path, bytes),
            None => Ok(()),
        }
    }

    /// Records `bytes` only if this device has no base for `relative` yet —
    /// what an open does. Overwriting on every open would make the base our
    /// own last session's version.
    pub fn record_if_absent(&self, relative: &str, bytes: &[u8]) -> Result<()> {
        match self.file(relative) {
            Some(path) if !path.exists() => write_atomically(path, bytes),
            _ => Ok(()),
        }
    }

    /// Forgets `relative` — the file is gone from the notebook.
    pub fn forget(&self, relative: &str) {
        if let Some(path) = self.file(relative) {
            let _ = std::fs::remove_file(path);
        }
    }

    /// Drops what no longer answers `exists` — the same housekeeping
    /// `prune_seen` does for the per-device indexes, so a base folder does
    /// not grow with every file the notebook ever held.
    pub fn prune(&self, exists: impl Fn(&str) -> bool) {
        let mut dirs = vec![self.dir.clone()];
        while let Some(dir) = dirs.pop() {
            let Ok(entries) = std::fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    dirs.push(path);
                    continue;
                }
                let relative = crate::relpath::relative_slash(&self.dir, &path);
                if !exists(&relative) {
                    let _ = std::fs::remove_file(&path);
                }
            }
        }
    }

    /// Where `relative` is kept; `None` for an address that could climb out
    /// of the folder. Unlike `relpath::safe_join`, a leading dot is allowed:
    /// the addresses recorded here are the app's own, and they start with
    /// `.jott/`.
    fn file(&self, relative: &str) -> Option<PathBuf> {
        let safe = !relative.trim().is_empty()
            && !relative.starts_with('/')
            && !relative.contains("..")
            && !relative.contains(['\\', '\0'])
            && relative.split('/').all(|part| !part.trim().is_empty());
        safe.then(|| self.dir.join(relative))
    }
}

/// The folder name one notebook's base gets: its own leaf, plus a digest of
/// the whole path. Every character the filesystems disagree about is dropped
/// from the readable half — it is there for the person reading the folder,
/// and the digest is what makes it unique.
fn folder_for(notebook_root: &Path) -> String {
    let leaf: String = crate::fsio::file_name_of(notebook_root)
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .take(32)
        .collect();
    let digest = crate::selfwrite::Stamp::of_bytes(
        notebook_root.to_string_lossy().as_bytes(),
    );
    format!("{leaf}-{:016x}", digest.hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> (tempfile::TempDir, Base) {
        let dir = tempfile::tempdir().unwrap();
        let base = Base::new(dir.path(), Path::new("/home/alguem/Caderno"));
        (dir, base)
    }

    #[test]
    fn two_notebooks_with_the_same_name_are_two_bases() {
        let dir = tempfile::tempdir().unwrap();
        let one = Base::new(dir.path(), Path::new("/a/Caderno"));
        let other = Base::new(dir.path(), Path::new("/b/Caderno"));

        one.record(".jott/plan.json", b"um").unwrap();
        other.record(".jott/plan.json", b"outro").unwrap();

        assert_eq!(one.of(".jott/plan.json").unwrap(), b"um");
        assert_eq!(other.of(".jott/plan.json").unwrap(), b"outro");
    }

    #[test]
    fn records_reads_and_forgets() {
        let (_dir, base) = base();
        assert_eq!(base.of(".jott/daily-state.json"), None);

        base.record(".jott/daily-state.json", b"{}").unwrap();
        assert_eq!(base.of(".jott/daily-state.json").unwrap(), b"{}");

        base.record(".jott/daily-state.json", b"{\"a\":1}").unwrap();
        assert_eq!(base.of(".jott/daily-state.json").unwrap(), b"{\"a\":1}");

        base.forget(".jott/daily-state.json");
        assert_eq!(base.of(".jott/daily-state.json"), None);
    }

    #[test]
    fn the_first_sight_is_kept_and_the_second_is_not() {
        // An open records what it finds only when it has never seen the file:
        // a second open must not promote our own last session to "common".
        let (_dir, base) = base();
        base.record_if_absent(".jott/plan.json", b"comum").unwrap();
        base.record_if_absent(".jott/plan.json", b"minha versao").unwrap();
        assert_eq!(base.of(".jott/plan.json").unwrap(), b"comum");
    }

    #[test]
    fn an_address_that_could_climb_out_is_refused() {
        let (dir, base) = base();
        for bad in ["../fora.json", "/etc/passwd", "a//b.json", "", "a\\b"] {
            base.record(bad, b"x").unwrap();
            assert_eq!(base.of(bad), None, "{bad:?} should reach nothing");
        }
        // And nothing landed beside the base folder.
        let stray: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name() != std::ffi::OsString::from(folder_for(Path::new("/home/alguem/Caderno"))))
            .collect();
        assert!(stray.is_empty(), "{stray:?}");
    }

    #[test]
    fn what_the_notebook_no_longer_holds_is_dropped() {
        let (_dir, base) = base();
        base.record(".jott/plan.json", b"fica").unwrap();
        base.record("jott.tasks/Compras.md", b"sai").unwrap();

        base.prune(|relative| relative == ".jott/plan.json");

        assert!(base.of(".jott/plan.json").is_some());
        assert!(base.of("jott.tasks/Compras.md").is_none());
    }
}
