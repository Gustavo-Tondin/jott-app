//! The tolerant JSON document every config file in the notebook is.
//!
//! `.jott/config.json`, `.space.json`, `.group.json` and
//! `.jott/tags.json` all make the **same four promises** (spec 3.4 and 3.5):
//!
//! - a missing or unreadable file reads as "nothing set", never an error —
//!   a broken preference must not stop someone opening their notebook;
//! - a missing or malformed *value* takes the default, one key at a time;
//! - an **unknown key survives the rewrite**, at any depth, so a notebook
//!   opened by two versions of the app does not lose the newer one's data;
//! - a value this build cleared is actively *removed*, not left behind.
//!
//! Each file used to implement all four itself. That is how the last two bugs
//! in this area happened, both the same shape: a cleared optional whose old
//! value survived in `raw` (space colour, 2026-07-28; `Config::order`, the
//! same day). Written once, a new config file inherits the promises instead of
//! re-earning them.

use std::path::Path;

use serde_json::{Map, Value};

/// A config document as read: the raw object, unknown keys and all.
pub type Doc = Map<String, Value>;

/// Reads a document. Missing, unreadable, or not a JSON object all yield an
/// empty one — every caller's "fall back to the defaults".
pub fn load(path: impl AsRef<Path>) -> Doc {
    match std::fs::read_to_string(path.as_ref()) {
        Ok(text) => parse(&text),
        Err(_) => Doc::new(),
    }
}

/// Parses a document. Anything that is not a JSON object yields an empty one.
pub fn parse(text: &str) -> Doc {
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(raw)) => raw,
        _ => Doc::new(),
    }
}

/// The declared `schemaVersion`, or `default` when absent or malformed.
pub fn schema_version(raw: &Doc, default: u64) -> u64 {
    raw.get("schemaVersion")
        .and_then(Value::as_u64)
        .unwrap_or(default)
}

/// A string field, or `None` when absent, the wrong type, or blank. Blank is
/// absent on purpose: a name of spaces is not a name.
pub fn string(raw: &Doc, key: &str) -> Option<String> {
    raw.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

/// A boolean field, falling back when absent or the wrong type.
pub fn flag(raw: &Doc, key: &str, default: bool) -> bool {
    raw.get(key).and_then(Value::as_bool).unwrap_or(default)
}

/// Renders the document to write: the file exactly as it was read, with the
/// keys this build owns written over it, and the ones it cleared removed.
///
/// `cleared` is what makes clearing work. The merge only writes the keys that
/// are *set*, so without it a value still sitting in `raw` survives — clearing
/// a colour would silently keep the old one.
///
/// **The clearing happens FIRST, before the merge**, and that is what lets a
/// key be both cleared and owned: "whatever the file had here does not
/// survive, and here is what goes in its place". A key that is only cleared
/// behaves exactly as it always did, since nothing writes it back.
///
/// That distinction is the whole of a bug measured on device (2026-08-20): the
/// merge is DEEP, on purpose — it is what keeps an unknown sibling key alive
/// next to one this build writes — and **a deep merge cannot express a
/// removal**. Every map the app owns whole was affected. Switching a feature
/// back to its default removes it from `features`; the removal was merged over
/// a `features` that still had it, so the file kept the old answer and the
/// switch could be turned off but never on again. The same silence was hiding
/// in `order`, `periodSort` and `shortcuts` — unbinding a chord never took.
/// `space.rs` had already met it and worked around it by hand, which is where
/// this belongs instead.
pub fn render(raw: &Doc, owned: Doc, cleared: &[&str]) -> String {
    let mut doc = Value::Object(raw.clone());
    if let Value::Object(map) = &mut doc {
        for key in cleared {
            map.remove(*key);
        }
    }
    merge(&mut doc, Value::Object(owned));
    crate::fsio::pretty_json(&doc)
}

/// Deep merge, so writing `rollover.daily.mode` does not wipe an unknown
/// sibling key sitting next to it.
fn merge(target: &mut Value, patch: Value) {
    match (target, patch) {
        (Value::Object(target), Value::Object(patch)) => {
            for (key, value) in patch {
                match target.get_mut(&key) {
                    Some(existing) => merge(existing, value),
                    None => {
                        target.insert(key, value);
                    }
                }
            }
        }
        (target, patch) => *target = patch,
    }
}

/// Writes an optional value, or clears its key when there is nothing to say.
///
/// The one rule behind every optional a config file carries (a colour, a sort,
/// a name): it is written only once the user has chosen something, and going
/// back to the default has to *remove* the key, or a stale one in `raw`
/// survives the rewrite. `config.rs` and `space.rs` each spelled this out by
/// hand; the policy belongs next to [`render`], which is what it feeds.
pub fn put_or_clear<'a>(
    owned: &mut Doc,
    cleared: &mut Vec<&'a str>,
    key: &'a str,
    value: Option<Value>,
) {
    match value {
        Some(value) => {
            owned.insert(key.to_string(), value);
        }
        None => cleared.push(key),
    }
}

