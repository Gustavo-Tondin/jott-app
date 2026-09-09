//! A folder of task lists — the thing a `tasks` space owns. The notebook
//! orchestrates, the folder does the file work: nothing here knows about
//! states, periods or completion rules. A tasks space is ONE list
//! (`task-list.md` plus `completed.md`, the same names in every space);
//! extra `.md` files a user drops in are still read — tolerance, not a model.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::error::{Error, IoContext, Result};
use crate::list::TaskList;
use crate::COMPLETED_LIST;

/// Written into `.jott/` once, for whoever opens the notebook without the app.
/// Deliberately short, and it covers notes as well as lists.
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
  [file](assets/file)   a file attached to the task (see IMAGES below)
  anything else on an indented line is a description

A line of nothing but links into assets/ is the task's attachments:

  - [ ] Enviar proposta
    @2026-07-25 #cliente
    [nota-fiscal.pdf](assets/nota-fiscal.pdf)

A line with any other link — to the web, to a file of your own — is just a
description, and Jott leaves it exactly as you wrote it.

Two tags mean something to the app: #urgent and #pinned.

The <!--id:... created:...--> comments are Jott's. Every task gets a
created: date — the day it entered the app; a task you typed by hand gets
today's date the next time the notebook opens. An id: is added only when it
needs to keep track of the task — when you pull it into your day or week, or
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

NOTE BANNERS (the first line of a note)

A note can carry a coloured or illustrated head. It is one comment, on the
first line of the text:

  <!--banner: 6-->
  <!--banner: assets/sunset.jpg-->

A colour is one of Jott's eight slots — 1 to 7, or neutral; the theme
decides what each one looks like. An image is an address in the assets
folder, below.
Every Markdown reader hides that comment, so the note stays a normal note
everywhere else. No line, no banner: the note shows only its title, and
that is the default.

FILES (the assets folder)

Every file you add lives in assets/, next to your spaces, and is addressed
from the notebook's root wherever it is used:

  ![](assets/sunset.jpg)               a picture inside a note
  <!--banner: assets/sunset.jpg-->     a note's banner
  [nota-fiscal.pdf](assets/nota-fiscal.pdf)   a file attached to a task

Any kind of file goes in there; only an image can be a banner or be shown
inside a note. The address is the same from any note and any task, so moving
them never breaks a link. Drop files into assets/ yourself if you prefer —
Jott lists whatever is in there.

NOTHING IS DESTROYED

A task or a file you delete in the app waits in .jott/trash/ before it goes
for good — 30 days, unless you change that in Settings.

THE .jott/timeline/ FOLDER IS JOTT'S MEMORY

One file a year, one line per thing that was created, moved or deleted. It
is only ever added to — Jott never rewrites or removes a line. It is what
lets the app show you a note on the day you wrote it even after you delete
it. Delete the folder and nothing you wrote is lost; Jott simply forgets
everything that is no longer here.

THE .jott/index/ FOLDER IS NOT YOURS TO EDIT

Everything under .jott/index/ is bookkeeping Jott writes for itself — which
note you last had open, and the like. It holds nothing you wrote, it is
rebuilt from what is around it, and deleting it costs you nothing but that
bookkeeping. Everything you write lives in the .md files.
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

    /// Path of a list by name. Rejects anything that could escape the folder
    /// (list names reach this from user input), and `"`: it is the quote of
    /// the hidden comment (`origin:"Meu Mercado"`) and would break its parsing.
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

    /// How many OPEN tasks each list has, in one pass; the completed list is
    /// skipped. Reading never adopts ids: counting is not a reason to write.
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

    /// The folder's main list: a tasks space is ONE list, with the same name
    /// in every space. A method rather than the constant so every call site
    /// still reads as a question about this folder.
    pub fn main_list_name(&self) -> &'static str {
        crate::MAIN_LIST
    }

    /// Recreates `task-list.md` and `completed.md` when missing. Called on
    /// every open: the user may have deleted them, and the app must not break.
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

    /// Drops a plain-text guide next to the lists. `.txt` on purpose: the app
    /// only reads `.md`, so the guide never shows up as a list.
    pub fn write_format_guide(&self) -> Result<()> {
        let path = self.dir.join("_FORMAT.txt");
        if path.exists() {
            return Ok(());
        }
        crate::fsio::write_atomically(&path, FORMAT_GUIDE.as_bytes())
    }
}
