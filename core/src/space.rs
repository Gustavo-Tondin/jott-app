//! Spaces: the folders of the notebook that carry a `.space.json`,
//! and the groups (`.group.json`) that gather them in the sidebar.
//!
//! Model (spec 3.5, rewritten 2026-08-11): **notebook → [group] → space
//! → file**. A folder *with* a `.space.json` is a space; every other
//! folder is ignored — a stray folder dropped into the notebook must never
//! turn into interface on its own. A space has a single function — its
//! `type` (`tasks` or `notes`) — and owns its files directly; the widget
//! layer that used to sit between the space and its files was cut.
//! The type comes from the config, never from the folder name, so two task
//! spaces can be called `Backlog/` and `Bugs/`.
//!
//! The config file follows the same covenant as `.jott/config.json`:
//!
//! - a missing or malformed value falls back to a default, never an error;
//! - an **unknown key survives the rewrite** — including a space of
//!   unknown type. A template written for a future version must open as
//!   "not supported yet", never be destroyed;
//! - a `schemaVersion` above what this build knows opens the space
//!   read-only, and saving is refused.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::error::{Error, Result};
use crate::jsondoc;

/// The marker file that makes a folder a space.
pub const SPACE_CONFIG_FILE: &str = ".space.json";

/// The marker file that makes a folder a group of spaces.
pub const GROUP_CONFIG_FILE: &str = ".group.json";

/// Schema version this build understands.
pub const SUPPORTED_SPACE_SCHEMA: u64 = 1;

/// Space types this build ships (`home` exists only on the fixed Home).
/// Anything else is *kept and shown as unsupported*, never dropped — see
/// [`SpaceConfig::is_known`].
const KNOWN_SPACE_KINDS: [&str; 3] = ["tasks", "notes", "home"];

/// What a folder of notes inside a space carries, beyond its own name.
///
/// Both are the user's choices about a place, not about its files — which is
/// why they live in the space's config and not in the `.md`s below.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FolderSettings {
    /// A palette NAME (`"red"`), never a hex — the same rule every colour in
    /// a Jott notebook follows. `None` means the place has no colour of its
    /// own and reads as the space's.
    pub color: Option<String>,
    /// Kept at the top of the board, the way a pinned note is.
    pub pinned: bool,
    /// The entry exactly as it was read, for the unknown-key promise — the
    /// same one the documents themselves keep. A key a newer build wrote here
    /// (an icon, a cover) survives this build rewriting the colour beside it.
    raw: serde_json::Map<String, Value>,
}

impl FolderSettings {
    /// True when there is nothing left to write down — no colour, no pin, and
    /// nothing a future build left behind. Such an entry is dropped rather
    /// than saved as `{}`: an empty object in the file would be litter the app
    /// leaves every time a colour is cleared.
    pub fn is_empty(&self) -> bool {
        self.color.is_none()
            && !self.pinned
            && !self
                .raw
                .keys()
                .any(|key| key != "color" && key != "pinned")
    }

    fn from_entry(entry: &serde_json::Map<String, Value>) -> Self {
        Self {
            color: entry.get("color").and_then(Value::as_str).map(str::to_string),
            pinned: entry.get("pinned").and_then(Value::as_bool).unwrap_or(false),
            raw: entry.clone(),
        }
    }

    /// The entry as it goes back to disk: what was read, with this build's two
    /// keys written over it and the cleared ones taken out.
    fn to_entry(&self) -> serde_json::Map<String, Value> {
        let mut entry = self.raw.clone();
        match &self.color {
            Some(color) => entry.insert("color".into(), Value::from(color.clone())),
            None => entry.remove("color"),
        };
        match self.pinned {
            true => entry.insert("pinned".into(), Value::from(true)),
            false => entry.remove("pinned"),
        };
        entry
    }
}

