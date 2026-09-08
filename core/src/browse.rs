//! The app's own folder browser, to pick where a notebook goes. Exists for
//! Android: no `pick_folder`, and the SAF hands back a `content://` URI that
//! `std::fs` cannot open. The bounding root is the bridge's to say (shared
//! storage on a phone, home on a desktop) and is always an argument, so the
//! containment rule is testable against a temporary folder.

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
    /// The folders inside, sorted, hidden ones left out. Files are not
    /// listed: the question is "which FOLDER".
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
/// `path` comes from the UI and is never trusted to be inside the root;
/// anything outside answers the root instead of an error, so the browser
/// lands somewhere usable.
pub fn listing(root: &Path, path: Option<String>) -> Result<FolderListing> {
    // Canonicalized so the containment check compares like with like: on
    // Windows `canonicalize` returns a verbatim path (`\\?\C:\...`), which
    // never starts_with a non-verbatim one.
    let raw_root = root;
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let at = match path {
        Some(path) => {
            let candidate = PathBuf::from(path);
            // `canonicalize` resolves `..` and symlinks. A path that no longer
            // exists (deleted between listing and tap) is judged against the
            // RAW root, and only with no `..` inside.
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

/// Creates a folder inside `parent`. The name goes through
/// [`crate::relpath::is_safe_leaf`], so a slash or `..` cannot write outside
/// `parent`.
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

    /// A tree for the browser: it may not walk out of the root, and a typed
    /// name may not be a path.
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
        // Sorted, no files, no dot-folders.
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
        // The browser answers canonical paths (verbatim prefix on Windows).
        let root = dir.path().canonicalize().unwrap();
        assert_eq!(listing.parent.as_deref(), root.to_str());
    }

    #[test]
    fn a_path_outside_the_root_lands_on_the_root_instead_of_erroring() {
        let dir = tree();
        let outside = dir.path().join("Documents/../../..");

        // Not an error: the browser has to land somewhere the user can act on.
        let listing = listing(dir.path(), Some(outside.to_string_lossy().into_owned())).unwrap();
        // The browser answers canonical paths.
        let root = dir.path().canonicalize().unwrap();
        assert_eq!(listing.path, root.to_string_lossy());
    }

    #[test]
    fn a_missing_folder_is_an_empty_one() {
        // A folder can be deleted by another app between listing and tap.
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
        // Canonical on both sides, compared as paths, not strings: component
        // equality forgives `\` vs `/` on Windows.
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
