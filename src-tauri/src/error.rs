//! Turning core errors into something `invoke()` can return.
//!
//! Tauri needs the error type to be `Serialize`, and `jott_core::Error` is
//! not — nor should it be, since the core knows nothing about the bridge.

use serde::Serialize;

/// An error on its way to the frontend.
///
/// `kind` lets the UI branch (showing "this notebook is read-only" instead of
/// a generic failure) without parsing the human-readable message.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub kind: &'static str,
    pub message: String,
}

impl CommandError {
    pub fn new(kind: &'static str, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    /// No notebook has been opened yet — the app called an operation too early.
    pub fn no_notebook() -> Self {
        Self::new("noNotebook", "no notebook is open")
    }
}

impl From<jott_core::Error> for CommandError {
    fn from(error: jott_core::Error) -> Self {
        use jott_core::Error;

        let kind = match &error {
            Error::Io { .. } => "io",
            Error::NotANotebook(_) => "notANotebook",
            Error::NotAWorkspace(_) => "notAWorkspace",
            Error::LegacyNotebook(_) => "legacyNotebook",
            Error::AlreadyANotebook(_) => "alreadyANotebook",
            Error::TaskNotFound(_) => "taskNotFound",
            Error::InvalidListName(_) => "invalidListName",
            Error::InvalidWorkspaceName(_) => "invalidWorkspaceName",
            Error::InvalidNotePath(_) => "invalidNotePath",
            Error::ReadOnlyNotebook { .. } => "readOnlyNotebook",
            Error::Protected(_) => "protected",
            Error::Watch(_) => "watch",
        };
        Self::new(kind, error.to_string())
    }
}

pub type CommandResult<T> = std::result::Result<T, CommandError>;
