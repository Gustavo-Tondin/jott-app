//! A folder of task lists — the thing a `tasks` space owns.
//!
//! Extracted from `Notebook` in phase 7 (step B): every operation here used
//! to be written against the one hard-coded `Tasks/` directory. Making "a
//! folder of lists" a value is what lets a second tasks space exist
//! without bolting an `if` onto twenty functions — the notebook
//! orchestrates, the folder does the file work.
//!
//! A tasks space is **one list** (spec 3.5): `task-list.md` plus its
//! `completed.md`, the same two names in every space since 2026-08-13 — the
//! folder is what tells them apart. Extra `.md` files a user drops in are
//! still read — tolerance, not a second model.
//!
//! Nothing here knows about states, periods or completion rules: those are
//! business decisions that coordinate *across* files, and they stay in
//! [`crate::notebook::Notebook`].

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::error::{Error, IoContext, Result};
use crate::list::TaskList;
use crate::COMPLETED_LIST;

/// Written into `.jott/` once, for whoever opens the notebook without the app.
/// Deliberately short: someone reading this is looking at a text file, not at
/// documentation. It covers BOTH worlds — a notebook holds notes as well as
/// lists, and the note format is as much a documented promise (spec 5) as the
/// task one.
const FORMAT_GUIDE: &str = "\
Your tasks and notes are plain Markdown, in the folders next to this one.
Edit them in any text editor — Jott reads whatever you write.

TASK LISTS (task-list.md, and the completed.md beside it)

  - [ ] Buy milk
  - [x] Pay the bill

You can add details on indented lines below a task:

  - [ ] Buy building material
    @2026-07-25 #home #urgent !2
    Talk to Jorge first, he gives a discount.
    repeat: every-week
    - [ ] Cement
    - [ ] Sand

  @2026-07-25   a date, always year-month-day
  #home         a tag
  !1 to !3      priority, 1 is highest
  repeat:       every-day, every-week, every-month, every-3-days...
  - [ ] ...     a subtask
  anything else on an indented line is a description

Two tags mean something to the app: #urgent and #pinned.

The <!--id:...--> comments are Jott's. It adds one to a task only when it
needs to keep track of it — when you pull it into your day or week, or
complete it. You never have to write those yourself, and you can leave them
alone.

Delete a list file and Jott forgets that list. The space's own
task-list.md and completed.md come back automatically.

NOTES (one .md file each)

Anything Jott keeps about a note sits in a block at the very top, between
two --- lines:

  ---
  created: 2026-07-21
  pinned: true
  ---

  Text of the note.

The block is optional: a .md file you wrote by hand, with no block at all,
is a perfectly good note. A key Jott does not know is left untouched, and a
checklist typed inside a note stays text — notes and tasks never mix.

NOTHING IS DESTROYED

A task or a file you delete in the app waits in .jott/trash/ before it goes
for good — 30 days, unless you change that in Settings.
";

/// A directory holding task lists. Cheap to build — it is a path, not a
/// cache; every method reads the disk.
#[derive(Debug, Clone)]
pub struct TaskFolder {
    dir: PathBuf,
}

impl TaskFolder {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Path of a list by name. Rejects anything that could escape the
    /// folder — list names reach this from user input.
    ///
    /// `"` is rejected because it is the quote character of the hidden
    /// comment (`origin:"Meu Mercado"`): allowing it in a name would let a
    /// list break the parsing of every task completed from it.
    pub fn list_path(&self, name: &str) -> Result<PathBuf> {
        if !crate::relpath::is_safe_leaf(name) || name.contains('"') {
            return Err(Error::InvalidListName(name.to_string()));
        }
        Ok(self.dir.join(format!("{name}.md")))
    }

    /// Every list in the folder, alphabetically.
    pub fn list_names(&self) -> Result<Vec<String>> {
        let mut names = Vec::new();
        for path in crate::fsio::dir_paths(&self.dir)? {
            // A copy left behind by a sync tool is not a list the user made.
            if crate::conflict::is_conflict_file(&path) {
                continue;
            }
            if path.extension().is_some_and(|ext| ext == "md") {
                if let Some(stem) = path.file_stem() {
                    names.push(stem.to_string_lossy().to_string());
                }
            }
        }
        names.sort();
        Ok(names)
    }

    pub fn open_list(&self, name: &str) -> Result<TaskList> {
        TaskList::load(self.list_path(name)?)
    }

    /// How many open tasks each list has, for the navigation.
    ///
    /// One pass over the whole folder instead of one read per list. Counts
    /// **open** tasks, and skips the completed list entirely — everything in
    /// it is done. Reading never adopts ids: counting is not a reason to
    /// write to every file.
    pub fn open_task_counts(&self) -> Result<BTreeMap<String, usize>> {
        let mut counts = BTreeMap::new();
        for name in self.list_names()? {
            if name == COMPLETED_LIST {
                continue;
            }
            let open = self
                .open_list(&name)?
                .tasks()
                .filter(|task| !task.done)
                .count();
            counts.insert(name, open);
        }
        Ok(counts)
    }

    /// The folder's main list — spec 3.5: a tasks space is ONE list, and
    /// since 2026-08-13 that list has the same name in every space.
    ///
    /// It used to be derived: the `.md` named after the folder, falling back
    /// to "the single `.md` that is not the Completed one" when the user had
    /// renamed it by hand. Both halves of that rule existed to survive a name
    /// drifting away from its folder, and a fixed name means it cannot drift.
    /// Kept as a method rather than inlining the constant so every call site
    /// still reads as a question about this folder.
    pub fn main_list_name(&self) -> String {
        crate::MAIN_LIST.to_string()
    }

    /// Recreates `task-list.md` and `completed.md` when missing. Called on
    /// every open: the user may have deleted them, and the app must not break.
    /// With fixed names this can no longer invent a third file — recreating a
    /// deleted list writes back exactly the name that was deleted.
    pub fn ensure_default_lists(&self) -> Result<()> {
        std::fs::create_dir_all(&self.dir).ctx(&self.dir)?;
        for name in [crate::MAIN_LIST, COMPLETED_LIST] {
            let path = self.list_path(name)?;
            if !path.exists() {
                crate::fsio::write_atomically(&path, b"")?;
            }
        }
        Ok(())
    }

    /// Drops a plain-text guide next to the lists, for whoever opens the
    /// folder without the app.
    ///
    /// `.txt` on purpose: the app only reads `.md`, so the guide never shows
    /// up as a list.
    pub fn write_format_guide(&self) -> Result<()> {
        let path = self.dir.join("_FORMAT.txt");
        if path.exists() {
            return Ok(());
        }
        crate::fsio::write_atomically(&path, FORMAT_GUIDE.as_bytes())
    }
}
