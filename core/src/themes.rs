//! Themes the reader brings into their own notebook (2026-08-25).
//!
//! The app ships three looks, and until now that was the whole list: a fourth
//! meant a pull request. This module reads the other source — `.jott/themes/`,
//! inside the notebook, which travels with it the way every other preference
//! that answers to a *person* does.
//!
//! **Two shapes, because they answer two different moments.** A single
//! `<name>.css` is the ten-second one: copy a file in, it is a theme. A folder
//! `<name>/` with `theme.css` beside a `manifest.json` is the one a theme
//! MEANT to be shared takes — it carries an author, a version, and the field
//! that cannot be invented later, `minAppVersion`. Without it a stylesheet
//! written for a future Jott would dress an older one and quietly leave half
//! the app uncoloured; with it the app can say so instead.
//!
//! **The name is the folder (or the file), and it is also the `data-theme`
//! value.** That is what lets a theme copied from `styles/themes/default.css`
//! work unchanged, keyed selectors and all — and equally lets a short theme
//! skip the name entirely and assign the two regions directly, because when
//! the attribute matches no theme the app ships, none of them apply.
//!
//! **Nothing here reaches the network.** A stylesheet is text the app injects
//! into its own document, so a `url()` pointing at a host would call home
//! every time the app opened — from a file the reader may have downloaded
//! rather than written. Remote references are neutralised on the way through,
//! and the count is reported so the interface can say what happened rather
//! than silently changing somebody's theme.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{Error, IoContext, Result};
use crate::{fsio, jsondoc, relpath, version};

/// The folder inside `.jott/` that holds them.
pub const THEMES_DIR: &str = "themes";

/// The stylesheet of a folder-shaped theme.
const CSS_FILE: &str = "theme.css";

/// Its optional metadata.
const MANIFEST_FILE: &str = "manifest.json";

/// The names the app already answers to. A notebook theme called `dark` would
/// be unreachable — the app's own selectors would win the moment the attribute
/// matched — so it is refused with its reason rather than listed and broken.
pub const RESERVED: [&str; 3] = ["default", "light", "dark"];

/// The most stylesheet the app will inject, in bytes.
///
/// A real theme is a few hundred lines; the cap exists for the other case. It
/// is generous on purpose — Obsidian's Blue Topaz is 1.3 MB of CSS, and a
/// theme of that shape should load rather than be told it is too big.
pub const MAX_CSS_BYTES: u64 = 4 * 1024 * 1024;

/// A theme the notebook carries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserTheme {
    /// Folder or file name, without `.css`. This is the `data-theme` value.
    pub name: String,
    /// What the settings screen shows: the manifest's `name`, or the folder's.
    pub label: String,
    pub author: Option<String>,
    pub version: Option<String>,
    /// The oldest app this theme says it needs.
    pub min_app_version: Option<String>,
    /// False when `minAppVersion` is newer than the app asking. The theme is
    /// still listed — hiding it would leave the reader wondering where the
    /// file went — and still wearable; what it buys is a sentence in the
    /// interface instead of a half-painted app and no explanation.
    pub supported: bool,
}

/// Where they live, given the notebook's `.jott/`.
pub fn dir(config_dir: impl AsRef<Path>) -> PathBuf {
    config_dir.as_ref().join(THEMES_DIR)
}

/// Every theme in the notebook, in reading order.
///
/// Never an error: a notebook with no `themes/` folder has no themes, which
/// is the ordinary case and not a failure (`fsio::dir_paths`). A file that is
/// not a stylesheet, a folder with no `theme.css`, a name the app already
/// uses, a name that could not be an attribute value — each is skipped, and
/// the rest of the list still arrives.
pub fn list(config_dir: impl AsRef<Path>, app_version: &str) -> Vec<UserTheme> {
    let mut themes: Vec<UserTheme> = fsio::dir_paths(dir(config_dir))
        .unwrap_or_default()
        .into_iter()
        .filter_map(|path| read_entry(&path, app_version))
        .collect();
    // By what the reader sees, not by what the filesystem happens to answer.
    themes.sort_by_key(|theme| theme.label.to_lowercase());
    themes
}

