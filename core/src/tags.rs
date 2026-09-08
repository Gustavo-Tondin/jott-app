//! The user's tag catalogue, in `.jott/tags.json`: the **vocabulary** the
//! picker offers, so a tag is spelled the same way every time. A tag on a
//! task is just `#word` text — reading a task never needs this file. Same
//! covenant as the other config files: missing or malformed reads as empty,
//! and an unknown key survives a rewrite.

use std::path::Path;

use serde_json::{Map, Value};

use crate::jsondoc;

use crate::error::Result;

/// Schema version this build understands.
const SUPPORTED_TAGS_SCHEMA: u64 = 1;

/// One catalogued tag: a name (without the `#`) and an optional colour.
#[derive(Debug, Clone, PartialEq)]
pub struct Tag {
    pub name: String,
    /// A palette NAME (`"orange"`), read and written back for notebooks that
    /// have it; the interface no longer shows or offers it.
    pub color: Option<String>,
}

/// How often a tag is used across the notebook's tasks, catalogued or not.
/// `count` is tasks open and completed alike: a tag that only survives in
/// `completed.md` is still a word someone typed.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagUsage {
    pub name: String,
    pub count: usize,
}

/// The tag catalogue, in memory.
#[derive(Debug, Clone, Default)]
pub struct Tags {
    tags: Vec<Tag>,
    /// The document as read, for the unknown-key promise.
    raw: jsondoc::Doc,
}

impl Tags {
    /// Reads the catalogue. Missing or unreadable yields an empty one.
    pub fn load(path: impl AsRef<Path>) -> Self {
        Self::from_doc(jsondoc::load(path))
    }

    pub fn parse(text: &str) -> Self {
        Self::from_doc(jsondoc::parse(text))
    }

