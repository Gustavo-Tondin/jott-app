//! A note: frontmatter plus body.
//!
//! Spec: `docs/project-strategy.md` section 5. Notes and tasks are **separate
//! worlds** — a checklist written inside a note stays a note; it never
//! becomes an interactive list, never earns an `id`, never shows up in
//! suggestions. Nothing here reuses the task model, and it must stay that
//! way: the shared parts are the infrastructure (atomic writes, the watcher,
//! conflicts), never the data model.
//!
//! ```markdown
//! ---
//! created: 2026-07-21
//! pinned: true
//! ---
//!
//! <!--banner: yellow-->
//!
//! Text of the note.
//! ```
//!
//! The **banner** is the first line of the body, and it is an HTML comment on
//! purpose (user call, 2026-08-18): every markdown renderer in the world hides
//! it, so a note with a banner is still a plain note in Obsidian, in VS Code
//! and on GitHub — and it is the same idiom a task already uses to carry its
//! id. Without the line a note has no banner and shows only its title, which
//! is the default and stays the default.
//!
//! The frontmatter is **lazy**, like the task `id`: a note written by hand
//! with no frontmatter at all is a perfectly valid note, and `created` is
//! adopted the first time the app saves it. A key the app does not know about
//! is preserved verbatim — the same promise `config.json` makes, for the same
//! reason: two versions of the app sharing one notebook must not eat each
//! other's data.

use chrono::NaiveDate;

const FENCE: &str = "---";

/// Keys this build owns. Everything else in the block is carried through
/// untouched.
const KNOWN_KEYS: [&str; 2] = ["created", "pinned"];

/// How much of the body a card shows.
const PREVIEW_CHARS: usize = 240;

/// What opens the banner line, and what closes it.
const BANNER_OPEN: &str = "<!--banner:";
const BANNER_CLOSE: &str = "-->";

/// The head of a note: a colour, or an image from the notebook's library.
///
/// Which one it is comes from the VALUE, not from a second keyword: an address
/// ending in an image extension is an image, anything else is a colour. The
/// two are never confusable — `yellow` is not a file and `assets/sunset.jpg`
/// is not a colour — and one keyword is one thing for the user to remember
/// when writing it by hand, which is the point of a plain-text format.
///
/// A colour is a NAME from the app's palette (`services/accent.js`), never a
/// hex: the same rule every other colour in a Jott notebook follows, so the
/// banner of a note reads correctly on the light chrome and on the dark one. A
/// hex written by hand is carried through untouched, like everywhere else.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum Banner {
    Color(String),
    Image(String),
}

impl Banner {
    /// The banner a value means — an image when it reads as an image address.
    pub fn from_value(value: &str) -> Option<Self> {
        let value = value.trim();
        if value.is_empty() {
            return None;
        }
        Some(if crate::assets::is_image_name(value) {
            Self::Image(value.to_string())
        } else {
            Self::Color(value.to_string())
        })
    }

    /// What the note carries after `<!--banner:`.
    pub fn value(&self) -> &str {
        match self {
            Self::Color(value) | Self::Image(value) => value,
        }
    }
}

/// A note in memory.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Note {
    pub created: Option<NaiveDate>,
    pub pinned: bool,
    /// The head of the note, from the first line of the body.
    pub banner: Option<Banner>,
    /// Frontmatter lines this build does not own, exactly as read.
    pub extra: Vec<String>,
    /// Everything after the frontmatter, verbatim.
    pub body: String,
}

