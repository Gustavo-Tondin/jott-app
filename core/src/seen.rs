//! When each note was last looked at — `.jott/index/seen.<device>.json`, kept
//! BESIDE the files because reading a note must never rewrite it — and, in
//! `edited.<device>.json`, last WRITTEN. Notes only; a regenerable INDEX, not
//! a format. Each device writes only its OWN file, so a sync tool never sees
//! two writers; reading is the union of every `<index>.*json`.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use chrono::NaiveDateTime;

use crate::error::Result;

/// The folder of the notebook's rebuildable indexes, inside `.jott/`:
/// everything under it can be thrown away without losing anything written.
pub const INDEX_DIR: &str = "index";

/// The index file of a process that named no device (and of every build
/// before the per-device files): read with the others, written only then.
pub const SEEN_FILE: &str = "seen.json";

/// Which of the two stamps an index holds — the name its files start with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Index {
    /// Opened in the editor, or written to.
    #[default]
    Seen,
    /// Written to — only the editor's save, never an open.
    Edited,
}

impl Index {
    pub const ALL: [Index; 2] = [Index::Seen, Index::Edited];

    fn stem(self) -> &'static str {
        match self {
            Self::Seen => "seen",
            Self::Edited => "edited",
        }
    }
}

static DEVICE: OnceLock<String> = OnceLock::new();

/// Names this installation, once per process: from then on the index is
/// written to `seen.<name>.json`. Refused (false) when the name is not a
/// short lowercase alphanumeric word — it becomes part of a file name — or
/// when a different name was already claimed.
pub fn claim_device(name: &str) -> bool {
    is_device_name(name) && DEVICE.get_or_init(|| name.to_string()) == name
}

/// The name claimed by this process, if any.
pub fn device() -> Option<&'static str> {
    DEVICE.get().map(String::as_str)
}

fn is_device_name(name: &str) -> bool {
    (1..=32).contains(&name.len())
        && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
}

/// The addresses of the notes that have been opened (or, as
/// [`Index::Edited`], written), and when. Keys are root-relative
/// (`jott.notes/Inbox/ideia.md`); values are local wall-clock stamps to the
/// minute (`crate::task::render_datetime`).
#[derive(Debug, Clone, Default)]
pub struct Seen {
    entries: BTreeMap<String, NaiveDateTime>,
    /// Whether the OWN file was readable on load. False means running off
    /// the backup, and rewriting the backup would destroy the only good copy.
    intact: bool,
    /// Whose file a save writes: `None` is the device-less `<index>.json`.
    device: Option<String>,
    index: Index,
}

/// Where THIS process writes the "seen" index, for a notebook's `.jott/`.
pub fn path_of(config_dir: impl AsRef<Path>) -> PathBuf {
    path_for(config_dir.as_ref(), Index::Seen, device())
}

fn path_for(config_dir: &Path, index: Index, device: Option<&str>) -> PathBuf {
    let name = match device {
        Some(device) => format!("{}.{device}.json", index.stem()),
        None => format!("{}.json", index.stem()),
    };
    config_dir.join(INDEX_DIR).join(name)
}

/// Every file of `index` but `own`: the other devices', the device-less
/// one, and a sync tool's conflict copies of any of them. Backups are left
/// out — each is read only in place of its own broken file.
fn others(config_dir: &Path, index: Index, own: &Path) -> Vec<PathBuf> {
    let Ok(dir) = std::fs::read_dir(config_dir.join(INDEX_DIR)) else {
        return Vec::new();
    };
    let stem = index.stem();
    dir.filter_map(|entry| Some(entry.ok()?.path()))
        .filter(|path| {
            path != own
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| {
                        name.strip_prefix(stem).is_some_and(|rest| rest.starts_with('.'))
                            && name.ends_with(".json")
                    })
        })
        .collect()
}

fn backup_of(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(".bak");
    PathBuf::from(name)
}