/// A space's `.space.json`, in memory.
///
/// Since the 2026-08-11 pivot this also carries what used to live in the
/// widget's own config: the `type` (the space's single function) and the
/// `sort`/`order` arrangement of its content.
#[derive(Debug, Clone)]
pub struct SpaceConfig {
    schema_version: u64,
    /// The space type (`tasks`, `notes`, `home` on the fixed Home, or
    /// something this build has never heard of). Empty when the file has no
    /// usable `type` — still kept, so nothing the user wrote is lost.
    pub kind: String,
    /// Display name. Falls back to the folder name when absent.
    pub name: Option<String>,
    /// The space's accent colour (any CSS colour string), shown on its
    /// group bar in the sidebar. Absent means the sidebar's default accent.
    pub color: Option<String>,
    /// The space's icon (a Phosphor icon name the frontend knows). Absent
    /// falls back to the generic folder icon.
    pub icon: Option<String>,
    /// How the space arranges its items (`name`, `created`, `completed`,
    /// `custom`). `None` — or a value this build has never heard of — reads
    /// as the file order. A view preference, so the core stores it verbatim.
    pub sort: Option<String>,
    /// The hand-dragged arrangement (task ids for a tasks space, note
    /// paths for a notes one), read when `sort` is `custom`. Lives here and
    /// never in the content files — the order is an app preference, the `.md`
    /// is the user's.
    pub order: Vec<String>,
    /// What each FOLDER of notes inside this space carries: a colour, and
    /// whether it is kept at the top. Keyed by the folder's address relative
    /// to the space (`Clientes`, `Clientes/2026`).
    ///
    /// **Here and not in the folder itself** (2026-08-19): a folder of notes
    /// is a plain directory, and the app does not scatter marker files through
    /// the user's own tree — that is the same reason a note folder has never
    /// had a colour before. The space already carries the arrangement of its
    /// contents (`sort`/`order`); this is one more line of the same sentence.
    /// A folder with nothing to say has no entry at all.
    pub folders: BTreeMap<String, FolderSettings>,
    /// The document as read, for the unknown-key promise.
    raw: jsondoc::Doc,
}

impl Default for SpaceConfig {
    fn default() -> Self {
        Self {
            schema_version: SUPPORTED_SPACE_SCHEMA,
            kind: String::new(),
            name: None,
            color: None,
            icon: None,
            sort: None,
            order: Vec::new(),
            folders: BTreeMap::new(),
            raw: jsondoc::Doc::new(),
        }
    }
}

impl SpaceConfig {
    /// Builds a config for a space the app itself creates.
    pub fn new(kind: impl Into<String>) -> Self {
        Self {
            kind: kind.into(),
            ..Self::default()
        }
    }

    pub fn schema_version(&self) -> u64 {
        self.schema_version
    }

    /// True when the file came from a newer app than this one. Same rule as
    /// the notebook config: read, never rewrite.
    pub fn is_read_only(&self) -> bool {
        self.schema_version > SUPPORTED_SPACE_SCHEMA
    }

    /// Whether this build knows how to render the space. An unknown one
    /// is shown as an "unsupported" card with its folder left untouched.
    pub fn is_known(&self) -> bool {
        KNOWN_SPACE_KINDS.contains(&self.kind.as_str())
    }

    /// Reads a config file. Missing or unreadable yields the defaults.
    pub fn load(path: impl AsRef<Path>) -> Self {
        Self::from_doc(jsondoc::load(path))
    }

    pub fn parse(text: &str) -> Self {
        Self::from_doc(jsondoc::parse(text))
    }

