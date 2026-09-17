//! Sync conflicts left behind by Syncthing. Two devices editing one file
//! before syncing leave a copy named
//! `Inbox.sync-conflict-20260720-143000-K3F7NLM.md` beside the original.
//! Scope on purpose: **detect and report**, plus the one comparison that
//! decides nothing — a copy holding exactly what the original holds goes to
//! the trash. Merging two versions that differ is a separate problem, and
//! guessing wrong there loses work.

use std::path::{Path, PathBuf};

use chrono::NaiveDateTime;
use serde::Serialize;

use crate::error::{Error, Result};

/// The marker Syncthing puts in the file name — and the app too, when it
/// keeps a version it is about to write over ([`keep_copy`]).
pub const MARKER: &str = ".sync-conflict-";

/// The tag the app signs its own copies with, where Syncthing puts the name
/// of the device the losing version came from.
const TAG: &str = "JOTTAPP";

/// The name a version the app is about to write over gets beside itself:
/// the shape Syncthing writes, so the same conflict handling finds it, with
/// our tag rather than a device's.
pub fn copy_name(stem: &str, extension: &str, now: NaiveDateTime) -> String {
    let dot = if extension.is_empty() { "" } else { "." };
    format!(
        "{stem}{MARKER}{}-{TAG}{dot}{extension}",
        now.format("%Y%m%d-%H%M%S")
    )
}

/// Keeps `path` AS IT IS ON DISK beside itself, under [`copy_name`] — for the
/// moment the app is about to write over a version somebody else left there.
/// Answers the copy's path; `None` when there is nothing on disk to keep.
/// Twice in the same second is two copies (`fsio::free_name`), never one
/// written over: each was somebody's work.
pub fn keep_copy(path: &Path, now: NaiveDateTime) -> Result<Option<PathBuf>> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => {
            return Err(Error::Io {
                path: path.to_path_buf(),
                source: e,
            })
        }
    };
    let text = |part: Option<&std::ffi::OsStr>| {
        part.map(|part| part.to_string_lossy().into_owned())
            .unwrap_or_default()
    };
    let dir = path.parent().unwrap_or(Path::new("."));
    let name = copy_name(&text(path.file_stem()), &text(path.extension()), now);
    let copy = crate::fsio::free_name(dir, &name);
    crate::fsio::write_atomically(&copy, &bytes)?;
    Ok(Some(copy))
}

/// Which of the app's files a copy belongs to — what tells the interface to
/// name a list its own way (every space's main list reads Inbox), and to say
/// nothing at all about the app's own bookkeeping.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FileKind {
    /// The day's state, the plan, or the trash's index — merged in silence.
    State,
    List,
    Note,
    /// `.jott/config.json`: the notebook's settings.
    Settings,
    /// `.jott/tags.json`: the colours of the tags.
    Tags,
    /// `.jott/trash/trash.json`, when it could not be merged.
    Trash,
}

/// One of the two versions on the table, as the banner shows it to someone
/// choosing between them: when it was last written, and how big it is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    /// Last written, local wall clock (`2026-09-17T09:12:05`); `None` when the
    /// file system would not say.
    pub modified: Option<String>,
    pub bytes: u64,
}

impl Version {
    pub fn of(path: &Path) -> Option<Self> {
        let meta = std::fs::metadata(path).ok()?;
        Some(Self {
            modified: meta.modified().ok().map(|time| {
                crate::clock::civil_time_of(time)
                    .format("%Y-%m-%dT%H:%M:%S")
                    .to_string()
            }),
            bytes: meta.len(),
        })
    }
}

/// What the two versions of a file disagree about, when the app read them
/// both and could not settle it. The words are the interface's; this says
/// which sentence and with what number.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Difference {
    /// A note: how many lines the two versions write differently.
    Lines { count: usize },
    /// A list: tasks both devices changed, named by the first of them.
    Tasks { count: usize, first: String },
    /// This device has never seen the file before, so there is nothing to
    /// measure from and nothing was compared.
    Unseen,
}