/// One theme by name, or `None` when the notebook has no such theme.
pub fn find(config_dir: impl AsRef<Path>, name: &str, app_version: &str) -> Option<UserTheme> {
    list(config_dir, app_version)
        .into_iter()
        .find(|theme| theme.name == name)
}

/// A stylesheet, ready to be put in the document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stylesheet {
    pub name: String,
    pub css: String,
    /// How many remote references were neutralised on the way here.
    pub blocked: usize,
}

/// Reads a theme's CSS, with every remote reference neutralised.
pub fn css(config_dir: impl AsRef<Path>, name: &str) -> Result<Stylesheet> {
    let path = css_path(config_dir, name)
        .ok_or_else(|| Error::Theme(format!("no theme named {name:?} in this notebook")))?;

    let size = std::fs::metadata(&path).ctx(&path)?.len();
    if size > MAX_CSS_BYTES {
        return Err(Error::Theme(format!(
            "the theme {name:?} is {size} bytes, past the {MAX_CSS_BYTES} this app will load"
        )));
    }

    let text = std::fs::read_to_string(&path).ctx(&path)?;
    let (css, blocked) = sanitize(&text);
    Ok(Stylesheet {
        name: name.to_string(),
        css,
        blocked,
    })
}

/// The stylesheet of a theme by name, whichever shape it takes.
fn css_path(config_dir: impl AsRef<Path>, name: &str) -> Option<PathBuf> {
    if !is_usable_name(name) {
        return None;
    }
    let folder = dir(config_dir);
    let nested = folder.join(name).join(CSS_FILE);
    if nested.is_file() {
        return Some(nested);
    }
    let flat = folder.join(format!("{name}.css"));
    flat.is_file().then_some(flat)
}

/// A name that can be a folder name, an attribute value and a theme setting.
fn is_usable_name(name: &str) -> bool {
    relpath::is_safe_leaf(name)
        && !name.contains('"')
        && !RESERVED.contains(&name.to_lowercase().as_str())
}

/// One entry of `themes/`: a `.css` file, or a folder holding `theme.css`.
fn read_entry(path: &Path, app_version: &str) -> Option<UserTheme> {
    if fsio::is_hidden(path) {
        return None;
    }

    let (name, manifest) = if path.is_dir() {
        if !path.join(CSS_FILE).is_file() {
            return None;
        }
        (
            fsio::file_name_of(path),
            jsondoc::load(path.join(MANIFEST_FILE)),
        )
    } else {
        if path.extension().is_none_or(|ext| ext != "css") {
            return None;
        }
        (
            path.file_stem()?.to_string_lossy().to_string(),
            jsondoc::Doc::new(),
        )
    };

    if !is_usable_name(&name) {
        return None;
    }

    let min_app_version = jsondoc::string(&manifest, "minAppVersion").filter(|v| !v.is_empty());
    Some(UserTheme {
        label: jsondoc::string(&manifest, "name")
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| name.clone()),
        author: jsondoc::string(&manifest, "author").filter(|a| !a.trim().is_empty()),
        version: jsondoc::string(&manifest, "version").filter(|v| !v.trim().is_empty()),
        // "Needs a newer app" is exactly `is_newer(minAppVersion, mine)`. A
        // value that is not a version reads as no requirement at all — the
        // same tolerance the update check keeps, and for the same reason: a
        // typo in a manifest must not lock somebody out of their own theme.
        supported: !min_app_version
            .as_deref()
            .is_some_and(|min| version::is_newer(min, app_version)),
        min_app_version,
        name,
    })
}

