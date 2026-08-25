//! One `invoke()` command per core operation.
//!
//! Every function here is a wire: read the arguments, call `jott_core`, hand
//! back the result. Any `if` that decides something about tasks, lists or
//! dates belongs in the core instead — see the architecture rule in
//! `CLAUDE.md`.
//!
//! One module per domain, mirroring `jott_core::notebook`'s own split. The
//! file was 2.9k lines in one piece until 2026-08-21, which is how a rule
//! about tasks ends up sitting between the clipboard and the icon theme: with
//! nowhere in particular to put a function, everything lands at the bottom.
//! `lib.rs` still registers one flat list of commands — the split is about
//! where a reader looks, not about the bridge the frontend sees.
//!
//! What each module holds:
//!
//! | module | the question it answers |
//! |---|---|
//! | [`shell`] | what the machine around the window is — its buttons, its folders, its file manager |
//! | [`notebook`] | the open notebook as a whole: what it is, one snapshot of it, its search, its trash and its tags |
//! | [`settings`] | what the user chose — this machine's drawer and the notebook's |
//! | [`lists`] · [`tasks`] · [`notes`] | the content |
//! | [`assets`] | the notebook's file library, and the two doors pictures come in through |
//! | [`spaces`] | spaces and the groups that hold them |
//! | [`period`] | the Day and the Week |
//! | [`update`] | what answers for this INSTALL: the version check and the menu entry |
//! | [`reminders`] | what should ring, the bell, and the tray the app waits in |

pub mod assets;
pub mod lists;
pub mod notebook;
pub mod notes;
pub mod period;
pub mod reminders;
pub mod settings;
pub mod shell;
pub mod spaces;
pub mod tasks;
pub mod update;
