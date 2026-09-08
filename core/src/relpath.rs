//! Resolving a user-supplied relative path inside a folder, safely.
//!
//! Every address the app takes — a list, a space folder, a note — arrives
//! from somewhere the user controls: a config file, a text field, a template
//! someone downloaded. The rule is always the same, so it lives here once
//! instead of being re-derived (slightly differently) in each module.
//!
//! What is refused, and why:
//!
//! - `..` in any form — the whole point;
//! - an absolute path, which would ignore the base entirely;
//! - a component starting with `.` — hidden files are the app's business
//!   (`.jott`, `.space.json`), never content;
//! - `\` and NUL, which mean different things on different platforms and
//!   nothing good on any of them;
//! - an empty component (`a//b`), which hides intent.

use std::path::{Path, PathBuf};

/// True when one path component is safe to walk into.
pub fn is_safe_component(part: &str) -> bool {
    !part.trim().is_empty() && !part.starts_with('.') && !part.contains(['\\', '\0'])
}

/// True when `name` is safe as a **single** folder or file name the user typed.
///
/// The difference from [`is_safe_component`]: a leaf may not contain `/` at
/// all. A list called `sub/lista` is not a list in a subfolder — it is a name
/// the app would silently turn into a folder.
///
/// Every door that takes a name from the user goes through here — a list name,
/// a space name, a group name. They used to each spell the rule out with
/// a slightly different set of checks; each still raises **its own** error, and
/// adds its own extra restriction (a list name also refuses `"`, a space
/// folder also refuses `completed`), but the rule underneath is one.
pub fn is_safe_leaf(name: &str) -> bool {
    is_safe_component(name) && !name.contains('/') && !name.contains("..")
}

/// True when `relative` is a safe path inside some base folder.
fn is_safe_relative(relative: &str) -> bool {
    !relative.trim().is_empty()
        && !relative.starts_with('/')
        && !relative.contains("..")
        && !relative.contains(['\\', '\0'])
        && relative.split('/').all(is_safe_component)
}

/// Joins `relative` onto `base`, or `None` when it is not safe.
pub fn safe_join(base: &Path, relative: &str) -> Option<PathBuf> {
    is_safe_relative(relative).then(|| base.join(relative))
}

/// The inverse: `abs` written relative to `base`, always with `/`.
///
/// Every address the app hands out or stores — a list path in a state file, a
/// space prefix, a note address, a trashed item's origin — is a root-relative
/// string with forward slashes, because those strings are written into files
/// that sync between machines. A Windows `\` in one of them would address
/// nothing on the next machine to open the notebook.
///
/// A path that is not under `base` is returned whole, which is the only honest
/// answer and never happens in practice.
pub fn relative_slash(base: &Path, abs: &Path) -> String {
    abs.strip_prefix(base)
        .unwrap_or(abs)
        .to_string_lossy()
        .replace('\\', "/")
}

/// The last component of a slash-separated address — the whole address when
/// it has no `/`. The root-relative strings the app hands around are always
/// `/`-joined (see [`relative_slash`]), so this is the one split every module
/// used to spell out with its own `rsplit('/')`.
pub fn leaf_of(relative: &str) -> &str {
    relative.rsplit('/').next().unwrap_or(relative)
}

/// Splits an address into its parent and its leaf: `Clientes/Acme` →
/// (`Clientes`, `Acme`). The parent has no trailing slash, and is empty when
/// the address has none — a root-level item's parent is the root.
pub fn split_parent(relative: &str) -> (&str, &str) {
    relative.rsplit_once('/').unwrap_or(("", relative))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_ordinary_relative_paths() {
        for good in ["Inbox", "Ideias/2026", "Project A/Backlog", "a b/c d"] {
            assert!(is_safe_relative(good), "{good:?} should be accepted");
        }
    }

    #[test]
    fn refuses_anything_that_climbs_hides_or_escapes() {
        for bad in [
            "..",
            "../fora",
            "a/../b",
            "/etc",
            ".jott",
            "a/.oculto",
            "a\\b",
            "a\0b",
            "",
            "   ",
            "a//b",
        ] {
            assert!(!is_safe_relative(bad), "{bad:?} should be refused");
        }
    }

    #[test]
    fn a_leaf_is_a_name_with_no_separator_in_it() {
        for good in ["Inbox", "Projeto Y", "Compras 2026", "Projeto v2.0"] {
            assert!(is_safe_leaf(good), "{good:?} should be accepted");
        }
        for bad in [
            "", "   ", "..", "../fora", "a/b", "Ideias/2026", "a\\b", "a\0b", ".oculto", "a..b",
        ] {
            assert!(!is_safe_leaf(bad), "{bad:?} should be refused");
        }
    }

    #[test]
    fn relative_slash_addresses_from_the_base_with_forward_slashes() {
        let base = Path::new("/notebook");
        assert_eq!(
            relative_slash(base, &base.join("Tasks/Inbox/Inbox.md")),
            "Tasks/Inbox/Inbox.md"
        );
        assert_eq!(relative_slash(base, base), "");
        // Not under the base: the whole path is the only honest answer.
        assert_eq!(relative_slash(base, Path::new("/outro/x.md")), "/outro/x.md");
    }

    #[test]
    fn leaf_of_is_the_last_component_or_the_whole_address() {
        assert_eq!(leaf_of("Tasks/Inbox/Inbox.md"), "Inbox.md");
        assert_eq!(leaf_of("Inbox.md"), "Inbox.md");
        assert_eq!(leaf_of(""), "");
        // A trailing slash is an empty leaf, not the piece before it.
        assert_eq!(leaf_of("Ideias/"), "");
    }

    #[test]
    fn split_parent_gives_the_parent_without_a_slash_and_empty_at_the_root() {
        assert_eq!(split_parent("Clientes/Acme"), ("Clientes", "Acme"));
        assert_eq!(split_parent("a/b/c.md"), ("a/b", "c.md"));
        assert_eq!(split_parent("Acme"), ("", "Acme"));
        assert_eq!(split_parent(""), ("", ""));
    }

    #[test]
    fn safe_join_stays_under_the_base() {
        let base = Path::new("/notebook/Notes");
        assert_eq!(
            safe_join(base, "Ideias/nota.md"),
            Some(PathBuf::from("/notebook/Notes/Ideias/nota.md"))
        );
        assert_eq!(safe_join(base, "../../etc/passwd"), None);
    }
}
