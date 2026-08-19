//! The asset library: the files a notebook carries.
//!
//! One folder, `assets/`, at the root of the notebook — not inside a space,
//! because a file is not the property of the note that shows it: the same
//! photo can be the banner of one note, an illustration inside another and a
//! task's attachment tomorrow. A library shared by the whole notebook is the
//! only shape that lets an address survive a note being moved.
//!
//! **Any file goes in; only an image is DRAWN** (user call, 2026-08-18, when
//! task attachments started using it). A PDF, a spreadsheet, a zip are all
//! things a task points at, and the library is where they live; whether one
//! can be a banner, or an `![](…)` inside a note, is a separate question that
//! [`is_image_name`] answers.
//!
//! ```text
//! MyNotebook/
//! ├── assets/
//! │   ├── sunset.jpg
//! │   └── logo.png
//! └── jott.notes/…
//! ```
//!
//! **An address is root-relative** (`assets/sunset.jpg`), decided by the user
//! on 2026-08-18. A note-relative address (`../../assets/sunset.jpg`) would
//! render in any other markdown editor, which was the argument for it; it also
//! breaks the moment the note moves between folders or spaces, and moving
//! notes is now a bulk action the user reaches in two clicks. Stability won.
//!
//! Nothing here decides what an address MEANS in a document. The app writes
//! three forms, and none of them is this module's business:
//! `[[/x.png]]` in a note's body (the app's own syntax, decided 2026-08-19 —
//! `src/lib/services/embeds.js`), `<!--banner: assets/x.png-->` on a note's
//! first line (see [`crate::note`]), and a markdown link on a task's file
//! line (see [`crate::task::Attachment`]).

use std::path::{Path, PathBuf};

use crate::error::{Error, IoContext, Result};
use crate::relpath;

/// Folder holding the notebook's images, relative to its root.
///
/// No `jott.` prefix, unlike the three fixed spaces: those are *spaces*, and
/// the prefix is what keeps the words "Tasks" and "Notes" free for the user to
/// name their own with. This is not a space and never appears in the sidebar
/// — it is one plain folder of plain image files, which is the whole point
/// (principle 4).
pub const ASSETS_DIR: &str = "assets";

/// What the app DRAWS, lowercase. Not a filter on what may be stored — a
/// filter on what a banner, a note's `![](…)` and a thumbnail can be.
///
/// A closed list rather than "whatever the OS thinks": the webview is what has
/// to draw these, and an address the app wrote must be one the app can show.
/// Public because it is THE list — the bridge maps a downloaded image's
/// content-type onto it, and a second copy there already drifted once.
pub const IMAGE_EXTENSIONS: [&str; 8] = [
    "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp",
];

/// An asset as the library screen shows it.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetEntry {
    /// Root-relative address — what a note carries (`assets/sunset.jpg`).
    pub path: String,
    /// File name, which is what the user reads and searches by.
    pub name: String,
    pub size: u64,
    /// Seconds since the epoch, for "newest first". Absent when the
    /// filesystem does not answer, which is not a reason to hide the file.
    pub modified: Option<u64>,
    /// Whether the interface can DRAW it — a thumbnail, a banner, an image in
    /// a note. Everything else is a file with a name, which is all an
    /// attachment ever needs to be.
    pub image: bool,
}

/// The `assets/` folder of one notebook. Cheap to build: a path, not a cache.
#[derive(Debug, Clone)]
pub struct Assets {
    dir: PathBuf,
}