/// Writes a new theme into the notebook, as a folder with a manifest.
///
/// **The app can write one, and that is the difference between a format and a
/// format somebody uses.** A theme assigns both regions in full — the same
/// contract the app's own three keep — which is ~170 declarations nobody is
/// going to type from a documentation page. So the interface hands over the
/// stylesheet the app is wearing right now, and the reader edits colours in a
/// file that already works.
///
/// The folder shape rather than a loose file, because a theme made to be kept
/// is a theme that wants a name and a version. Refuses to overwrite: a theme
/// is somebody's work, even five minutes old.
pub fn create(config_dir: impl AsRef<Path>, name: &str, css: &str) -> Result<UserTheme> {
    if !is_usable_name(name) {
        return Err(Error::Theme(format!(
            "{name:?} cannot be a theme name here — the app already answers to \
             default, light and dark"
        )));
    }

    let folder = dir(&config_dir).join(name);
    if folder.exists() {
        return Err(Error::Theme(format!(
            "this notebook already has a theme called {name:?}"
        )));
    }

    let manifest = jsondoc::render(
        &jsondoc::Doc::new(),
        jsondoc::owned([
            ("name", serde_json::Value::String(name.to_string())),
            ("version", serde_json::Value::String("1.0.0".to_string())),
        ]),
        &[],
    );
    fsio::write_atomically(folder.join(MANIFEST_FILE), manifest.as_bytes())?;
    fsio::write_atomically(folder.join(CSS_FILE), css.as_bytes())?;

    read_entry(&folder, "0.0.0").ok_or_else(|| Error::Theme("the theme could not be read back".into()))
}

/// Whether an address in a stylesheet would leave the machine.
fn is_remote(target: &str) -> bool {
    let target = target.trim().trim_matches(['"', '\'']).trim();
    let lower = target.to_lowercase();
    lower.starts_with("//")
        || ["http:", "https:", "ftp:", "ftps:", "file:", "ws:", "wss:"]
            .iter()
            .any(|scheme| lower.starts_with(scheme))
}

/// The address `url()` is rewritten to. `about:invalid` is the value CSS
/// itself defines for an image that is deliberately not there: it resolves to
/// nothing, and — unlike an empty string, which resolves to the document and
/// so fetches the page again — it makes no request at all.
const NEUTRAL_URL: &str = "url(\"about:invalid\")";

/// Neutralises everything in a stylesheet that would reach the network.
///
/// Two forms carry an address: `@import`, which pulls in another stylesheet,
/// and `url()`, which is every image, font and cursor. A remote `@import` is
/// dropped whole — a rewritten one would still be an import of nothing — and
/// a remote `url()` becomes `about:invalid`, which keeps the declaration
/// syntactically intact so the rest of the rule still applies.
///
/// `data:` is left alone: it is bytes already in the file, which is how a
/// self-contained theme carries its own image.
///
/// Returns the stylesheet and how many references were neutralised.
pub fn sanitize(css: &str) -> (String, usize) {
    let (css, imports) = strip_remote_imports(css);
    let (css, urls) = neutralise_remote_urls(&css);
    (css, imports + urls)
}

fn strip_remote_imports(css: &str) -> (String, usize) {
    let lower = css.to_lowercase();
    let mut out = String::with_capacity(css.len());
    let mut removed = 0;
    let mut at = 0;

    while let Some(found) = lower[at..].find("@import") {
        let start = at + found;
        // The rule runs to its semicolon; a block would make it a conditional
        // import (`@import ... supports(...)`), which ends at the brace.
        let end = css[start..]
            .find([';', '{'])
            .map(|i| start + i + 1)
            .unwrap_or(css.len());
        if is_remote_import(&css[start..end]) {
            out.push_str(&css[at..start]);
            removed += 1;
        } else {
            out.push_str(&css[at..end]);
        }
        at = end;
    }
    out.push_str(&css[at..]);
    (out, removed)
}

