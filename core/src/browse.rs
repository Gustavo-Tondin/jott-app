//! Browsing the machine's folders, to pick where a notebook goes.
//!
//! This is the app's own browser rather than the system's, and it exists for
//! Android: there is no `pick_folder` there, and the Storage Access Framework
//! — the platform's answer — hands back a `content://` URI that `std::fs`
//! cannot open. With the all-files permission granted, ordinary paths work
//! again, and a folder browser is a list of directories.
//!
//! Which folder the browsing is bounded BY is the bridge's to say: the root is
//! shared storage on a phone and the home folder on a desktop, and both come
//! from the environment. Everything below takes that root as an argument —
//! which is also what lets the containment rule be tested against a temporary
//! folder rather than against whatever `$HOME` happens to be on the machine
//! running the tests.

use std::path::{Path, PathBuf};

use crate::error::{Error, IoContext, Result};
use crate::fsio;

/// A folder and the folders inside it — one rung of the in-app folder browser.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderListing {
    /// The folder that was listed, absolute.
    pub path: String,
    /// What to display for it — the last component, or the whole path at the
    /// top, where there is no component to name.
    pub name: String,
    /// One rung up, or `None` at the top of what the app may browse.
    pub parent: Option<String>,
    /// The folders inside, sorted, hidden ones left out. Files are not listed:
    /// the question this browser asks is "which FOLDER", and a list of every
    /// photo on the phone would only be scrolled past.
    pub folders: Vec<FolderEntry>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    pub path: String,
    pub name: String,
    /// True when the folder already holds a notebook — the browser marks it,
    /// so opening an existing notebook does not look like creating one.
    pub notebook: bool,
}

/// Lists the folders inside `path`, or inside `root` when it is `None`.
///
/// **`path` is never trusted to be inside the root**: it arrives from the UI,
/// and a browser that accepted `..` would walk out of shared storage into
/// wherever the process happens to be allowed. Anything outside answers the
/// root instead of an error — the browser lands somewhere usable rather than
/// showing a failure the user cannot act on.
pub fn listing(root: &Path, path: Option<String>) -> Result<FolderListing> {
    // Canonicalized so the containment check below compares like with like:
    // on Windows `canonicalize` returns a verbatim path (`\\?\C:\...`), and a
    // verbatim path never starts_with a non-verbatim one — every candidate
    // would silently land back on the root (caught by CI, 2026-08-19).
    let raw_root = root;
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let at = match path {
        Some(path) => {
            let candidate = PathBuf::from(path);
            // `canonicalize` resolves `..` and symlinks, which is what makes
            // the containment check mean anything. A path that does not
            // exist cannot be canonicalized — a folder deleted between the
            // listing and the tap — so that one is judged against the RAW
            // root (again like with like), and only with no `..` inside:
            // unresolved dot-dots would walk out of what starts_with saw.
            match candidate.canonicalize() {
                Ok(resolved) if resolved.starts_with(&root) => resolved,
                Err(_)
                    if candidate.starts_with(raw_root)
                        && candidate
                            .components()
                            .all(|c| !matches!(c, std::path::Component::ParentDir)) =>
                {
                    candidate
                }
                _ => root.clone(),
            }
        }
        None => root.clone(),
    };

    let mut folders: Vec<FolderEntry> = fsio::dir_paths(&at)?
        .into_iter()
        .filter(|p| p.is_dir() && !fsio::is_hidden(p))
        .map(|p| FolderEntry {
            notebook: p.join(crate::NOTEBOOK_CONFIG_DIR).is_dir(),
            name: label(&p),
            path: p.to_string_lossy().into_owned(),
        })
        .collect();
    folders.sort_by_key(|f| f.name.to_lowercase());

    Ok(FolderListing {
        parent: (at != root)
            .then(|| at.parent().map(|p| p.to_string_lossy().into_owned()))
            .flatten(),
        name: label(&at),
        path: at.to_string_lossy().into_owned(),
        folders,
    })
}

/// The last component of a path, falling back to the whole thing — a root has
/// no last component, and an empty label would draw an empty breadcrumb.
pub fn label(path: &Path) -> String {
    let name = crate::fsio::file_name_of(path);
    if name.is_empty() {
        path.to_string_lossy().into_owned()
    } else {
        name
    }
}