    fn from_doc(raw: jsondoc::Doc) -> Self {
        let tags = raw
            .get("tags")
            .and_then(Value::as_array)
            .map(|entries| {
                entries
                    .iter()
                    .filter_map(|entry| {
                        let name = entry.get("name")?.as_str()?.trim();
                        if name.is_empty() {
                            return None;
                        }
                        Some(Tag {
                            name: name.to_string(),
                            color: entry
                                .get("color")
                                .and_then(Value::as_str)
                                .filter(|c| !c.trim().is_empty())
                                .map(str::to_string),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        Self { tags, raw }
    }

    pub fn tags(&self) -> &[Tag] {
        &self.tags
    }

    /// Sets (or creates) a tag's colour. An empty colour clears it. The tag
    /// name is normalized the same way a task tag is (`normalize_tag`), so the
    /// catalogue and the file always agree.
    pub fn set(&mut self, name: &str, color: Option<String>) {
        let Some(name) = crate::task::normalize_tag(name) else {
            return;
        };
        let color = color.filter(|c| !c.trim().is_empty());
        match self.tags.iter_mut().find(|t| t.name == name) {
            Some(tag) => tag.color = color,
            None => self.tags.push(Tag { name, color }),
        }
    }

    /// Removes a tag from the catalogue. The `#word` text in tasks is left
    /// untouched — only the colour is forgotten.
    pub fn remove(&mut self, name: &str) {
        let Some(name) = crate::task::normalize_tag(name) else {
            return;
        };
        self.tags.retain(|t| t.name != name);
    }

    /// Renders the document, preserving unknown top-level keys.
    pub fn render(&self) -> String {
        let entries: Vec<Value> = self
            .tags
            .iter()
            .map(|tag| {
                let mut obj = Map::new();
                obj.insert("name".into(), Value::from(tag.name.clone()));
                if let Some(color) = &tag.color {
                    obj.insert("color".into(), Value::from(color.clone()));
                }
                Value::Object(obj)
            })
            .collect();
        // The declared version is carried through rather than owned: this file
        // has no version-specific behaviour of its own, so a newer one written
        // by another build must not be quietly downgraded.
        let version = jsondoc::schema_version(&self.raw, SUPPORTED_TAGS_SCHEMA);
        let owned = jsondoc::owned([
            ("schemaVersion", Value::from(version)),
            ("tags", Value::Array(entries)),
        ]);
        jsondoc::render(&self.raw, owned, &[])
    }

    pub fn save(&self, path: impl AsRef<Path>) -> Result<()> {
        crate::fsio::write_atomically(path.as_ref(), self.render().as_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_documented_shape() {
        let tags = Tags::parse(
            r##"{ "schemaVersion": 1, "tags": [
                 { "name": "casa", "color": "#f00" },
                 { "name": "trabalho" } ] }"##,
        );
        assert_eq!(tags.tags().len(), 2);
        assert_eq!(tags.tags()[0].name, "casa");
        assert_eq!(tags.tags()[0].color.as_deref(), Some("#f00"));
        assert_eq!(tags.tags()[1].color, None);
    }

    #[test]
    fn garbage_falls_back_to_an_empty_catalogue() {
        // Same covenant as the other config files: a broken preference file
        // never stops someone from opening their notebook.
        for text in ["", "not json", "[]", "null", "{", r#"{ "tags": 7 }"#] {
            assert!(Tags::parse(text).tags().is_empty(), "{text:?}");
        }
    }

    #[test]
    fn an_entry_without_a_usable_name_is_dropped_not_kept_half_read() {
        let tags = Tags::parse(
            r##"{ "tags": [ { "color": "#f00" }, { "name": "   " }, { "name": "ok" } ] }"##,
        );
        assert_eq!(tags.tags().len(), 1);
        assert_eq!(tags.tags()[0].name, "ok");
    }

    #[test]
    fn an_unknown_key_survives_the_rewrite() {
        let tags = Tags::parse(r#"{ "schemaVersion": 1, "futureFeature": { "deep": [1] } }"#);
        let rendered = tags.render();
        assert!(rendered.contains("futureFeature"), "{rendered}");
        assert!(rendered.contains("deep"), "{rendered}");
    }

    #[test]
    fn setting_a_colour_creates_or_updates_and_an_empty_one_clears_it() {
        let mut tags = Tags::default();
        tags.set("casa", Some("#f00".into()));
        assert_eq!(tags.tags()[0].color.as_deref(), Some("#f00"));

        tags.set("casa", Some("#0f0".into()));
        assert_eq!(tags.tags().len(), 1, "same tag, not a second entry");
        assert_eq!(tags.tags()[0].color.as_deref(), Some("#0f0"));

        tags.set("casa", Some("  ".into()));
        assert_eq!(tags.tags()[0].color, None, "blank clears the colour");
    }

    #[test]
    fn the_name_is_normalized_like_a_tag_written_on_a_task() {
        // Otherwise the catalogue and the file disagree: `#casa nova` on a task
        // line degrades the whole metadata line to description.
        let mut tags = Tags::default();
        tags.set("#casa nova", Some("#f00".into()));
        assert_eq!(tags.tags()[0].name, "casa-nova");

        // And removing addresses it the same way.
        tags.remove("casa nova");
        assert!(tags.tags().is_empty());

        // A name that normalizes to nothing is not a tag.
        tags.set("  #  ", None);
        assert!(tags.tags().is_empty());
    }

    #[test]
    fn round_trips_through_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tags.json");

        let mut tags = Tags::default();
        tags.set("casa", Some("#f00".into()));
        tags.set("trabalho", None);
        tags.save(&path).unwrap();

        let loaded = Tags::load(&path);
        assert_eq!(loaded.tags().len(), 2);
        assert_eq!(loaded.tags()[0].color.as_deref(), Some("#f00"));
        assert_eq!(loaded.tags()[1].color, None);

        // A missing file is an empty catalogue, not a failure.
        assert!(Tags::load(dir.path().join("absent.json")).tags().is_empty());
    }
}