impl Assets {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Every file in the folder, newest first.
    ///
    /// A missing folder is an empty library, never an error: the notebook only
    /// grows one the first time something is imported (`fsio::dir_paths`
    /// already keeps that promise).
    pub fn list(&self) -> Result<Vec<AssetEntry>> {
        let mut found: Vec<AssetEntry> = Vec::new();
        for path in crate::fsio::dir_paths(&self.dir)? {
            // A hidden entry is another tool's business, and a folder someone
            // made in here is not an asset — the library is flat.
            if crate::fsio::is_hidden(&path) || !path.is_file() {
                continue;
            }
            let name = crate::fsio::file_name_of(&path);
            let meta = std::fs::metadata(&path).ok();
            found.push(AssetEntry {
                path: address(&name),
                image: is_image_name(&name),
                name,
                size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
                modified: meta.and_then(|m| m.modified().ok()).and_then(|time| {
                    time.duration_since(std::time::UNIX_EPOCH)
                        .ok()
                        .map(|d| d.as_secs())
                }),
            });
        }
        // Newest first, then by name — the same shape the notes board reads
        // in, and the only order in which a just-imported file is where the
        // eye goes looking for it.
        found.sort_by(|a, b| {
            b.modified
                .cmp(&a.modified)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(found)
    }

    /// Writes a file into the library, returning its root-relative address.
    ///
    /// A colliding name is suffixed, never overwritten — the same free-name
    /// dance every other write in the app goes through. Losing the picture
    /// someone imported last week to a second file called `image.png` would be
    /// silent, and silent is the one thing a file operation must not be.
    pub fn import(&self, file_name: &str, bytes: &[u8]) -> Result<String> {
        let name = sanitize_name(file_name)?;
        std::fs::create_dir_all(&self.dir).ctx(&self.dir)?;
        let target = crate::fsio::free_name(&self.dir, &name);
        crate::fsio::write_atomically(&target, bytes)?;
        Ok(address(&crate::fsio::file_name_of(&target)))
    }

    /// The file behind an address, or an error when it is not one of ours.
    ///
    /// Every address the interface hands back goes through here: it is user
    /// input the moment someone types it into a note, and `..` in a markdown
    /// link is a perfectly ordinary thing to write.
    pub fn file(&self, address: &str) -> Result<PathBuf> {
        let name = name_of(address).ok_or_else(|| invalid(address))?;
        if !relpath::is_safe_leaf(name) {
            return Err(invalid(address));
        }
        relpath::safe_join(&self.dir, name).ok_or_else(|| invalid(address))
    }
}

fn invalid(address: &str) -> Error {
    Error::InvalidAssetPath(address.to_string())
}

/// The address a note carries for an asset called `name`.
pub fn address(name: &str) -> String {
    format!("{ASSETS_DIR}/{name}")
}

/// The file name inside an address, for an address of the library — `None`
/// for anything that does not live in it.
///
/// Deliberately strict: `assets/x.png` and nothing else. An address that
/// points outside is not "an asset the app failed to find", it is a link the
/// user wrote to their own file, and the app has no business resolving it.
pub fn name_of(address: &str) -> Option<&str> {
    let rest = address.strip_prefix(ASSETS_DIR)?.strip_prefix('/')?;
    (!rest.is_empty() && !rest.contains('/')).then_some(rest)
}

/// Whether a file name reads as an image this app can DRAW. Nothing to do
/// with what may be stored — see the module header.
pub fn is_image_name(name: &str) -> bool {
    let Some((_, ext)) = name.rsplit_once('.') else {
        return false;
    };
    let ext = ext.to_lowercase();
    IMAGE_EXTENSIONS.contains(&ext.as_str())
}

/// An imported name becomes a file name, so it has to survive being one.
fn sanitize_name(name: &str) -> Result<String> {
    // Whatever the browser handed over may carry a path (some file pickers
    // send `folder/file.png`); only the leaf is ours.
    let leaf = name.rsplit(['/', '\\']).next().unwrap_or(name);
    let cleaned = leaf.trim().replace('\0', "-");
    let cleaned = cleaned.trim().trim_start_matches('.').trim().to_string();
    if cleaned.is_empty() || !relpath::is_safe_leaf(&cleaned) {
        return Err(invalid(name));
    }
    Ok(cleaned)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn library() -> (tempfile::TempDir, Assets) {
        let dir = tempfile::tempdir().unwrap();
        let assets = Assets::new(dir.path().join(ASSETS_DIR));
        (dir, assets)
    }

    #[test]
    fn a_missing_folder_is_an_empty_library() {
        let (_dir, assets) = library();
        assert!(assets.list().unwrap().is_empty());
    }

    #[test]
    fn importing_creates_the_folder_and_returns_a_root_relative_address() {
        let (_dir, assets) = library();
        let address = assets.import("sunset.jpg", b"jpeg-bytes").unwrap();
        assert_eq!(address, "assets/sunset.jpg");
        assert_eq!(std::fs::read(assets.file(&address).unwrap()).unwrap(), b"jpeg-bytes");
    }

    #[test]
    fn a_colliding_name_is_suffixed_never_overwritten() {
        let (_dir, assets) = library();
        assets.import("logo.png", b"first").unwrap();
        let second = assets.import("logo.png", b"second").unwrap();

        assert_ne!(second, "assets/logo.png");
        // And the first one is still exactly what it was.
        let first = assets.file("assets/logo.png").unwrap();
        assert_eq!(std::fs::read(first).unwrap(), b"first");
    }

    #[test]
    fn any_file_is_stored_and_the_listing_says_which_are_drawable() {
        // Decided 2026-08-18, when task attachments started using the library:
        // a PDF, a spreadsheet and a zip are all things a task points at, and
        // this is where they live. What `image` decides is whether the
        // interface DRAWS it — a thumbnail, a banner — or shows a file with a
        // name, which is all an attachment needs to be.
        let (_dir, assets) = library();
        assets.import("ok.png", b"x").unwrap();
        assets.import("nota-fiscal.pdf", b"xx").unwrap();
        // Even a file dropped in the folder by hand: the folder is the user's.
        std::fs::write(assets.dir().join("leiame.txt"), b"xxx").unwrap();

        let listed = assets.list().unwrap();
        assert_eq!(listed.len(), 3);
        let by_name = |n: &str| listed.iter().find(|a| a.name == n).unwrap();
        assert!(by_name("ok.png").image);
        assert!(!by_name("nota-fiscal.pdf").image);
        assert!(!by_name("leiame.txt").image);
        assert_eq!(by_name("nota-fiscal.pdf").size, 2);
    }

    #[test]
    fn a_name_that_cannot_be_a_file_name_is_still_refused() {
        // Storing anything does not mean storing it anywhere: the name still
        // has to survive being a file name, and it still cannot escape.
        let (_dir, assets) = library();
        for name in ["", "   ", "..", "/", "."] {
            assert!(assets.import(name, b"x").is_err(), "{name:?}");
        }
    }

    #[test]
    fn an_address_that_escapes_the_library_is_refused() {
        let (_dir, assets) = library();
        for address in [
            "assets/../../etc/passwd",
            "../secret.png",
            "assets/sub/deep.png",
            "assets/",
            "sunset.jpg",
            "jott.notes/Inbox/nota.md",
        ] {
            assert!(assets.file(address).is_err(), "{address}");
        }
    }

    #[test]
    fn a_name_with_a_path_in_it_keeps_only_the_leaf() {
        let (_dir, assets) = library();
        let address = assets.import("C:\\Users\\gus\\foto.png", b"x").unwrap();
        assert_eq!(address, "assets/foto.png");
    }

    #[test]
    fn extensions_are_recognised_whatever_their_case() {
        assert!(is_image_name("FOTO.JPG"));
        assert!(is_image_name("a.WebP"));
        assert!(!is_image_name("a.mp4"));
        assert!(!is_image_name("semponto"));
    }

    #[test]
    fn the_newest_asset_is_listed_first() {
        let (_dir, assets) = library();
        assets.import("old.png", b"x").unwrap();
        // Two files written in the same second would tie, and the tie-break is
        // the name; stamping the older one back an hour is what makes this a
        // test of the ORDER rather than of the filesystem's clock resolution.
        let old = assets.file("assets/old.png").unwrap();
        let hour_ago = std::time::SystemTime::now() - std::time::Duration::from_secs(3600);
        std::fs::File::options()
            .write(true)
            .open(&old)
            .unwrap()
            .set_modified(hour_ago)
            .unwrap();

        assets.import("new.png", b"x").unwrap();
        let listed = assets.list().unwrap();
        assert_eq!(listed[0].name, "new.png");
        assert_eq!(listed[1].name, "old.png");
    }
}
