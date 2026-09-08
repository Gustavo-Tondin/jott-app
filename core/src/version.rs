//! Comparing the running app's version against a published one: which
//! version the manifest names, and whether that is newer than me. In the core
//! so both rules are testable without a network; fetching is the bridge's.

use crate::error::{Error, Result};

/// The version a release manifest (`latest.json`) names. Reads the ONE field
/// the notice needs and refuses the rest: a manifest that is not JSON, or that
/// names no version, is not an update, and "" would read as one version too many.
pub fn from_manifest(text: &str) -> Result<String> {
    let manifest: serde_json::Value = serde_json::from_str(text)
        .map_err(|e| Error::InvalidManifest(format!("that manifest is not JSON: {e}")))?;
    manifest
        .get("version")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| Error::InvalidManifest("that manifest names no version".to_string()))
}

/// Whether `candidate` names a strictly newer version than `current`. A
/// leading `v` is accepted (tags are `v0.20.0`); anything after `-`/`+` is
/// ignored (no pre-releases are published). Unparseable is never "newer":
/// a broken manifest must not nag the user with a phantom update.
pub fn is_newer(candidate: &str, current: &str) -> bool {
    match (parse(candidate), parse(current)) {
        (Some(new), Some(old)) => new > old,
        _ => false,
    }
}

/// `"v1.2.3-rc1"` → `(1, 2, 3)`. `None` when any of the three numbers is
/// missing or not a number.
fn parse(version: &str) -> Option<(u64, u64, u64)> {
    let version = version.trim().trim_start_matches('v');
    let version = version
        .split(['-', '+'])
        .next()
        .unwrap_or_default();

    let mut numbers = version.split('.').map(|part| part.parse::<u64>().ok());
    let major = numbers.next()??;
    let minor = numbers.next()??;
    let patch = numbers.next()??;
    if numbers.next().is_some() {
        return None;
    }
    Some((major, minor, patch))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_versions_are_recognised() {
        assert!(is_newer("0.20.1", "0.20.0"));
        assert!(is_newer("0.21.0", "0.20.9"));
        assert!(is_newer("1.0.0", "0.99.99"));
    }

    #[test]
    fn same_and_older_versions_are_not_newer() {
        assert!(!is_newer("0.20.0", "0.20.0"));
        assert!(!is_newer("0.19.9", "0.20.0"));
        assert!(!is_newer("0.9.0", "1.0.0"));
    }

    #[test]
    fn numeric_order_beats_text_order() {
        // The mistake a string comparison would make.
        assert!(is_newer("0.100.0", "0.99.0"));
        assert!(!is_newer("0.9.0", "0.10.0"));
    }

    #[test]
    fn tags_and_suffixes_are_tolerated() {
        assert!(is_newer("v0.21.0", "0.20.0"));
        assert!(is_newer("0.21.0-rc1", "v0.20.0"));
        assert!(is_newer(" 0.21.0 ", "0.20.0+build5"));
    }

    #[test]
    fn garbage_is_never_an_update() {
        assert!(!is_newer("latest", "0.20.0"));
        assert!(!is_newer("", "0.20.0"));
        assert!(!is_newer("0.21", "0.20.0"));
        assert!(!is_newer("0.21.0.1", "0.20.0"));
        assert!(!is_newer("0.21.0", "not-a-version"));
    }
}