    fn from_doc(raw: jsondoc::Doc) -> Self {
        Self {
            schema_version: jsondoc::schema_version(&raw, SUPPORTED_SPACE_SCHEMA),
            kind: jsondoc::string(&raw, "type").unwrap_or_default(),
            name: jsondoc::string(&raw, "name"),
            color: jsondoc::string(&raw, "color"),
            icon: jsondoc::string(&raw, "icon"),
            sort: jsondoc::string(&raw, "sort"),
            // Malformed entries fall away one at a time, like every field.
            order: raw
                .get("order")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default(),
            // Same tolerance: an entry that is not an object, or a colour that
            // is not a string, simply falls away — one folder never spoils the
            // file for the others.
            folders: raw
                .get("folders")
                .and_then(Value::as_object)
                .map(|entries| {
                    entries
                        .iter()
                        .filter_map(|(name, value)| {
                            let settings = FolderSettings::from_entry(value.as_object()?);
                            (!settings.is_empty()).then(|| (name.clone(), settings))
                        })
                        .collect()
                })
                .unwrap_or_default(),
            raw,
        }
    }

    /// Renders the document: the file as read, with the owned keys written
    /// over it and the cleared ones removed.
    pub fn render(&self) -> String {
        let mut owned = jsondoc::owned([("schemaVersion", Value::from(self.schema_version))]);
        let mut cleared = Vec::new();
        // `type` is never cleared, only overwritten: a space whose type
        // this build cannot read (a future shape, an object where we expect a
        // string) keeps whatever is on disk — that is the whole "unsupported
        // space, folder untouched" promise of spec 3.5. A group's config
        // reuses this struct and simply has no `type` to write.
        if !self.kind.is_empty() {
            owned.insert("type".into(), Value::from(self.kind.clone()));
        }
        for (key, value) in [
            ("name", &self.name),
            ("color", &self.color),
            ("icon", &self.icon),
            ("sort", &self.sort),
        ] {
            match value {
                Some(value) => {
                    owned.insert(key.to_string(), Value::from(value.clone()));
                }
                // A cleared optional must be actively removed, or the old value
                // still sitting in `raw` survives the rewrite.
                None => cleared.push(key),
            }
        }
        if self.order.is_empty() {
            cleared.push("order");
        } else {
            owned.insert("order".into(), Value::from(self.order.clone()));
        }
        let folders: serde_json::Map<String, Value> = self
            .folders
            .iter()
            .filter(|(_, settings)| !settings.is_empty())
            .map(|(name, settings)| (name.clone(), Value::Object(settings.to_entry())))
            .collect();
        // `folders` is a key this build replaces whole instead of merging
        // into. jsondoc merges deeply, on purpose — that is what keeps an
        // unknown sibling key alive — but a deep merge cannot express a
        // REMOVAL, and a folder that was renamed or deleted has to stop being
        // in the file. Each entry carries what it was read with
        // (`FolderSettings::raw`), so nothing inside one is lost by clearing
        // the map before the merge.
        //
        // Cleared whether or not it has content, which is what says "replace"
        // rather than "remove": `render` clears before it merges, so the map
        // that goes in is the map that comes out. This file met the problem
        // first and used to lift `folders` out of the base document by hand;
        // the same silence turned out to be swallowing four maps in
        // config.rs, which is why the mechanism moved into jsondoc.
        cleared.push("folders");
        if !folders.is_empty() {
            owned.insert("folders".into(), Value::Object(folders));
        }

        jsondoc::render(&self.raw, owned, &cleared)
    }

    /// Writes the config atomically. Refuses when it came from a newer app.
    pub fn save(&self, path: impl AsRef<Path>) -> Result<()> {
        crate::error::guard_schema(self.schema_version, SUPPORTED_SPACE_SCHEMA)?;
        crate::fsio::write_atomically(path.as_ref(), self.render().as_bytes())
    }
}

/// An open space: a first-level folder plus its config.
#[derive(Debug, Clone)]
pub struct Space {
    root: PathBuf,
    folder_name: String,
    pub config: SpaceConfig,
}

impl Space {
    /// True when the folder carries the marker file.
    pub fn is_space(path: impl AsRef<Path>) -> bool {
        path.as_ref().join(SPACE_CONFIG_FILE).is_file()
    }

