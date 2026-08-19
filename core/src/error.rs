use std::path::PathBuf;

/// Everything that can go wrong inside the core.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("io error on {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("{0} is not a Jott notebook")]
    NotANotebook(PathBuf),

    /// The folder has no `.space.json`. A folder only becomes interface
    /// by carrying the marker — never on its own.
    #[error("{0} is not a space")]
    NotASpace(PathBuf),

    /// A notebook in the pre-phase-7 layout. Refused with a clear message
    /// instead of converted: no migrations before v1 (decision 2026-07-21).
    #[error(
        "{0} was created by an older version of Jott and uses a layout this \
         build no longer reads; create a new notebook"
    )]
    LegacyNotebook(PathBuf),

    /// An asset address that is not one of the library's — it escapes the
    /// folder, names something that is not an image, or points at a file the
    /// user wrote the link to themselves. See [`crate::assets`].
    #[error("invalid asset path {0:?}")]
    InvalidAssetPath(String),

    /// A note address that could escape its folder, or a title that cannot
    /// be a file name.
    #[error("invalid note path {0:?}")]
    InvalidNotePath(String),

    #[error("{0} already contains a Jott notebook")]
    AlreadyANotebook(PathBuf),

    #[error("no task with id {0}")]
    TaskNotFound(String),

    #[error("invalid list name {0:?}")]
    InvalidListName(String),

    /// A space folder name that could escape the notebook, is empty, or
    /// collides with an existing folder. The name is user input.
    #[error("invalid space name {0:?}")]
    InvalidSpaceName(String),

    /// The notebook was written by a newer version of the app. Opening it
    /// read-only is safer than rewriting a file whose fields we do not know.
    #[error("notebook uses schema version {found}, this build supports {supported}")]
    ReadOnlyNotebook { found: u64, supported: u64 },

    /// A default the app recreates on every open — `Inbox`, `Completed`, the
    /// notes `Inbox` folder. Renaming or deleting one would only confuse the
    /// user, since it comes straight back.
    #[error("{0} is created by the app and cannot be renamed or deleted")]
    Protected(String),

    /// The file watcher could not be started or kept running.
    #[error("could not watch the notebook: {0}")]
    Watch(String),
}

pub type Result<T> = std::result::Result<T, Error>;

/// The guard every writer shares: refuse to write a file whose `schemaVersion`
/// came from a newer build.
///
/// The notebook config, the space config and the notebook itself each spelled
/// this out; three copies of one rule is three chances for the next config
/// file to forget it. Reading a future file is
/// fine — rewriting one is how data written by a newer app gets destroyed.
pub fn guard_schema(found: u64, supported: u64) -> Result<()> {
    if found > supported {
        return Err(Error::ReadOnlyNotebook { found, supported });
    }
    Ok(())
}

/// Attaches the offending path to an io error, so failures say *which* file
/// broke instead of just "No such file or directory".
pub(crate) trait IoContext<T> {
    fn ctx(self, path: impl Into<PathBuf>) -> Result<T>;
}

impl<T> IoContext<T> for std::result::Result<T, std::io::Error> {
    fn ctx(self, path: impl Into<PathBuf>) -> Result<T> {
        self.map_err(|source| Error::Io {
            path: path.into(),
            source,
        })
    }
}