/// Creates a folder inside `parent`, so the notebook can be put somewhere that
/// does not exist yet — which is most of the time, on a phone whose shared
/// storage came with the manufacturer's folders and nothing else.
///
/// The name goes through the same guard as every name the user types
/// ([`crate::relpath::is_safe_leaf`]), so a slash or a `..` cannot make this
/// write anywhere but inside `parent`.
pub fn create_folder(root: &Path, parent: String, name: &str) -> Result<String> {
    let name = name.trim();
    if !crate::relpath::is_safe_leaf(name) {
        return Err(Error::InvalidFolderName(name.to_string()));
    }
    // Through the browser's own resolution, so a `parent` from outside the
    // root cannot be written to either.
    let listing = listing(root, Some(parent))?;
    let folder = PathBuf::from(listing.path).join(name);
    std::fs::create_dir_all(&folder).ctx(&folder)?;
    Ok(folder.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The folder browser Android needs (2026-08-19). Its rules are the ones a
    /// path from the UI makes necessary: it may not walk out of the root, and
    /// a typed name may not be a path.
    fn tree() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("Documents/Jott/.jott")).unwrap();
        std::fs::create_dir(dir.path().join("Documents/Photos")).unwrap();
        std::fs::create_dir(dir.path().join("Documents/.thumbnails")).unwrap();
        std::fs::write(dir.path().join("Documents/note.md"), "x").unwrap();
        dir
    }

    #[test]
    fn lists_folders_only_and_marks_the_ones_holding_a_notebook() {
        let dir = tree();
        let at = dir.path().join("Documents");
        let listing = listing(dir.path(), Some(at.to_string_lossy().into_owned())).unwrap();

        let names: Vec<&str> = listing.folders.iter().map(|f| f.name.as_str()).collect();
        // Sorted, no files, and no dot-folders — `.thumbnails` is another
        // tool's business and `note.md` is not an answer to "which folder?".
        assert_eq!(names, ["Jott", "Photos"]);
        assert!(listing.folders[0].notebook, "Jott/ holds a .jott");
        assert!(!listing.folders[1].notebook);
        assert_eq!(listing.name, "Documents");
    }

    #[test]
    fn the_root_has_no_way_up_and_everything_below_it_does() {
        let dir = tree();
        assert_eq!(listing(dir.path(), None).unwrap().parent, None);

        let at = dir.path().join("Documents");
        let listing = listing(dir.path(), Some(at.to_string_lossy().into_owned())).unwrap();
        // Canonicalized on both sides: the browser answers canonical
        // paths, and on Windows those carry the verbatim prefix.
        let root = dir.path().canonicalize().unwrap();
        assert_eq!(listing.parent.as_deref(), root.to_str());
    }

    #[test]
    fn a_path_outside_the_root_lands_on_the_root_instead_of_erroring() {
        let dir = tree();
        let outside = dir.path().join("Documents/../../..");

        // Not an error: the browser has to land somewhere the user can act
        // on, and "that path is not allowed" is not a folder.
        let listing = listing(dir.path(), Some(outside.to_string_lossy().into_owned())).unwrap();
        // The browser answers canonical paths — see the parent assertion
        // in the test below.
        let root = dir.path().canonicalize().unwrap();
        assert_eq!(listing.path, root.to_string_lossy());
    }

    #[test]
    fn a_missing_folder_is_an_empty_one() {
        // `fsio::dir_paths`' rule, which matters here because a folder can
        // be deleted by another app between the listing and the tap.
        let dir = tree();
        let gone = dir.path().join("Documents/gone");
        let listing = listing(dir.path(), Some(gone.to_string_lossy().into_owned())).unwrap();
        assert!(listing.folders.is_empty());
    }

    #[test]
    fn creates_a_folder_and_refuses_a_name_that_is_a_path() {
        let dir = tree();
        let at = dir.path().join("Documents").to_string_lossy().into_owned();

        let made = create_folder(dir.path(), at.clone(), " Notebook ").unwrap();
        assert!(dir.path().join("Documents/Notebook").is_dir());
        // Canonical on both sides — see the parent assertion above. And
        // compared as paths, not strings: Path equality goes through
        // components, which is what forgives `\` vs `/` on Windows.
        let expected = dir
            .path()
            .canonicalize()
            .unwrap()
            .join("Documents")
            .join("Notebook");
        assert_eq!(PathBuf::from(&made), expected);

        for bad in ["../escaped", "a/b", "..", ""] {
            let error = create_folder(dir.path(), at.clone(), bad).unwrap_err();
            assert!(
                matches!(error, Error::InvalidFolderName(_)),
                "{bad} should be refused"
            );
        }
        assert!(!dir.path().join("escaped").exists());
    }
}
