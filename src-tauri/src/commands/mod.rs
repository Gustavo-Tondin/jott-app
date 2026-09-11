//! One `invoke()` command per core operation, one module per domain
//! (mirroring `jott_core::notebook`). Every function is a wire: read the
//! arguments, call `jott_core`, hand back the result — any `if` about tasks,
//! lists or dates belongs in the core. `lib.rs` registers one flat list.

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
