//! What the app itself just wrote, so a watcher can tell its own writes from
//! somebody else's. Every write goes through `fsio::write_atomically`, which
//! records the path here with the stamp it ended up carrying.
//!
//! A write is remembered by its RESULT (length + mtime), never by time alone:
//! a file that no longer carries the stamp we left was written by someone
//! after us, and must still be reported — missing that lets the next save
//! overwrite an external edit in silence.

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
#[derive(Clone, Copy, Debug)]
struct Record {
    stamp: Stamp,
    at: SystemTime,
    seq: u64,
}

#[derive(Default)]
struct Log {
    writes: HashMap<PathBuf, Record>,
    next: u64,
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

/// The current position in the log — hand it back to [since].
pub fn mark() -> u64 {
    log().lock().map(|log| log.next).unwrap_or(0)
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
    let seq = log.next;
    log.next += 1;
    log.writes.insert(
        path.to_path_buf(),
        Record {
            stamp,
            at: now,
            seq,
        },
    );
}

/// Everything written since `mark`, as the paths and the stamps they were
/// left carrying. The caller decides who those writes belong to — the log
/// itself is process-wide, but a WINDOW is what a watcher answers to.
pub fn since(mark: u64) -> Vec<(PathBuf, Stamp)> {
    let now = crate::clock::system_now();
    let Ok(mut log) = log().lock() else {
        return Vec::new();
    };
    purge(&mut log, now);
    log.writes
        .iter()
        .filter(|(_, record)| record.seq >= mark)
        .map(|(path, record)| (path.clone(), record.stamp))
        .collect()
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

        let mark = mark();
        std::fs::write(&path, b"first").unwrap();
        remember(&path);

        let written: HashMap<_, _> = since(mark).into_iter().collect();
        let stamp = written.get(&path).copied().expect("the write was recorded");
        assert!(unchanged(&path, &stamp), "the file we just wrote is ours");

        // Somebody else writes over it: the stamp no longer matches, so the
        // change is theirs and has to be reported.
        std::thread::sleep(Duration::from_millis(10));
        std::fs::write(&path, b"second, longer").unwrap();
        assert!(!unchanged(&path, &stamp), "a file changed after us is not ours");
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
    fn since_reports_only_writes_after_the_mark() {
        let dir = temp_dir("mark");
        let before = dir.join("before.md");
        std::fs::write(&before, b"a").unwrap();
        remember(&before);

        let mark = mark();
        let after = dir.join("after.md");
        std::fs::write(&after, b"b").unwrap();
        remember(&after);

        let paths: Vec<_> = since(mark).into_iter().map(|(path, _)| path).collect();
        assert!(paths.contains(&after));
        assert!(!paths.contains(&before));
    }
}