/// Reads the map out of a file's text, or `None` when it is not one. One
/// unreadable stamp is dropped; an unreadable DOCUMENT is a failure, so a
/// truncated file never reads as "nobody ever opened anything".
fn parse(text: &str) -> Option<BTreeMap<String, NaiveDateTime>> {
    let doc: serde_json::Value = serde_json::from_str(text).ok()?;
    let map = doc.as_object()?;
    Some(
        map.iter()
            .filter_map(|(path, value)| {
                let at = crate::task::parse_datetime(value.as_str()?)?;
                Some((path.clone(), at))
            })
            .collect(),
    )
}

/// The own file's entries, and whether it was readable. "Intact" covers
/// absence too: there is nothing to protect, so the next save may write the
/// backup normally.
fn read_own(path: &Path) -> (BTreeMap<String, NaiveDateTime>, bool) {
    let Some(main) = std::fs::read_to_string(path).ok() else {
        return (BTreeMap::new(), true);
    };
    if let Some(entries) = parse(&main) {
        return (entries, true);
    }
    let backup = std::fs::read_to_string(backup_of(path)).ok();
    (backup.as_deref().and_then(parse).unwrap_or_default(), false)
}

impl Seen {
    /// Loads the index of the notebook whose `.jott/` is `config_dir`, as
    /// this process's device sees it.
    pub fn load(config_dir: impl AsRef<Path>) -> Self {
        Self::load_of(config_dir, Index::Seen)
    }

    /// The same, for either index.
    pub fn load_of(config_dir: impl AsRef<Path>, index: Index) -> Self {
        Self::load_as(config_dir.as_ref(), index, device())
    }

    /// The union of every file of `index`, the latest stamp winning. A
    /// missing file is an empty index, not an error; an own file that does
    /// not parse falls back to its `.bak`, another device's broken file is
    /// skipped.
    fn load_as(config_dir: &Path, index: Index, device: Option<&str>) -> Self {
        let own = path_for(config_dir, index, device);
        let (mut entries, intact) = read_own(&own);
        for other in others(config_dir, index, &own) {
            let text = std::fs::read_to_string(&other).ok();
            for (path, at) in text.as_deref().and_then(parse).unwrap_or_default() {
                entries
                    .entry(path)
                    .and_modify(|kept| *kept = (*kept).max(at))
                    .or_insert(at);
            }
        }
        Self {
            entries,
            intact,
            device: device.map(str::to_string),
            index,
        }
    }

    /// Writes the index back to this device's file, keeping a copy of the
    /// previous one beside it. The same bytes again are not written at all.
    pub fn save(&self, config_dir: impl AsRef<Path>) -> Result<()> {
        let path = path_for(config_dir.as_ref(), self.index, self.device.as_deref());
        let text = crate::fsio::pretty_json(&self.render());
        let previous = std::fs::read(&path).ok();
        if previous.as_deref() == Some(text.as_bytes()) {
            return Ok(());
        }
        if let (true, Some(previous)) = (self.intact, previous) {
            // Best effort by design: a backup that could not be written is
            // not a reason to refuse the write that matters.
            let _ = crate::fsio::write_atomically(backup_of(&path), &previous);
        }
        crate::fsio::write_atomically(path, text.as_bytes())
    }

    fn render(&self) -> serde_json::Value {
        serde_json::Value::Object(
            self.entries
                .iter()
                .map(|(path, at)| {
                    (
                        path.clone(),
                        serde_json::Value::from(crate::task::render_datetime(*at)),
                    )
                })
                .collect(),
        )
    }

    /// When a note was last opened, if ever.
    pub fn at(&self, path: &str) -> Option<NaiveDateTime> {
        self.entries.get(path).copied()
    }

    /// Everything the index holds, addresses in order.
    pub fn entries(&self) -> &BTreeMap<String, NaiveDateTime> {
        &self.entries
    }

    /// Records that a note was looked at. Answers whether anything changed —
    /// the same minute twice is not worth a write.
    pub fn mark(&mut self, path: &str, at: NaiveDateTime) -> bool {
        if self.entries.get(path) == Some(&at) {
            return false;
        }
        self.entries.insert(path.to_string(), at);
        true
    }