impl Note {
    /// Parses a note. Anything that is not a frontmatter block is body — a
    /// file that opens with `---` but never closes it is a horizontal rule
    /// in someone's markdown, not a broken note.
    pub fn parse(text: &str) -> Self {
        let plain = |text: &str| {
            let (banner, body) = split_banner(text);
            Self {
                banner,
                body,
                ..Default::default()
            }
        };
        let Some(rest) = strip_open_fence(text) else {
            return plain(text);
        };
        let Some((block, body)) = split_at_close_fence(rest) else {
            return plain(text);
        };

        let (banner, body) = split_banner(body);
        let mut note = Self {
            banner,
            body,
            ..Default::default()
        };
        for line in block.lines() {
            match parse_entry(line) {
                Some(("created", value)) => note.created = crate::task::parse_date(value),
                Some(("pinned", value)) => note.pinned = value.trim() == "true",
                // Unknown key, or a line that is not `key: value` at all.
                _ if line.trim().is_empty() => {}
                _ => note.extra.push(line.to_string()),
            }
        }
        note
    }

    /// Renders the note back to text.
    ///
    /// With nothing to record, **no frontmatter block is written at all** —
    /// that is the lazy half of the rule, and it is what keeps a plain note
    /// plain for someone editing it in another app.
    pub fn render(&self) -> String {
        let mut fields: Vec<String> = Vec::new();
        if let Some(created) = self.created {
            fields.push(format!("created: {created}"));
        }
        if self.pinned {
            fields.push("pinned: true".to_string());
        }
        fields.extend(self.extra.iter().cloned());

        // The banner belongs to the BODY — it is the first line of it — so it
        // goes back exactly where it was read from, above the text and below
        // the frontmatter.
        let body = match &self.banner {
            Some(banner) => format!(
                "{BANNER_OPEN} {}{BANNER_CLOSE}\n\n{}",
                banner.value(),
                self.body.trim_start_matches('\n')
            ),
            None => self.body.clone(),
        };

        if fields.is_empty() {
            return body;
        }

        let body = body.trim_start_matches('\n');
        format!("{FENCE}\n{}\n{FENCE}\n\n{body}", fields.join("\n"))
    }

    /// Records `today` as the creation date, if the note does not have one.
    ///
    /// Called on the app's first save of a note — never on reading, which is
    /// what lets someone browse a folder without the app rewriting it.
    pub fn adopt_created(&mut self, today: NaiveDate) {
        if self.created.is_none() {
            self.created = Some(today);
        }
    }

    /// First lines of the body, collapsed, for a card.
    pub fn preview(&self) -> String {
        let mut preview = String::new();
        for word in self.body.split_whitespace() {
            if preview.len() + word.len() + 1 > PREVIEW_CHARS {
                break;
            }
            if !preview.is_empty() {
                preview.push(' ');
            }
            preview.push_str(word);
        }
        preview
    }

    /// Whether the note's text matches `query`, case-insensitively.
    pub fn matches(&self, query: &str) -> bool {
        let query = query.trim().to_lowercase();
        query.is_empty() || self.body.to_lowercase().contains(&query)
    }
}

/// Splits the banner line off the top of a body.
///
/// Only the FIRST line, and only when it is the whole line: a `<!--banner:…-->`
/// written in the middle of a paragraph is a comment someone wrote, not the
/// head of the note. The blank line under it goes too, so that reading and
/// writing a note back is byte-for-byte stable.
fn split_banner(body: &str) -> (Option<Banner>, String) {
    let (first, rest) = match body.split_once('\n') {
        Some((first, rest)) => (first, rest),
        None => (body, ""),
    };
    let trimmed = first.trim();
    let Some(value) = trimmed
        .strip_prefix(BANNER_OPEN)
        .and_then(|rest| rest.strip_suffix(BANNER_CLOSE))
    else {
        return (None, body.to_string());
    };
    let Some(banner) = Banner::from_value(value) else {
        // `<!--banner:-->` says nothing. Left in the body rather than eaten:
        // the app never silently deletes a line someone typed.
        return (None, body.to_string());
    };
    (Some(banner), rest.trim_start_matches('\n').to_string())
}

/// The text after an opening `---` line, or `None`.
fn strip_open_fence(text: &str) -> Option<&str> {
    let rest = text.strip_prefix(FENCE)?;
    match rest.strip_prefix('\n') {
        Some(rest) => Some(rest),
        // `---\r\n`, written by an editor on another platform.
        None => rest.strip_prefix("\r\n"),
    }
}