/// A conflicting copy of a file, and the file it belongs to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    /// The conflicting copy Syncthing wrote.
    pub path: PathBuf,
    /// Name of the list it belongs to (`Inbox`), when it is a task list.
    pub list: Option<String>,
    /// The file it conflicts with, if that file still exists.
    pub original: Option<PathBuf>,
    /// The copy's address, root-relative with `/` — what the interface hands
    /// back to `folder_of` to reveal it. `describe` does not know the root;
    /// `Notebook::conflicts` fills it in.
    pub relative: Option<String>,
    /// What the two versions disagree about, when the app could look. Filled
    /// by `Notebook::conflicts`, which is the only reader that has the base.
    pub differs: Option<Difference>,
    /// Which of the app's files it is; `None` for one the app does not read.
    /// Filled by `Notebook::conflicts`, which is the only reader that knows
    /// the spaces.
    pub kind: Option<FileKind>,
    /// The version under the file's own name — the one in use. Filled by
    /// `Notebook::conflicts`.
    pub kept: Option<Version>,
    /// The conflicting copy. Filled by `Notebook::conflicts`.
    pub copy: Option<Version>,
}

/// True when the file name is a sync-conflict copy — kept out of the list
/// of lists, because it is not a list the user created.
///
/// A HALF-WRITTEN one is not: while it is being fetched, Syncthing holds the
/// copy as `.syncthing.<name>.tmp`, hidden and temporary, and the name still
/// carries the marker. Counting it left the banner asking about a file that
/// was about to have another name — and about one that may never arrive at
/// all, since the app can send the copy to the trash mid-transfer. Nothing
/// the app writes is hidden or `.tmp`.
pub fn is_conflict_file(path: &Path) -> bool {
    let name = crate::fsio::file_name_of(path);
    name.contains(MARKER) && !name.starts_with('.') && !name.ends_with(".tmp")
}