    /// Drops what the index knew about an address and everything under it.
    /// One method: an address is a file or a folder, never both.
    pub fn forget(&mut self, path: &str) -> bool {
        let under = format!("{path}/");
        let before = self.entries.len();
        self.entries
            .retain(|key, _| key != path && !key.starts_with(&under));
        before != self.entries.len()
    }

    /// Follows an address that moved: the entry itself and every entry under
    /// it; the address is rebuilt, never spliced. Without it a rename would
    /// reset a note's age to "never opened".
    pub fn retarget(&mut self, from: &str, to: &str) -> bool {
        if from == to {
            return false;
        }
        let under = format!("{from}/");
        let moved: Vec<String> = self
            .entries
            .keys()
            .filter(|key| *key == from || key.starts_with(&under))
            .cloned()
            .collect();
        if moved.is_empty() {
            return false;
        }
        for key in moved {
            let Some(at) = self.entries.remove(&key) else {
                continue;
            };
            let landed = if key == from {
                to.to_string()
            } else {
                let rest = &key[under.len()..];
                if to.is_empty() {
                    rest.to_string()
                } else {
                    format!("{to}/{rest}")
                }
            };
            self.entries.insert(landed, at);
        }
        true
    }

    /// Drops every entry whose address is not in `alive`. The index is
    /// keyed by address, so a note deleted outside the app (or by a build
    /// that did not know to forget it) would otherwise stay in here for good.
    pub fn keep_only(&mut self, alive: &std::collections::HashSet<String>) -> bool {
        let before = self.entries.len();
        self.entries.retain(|key, _| alive.contains(key));
        before != self.entries.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(day: u32, hour: u32) -> NaiveDateTime {
        chrono::NaiveDate::from_ymd_opt(2026, 8, day)
            .unwrap()
            .and_hms_opt(hour, 30, 0)
            .unwrap()
    }

    /// A notebook's `.jott/`, empty; the index folder is the index's to create.
    fn temp() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn a_missing_index_is_an_empty_one() {
        let seen = Seen::load(temp().path());
        assert!(seen.entries().is_empty());
        assert_eq!(seen.at("jott.notes/a.md"), None);
    }

    #[test]
    fn a_mark_survives_a_round_trip() {
        let dir = temp();
        let dir = dir.path();
        let mut seen = Seen::load(dir);
        assert!(seen.mark("jott.notes/a.md", at(20, 9)));
        seen.save(dir).unwrap();

        let again = Seen::load(dir);
        assert_eq!(again.at("jott.notes/a.md"), Some(at(20, 9)));
    }

    #[test]
    fn marking_the_same_minute_twice_changes_nothing() {
        let mut seen = Seen::default();
        assert!(seen.mark("a.md", at(20, 9)));
        assert!(!seen.mark("a.md", at(20, 9)));
        assert!(seen.mark("a.md", at(20, 10)));
    }

    #[test]
    fn a_broken_index_is_read_from_the_backup() {
        let dir = temp();
        let dir = dir.path();
        let mut seen = Seen::load(dir);
        seen.mark("jott.notes/a.md", at(20, 9));
        seen.save(dir).unwrap();
        // A second save is what creates the backup: the first had nothing
        // to copy.
        let mut seen = Seen::load(dir);
        seen.mark("jott.notes/b.md", at(21, 9));
        seen.save(dir).unwrap();

        std::fs::write(path_of(dir), "{ this is not json").unwrap();
        let recovered = Seen::load(dir);
        assert_eq!(recovered.at("jott.notes/a.md"), Some(at(20, 9)));
    }

    #[test]
    fn a_broken_index_with_no_backup_loses_only_the_seen() {
        let dir = temp();
        let dir = dir.path();
        std::fs::create_dir_all(dir.join(INDEX_DIR)).unwrap();
        std::fs::write(path_of(dir), "]").unwrap();
        assert!(Seen::load(dir).entries().is_empty());
    }

    #[test]
    fn a_backup_is_never_written_from_a_broken_file() {
        let dir = temp();
        let dir = dir.path();
        let mut seen = Seen::load(dir);
        seen.mark("jott.notes/a.md", at(20, 9));
        seen.save(dir).unwrap();
        let mut seen = Seen::load(dir);
        seen.mark("jott.notes/b.md", at(21, 9));
        seen.save(dir).unwrap();

        std::fs::write(path_of(dir), "{ broken").unwrap();
        let mut recovered = Seen::load(dir);
        recovered.mark("jott.notes/c.md", at(22, 9));
        recovered.save(dir).unwrap();

        // The backup still holds the good copy, not the broken main file.
        let backup = std::fs::read_to_string(backup_of(&path_of(dir))).unwrap();
        assert!(backup.contains("jott.notes/a.md"), "{backup}");
    }

    #[test]
    fn one_unreadable_stamp_does_not_take_the_others_down() {
        let dir = temp();
        let dir = dir.path();
        std::fs::create_dir_all(dir.join(INDEX_DIR)).unwrap();
        std::fs::write(
            path_of(dir),
            r#"{"a.md":"2026-08-20T09:30","b.md":"whenever"}"#,
        )
        .unwrap();
        let seen = Seen::load(dir);
        assert_eq!(seen.at("a.md"), Some(at(20, 9)));
        assert_eq!(seen.at("b.md"), None);
    }

    #[test]
    fn a_rename_carries_the_stamp_along() {
        let mut seen = Seen::default();
        seen.mark("jott.notes/velha.md", at(20, 9));
        assert!(seen.retarget("jott.notes/velha.md", "jott.notes/nova.md"));
        assert_eq!(seen.at("jott.notes/nova.md"), Some(at(20, 9)));
        assert_eq!(seen.at("jott.notes/velha.md"), None);
    }

    #[test]
    fn a_folder_carries_everything_under_it() {
        let mut seen = Seen::default();
        seen.mark("jott.notes/2025/a.md", at(20, 9));
        seen.mark("jott.notes/2025/velhas/b.md", at(21, 9));
        seen.mark("jott.notes/outra.md", at(22, 9));
        seen.retarget("jott.notes/2025", "jott.notes/2026");
        assert_eq!(seen.at("jott.notes/2026/a.md"), Some(at(20, 9)));
        assert_eq!(seen.at("jott.notes/2026/velhas/b.md"), Some(at(21, 9)));
        assert_eq!(seen.at("jott.notes/outra.md"), Some(at(22, 9)));
    }

    #[test]
    fn a_deleted_folder_lets_its_notes_move_up() {
        let mut seen = Seen::default();
        seen.mark("jott.notes/2025/a.md", at(20, 9));
        seen.retarget("jott.notes/2025", "jott.notes");
        assert_eq!(seen.at("jott.notes/a.md"), Some(at(20, 9)));
    }

    #[test]
    fn forgetting_a_folder_forgets_what_was_in_it() {
        let mut seen = Seen::default();
        seen.mark("jott.notes/2025/a.md", at(20, 9));
        seen.mark("jott.notes/2025b.md", at(21, 9));
        assert!(seen.forget("jott.notes/2025"));
        assert_eq!(seen.at("jott.notes/2025/a.md"), None);
        // A sibling whose name merely STARTS with the folder's is untouched.
        assert_eq!(seen.at("jott.notes/2025b.md"), Some(at(21, 9)));
    }

    #[test]
    fn what_is_gone_from_disk_is_dropped_on_a_sweep() {
        let mut seen = Seen::default();
        seen.mark("jott.notes/a.md", at(20, 9));
        seen.mark("jott.notes/gone.md", at(21, 9));
        let alive = std::collections::HashSet::from(["jott.notes/a.md".to_string()]);
        assert!(seen.keep_only(&alive));
        assert_eq!(seen.at("jott.notes/gone.md"), None);
        assert_eq!(seen.at("jott.notes/a.md"), Some(at(20, 9)));
    }

    fn write_index(dir: &Path, name: &str, text: &str) {
        std::fs::create_dir_all(dir.join(INDEX_DIR)).unwrap();
        std::fs::write(dir.join(INDEX_DIR).join(name), text).unwrap();
    }

    #[test]
    fn a_device_writes_only_its_own_file() {
        let dir = temp();
        let dir = dir.path();
        let mut seen = Seen::load_as(dir, Index::Seen, Some("desk01"));
        seen.mark("jott.notes/a.md", at(20, 9));
        seen.save(dir).unwrap();
        assert!(path_for(dir, Index::Seen, Some("desk01")).is_file());
        assert!(!dir.join(INDEX_DIR).join(SEEN_FILE).exists());
    }

    #[test]
    fn every_devices_file_is_read_and_the_latest_stamp_wins() {
        let dir = temp();
        let dir = dir.path();
        let legacy = r#"{"a.md":"2026-08-20T09:30","b.md":"2026-08-20T09:30"}"#;
        let phone = r#"{"a.md":"2026-08-22T09:30"}"#;
        let conflict = r#"{"c.md":"2026-08-21T09:30"}"#;
        write_index(dir, SEEN_FILE, legacy);
        write_index(dir, "seen.phone1.json", phone);
        write_index(dir, "seen.sync-conflict-20260911-150128-ABCDEFG.json", conflict);

        let mut seen = Seen::load_as(dir, Index::Seen, Some("desk01"));
        assert_eq!(seen.at("a.md"), Some(at(22, 9)));
        assert_eq!(seen.at("b.md"), Some(at(20, 9)));
        assert_eq!(seen.at("c.md"), Some(at(21, 9)));

        // Writing leaves every other file exactly as the other writer left it.
        seen.mark("d.md", at(23, 9));
        seen.save(dir).unwrap();
        let read = |name: &str| std::fs::read_to_string(dir.join(INDEX_DIR).join(name)).unwrap();
        assert_eq!(read(SEEN_FILE), legacy);
        assert_eq!(read("seen.phone1.json"), phone);
        assert!(read("seen.desk01.json").contains("a.md"), "the union is carried along");
    }

    #[test]
    fn another_devices_broken_file_takes_nothing_down() {
        let dir = temp();
        let dir = dir.path();
        write_index(dir, "seen.desk01.json", r#"{"a.md":"2026-08-20T09:30"}"#);
        write_index(dir, "seen.phone1.json", "{ half a fi");
        let seen = Seen::load_as(dir, Index::Seen, Some("desk01"));
        assert_eq!(seen.at("a.md"), Some(at(20, 9)));
        assert!(seen.intact, "only the OWN file decides the backup");
    }

    #[test]
    fn saving_what_is_already_there_writes_nothing() {
        let dir = temp();
        let dir = dir.path();
        let mut seen = Seen::load_as(dir, Index::Seen, Some("desk01"));
        seen.mark("a.md", at(20, 9));
        seen.save(dir).unwrap();
        Seen::load_as(dir, Index::Seen, Some("desk01")).save(dir).unwrap();
        assert!(!backup_of(&path_for(dir, Index::Seen, Some("desk01"))).exists());
    }

    #[test]
    fn the_two_indexes_never_read_each_other() {
        let dir = temp();
        let dir = dir.path();
        write_index(dir, "seen.phone1.json", r#"{"a.md":"2026-08-20T09:30"}"#);
        let mut edited = Seen::load_as(dir, Index::Edited, Some("desk01"));
        assert_eq!(edited.at("a.md"), None);

        edited.mark("b.md", at(21, 9));
        edited.save(dir).unwrap();
        assert!(path_for(dir, Index::Edited, Some("desk01")).is_file());
        assert_eq!(Seen::load_as(dir, Index::Seen, Some("desk01")).at("b.md"), None);
        assert_eq!(Seen::load_as(dir, Index::Edited, Some("phone1")).at("b.md"), Some(at(21, 9)));
    }

    #[test]
    fn a_device_name_is_a_plain_word() {
        assert!(is_device_name("a1b2c3"));
        for bad in ["", "../x", "A1", "a.b", "a b", &"a".repeat(33)] {
            assert!(!is_device_name(bad), "{bad:?}");
        }
    }
}
