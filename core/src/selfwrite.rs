//! What the app itself just wrote, so a watcher can tell its own writes from
//! somebody else's. Every write goes through `fsio::write_atomically`, which
//! records the bytes about to land here, BEFORE the rename that lands them.
//!
//! A write is remembered by its CONTENT (length + hash), never by mtime or by
//! time alone: a file that no longer reads as something we wrote was written
//! by someone after us, and must still be reported — missing that lets the
//! next save overwrite an external edit in silence. The mtime was the old
//! stamp, and on Android's FUSE it is not the same number twice; see
//! docs/platform-gotchas.md#android.
//!
//! The last few writes to a path are ALL kept, not just the latest: a save
//! lands while the event of the previous one is still being judged, and the
//! file must read as ours whichever of the two is on disk at that instant.
//!
//! WHO wrote is named per thread (`as_owner`) and stamped on the record the
//! moment it is made — so a watcher can recognise the write while the command
//! that made it is still running.

use std::cell::RefCell;
use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime};

/// How long a record is worth keeping. Long enough for a watcher's own
/// debounce to have delivered the event, short enough that a stale entry
/// cannot mask a real change for long.
const REMEMBER: Duration = Duration::from_secs(5);

/// What we wrote: its length and a hash of its bytes.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Stamp {
    pub len: u64,
    pub hash: u64,
}

impl Stamp {
    pub fn of_bytes(bytes: &[u8]) -> Self {
        let mut hasher = DefaultHasher::new();
        bytes.hash(&mut hasher);
        Self {
            len: bytes.len() as u64,
            hash: hasher.finish(),
        }
    }

    /// What `path` holds right now; `None` when it cannot be read — gone,
    /// or a folder. Reads the whole file, so it is for the small ones the
    /// app compares by content, never for an asset.
    pub fn of_file(path: &Path) -> Option<Self> {
        std::fs::read(path).ok().map(|bytes| Self::of_bytes(&bytes))
    }
}

/// One recorded write: what it left behind, when, and who wrote it.
#[derive(Clone, Debug)]
struct Record {
    stamp: Stamp,
    at: SystemTime,
    /// Who was writing on that thread, if anyone had said (`as_owner`).
    owner: Option<String>,
}

#[derive(Default)]
struct Log {
    writes: HashMap<PathBuf, Vec<Record>>,
}

thread_local! {
    static OWNER: RefCell<Option<String>> = const { RefCell::new(None) };
}

/// Restores the previous owner of the thread when dropped.
pub struct Owner(Option<String>);

impl Drop for Owner {
    fn drop(&mut self) {
        let previous = self.0.take();
        OWNER.with(|owner| *owner.borrow_mut() = previous);
    }
}

/// Names who is writing on THIS thread until the guard drops: every
/// `remember` in between carries `owner`. Nested guards restore in order.
pub fn as_owner(owner: &str) -> Owner {
    Owner(OWNER.with(|current| current.replace(Some(owner.to_string()))))
}

/// The key a path is remembered under. Canonical wherever the filesystem can
/// answer, because the app and the watcher do not always spell the same file
/// the same way: on Windows the watcher reports the long, verbatim form of a
/// path the app may have opened through a short (8.3) one, and a notebook
/// reached through a symlink has two names on any system. The FOLDER is what
/// gets canonicalised — a record is made before the file exists.
fn key(path: &Path) -> PathBuf {
    match (path.parent(), path.file_name()) {
        (Some(dir), Some(name)) => std::fs::canonicalize(dir)
            .map(|dir| dir.join(name))
            .unwrap_or_else(|_| path.to_path_buf()),
        _ => path.to_path_buf(),
    }
}

fn log() -> &'static Mutex<Log> {
    static LOG: OnceLock<Mutex<Log>> = OnceLock::new();
    LOG.get_or_init(Default::default)
}

/// Drops records older than [REMEMBER]. Called on every touch of the log, so
/// it never grows past the writes of the last few seconds.
fn purge(log: &mut Log, now: SystemTime) {
    log.writes.retain(|_, records| {
        records.retain(|record| {
            now.duration_since(record.at)
                .map(|age| age < REMEMBER)
                .unwrap_or(true)
        });
        !records.is_empty()
    });
}

/// Records that we are writing `bytes` to `path` — called before the bytes
/// land, so an event that arrives the instant they do finds the record.
pub fn remember(path: &Path, bytes: &[u8]) {
    let now = crate::clock::system_now();
    let Ok(mut log) = log().lock() else {
        return;
    };
    purge(&mut log, now);
    let owner = OWNER.with(|owner| owner.borrow().clone());
    log.writes.entry(key(path)).or_default().push(Record {
        stamp: Stamp::of_bytes(bytes),
        at: now,
        owner,
    });
}