/// Whether an `@import` rule names an address off this machine. The target is
/// either a bare string or a `url()`; both are read the same way once the
/// keyword and the punctuation are off.
fn is_remote_import(rule: &str) -> bool {
    let body = rule
        .trim_start()
        .get("@import".len()..)
        .unwrap_or_default()
        .trim_start();
    let target = match body.strip_prefix("url(").or_else(|| {
        body.get(..4)
            .filter(|p| p.eq_ignore_ascii_case("url("))
            .and(body.get(4..))
    }) {
        Some(inside) => inside.split(')').next().unwrap_or_default(),
        None => body,
    };
    is_remote(target.trim_end_matches([';', '{']))
}

fn neutralise_remote_urls(css: &str) -> (String, usize) {
    let lower = css.to_lowercase();
    let mut out = String::with_capacity(css.len());
    let mut blocked = 0;
    let mut at = 0;

    while let Some(found) = lower[at..].find("url(") {
        let start = at + found;
        let Some(close) = css[start..].find(')').map(|i| start + i + 1) else {
            break;
        };
        let inside = &css[start + "url(".len()..close - 1];
        out.push_str(&css[at..start]);
        if is_remote(inside) {
            out.push_str(NEUTRAL_URL);
            blocked += 1;
        } else {
            out.push_str(&css[start..close]);
        }
        at = close;
    }
    out.push_str(&css[at..]);
    (out, blocked)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A notebook's `.jott/`, with themes in it.
    fn config_dir() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(THEMES_DIR)).unwrap();
        dir
    }

    fn write(dir: &Path, relative: &str, text: &str) {
        let path = dir.join(relative);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }

    #[test]
    fn a_notebook_with_no_themes_folder_has_no_themes() {
        let dir = tempfile::tempdir().unwrap();
        assert!(list(dir.path(), "1.0.0").is_empty());
    }

    #[test]
    fn a_loose_css_file_is_a_theme() {
        let dir = config_dir();
        write(dir.path(), "themes/solarized.css", ":root { --x: 1; }");

        let themes = list(dir.path(), "1.0.0");
        assert_eq!(themes.len(), 1);
        assert_eq!(themes[0].name, "solarized");
        // With no manifest the label is the file name, and nothing is claimed
        // about authorship or compatibility.
        assert_eq!(themes[0].label, "solarized");
        assert_eq!(themes[0].author, None);
        assert!(themes[0].supported);
    }

    #[test]
    fn a_folder_with_a_manifest_carries_its_metadata() {
        let dir = config_dir();
        write(dir.path(), "themes/blue/theme.css", ":root { --x: 1; }");
        write(
            dir.path(),
            "themes/blue/manifest.json",
            r#"{ "name": "Blue Topaz", "author": "Someone", "version": "2.1.0",
                 "minAppVersion": "0.30.0" }"#,
        );

        let themes = list(dir.path(), "0.37.0");
        assert_eq!(themes.len(), 1);
        // The NAME is still the folder — it is what the attribute says — while
        // the label is what the manifest wants shown.
        assert_eq!(themes[0].name, "blue");
        assert_eq!(themes[0].label, "Blue Topaz");
        assert_eq!(themes[0].author.as_deref(), Some("Someone"));
        assert_eq!(themes[0].version.as_deref(), Some("2.1.0"));
        assert!(themes[0].supported);
    }

    #[test]
    fn a_theme_written_for_a_newer_app_is_listed_as_unsupported() {
        let dir = config_dir();
        write(dir.path(), "themes/future/theme.css", ":root {}");
        write(
            dir.path(),
            "themes/future/manifest.json",
            r#"{ "minAppVersion": "9.0.0" }"#,
        );

        let themes = list(dir.path(), "0.37.0");
        assert_eq!(themes.len(), 1, "it is still offered, with a reason");
        assert!(!themes[0].supported);
        assert_eq!(themes[0].min_app_version.as_deref(), Some("9.0.0"));
    }

    #[test]
    fn a_manifest_that_is_broken_costs_only_its_own_fields() {
        let dir = config_dir();
        write(dir.path(), "themes/rough/theme.css", ":root {}");
        write(dir.path(), "themes/rough/manifest.json", "{ not json at all");

        let themes = list(dir.path(), "0.37.0");
        // The stylesheet is what makes it a theme; the manifest only decorates.
        assert_eq!(themes.len(), 1);
        assert_eq!(themes[0].label, "rough");
        assert!(themes[0].supported);
    }

    #[test]
    fn a_minimum_version_that_is_not_a_version_is_no_requirement() {
        let dir = config_dir();
        write(dir.path(), "themes/odd/theme.css", ":root {}");
        write(
            dir.path(),
            "themes/odd/manifest.json",
            r#"{ "minAppVersion": "tomorrow" }"#,
        );

        assert!(list(dir.path(), "0.37.0")[0].supported);
    }

    #[test]
    fn the_apps_own_names_are_refused() {
        let dir = config_dir();
        write(dir.path(), "themes/dark.css", ":root {}");
        write(dir.path(), "themes/Light/theme.css", ":root {}");
        write(dir.path(), "themes/mine.css", ":root {}");

        let names: Vec<_> = list(dir.path(), "1.0.0")
            .into_iter()
            .map(|t| t.name)
            .collect();
        // A notebook theme called `dark` could never be worn: the app's own
        // selectors answer to that attribute first.
        assert_eq!(names, vec!["mine"]);
    }

    #[test]
    fn what_is_not_a_theme_is_skipped_without_taking_the_rest_with_it() {
        let dir = config_dir();
        write(dir.path(), "themes/README.txt", "notes to self");
        write(dir.path(), "themes/half/manifest.json", "{}");
        write(dir.path(), "themes/.hidden.css", ":root {}");
        write(dir.path(), "themes/good.css", ":root {}");

        let names: Vec<_> = list(dir.path(), "1.0.0")
            .into_iter()
            .map(|t| t.name)
            .collect();
        assert_eq!(names, vec!["good"]);
    }

    #[test]
    fn themes_are_listed_the_way_a_person_reads_them() {
        let dir = config_dir();
        write(dir.path(), "themes/zinc.css", ":root {}");
        write(dir.path(), "themes/amber/theme.css", ":root {}");
        write(
            dir.path(),
            "themes/amber/manifest.json",
            r#"{ "name": "Nord" }"#,
        );

        let labels: Vec<_> = list(dir.path(), "1.0.0")
            .into_iter()
            .map(|t| t.label)
            .collect();
        // By the label — what the settings screen shows — not by the folder.
        assert_eq!(labels, vec!["Nord", "zinc"]);
    }

    #[test]
    fn the_stylesheet_is_read_from_either_shape() {
        let dir = config_dir();
        write(dir.path(), "themes/flat.css", ":root { --a: 1; }");
        write(dir.path(), "themes/deep/theme.css", ":root { --b: 2; }");

        assert_eq!(css(dir.path(), "flat").unwrap().css, ":root { --a: 1; }");
        assert_eq!(css(dir.path(), "deep").unwrap().css, ":root { --b: 2; }");
    }

    #[test]
    fn a_folder_wins_over_a_file_of_the_same_name() {
        let dir = config_dir();
        write(dir.path(), "themes/twin.css", ":root { --file: 1; }");
        write(dir.path(), "themes/twin/theme.css", ":root { --folder: 1; }");

        // The shape that carries a manifest is the one that meant to be a
        // theme; the loose file beside it is the leftover.
        assert_eq!(css(dir.path(), "twin").unwrap().css, ":root { --folder: 1; }");
    }

    #[test]
    fn asking_for_a_theme_that_is_not_there_says_so() {
        let dir = config_dir();
        assert!(css(dir.path(), "ghost").is_err());
        // And a name that could escape the folder never becomes a path.
        assert!(css(dir.path(), "../../etc/passwd").is_err());
    }

    #[test]
    fn a_stylesheet_past_the_cap_is_refused_rather_than_injected() {
        let dir = config_dir();
        let huge = "a".repeat(MAX_CSS_BYTES as usize + 1);
        write(dir.path(), "themes/huge.css", &huge);

        assert!(css(dir.path(), "huge").is_err());
    }

    #[test]
    fn the_app_can_write_a_theme_and_read_it_straight_back() {
        let dir = config_dir();
        let made = create(dir.path(), "mine", "[data-region=\"canvas\"] { --theme-bg: #fff; }")
            .unwrap();

        assert_eq!(made.name, "mine");
        // The folder shape, manifest included: a theme meant to be kept.
        assert!(dir.path().join("themes/mine/manifest.json").is_file());
        assert_eq!(
            css(dir.path(), "mine").unwrap().css,
            "[data-region=\"canvas\"] { --theme-bg: #fff; }"
        );
        assert_eq!(list(dir.path(), "1.0.0").len(), 1);
    }

    #[test]
    fn writing_a_theme_never_overwrites_one() {
        let dir = config_dir();
        create(dir.path(), "mine", "a").unwrap();

        assert!(create(dir.path(), "mine", "b").is_err());
        // Five minutes old is still somebody's work.
        assert_eq!(css(dir.path(), "mine").unwrap().css, "a");
    }

    #[test]
    fn the_names_the_app_answers_to_are_refused_at_the_door() {
        let dir = config_dir();
        // Not silently renamed: the reader typed it, and a theme called `dark`
        // would simply never show.
        assert!(create(dir.path(), "dark", "a").is_err());
        assert!(create(dir.path(), "../escape", "a").is_err());
    }

    #[test]
    fn a_remote_import_is_dropped_and_a_local_one_is_kept() {
        let (css, blocked) = sanitize(
            "@import url(\"https://fonts.example/x.css\");\n\
             @import \"partial.css\";\n\
             :root { --a: 1; }",
        );

        assert_eq!(blocked, 1);
        assert!(!css.contains("fonts.example"));
        assert!(css.contains("@import \"partial.css\";"));
        assert!(css.contains("--a: 1;"));
    }

    #[test]
    fn a_remote_url_is_neutralised_and_the_declaration_survives() {
        let (css, blocked) = sanitize(
            ".x { background: url(http://tracker.example/pixel.png) no-repeat; }",
        );

        assert_eq!(blocked, 1);
        // The rule still parses — only the address is gone.
        assert!(css.contains("no-repeat"));
        assert!(css.contains("about:invalid"));
        assert!(!css.contains("tracker.example"));
    }

    #[test]
    fn what_never_leaves_the_machine_is_left_alone() {
        let source = ".a { background: url(\"pattern.png\"); }\n\
                      .b { background: url(data:image/gif;base64,R0lGOD); }\n\
                      .c { cursor: url(cursors/hand.cur), pointer; }";
        let (css, blocked) = sanitize(source);

        assert_eq!(blocked, 0);
        assert_eq!(css, source, "a local theme goes through untouched");
    }

    #[test]
    fn a_protocol_relative_address_counts_as_remote() {
        // `//host/x.png` inherits the page's scheme — still a request off
        // this machine, and the form a copied snippet most often carries.
        let (_, blocked) = sanitize(".x { background: url(//cdn.example/x.png); }");
        assert_eq!(blocked, 1);
    }

    #[test]
    fn the_count_covers_every_reference_not_just_the_first() {
        let (css, blocked) = sanitize(
            "@import url(https://a.example/1.css);\n\
             @import url(https://b.example/2.css);\n\
             .x { background: url(https://c.example/3.png); }\n\
             .y { background: url(https://d.example/4.png); }",
        );

        assert_eq!(blocked, 4);
        assert!(!css.contains("example"));
    }
}