/// Builds an owned-keys map from `(key, value)` pairs, for [`render`].
pub fn owned<const N: usize>(pairs: [(&str, Value); N]) -> Doc {
    pairs
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anything_that_is_not_an_object_reads_as_nothing_set() {
        for text in ["", "not json", "[]", "null", "{", "7"] {
            assert!(parse(text).is_empty(), "{text:?}");
        }
        let dir = tempfile::tempdir().unwrap();
        assert!(load(dir.path().join("absent.json")).is_empty());
    }

    #[test]
    fn fields_fall_back_one_key_at_a_time() {
        let raw = parse(r#"{ "schemaVersion": 2, "name": "  ", "on": "yes", "off": false }"#);
        assert_eq!(schema_version(&raw, 1), 2);
        assert_eq!(schema_version(&parse("{}"), 1), 1);
        assert_eq!(string(&raw, "name"), None, "blank is absent");
        assert_eq!(string(&raw, "missing"), None);
        assert!(flag(&raw, "on", true), "wrong type takes the default");
        assert!(!flag(&raw, "off", true));
    }

    #[test]
    fn a_string_field_keeps_its_value_without_the_padding() {
        let raw = parse(r#"{ "name": "  Project A  " }"#);
        assert_eq!(string(&raw, "name").as_deref(), Some("Project A"));
    }

    #[test]
    fn an_unknown_key_survives_the_rewrite_at_any_depth() {
        let raw = parse(
            r#"{ "schemaVersion": 1,
                 "futureFeature": { "deep": [1, 2] },
                 "rollover": { "daily": { "unknownKnob": true } } }"#,
        );
        let text = render(
            &raw,
            owned([(
                "rollover",
                serde_json::json!({ "daily": { "mode": "carry" } }),
            )]),
            &[],
        );
        let written = parse(&text);

        assert_eq!(written["futureFeature"], serde_json::json!({ "deep": [1, 2] }));
        // The owned key landed without wiping the unknown sibling next to it.
        assert_eq!(written["rollover"]["daily"]["mode"], serde_json::json!("carry"));
        assert_eq!(written["rollover"]["daily"]["unknownKnob"], serde_json::json!(true));
    }

    #[test]
    fn a_key_that_is_both_cleared_and_owned_is_replaced_whole() {
        // The deep merge cannot express a REMOVAL inside a map. A caller that
        // owns the whole map says so by clearing the key AND writing it: the
        // old value is gone before the merge, so what goes in is what comes
        // out. Every map in config.rs lives under this rule, and getting it
        // wrong is what let a settings switch be turned off but never on
        // again (2026-08-20).
        let raw = parse(r#"{ "features": { "a": true, "b": false }, "keep": 1 }"#);
        let text = render(
            &raw,
            owned([("features", serde_json::json!({ "a": true }))]),
            &["features"],
        );
        let written = parse(&text);

        assert_eq!(written["features"], serde_json::json!({ "a": true }), "{text}");
        assert_eq!(written["keep"], serde_json::json!(1), "the rest is untouched");
    }

    #[test]
    fn a_cleared_key_is_removed_instead_of_surviving_in_the_raw() {
        // The bug this project paid for twice: the merge only writes what is
        // set, so a cleared optional kept its old value on disk.
        let raw = parse(r##"{ "schemaVersion": 1, "color": "#f00", "icon": "flag" }"##);
        let text = render(&raw, owned([("icon", Value::from("star"))]), &["color"]);
        let written = parse(&text);

        assert!(!written.contains_key("color"), "{text}");
        assert_eq!(written["icon"], serde_json::json!("star"));
    }

    #[test]
    fn put_or_clear_writes_a_value_and_clears_an_absence() {
        let mut owned = Doc::new();
        let mut cleared = Vec::new();
        put_or_clear(&mut owned, &mut cleared, "color", Some(Value::from("red")));
        put_or_clear(&mut owned, &mut cleared, "icon", None);
        assert_eq!(owned.get("color"), Some(&Value::from("red")));
        assert!(!owned.contains_key("icon"));
        assert_eq!(cleared, vec!["icon"]);
    }

    #[test]
    fn the_rendered_file_ends_in_a_newline() {
        assert!(render(&Doc::new(), owned([]), &[]).ends_with("}\n"));
    }
}
