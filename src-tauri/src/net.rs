//! The one way this app fetches anything over the network.
//!
//! Two commands leave the machine — the picture pasted as an `https://`
//! address (`commands::assets`) and the update check (`commands::update`) —
//! and both are fenced the same way: timeouts on connecting and on the whole
//! call, and a ceiling on the body read through `take`, so a server claiming
//! a small file and sending a stream cannot fill the disk. Written once, the
//! next thing that fetches cannot skip part of the fence. What the bytes MEAN
//! stays with the caller.

use std::io::Read;
use std::time::Duration;

use crate::error::{CommandError, CommandResult};

/// What came back: the media type the server declared, and the body.
pub struct Fetched {
    /// The `content-type` without its parameters, lower-cased — `image/png`
    /// out of `image/PNG; charset=binary`. Empty when the server sent none.
    pub content_type: String,
    pub body: Vec<u8>,
}

/// Refuses anything that is not `https://`, before a socket is opened.
///
/// A picture is not worth a plaintext request, and `file://` here would be
/// this process reading the disk on the page's behalf. A separate step from
/// the fetch so the one caller with a reason to skip it (a test server, a
/// manifest of lies while developing) can, explicitly.
pub fn require_https(url: &str) -> CommandResult<()> {
    if url.starts_with("https://") {
        Ok(())
    } else {
        Err(CommandError::new("invalid", format!("{url} is not https")))
    }
}

/// GETs `url`, reading at most `max_bytes` of body.
///
/// A body over the ceiling is an error, not a truncation: the callers parse
/// what they get, and a file cut short would be a picture that does not open
/// or a manifest that does not parse, reported as the wrong thing.
pub fn get_bounded(url: &str, max_bytes: u64) -> CommandResult<Fetched> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(10)))
        .timeout_global(Some(Duration::from_secs(30)))
        // A call that began on https stays there: redirects are followed,
        // and one to plain http would step around `require_https`.
        .https_only(url.starts_with("https://"))
        .build()
        .into();

    let mut response = agent
        .get(url)
        .call()
        .map_err(|e| CommandError::new("io", format!("{url}: {e}")))?;

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_lowercase();

    let mut body = Vec::new();
    response
        .body_mut()
        .as_reader()
        .take(max_bytes + 1)
        .read_to_end(&mut body)
        .map_err(|e| CommandError::new("io", e.to_string()))?;
    if body.len() as u64 > max_bytes {
        return Err(CommandError::new(
            "invalid",
            format!("{url} answered with more than {max_bytes} bytes"),
        ));
    }

    Ok(Fetched { content_type, body })
}
