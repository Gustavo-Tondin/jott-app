//! Comparing the running app's version against a published one.
//!
//! The update check downloads a manifest that names the latest released
//! version; this module answers the only question the app asks about it —
//! "is that newer than me?". It lives in the core so the rule is testable
//! without a network and shared by any frontend.

/// Whether `candidate` names a strictly newer version than `current`.
///
/// Tolerant on purpose: a leading `v` is accepted (tags are written
/// `v0.20.0`), and anything after a `-` or `+` is ignored — the app never
/// publishes pre-releases, so `0.20.0-rc1` counting as `0.20.0` is fine.
/// A version that cannot be parsed is never "newer": a broken manifest must
/// not nag the user with a phantom update.
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
