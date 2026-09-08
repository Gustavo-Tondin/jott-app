//! The asset library: one flat `assets/` folder at the notebook root, shared
//! by every note and task so an address (`assets/sunset.jpg`, root-relative)
//! survives a note being moved. Any file goes in; only an image is DRAWN
//! ([`is_image_name`]). What an address means in a document is decided by
//! `embeds.js` (`[[/x.png]]`), [`crate::note`] (banner) and [`crate::task::Attachment`].

use std::path::{Path, PathBuf};

use crate::error::{Error, IoContext, Result};
use crate::relpath;

/// The library folder, relative to the notebook root. No `jott.` prefix: it
/// is not a space and never appears in the sidebar.
pub const ASSETS_DIR: &str = "assets";

/// What the app DRAWS, lowercase — a filter on banners, `![](…)` and
/// thumbnails, not on what may be stored. Closed list: the webview has to
/// draw these. THE list: [`extension_for_type`] answers out of it, and the
/// bridge must not keep a copy.
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
    /// Whether the interface can DRAW it (thumbnail, banner, image in a
    /// note). Everything else is a file with a name.
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

    /// Every file in the folder, newest first. A missing folder is an empty
    /// library, never an error: it only exists after the first import.
    pub fn list(&self) -> Result<Vec<AssetEntry>> {
        let mut found: Vec<AssetEntry> = Vec::new();
        for path in crate::fsio::dir_paths(&self.dir)? {
            // Hidden entries are another tool's; the library is flat.
            if crate::fsio::is_hidden(&path) || !path.is_file() {
                continue;
            }
            let name = crate::fsio::file_name_of(&path);
            let meta = std::fs::metadata(&path).ok();
            found.push(AssetEntry {
                path: address(&name),
                image: is_image_name(&name),
                name,
                size: meta.as_ref().map_or(0, |m| m.len()),
                modified: meta.and_then(|m| m.modified().ok()).and_then(|time| {
                    time.duration_since(std::time::UNIX_EPOCH)
                        .ok()
                        .map(|d| d.as_secs())
                }),
            });
        }
        // Newest first, then by name — the same order as the notes board.
        found.sort_by(|a, b| {
            b.modified
                .cmp(&a.modified)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(found)
    }

    /// Writes a file into the library, returning its root-relative address.
    /// A colliding name is suffixed, never overwritten.
    pub fn import(&self, file_name: &str, bytes: &[u8]) -> Result<String> {
        let name = sanitize_name(file_name)?;
        std::fs::create_dir_all(&self.dir).ctx(&self.dir)?;
        let target = crate::fsio::free_name(&self.dir, &name);
        crate::fsio::write_atomically(&target, bytes)?;
        Ok(address(&crate::fsio::file_name_of(&target)))
    }

    /// The file behind an address, or an error when it is not one of ours.
    /// Every address from the interface is user input (`..` in a link is
    /// ordinary), so it goes through here.
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

/// The file name inside a library address — `None` for anything else.
/// Strict: `assets/x.png` and nothing else. An address pointing outside is a
/// link the user wrote to their own file, not the app's to resolve.
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

/// The extension a picture of this content type is stored under; `None` for
/// anything the app cannot draw (same closed list). Downloading is the
/// bridge's; deciding what came back is a picture is the library's.
pub fn extension_for_type(content_type: &str) -> Option<&'static str> {
    // The two subtypes whose extension is not the subtype itself; the rest
    // is answered by the closed list, so a format added there is accepted here.
    let extension = match content_type.strip_prefix("image/")? {
        "jpeg" | "jpg" => "jpg",
        "svg+xml" => "svg",
        other => other,
    };
    IMAGE_EXTENSIONS
        .iter()
        .find(|known| **known == extension)
        .copied()
}

/// A name for the file, from the last readable piece of an address. Query
/// string and claimed extension are dropped (the content type decides,
/// [`extension_for_type`]); `image` when there is nothing to go on.
pub fn name_from_url(url: &str) -> String {
    let path = url
        .trim_start_matches("https://")
        .split(['?', '#'])
        .next()
        .unwrap_or_default();
    let leaf = path.rsplit('/').find(|piece| !piece.is_empty()).unwrap_or("");
    let stem = leaf.rsplit_once('.').map(|(head, _)| head).unwrap_or(leaf);
    let cleaned: String = stem
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | ' '))
        .collect();
    let cleaned = cleaned.trim().to_string();
    if cleaned.is_empty() {
        "image".to_string()
    } else {
        cleaned
    }
}

/// An imported name becomes a file name, so it has to survive being one.
fn sanitize_name(name: &str) -> Result<String> {
    // Some file pickers send `folder/file.png`; only the leaf is ours.
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

    #[test]
    fn a_name_is_made_from_the_address_and_the_type() {
        // Query string and all: the extension comes from the content type,
        // never from the URL.
        assert_eq!(
            name_from_url(
                "https://cdnb.artstation.com/p/assets/images/087/large/daoz-51.jpg?1747030361"
            ),
            "daoz-51"
        );
        assert_eq!(name_from_url("https://exemplo.com/foto"), "foto");
        assert_eq!(name_from_url("https://exemplo.com/"), "exemplo");
        // Nothing usable at the end of the address: the library will suffix
        // a colliding `image.png` rather than overwrite one.
        assert_eq!(name_from_url("https://exemplo.com/a/../"), "image");
    }

    #[test]
    fn only_what_the_app_can_draw_comes_back() {
        assert_eq!(extension_for_type("image/jpeg"), Some("jpg"));
        assert_eq!(extension_for_type("image/svg+xml"), Some("svg"));
        assert_eq!(extension_for_type("text/html"), None);
        assert_eq!(extension_for_type(""), None);
    }

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
        // A PDF, a spreadsheet, a zip all live here; `image` only says whether
        // the interface DRAWS it or shows a file with a name.
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
        // Same-second writes tie on the name; stamping the older one back an
        // hour makes this a test of the order, not of the clock resolution.
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
