//! What the app itself just wrote, so a watcher can tell its own writes from
//! somebody else's. Every write goes through `fsio::write_atomically`, which
//! records the path here with the stamp it ended up carrying.
//!
//! A write is remembered by its RESULT (length + mtime), never by time alone:
//! a file that no longer carries the stamp we left was written by someone
//! after us, and must still be reported — missing that lets the next save
//! overwrite an external edit in silence.
//!
//! WHO wrote is named per thread (`as_owner`) and stamped on the record the
//! moment the file lands — so a watcher can recognise the write while the
//! command that made it is still running. Attributing at the end of the
//! command was a race on slow storage: see docs/platform-gotchas.md#android.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime};

/// How long a record is worth keeping. Long enough for a watcher's own
/// debounce to have delivered the event, short enough that a stale entry
/// cannot mask a real change for long.
const REMEMBER: Duration = Duration::from_secs(5);

/// What a file looked like right after we wrote it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Stamp {
    pub len: u64,
    pub modified: Option<SystemTime>,
}

impl Stamp {
    fn of(path: &Path) -> Option<Self> {
        let meta = std::fs::metadata(path).ok()?;
        Some(Self {
            len: meta.len(),
            modified: meta.modified().ok(),
        })
    }
}

/// One recorded write: what it left behind, when, and the sequence number
/// that lets a caller ask "what was written since I last looked?".
#[derive(Clone, Debug)]
struct Record {
    stamp: Stamp,
    at: SystemTime,
    /// Who was writing on that thread, if anyone had said (`as_owner`).
    owner: Option<String>,
}

#[derive(Default)]
struct Log {
    writes: HashMap<PathBuf, Record>,
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
/// reached through a symlink has two names on any system. A raw `PathBuf`
/// compare misses those, and the window's own save comes back as somebody
/// else's. A path that cannot be canonicalised — it is already gone — keeps
/// its own form; the stamp comparison answers false for it anyway.
fn key(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn log() -> &'static Mutex<Log> {
    static LOG: OnceLock<Mutex<Log>> = OnceLock::new();
    LOG.get_or_init(Default::default)
}

/// Drops records older than [REMEMBER]. Called on every touch of the log, so
/// it never grows past the writes of the last few seconds.
fn purge(log: &mut Log, now: SystemTime) {
    log.writes.retain(|_, record| {
        now.duration_since(record.at)
            .map(|age| age < REMEMBER)
            .unwrap_or(true)
    });
}


/// Records that we just wrote `path`. A path whose stamp cannot be read (it
/// was deleted again already) is not recorded: there is nothing to compare
/// against later, and reporting the event is the safe answer.
pub fn remember(path: &Path) {
    let Some(stamp) = Stamp::of(path) else {
        return;
    };
    let now = crate::clock::system_now();
    let Ok(mut log) = log().lock() else {
        return;
    };
    purge(&mut log, now);
    let owner = OWNER.with(|owner| owner.borrow().clone());
    log.writes.insert(
        key(path),
        Record {
            stamp,
            at: now,
            owner,
        },
    );
}

/// The stamp `owner` left on `path` with its latest write — `None` if the
/// last write there was somebody else's, or nobody's, or too old to matter.
pub fn own(path: &Path, owner: &str) -> Option<Stamp> {
    let now = crate::clock::system_now();
    let Ok(mut log) = log().lock() else {
        return None;
    };
    purge(&mut log, now);
    log.writes
        .get(&key(path))
        .filter(|record| record.owner.as_deref() == Some(owner))
        .map(|record| record.stamp)
}

/// Does `path` still carry exactly `stamp`? True means the file on disk is
/// the one we left there, and an event about it is our own echo. A file that
/// has since changed, or gone, answers false — somebody else touched it, and
/// missing that lets the next save overwrite an external edit in silence.
pub fn unchanged(path: &Path, stamp: &Stamp) -> bool {
    Stamp::of(path).is_some_and(|actual| actual == *stamp)
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
        std::fs::write(&path, b"first").unwrap();
        remember(&path);

        let stamp = own(&path, "w1").expect("the write was recorded as w1's");
        assert!(unchanged(&path, &stamp), "the file we just wrote is ours");

        // Somebody else writes over it: the stamp no longer matches, so the
        // change is theirs and has to be reported.
        std::thread::sleep(Duration::from_millis(10));
        std::fs::write(&path, b"second, longer").unwrap();
        assert!(!unchanged(&path, &stamp), "a file changed after us is not ours");
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
        std::fs::write(&written, b"x").unwrap();
        remember(&written);

        let reported = real.join("note.md");
        let stamp = own(&reported, "w1").expect("the other spelling names the same file");
        assert!(unchanged(&reported, &stamp), "and it still carries our stamp");
    }

    #[test]
    fn a_file_that_went_away_is_not_ours() {
        let dir = temp_dir("gone");
        let path = dir.join("gone.md");
        std::fs::write(&path, b"x").unwrap();
        remember(&path);
        let stamp = Stamp::of(&path).unwrap();
        std::fs::remove_file(&path).unwrap();
        assert!(!unchanged(&path, &stamp));
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
            std::fs::write(&mine, b"a").unwrap();
            remember(&mine);
            {
                let _nested = as_owner("w2");
                assert_eq!(OWNER.with(|o| o.borrow().clone()).as_deref(), Some("w2"));
            }
            assert_eq!(OWNER.with(|o| o.borrow().clone()).as_deref(), Some("w1"));
        }
        assert_eq!(OWNER.with(|o| o.borrow().clone()), None, "the guard restores");

        std::fs::write(&nobodys, b"b").unwrap();
        remember(&nobodys);

        assert!(own(&mine, "w1").is_some(), "w1 wrote it");
        assert!(own(&mine, "w2").is_none(), "w2 did not — a second window must hear");
        assert!(own(&nobodys, "w1").is_none(), "an unnamed write is nobody's");
    }

}