/// Describes a conflict file: which list it belongs to and what it conflicts
/// with. Returns `None` when the path is not a conflict file.
pub fn describe(path: &Path) -> Option<Conflict> {
    if !is_conflict_file(path) {
        return None;
    }
    let name = crate::fsio::file_name_of(path);
    let (original_stem, _) = name.split_once(MARKER)?;

    // `Inbox.sync-conflict-...md` belongs to `Inbox.md`, in the same folder.
    let original = path.parent().map(|dir| {
        let mut name = original_stem.to_string();
        if let Some(ext) = path.extension() {
            name.push('.');
            name.push_str(&ext.to_string_lossy());
        }
        dir.join(name)
    });

    let is_markdown = path.extension().is_some_and(|ext| ext == "md");
    Some(Conflict {
        list: is_markdown.then(|| original_stem.to_string()),
        original: original.filter(|p| p.exists()),
        relative: None,
        differs: None,
        kind: None,
        kept: None,
        copy: None,
        path: path.to_path_buf(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(hour: u32, minute: u32, second: u32) -> NaiveDateTime {
        chrono::NaiveDate::from_ymd_opt(2026, 9, 14)
            .unwrap()
            .and_hms_opt(hour, minute, second)
            .unwrap()
    }

    fn p(name: &str) -> PathBuf {
        PathBuf::from("/notebook/Tasks").join(name)
    }

    #[test]
    fn recognizes_what_syncthing_writes() {
        assert!(is_conflict_file(&p(
            "Inbox.sync-conflict-20260720-143000-K3F7NLM.md"
        )));
    }

    #[test]
    fn leaves_normal_lists_alone() {
        for name in ["Inbox.md", "Compras.md", "Projeto X.md", "Completed.md"] {
            assert!(!is_conflict_file(&p(name)), "{name} is a normal list");
        }
    }

    #[test]
    fn a_copy_still_being_fetched_is_not_one_yet() {
        // Measured on the real pair, 2026-09-14: the app merged the copy and
        // trashed it while Syncthing was still sending it on, and the hidden
        // temporary stayed behind — with no original, and asked about in the
        // banner for ever.
        assert!(!is_conflict_file(&PathBuf::from(
            "/notebook/.jott/.syncthing.daily-state.sync-conflict-20260914-154931-VXVGIUI.json.tmp"
        )));
        assert_eq!(
            describe(&PathBuf::from(
                "/notebook/.jott/.syncthing.daily-state.sync-conflict-20260914-154931-VXVGIUI.json.tmp"
            )),
            None
        );
        // And the finished one, under its real name, still is.
        assert!(is_conflict_file(&PathBuf::from(
            "/notebook/.jott/daily-state.sync-conflict-20260914-154931-VXVGIUI.json"
        )));
    }

    #[test]
    fn a_list_named_after_the_marker_is_not_a_false_positive() {
        // Contrived, but a list really called "sync-conflict" must still work.
        assert!(!is_conflict_file(&p("sync-conflict.md")));
        assert!(!is_conflict_file(&p("meu sync conflict.md")));
    }

    #[test]
    fn describes_which_list_the_conflict_belongs_to() {
        let conflict = describe(&p("Inbox.sync-conflict-20260720-143000-K3F7NLM.md")).unwrap();

        assert_eq!(conflict.list.as_deref(), Some("Inbox"));
        // The original does not exist on this fake path, so it is reported as
        // missing rather than as a path that leads nowhere.
        assert_eq!(conflict.original, None);
    }

    #[test]
    fn a_list_name_with_dots_survives() {
        let conflict =
            describe(&p("Projeto v2.0.sync-conflict-20260720-143000-ABC.md")).unwrap();
        assert_eq!(conflict.list.as_deref(), Some("Projeto v2.0"));
    }

    #[test]
    fn a_conflict_on_a_non_markdown_file_has_no_list() {
        let conflict = describe(&PathBuf::from(
            "/notebook/.jott/daily-state.sync-conflict-20260720-143000-ABC.json",
        ))
        .unwrap();
        assert_eq!(conflict.list, None);
    }

    #[test]
    fn a_normal_file_is_not_described() {
        assert_eq!(describe(&p("Inbox.md")), None);
    }

    #[test]
    fn points_at_the_original_when_it_exists() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("Inbox.md");
        std::fs::write(&original, "- [ ] tarefa\n").unwrap();

        let conflict = describe(
            &dir.path()
                .join("Inbox.sync-conflict-20260720-143000-ABC.md"),
        )
        .unwrap();

        assert_eq!(conflict.original, Some(original));
    }

    #[test]
    fn the_name_the_app_signs_its_own_copies_with() {
        let name = copy_name("Ideia", "md", at(3, 14, 48));
        assert_eq!(name, "Ideia.sync-conflict-20260914-031448-JOTTAPP.md");
        assert!(is_conflict_file(&p(&name)), "and it reads back as one");
        assert_eq!(describe(&p(&name)).unwrap().list.as_deref(), Some("Ideia"));
        // A file with no extension is given none.
        assert_eq!(
            copy_name("LEIA", "", at(3, 14, 48)),
            "LEIA.sync-conflict-20260914-031448-JOTTAPP"
        );
    }

    #[test]
    fn keeping_a_version_twice_in_one_second_is_two_copies() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Compras.md");
        std::fs::write(&path, "- [ ] do celular\n").unwrap();

        let first = keep_copy(&path, at(3, 14, 48)).unwrap().unwrap();
        let second = keep_copy(&path, at(3, 14, 48)).unwrap().unwrap();

        assert_ne!(first, second, "each was somebody's work");
        assert_eq!(std::fs::read_to_string(&first).unwrap(), "- [ ] do celular\n");
        assert_eq!(std::fs::read_to_string(&second).unwrap(), "- [ ] do celular\n");
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "- [ ] do celular\n",
            "the original is not touched"
        );
        // Nothing on disk: nothing to keep, and no error.
        assert_eq!(keep_copy(&dir.path().join("Nada.md"), at(3, 14, 48)).unwrap(), None);
    }
}
