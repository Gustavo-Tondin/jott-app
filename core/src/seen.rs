//! When each note was last looked at — `.jott/index/seen.json`.
//!
//! The second half of the time axis (spec 3.6). `created` says when a thing
//! was born and travels inside the file; "last seen" says when someone last
//! had it open, and travels **beside** the files: writing it into the note
//! would mean READING a note rewrites it, which is the one thing a notebook
//! of plain files must never do to a file the user did not touch.
//!
//! Three decisions worth keeping in mind while reading this:
//!
//! - **Notes only** (user call, 2026-08-26). A task shows the age of its
//!   `created` and nothing else, so nothing here ever keys a task.
//! - **Opening counts, glancing does not.** The index is written when a note
//!   is opened or edited — never when a board draws its cards, which would
//!   make everything on screen permanently fresh.
//! - **It is an INDEX, not a format.** No screen shows the file, the public
//!   `file-format.md` declares it regenerable and not-to-be-edited, and
//!   losing it loses the "seen" and nothing else. That is what buys the right
//!   to keep it in `.jott/index/` rather than in the notebook proper.
//!
//! The one durability trick: `seen.json.bak` is written before each rewrite,
//! and a main file that does not parse is read from the backup instead. A
//! half-written index would otherwise silently make every note look unseen.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use chrono::NaiveDateTime;

use crate::error::Result;

/// The folder of the notebook's rebuildable indexes, inside `.jott/`.
///
/// Kept apart from the durable side of `.jott/` on purpose: everything under
/// here can be thrown away and recomputed (or simply lost) without the user
/// losing anything they wrote.
pub const INDEX_DIR: &str = "index";

/// The index file itself, inside [`INDEX_DIR`].
pub const SEEN_FILE: &str = "seen.json";

/// The addresses of the notes that have been opened, and when.
///
/// Keys are **root-relative** (`jott.notes/Inbox/ideia.md`), the same address
/// every other part of the app carries, so a note is identified the same way
/// here as it is in a search hit or a timeline line. Values are local
/// wall-clock stamps, minute resolution, in the format the rest of the app
/// writes dates and times in (`crate::task::render_datetime`).
#[derive(Debug, Clone, Default)]
pub struct Seen {
    entries: BTreeMap<String, NaiveDateTime>,
    /// Whether the main file was readable when this was loaded. False means
    /// we are running off the backup (or off nothing), and rewriting the
    /// backup from the broken main file would destroy the only good copy.
    intact: bool,
}

/// Where the index lives for a notebook's `.jott/`.
pub fn path_of(config_dir: impl AsRef<Path>) -> PathBuf {
    config_dir.as_ref().join(INDEX_DIR).join(SEEN_FILE)
}

fn backup_of(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(".bak");
    PathBuf::from(name)
}

/// Reads the map out of a file's text, or `None` when it is not one.
///
/// Tolerant in one direction only: a value that is not a readable stamp is
/// dropped, an unreadable *document* is a failure. The difference matters —
/// one bad entry must not throw away the other nine hundred, and a truncated
/// file must not read as "nobody ever opened anything".
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

impl Seen {
    /// Loads the index of the notebook whose `.jott/` is `config_dir`.
    ///
    /// A missing file is an empty index, not an error: a notebook that was
    /// never opened by this build has no "seen" to remember, and that is the
    /// normal case, not a fault. A main file that does not parse falls back
    /// to `seen.json.bak`.
    pub fn load(config_dir: impl AsRef<Path>) -> Self {
        let path = path_of(config_dir);
        let main = std::fs::read_to_string(&path).ok();
        // "Intact" covers absence too: there is nothing to protect, so the
        // next save may write the backup normally.
        if main.is_none() {
            return Self {
                entries: BTreeMap::new(),
                intact: true,
            };
        }
        if let Some(entries) = main.as_deref().and_then(parse) {
            return Self {
                entries,
                intact: true,
            };
        }
        let entries = std::fs::read_to_string(backup_of(&path))
            .ok()
            .as_deref()
            .and_then(parse)
            .unwrap_or_default();
        Self {
            entries,
            intact: false,
        }
    }

    /// Writes the index back, keeping a copy of the previous one beside it.
    pub fn save(&self, config_dir: impl AsRef<Path>) -> Result<()> {
        let path = path_of(config_dir);
        if self.intact {
            // Best effort by design: a backup that could not be written is
            // not a reason to refuse the write that matters.
            if let Ok(previous) = std::fs::read(&path) {
                let _ = crate::fsio::write_atomically(backup_of(&path), &previous);
            }
        }
        let doc = serde_json::Value::Object(
            self.entries
                .iter()
                .map(|(path, at)| {
                    (
                        path.clone(),
                        serde_json::Value::from(crate::task::render_datetime(*at)),
                    )
                })
                .collect(),
        );
        crate::fsio::write_atomically(path, crate::fsio::pretty_json(&doc).as_bytes())
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

    /// Drops what the index knew about an address, and about everything under
    /// it. One method rather than two because an address is either a file or
    /// a folder and never both, so asking about children can never hit the
    /// wrong entry.
    pub fn forget(&mut self, path: &str) -> bool {
        let under = format!("{path}/");
        let before = self.entries.len();
        self.entries
            .retain(|key, _| key != path && !key.starts_with(&under));
        before != self.entries.len()
    }

    /// Follows an address that moved: the entry itself, and every entry under
    /// it. `to` may be a folder that already exists (a note moving into
    /// another folder) or a space — the address is rebuilt, never spliced.
    ///
    /// This is what keeps a rename from making a note look untouched: without
    /// it, renaming a note the user reads every day would reset its age to
    /// "never opened", and the weekly sweep would then offer it up as
    /// forgotten.
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

    /// A notebook's `.jott/`, empty. The index folder inside it is the
    /// index's own to create.
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
}