    /// Opens the space living in `path`.
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let root = path.as_ref().to_path_buf();
        if !Self::is_space(&root) {
            return Err(Error::NotASpace(root));
        }
        let folder_name = crate::fsio::file_name_of(&root);
        let config = SpaceConfig::load(root.join(SPACE_CONFIG_FILE));
        Ok(Self {
            root,
            folder_name,
            config,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The folder name, which is how states and origins will address the
    /// space — renaming the folder is renaming the space.
    pub fn folder_name(&self) -> &str {
        &self.folder_name
    }

    /// What the UI shows: **the folder name** (user call, 2026-08-13).
    ///
    /// The marker's `name` used to win, and that made the name a second copy
    /// of something the filesystem already stores. Two copies drift: renaming
    /// a space in the app wrote the marker and left the folder — and the
    /// list file inside it — under the old name, so the sidebar and the disk
    /// disagreed. It also went one way only: renaming the folder in a file
    /// manager changed nothing on screen.
    ///
    /// The **app's own folders are the exception**, and the only one. They are
    /// called `jott.tasks`, `jott.notes`, `jott.home` precisely so the plain
    /// words stay free for the user, so their folder name is an identifier and
    /// not a label; their marker carries the name the interface reads. A user
    /// space cannot take that route — there, the folder IS the name.
    pub fn display_name(&self) -> &str {
        if !is_app_folder(&self.folder_name) {
            return &self.folder_name;
        }
        self.config
            .name
            .as_deref()
            .filter(|name| !name.trim().is_empty())
            .unwrap_or(&self.folder_name)
    }

    pub fn config_path(&self) -> PathBuf {
        self.root.join(SPACE_CONFIG_FILE)
    }

    /// The space's single function (`tasks`, `notes`, `home`), straight
    /// from the config. Empty means a type this build cannot read — shown as
    /// unsupported, folder untouched.
    pub fn kind(&self) -> &str {
        &self.config.kind
    }
}

/// The direct subfolders of `parent` that carry `marker`, sorted by name.
///
/// **This is the rule of spec 3.5, in one place:** a folder only becomes
/// interface by carrying its marker file — never on its own. A folder someone
/// dropped in (a download, an attachments dir, whatever a sync tool leaves) is
/// ignored, and so is anything hidden.
///
/// The two discoveries of the app are the same scan with a different marker:
/// spaces (`.space.json`) inside the notebook or a group, and groups
/// (`.group.json`) at the root.
pub fn marker_dirs(parent: &Path, marker: &str) -> Result<Vec<PathBuf>> {
    let mut found: Vec<PathBuf> = crate::fsio::dir_paths(parent)?
        .into_iter()
        .filter(|path| {
            path.is_dir() && !crate::fsio::is_hidden(path) && path.join(marker).is_file()
        })
        .collect();
    found.sort_by_key(|dir| crate::fsio::file_name_of(dir));
    Ok(found)
}

/// True for a folder the APP owns and named — `jott.tasks`, `jott.notes`,
/// `jott.home`. Only these may carry a display name in their marker: their
/// folder name is an identifier, everyone else's folder name is the name.
pub fn is_app_folder(folder: &str) -> bool {
    folder.starts_with("jott.")
}

/// A group of spaces (reestruturação 2026-07-30): a folder carrying a
/// `.group.json`, holding spaces **and other groups** (nesting, since
/// 2026-08-11). It organizes the left sidebar and owns no files of its own.
/// The marker **reuses [`SpaceConfig`]** — a group config is just
/// name/colour/icon, the same tolerant fields — so there is no second reader
/// to keep in sync.
pub struct Group;

impl Group {
    /// True when the folder carries the group marker.
    pub fn is_group(path: impl AsRef<Path>) -> bool {
        path.as_ref().join(GROUP_CONFIG_FILE).is_file()
    }
}

/// A group as the navigation shows it: its folder (identity), the group it
/// sits in (groups nest since 2026-08-11), its config (name/colour/icon) and
/// the leaf names of the spaces it holds directly.
#[derive(Debug, Clone)]
pub struct GroupEntry {
    pub folder: String,
    /// The folder name of the group holding this one; `None` at the root.
    pub parent: Option<String>,
    pub config: SpaceConfig,
    pub spaces: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_folder_entry_keeps_what_this_build_does_not_own() {
        // The same promise the documents keep: a key a newer build wrote next
        // to ours survives us rewriting ours.
        let config = SpaceConfig::parse(
            r##"{ "type": "notes", "folders": { "Clientes": { "color": "red", "cover": "x.png" } } }"##,
        );
        assert_eq!(config.folders["Clientes"].color.as_deref(), Some("red"));

        let mut config = config;
        config.folders.get_mut("Clientes").unwrap().color = None;
        let rendered = config.render();
        assert!(rendered.contains("x.png"), "{rendered}");
        assert!(!rendered.contains("red"), "{rendered}");

        // And an entry that says nothing at all is not written.
        let mut bare = SpaceConfig::parse(r##"{ "type": "notes" }"##);
        bare.folders.insert("Vazia".into(), FolderSettings::default());
        assert!(!bare.render().contains("folders"));
    }

    #[test]
    fn a_documented_space_config_parses() {
        let config = SpaceConfig::parse(
            r##"{ "schemaVersion": 1, "type": "tasks", "name": "Project A", "color": "#f00" }"##,
        );
        assert_eq!(config.kind, "tasks");
        assert_eq!(config.name.as_deref(), Some("Project A"));
        assert_eq!(config.color.as_deref(), Some("#f00"));
        assert!(config.is_known());
    }

    #[test]
    fn an_unknown_space_type_is_kept_not_dropped() {
        // The most important promise of spec 3.5: a space from a future
        // version renders as "unsupported", and nothing the user has is lost.
        let config = SpaceConfig::parse(
            r#"{ "schemaVersion": 1, "type": "kanban", "columns": ["todo", "done"] }"#,
        );
        assert!(!config.is_known());
        assert_eq!(config.kind, "kanban");

        // And the rewrite keeps the key this build has never heard of.
        let rendered = config.render();
        assert!(rendered.contains("columns"), "{rendered}");
        assert!(rendered.contains("kanban"));
    }

    #[test]
    fn a_space_without_a_type_is_kept_as_unknown() {
        let config = SpaceConfig::parse(r#"{ "schemaVersion": 1, "name": "X" }"#);
        assert!(!config.is_known());
        assert_eq!(config.kind, "");
    }

    #[test]
    fn clearing_a_space_name_removes_the_key() {
        let mut config =
            SpaceConfig::parse(r#"{ "schemaVersion": 1, "type": "tasks", "name": "old" }"#);
        config.name = None;
        assert!(!config.render().contains("old"));
    }

    #[test]
    fn the_sort_and_order_live_in_the_space_config() {
        let mut config = SpaceConfig::new("tasks");
        config.sort = Some("custom".into());
        config.order = vec!["a1".into(), "b2".into()];
        let reparsed = SpaceConfig::parse(&config.render());
        assert_eq!(reparsed.sort.as_deref(), Some("custom"));
        assert_eq!(reparsed.order, vec!["a1".to_string(), "b2".to_string()]);

        // Clearing them removes the keys instead of leaving stale values.
        let mut cleared = reparsed;
        cleared.sort = None;
        cleared.order = Vec::new();
        let rendered = cleared.render();
        assert!(!rendered.contains("custom"), "{rendered}");
        assert!(!rendered.contains("a1"), "{rendered}");
    }

    #[test]
    fn unknown_top_level_keys_survive_the_rewrite() {
        let text = r#"{ "schemaVersion": 1, "futureFeature": { "deep": [1] } }"#;
        let sp = SpaceConfig::parse(text);
        let reparsed = SpaceConfig::parse(&sp.render());
        assert_eq!(reparsed.raw["futureFeature"], serde_json::json!({ "deep": [1] }));
    }

    #[test]
    fn garbage_or_missing_falls_back_to_defaults() {
        for text in ["", "not json", "[]", "null"] {
            let sp = SpaceConfig::parse(text);
            assert_eq!(sp.schema_version(), SUPPORTED_SPACE_SCHEMA);
            assert_eq!(sp.kind, "", "{text:?}");
        }
    }

    #[test]
    fn a_newer_schema_opens_read_only_and_refuses_to_save() {
        let config = SpaceConfig::parse(r#"{ "schemaVersion": 99 }"#);
        assert!(config.is_read_only());
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SPACE_CONFIG_FILE);
        assert!(config.save(&path).is_err());
        assert!(!path.exists());
    }

    fn space_at(dir: &Path, config: &str) -> Space {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(dir.join(SPACE_CONFIG_FILE), config).unwrap();
        Space::open(dir).unwrap()
    }

    #[test]
    fn the_folder_is_the_name_and_only_the_app_folders_may_say_otherwise() {
        // 2026-08-13: the marker's `name` stopped being a second copy of the
        // folder. It drifted — renaming in the app wrote the marker and left
        // the folder — and it only ever went one way, so renaming the folder
        // in a file manager changed nothing on screen.
        let dir = tempfile::tempdir().unwrap();
        let sp = space_at(&dir.path().join("Trabalho"), r#"{ "schemaVersion": 1 }"#);
        assert_eq!(sp.display_name(), "Trabalho");
        assert_eq!(sp.folder_name(), "Trabalho");

        // A user space carrying a stale `name` shows its FOLDER. The key
        // itself is not destroyed (the unknown-key promise still holds); it is
        // simply no longer what the interface reads.
        let named = space_at(
            &dir.path().join("pasta-feia"),
            r#"{ "schemaVersion": 1, "name": "Project A" }"#,
        );
        assert_eq!(named.display_name(), "pasta-feia");
        assert_eq!(named.folder_name(), "pasta-feia");

        // The exception, and the only one: the app's own folders are called
        // `jott.*` precisely so the plain words stay free for the user, so
        // their folder name is an identifier and their marker holds the label.
        let fixed = space_at(
            &dir.path().join("jott.tasks"),
            r#"{ "schemaVersion": 1, "type": "tasks", "name": "Tasks" }"#,
        );
        assert_eq!(fixed.display_name(), "Tasks");
        assert_eq!(fixed.folder_name(), "jott.tasks");

        // And a fixed one with no label falls back to its folder rather than
        // showing nothing.
        let bare = space_at(
            &dir.path().join("jott.notes"),
            r#"{ "schemaVersion": 1, "type": "notes" }"#,
        );
        assert_eq!(bare.display_name(), "jott.notes");
    }

    #[test]
    fn a_folder_without_the_marker_is_not_a_space() {
        let dir = tempfile::tempdir().unwrap();
        assert!(matches!(
            Space::open(dir.path()),
            Err(Error::NotASpace(_))
        ));
    }

    #[test]
    fn a_space_reads_its_type_from_the_config() {
        let dir = tempfile::tempdir().unwrap();
        let tasks = space_at(
            &dir.path().join("Work"),
            r#"{ "schemaVersion": 1, "type": "tasks" }"#,
        );
        assert_eq!(tasks.kind(), "tasks");

        let notes = space_at(
            &dir.path().join("Journal"),
            r#"{ "schemaVersion": 1, "type": "notes" }"#,
        );
        assert_eq!(notes.kind(), "notes");
    }

    #[test]
    fn marker_dirs_ignores_plain_and_hidden_folders() {
        let dir = tempfile::tempdir().unwrap();
        for (folder, marked) in [("Work", true), ("just a folder", false)] {
            let d = dir.path().join(folder);
            std::fs::create_dir_all(&d).unwrap();
            if marked {
                std::fs::write(d.join(SPACE_CONFIG_FILE), "{}").unwrap();
            }
        }
        let found = marker_dirs(dir.path(), SPACE_CONFIG_FILE).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(crate::fsio::file_name_of(&found[0]), "Work");
    }
}
