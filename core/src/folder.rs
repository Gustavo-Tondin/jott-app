//! A folder of task lists — the thing a `tasks` workspace owns.
//!
//! Extracted from `Notebook` in phase 7 (step B): every operation here used
//! to be written against the one hard-coded `Tasks/` directory. Making "a
//! folder of lists" a value is what lets a second tasks workspace exist
//! without bolting an `if` onto twenty functions — the notebook
//! orchestrates, the folder does the file work.
//!
//! A tasks workspace is **one list** (spec 3.5): a `.md` named after the
//! folder (`Work/` → `Work.md`) plus its `Completed.md`. Extra `.md` files a
//! user drops in are still read — tolerance, not a second model.
//!
//! Nothing here knows about states, periods or completion rules: those are
//! business decisions that coordinate *across* files, and they stay in
//! [`crate::notebook::Notebook`].

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::error::{Error, IoContext, Result};
use crate::list::TaskList;
use crate::COMPLETED_LIST;

/// Written into every new tasks folder, for whoever opens it without the app.
/// Deliberately short: someone reading this is looking at a text file, not at
/// documentation.
const FORMAT_GUIDE: &str = "\
These are plain Markdown checklists. Edit them in any text editor —
Jott reads whatever you write.

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

Delete a list file and Jott forgets that list. The workspace's own list
and Completed.md come back automatically.
";

/// A directory holding task lists. Cheap to build — it is a path, not a
/// cache; every method reads the disk.
#[derive(Debug, Clone)]
pub struct TaskFolder {
    dir: PathBuf,
    /// The name of the list this folder is built around, when it is not the
    /// folder's own. See [`TaskFolder::with_main`].
    main: Option<String>,
}

impl TaskFolder {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self {
            dir: dir.into(),
            main: None,
        }
    }

    /// A folder whose main list is **not** named after it.
    ///
    /// Only the fixed Tasks workspace: its folder carries the app's `jott.`
    /// prefix, while its list keeps the plain name the user opens in another
    /// editor. Saying which is the main list beats guessing — with two lists
    /// in the folder there is nothing in the names to guess FROM, and the
    /// rescue of a deleted list would invent a third file (2026-08-11).
    pub fn with_main(dir: impl Into<PathBuf>, main: impl Into<String>) -> Self {
        Self {
            dir: dir.into(),
            main: Some(main.into()),
        }
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

    /// The folder's main list — spec 3.5: the `.md` named after the folder
    /// (or after `main`, when the folder was built with one), or — when the
    /// user renamed it by hand — "the single `.md` that is not
    /// `Completed.md`". Extra hand-made lists never steal the title: with
    /// more than one candidate and none carrying the expected name, the
    /// expected name wins (and `ensure_default_lists` recreates it).
    pub fn main_list_name(&self) -> String {
        let own = self
            .main
            .clone()
            .unwrap_or_else(|| crate::workspace::folder_name_of(&self.dir));
        let others: Vec<String> = self
            .list_names()
            .unwrap_or_default()
            .into_iter()
            .filter(|name| name != COMPLETED_LIST)
            .collect();
        if others.iter().any(|name| *name == own) {
            return own;
        }
        match others.as_slice() {
            [single] => single.clone(),
            _ => own,
        }
    }

    /// Recreates the main list and `Completed.md` when missing. Called on
    /// every open: the user may have deleted them, and the app must not
    /// break. When a list is already there, it *is* the main list and
    /// nothing extra is created — `main` only names the file when the folder
    /// has none, so recreating it twice never invents a second list.
    pub fn ensure_default_lists(&self) -> Result<()> {
        std::fs::create_dir_all(&self.dir).ctx(&self.dir)?;
        for name in [self.main_list_name(), COMPLETED_LIST.to_string()] {
            let path = self.list_path(&name)?;
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