/// Whether `path`, as it is on disk right now, is something `owner` wrote in
/// the last few seconds — its own write coming back as an event. A file that
/// reads as none of them, or is gone, answers false: somebody else touched
/// it, and missing that lets the next save overwrite an external edit.
pub fn is_own(path: &Path, owner: &str) -> bool {
    let now = crate::clock::system_now();
    let stamps: Vec<Stamp> = {
        let Ok(mut log) = log().lock() else {
            return false;
        };
        purge(&mut log, now);
        match log.writes.get(&key(path)) {
            Some(records) => records
                .iter()
                .filter(|record| record.owner.as_deref() == Some(owner))
                .map(|record| record.stamp)
                .collect(),
            None => return false,
        }
    };
    if stamps.is_empty() {
        return false;
    }
    // The length is a stat away; the bytes are only read when one of our
    // writes had that length — an asset is not hashed for every event.
    let Ok(len) = std::fs::metadata(path).map(|meta| meta.len()) else {
        return false;
    };
    if !stamps.iter().any(|stamp| stamp.len == len) {
        return false;
    }
    let Ok(bytes) = std::fs::read(path) else {
        return false;
    };
    let actual = Stamp::of_bytes(&bytes);
    stamps.contains(&actual)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("jott-selfwrite-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn remembers_what_it_wrote_and_forgets_what_changed() {
        let dir = temp_dir("basic");
        let path = dir.join("note.md");

        let _me = as_owner("w1");
        remember(&path, b"first");
        std::fs::write(&path, b"first").unwrap();
        assert!(is_own(&path, "w1"), "the file we just wrote is ours");

        // Somebody else writes over it: the content is none we wrote, so the
        // change is theirs and has to be reported.
        std::fs::write(&path, b"second, longer").unwrap();
        assert!(!is_own(&path, "w1"), "a file changed after us is not ours");
    }

    #[test]
    fn a_rewrite_of_the_same_length_by_somebody_else_is_theirs() {
        // Same length, same second: the old (length + mtime) stamp could not
        // tell these apart on a coarse clock. The content can.
        let dir = temp_dir("samelen");
        let path = dir.join("note.md");
        let _me = as_owner("w1");
        remember(&path, b"ours");
        std::fs::write(&path, b"ours").unwrap();
        std::fs::write(&path, b"them").unwrap();
        assert!(!is_own(&path, "w1"));
    }

    #[test]
    fn the_mtime_does_not_matter() {
        // Android's FUSE answers a different mtime for the same write a
        // moment later; what we compare is what is in the file.
        let dir = temp_dir("mtime");
        let path = dir.join("note.md");
        let _me = as_owner("w1");
        remember(&path, b"x");
        std::fs::write(&path, b"x").unwrap();
        let later = std::fs::FileTimes::new().set_modified(SystemTime::UNIX_EPOCH);
        std::fs::File::options()
            .write(true)
            .open(&path)
            .unwrap()
            .set_times(later)
            .unwrap();
        assert!(is_own(&path, "w1"));
    }

    #[test]
    fn the_previous_save_still_reads_as_ours_while_the_next_one_lands() {
        // Two saves 500 ms apart: the event of the first is judged while the
        // second is already recorded, or the second landed while the event
        // of the first is judged. Either way the file is ours.
        let dir = temp_dir("burst");
        let path = dir.join("note.md");
        let _me = as_owner("w1");
        remember(&path, b"first");
        std::fs::write(&path, b"first").unwrap();
        remember(&path, b"second");
        assert!(is_own(&path, "w1"), "recorded the next, the previous is still on disk");
        std::fs::write(&path, b"second").unwrap();
        assert!(is_own(&path, "w1"), "and the next landed");
    }

    #[test]
    #[cfg(unix)]
    fn the_same_file_under_another_name_is_still_ours() {
        // The app and the watcher do not always spell a path the same way.
        // A symlink is the spelling this platform can build; on Windows the
        // pair is a short (8.3) name and the verbatim one the watcher reports.
        let dir = temp_dir("spelling");
        let real = dir.join("real");
        std::fs::create_dir_all(&real).unwrap();
        let link = dir.join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();

        let _me = as_owner("w1");
        let written = link.join("note.md");
        // Recorded before the file exists, as `write_atomically` does.
        remember(&written, b"x");
        std::fs::write(&written, b"x").unwrap();

        let reported = real.join("note.md");
        assert!(is_own(&reported, "w1"), "the other spelling names the same file");
    }

    #[test]
    fn a_file_that_went_away_is_not_ours() {
        let dir = temp_dir("gone");
        let path = dir.join("gone.md");
        let _me = as_owner("w1");
        remember(&path, b"x");
        std::fs::write(&path, b"x").unwrap();
        std::fs::remove_file(&path).unwrap();
        assert!(!is_own(&path, "w1"));
    }

    #[test]
    fn a_write_belongs_to_whoever_named_the_thread_at_that_moment() {
        // The owner rides on the record, not on a table filled when the
        // command returns: on slow storage the watcher looks before that.
        let dir = temp_dir("owner");
        let mine = dir.join("mine.md");
        let nobodys = dir.join("nobodys.md");

        {
            let _me = as_owner("w1");
            remember(&mine, b"a");
            std::fs::write(&mine, b"a").unwrap();
            {
                let _nested = as_owner("w2");
                assert_eq!(OWNER.with(|o| o.borrow().clone()).as_deref(), Some("w2"));
            }
            assert_eq!(OWNER.with(|o| o.borrow().clone()).as_deref(), Some("w1"));
        }
        assert_eq!(OWNER.with(|o| o.borrow().clone()), None, "the guard restores");

        remember(&nobodys, b"b");
        std::fs::write(&nobodys, b"b").unwrap();

        assert!(is_own(&mine, "w1"), "w1 wrote it");
        assert!(!is_own(&mine, "w2"), "w2 did not — a second window must hear");
        assert!(!is_own(&nobodys, "w1"), "an unnamed write is nobody's");
    }
}
