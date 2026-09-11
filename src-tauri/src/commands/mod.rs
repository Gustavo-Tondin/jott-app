//! One `invoke()` command per core operation, one module per domain
//! (mirroring `jott_core::notebook`). Every function is a wire: read the
//! arguments, call `jott_core`, hand back the result — any `if` about tasks,
//! lists or dates belongs in the core. `lib.rs` registers one flat list.
//!
//! **Every command that touches the disk or waits on a process is `async`.**
//! A sync command runs on the thread that draws (on Android, the only one),
//! and the notebook there sits on FUSE storage. The few that stay sync read
//! memory alone — `platform`, `perf_enabled`, `app_version`, `undoable`,
//! `quit_app` — plus `open_window`, which makes a window and belongs to the
//! main thread. A test in `tests/bridge.rs` holds the list.

pub mod shell;
pub mod notebook;
pub mod settings;
pub mod spaces;
pub mod lists;
pub mod tasks;
pub mod notes;
pub mod assets;
pub mod day;
pub mod timeline;
pub mod reminders;
pub mod update;