/// Splits the frontmatter block from the body at the closing fence.
fn split_at_close_fence(rest: &str) -> Option<(&str, &str)> {
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        if line.trim_end() == FENCE {
            let block = &rest[..offset];
            let body = &rest[offset + line.len()..];
            return Some((block, body.strip_prefix('\n').unwrap_or(body)));
        }
        offset += line.len();
    }
    None
}

/// `key: value`, for the keys this build owns. Returns `None` for anything
/// else, so unknown lines fall through to `extra` untouched.
fn parse_entry(line: &str) -> Option<(&str, &str)> {
    let (key, value) = line.split_once(':')?;
    let key = key.trim();
    KNOWN_KEYS.contains(&key).then_some((key, value.trim()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ymd(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    #[test]
    fn a_note_without_frontmatter_is_a_valid_note() {
        // Someone wrote it in Obsidian, or in gedit. It is a note.
        let note = Note::parse("Uma ideia solta.\n");
        assert_eq!(note.created, None);
        assert!(!note.pinned);
        assert_eq!(note.body, "Uma ideia solta.\n");
        // And it round-trips byte for byte: reading never adds a block.
        assert_eq!(note.render(), "Uma ideia solta.\n");
    }

    #[test]
    fn reads_the_documented_frontmatter() {
        let note = Note::parse("---\ncreated: 2026-07-21\npinned: true\n---\n\nTexto.\n");
        assert_eq!(note.created, Some(ymd(2026, 7, 21)));
        assert!(note.pinned);
        assert_eq!(note.body, "Texto.\n");
    }

    #[test]
    fn an_unknown_key_survives_the_rewrite() {
        // The same promise config.json makes: two versions of the app sharing
        // a notebook must not eat each other's data.
        let note = Note::parse("---\ncreated: 2026-07-21\ncolor: yellow\n---\n\nTexto.\n");
        assert_eq!(note.extra, vec!["color: yellow"]);
        assert!(note.render().contains("color: yellow"));
    }

    #[test]
    fn a_body_that_starts_with_a_rule_is_not_frontmatter() {
        // `---` opening a file with no closing fence is a horizontal rule.
        let text = "---\nUm texto qualquer.\n";
        let note = Note::parse(text);
        assert_eq!(note.body, text);
        assert_eq!(note.render(), text);
    }

    #[test]
    fn the_frontmatter_is_lazy() {
        let mut note = Note::parse("Ideia.\n");
        assert_eq!(note.render(), "Ideia.\n", "nothing to record, nothing written");

        note.adopt_created(ymd(2026, 7, 21));
        assert_eq!(note.render(), "---\ncreated: 2026-07-21\n---\n\nIdeia.\n");
    }

    #[test]
    fn adopting_never_overwrites_an_existing_date() {
        let mut note = Note::parse("---\ncreated: 2026-01-01\n---\n\nAntiga.\n");
        note.adopt_created(ymd(2026, 7, 21));
        assert_eq!(note.created, Some(ymd(2026, 1, 1)));
    }

    #[test]
    fn round_trips_through_render_and_parse() {
        let mut note = Note::parse("---\ncreated: 2026-07-21\ncolor: yellow\n---\n\nCorpo.\n");
        note.pinned = true;

        let reparsed = Note::parse(&note.render());
        assert_eq!(reparsed.created, note.created);
        assert!(reparsed.pinned);
        assert_eq!(reparsed.extra, note.extra);
        assert_eq!(reparsed.body, note.body);
    }

    #[test]
    fn unpinning_removes_the_line_instead_of_writing_false() {
        let mut note = Note::parse("---\npinned: true\n---\n\nCorpo.\n");
        note.pinned = false;
        assert!(!note.render().contains("pinned"));
    }

    #[test]
    fn a_checklist_inside_a_note_is_just_text() {
        // Spec 5: it never becomes an interactive list.
        let text = "- [ ] comprar leite\n- [x] pagar boleto\n";
        let note = Note::parse(text);
        assert_eq!(note.body, text);
        assert_eq!(note.render(), text);
    }

    #[test]
    fn preview_collapses_whitespace_and_stops_at_a_limit() {
        let note = Note::parse("Primeira linha.\n\n   Segunda    linha.\n");
        assert_eq!(note.preview(), "Primeira linha. Segunda linha.");

        let long = Note::parse(&"palavra ".repeat(200));
        assert!(long.preview().len() <= PREVIEW_CHARS);
    }

    #[test]
    fn search_is_case_insensitive_and_an_empty_query_matches_everything() {
        let note = Note::parse("Comprar Cimento na obra\n");
        assert!(note.matches("cimento"));
        assert!(note.matches("CIMENTO"));
        assert!(note.matches("  "));
        assert!(!note.matches("areia"));
    }

    #[test]
    fn a_banner_is_the_first_line_of_the_body_and_is_not_text() {
        let note = Note::parse("<!--banner: yellow-->\n\nTexto.\n");
        assert_eq!(note.banner, Some(Banner::Color("yellow".into())));
        assert_eq!(note.body, "Texto.\n");
        // The preview a card shows is the TEXT — the banner is drawn, not read.
        assert_eq!(note.preview(), "Texto.");
    }

    #[test]
    fn an_address_that_ends_in_an_image_extension_is_an_image() {
        let note = Note::parse("<!--banner: assets/sunset.jpg-->\n\nTexto.\n");
        assert_eq!(note.banner, Some(Banner::Image("assets/sunset.jpg".into())));
    }

    #[test]
    fn a_note_without_the_line_has_no_banner() {
        // The default, and what "sem essa sintaxe a nota fica só com título"
        // means: nothing is invented for a note that does not ask for one.
        let note = Note::parse("---\ncreated: 2026-07-21\n---\n\nSó texto.\n");
        assert_eq!(note.banner, None);
        assert_eq!(note.body, "Só texto.\n");
    }

    #[test]
    fn the_banner_round_trips_with_and_without_frontmatter() {
        for text in [
            "<!--banner: blue-->\n\nCorpo.\n",
            "---\ncreated: 2026-07-21\n---\n\n<!--banner: blue-->\n\nCorpo.\n",
        ] {
            assert_eq!(Note::parse(text).render(), text, "{text:?}");
        }
    }

    #[test]
    fn setting_and_clearing_a_banner_only_touches_that_line() {
        let mut note = Note::parse("---\ncreated: 2026-07-21\n---\n\nCorpo.\n");
        note.banner = Some(Banner::Color("red".into()));
        assert_eq!(
            note.render(),
            "---\ncreated: 2026-07-21\n---\n\n<!--banner: red-->\n\nCorpo.\n"
        );

        note.banner = None;
        assert_eq!(note.render(), "---\ncreated: 2026-07-21\n---\n\nCorpo.\n");
    }

    #[test]
    fn a_banner_comment_further_down_is_just_a_comment() {
        // Only the first line is the head of the note; anywhere else it is
        // something the user wrote, and rewriting it would be the app editing
        // prose it does not own.
        let text = "Primeira linha.\n<!--banner: yellow-->\n";
        let note = Note::parse(text);
        assert_eq!(note.banner, None);
        assert_eq!(note.render(), text);
    }

    #[test]
    fn an_empty_banner_says_nothing_and_is_left_alone() {
        let text = "<!--banner: -->\n\nCorpo.\n";
        let note = Note::parse(text);
        assert_eq!(note.banner, None);
        assert_eq!(note.render(), text, "a line the app cannot read is never eaten");
    }

    #[test]
    fn handles_crlf_frontmatter() {
        let note = Note::parse("---\r\ncreated: 2026-07-21\r\n---\r\n\r\nTexto.\r\n");
        assert_eq!(note.created, Some(ymd(2026, 7, 21)));
    }
}
