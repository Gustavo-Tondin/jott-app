//! The task: model, parser and writer.
//!
//! Format spec: `docs/project-strategy.md`, section 3.2. The rule that
//! organises everything:
//!
//! > What the user writes stays visible. What the app controls goes in the
//! > hidden comment.
//!
//! A task can span several lines:
//!
//! ```text
//! - [ ] Comprar material da obra <!--id:g7h8i9-->
//!   @2026-07-25 #casa #urgent !2
//!   Falar com o Jorge antes, ele tem desconto.
//!   repeat: every-week
//!   - [ ] Cimento
//! ```
//!
//! Everything indented under a task belongs to it. Which kind of line it is
//! gets decided by shape, never by position, because the file is written by
//! humans in whatever order they like.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

const COMMENT_OPEN: &str = "<!--";
const COMMENT_CLOSE: &str = "-->";

/// Indentation of one level. Everything under a task uses exactly one level.
const INDENT: &str = "  ";

/// Named fields the app understands. Anything else stays description, so a
/// line like `lembrar: ligar pro Jorge` is never mistaken for a field.
const KNOWN_FIELDS: [&str; 1] = ["repeat"];

/// Tags with meaning to the app. Always stored in English; translated only
/// when displayed.
pub const TAG_URGENT: &str = "urgent";
pub const TAG_PINNED: &str = "pinned";

/// How often a task comes back.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Repeat {
    pub every: u32,
    pub unit: RepeatUnit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RepeatUnit {
    Day,
    Week,
    Month,
}

impl RepeatUnit {
    fn as_str(self) -> &'static str {
        match self {
            Self::Day => "day",
            Self::Week => "week",
            Self::Month => "month",
        }
    }

    fn parse(text: &str) -> Option<Self> {
        // Both singular and plural, since `every-3-days` reads better than
        // `every-3-day` and people will write it that way.
        match text {
            "day" | "days" => Some(Self::Day),
            "week" | "weeks" => Some(Self::Week),
            "month" | "months" => Some(Self::Month),
            _ => None,
        }
    }
}

impl Repeat {
    /// Parses `every-week` or `every-3-days`.
    pub fn parse(text: &str) -> Option<Self> {
        let rest = text.trim().strip_prefix("every-")?;
        match rest.split_once('-') {
            Some((count, unit)) => Some(Self {
                every: count.parse().ok().filter(|n| *n > 0)?,
                unit: RepeatUnit::parse(unit)?,
            }),
            None => Some(Self {
                every: 1,
                unit: RepeatUnit::parse(rest)?,
            }),
        }
    }

    pub fn render(self) -> String {
        if self.every == 1 {
            format!("every-{}", self.unit.as_str())
        } else {
            // Plural reads naturally: every-3-days.
            format!("every-{}-{}s", self.every, self.unit.as_str())
        }
    }
}

/// A checkbox nested under a task. Text and state only — giving subtasks their
/// own dates and tags would turn the model into a recursive tree.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Subtask {
    pub text: String,
    pub done: bool,
}

/// A file attached to a task.
///
/// On disk it is a plain Markdown link on a line of its own under the task
/// (spec 3.2, 2026-08-18):
///
/// ```markdown
/// - [ ] Enviar proposta <!--id:g7h8i9-->
///   @2026-07-25 #cliente
///   [nota-fiscal.pdf](assets/nota-fiscal.pdf)
///   Falar com o Jorge antes.
/// ```
///
/// Visible, and not a field in the hidden comment (user call): a link renders
/// and is clickable in any Markdown editor, which is the same reason a note
/// writes `![](assets/x.png)` for its images. The `label` is what the link
/// shows — the file's name when the app writes it, whatever someone typed when
/// they wrote it by hand, and either way it survives the rewrite.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub label: String,
    /// Address in the notebook's library (`assets/nota-fiscal.pdf`).
    pub address: String,
}

impl Attachment {
    /// Names the link after the file, which is what the app writes.
    pub fn of(address: &str) -> Self {
        Self {
            label: crate::relpath::leaf_of(address).to_string(),
            address: address.to_string(),
        }
    }

    fn render(&self) -> String {
        format!("[{}]({})", self.label, self.address)
    }
}

/// The attachment line: nothing but links, and every one of them into the
/// notebook's own library.
///
/// Both halves matter. "Nothing but links" is the same rule the metadata line
/// keeps (a loose word makes it a description), and "into the library" is what
/// stops `[a documentação](https://exemplo.com)` written in a description from
/// silently becoming an attachment the app then cannot open.
fn parse_attachments(line: &str) -> Option<Vec<Attachment>> {
    let mut found = Vec::new();
    let mut rest = line.trim();
    while !rest.is_empty() {
        let inner = rest.strip_prefix('[')?;
        let (label, after) = inner.split_once("](")?;
        let (address, after) = after.split_once(')')?;
        if label.contains('[') || label.contains(']') {
            return None;
        }
        crate::assets::name_of(address)?;
        found.push(Attachment {
            label: label.to_string(),
            address: address.to_string(),
        });
        rest = after.trim_start();
    }
    (!found.is_empty()).then_some(found)
}

/// A single task.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Task {
    /// Stable id, assigned only when the task needs to be addressed — pulled
    /// into a period or completed. A plain checklist never grows comments.
    pub id: Option<String>,
    pub text: String,
    pub done: bool,
    /// List the task came from. Only meaningful in the completed list, where
    /// it powers the undo.
    pub origin: Option<String>,
    /// Date the task was written (stamped by the app on creation since
    /// 2026-08-04 — the by-creation ordering reads it). Doubles as the
    /// recurrence anchor when a repeating task has no due date.
    pub created: Option<NaiveDate>,
    /// Date the task was completed. Stamped on completion, cleared on undo —
    /// the by-completion ordering reads it.
    pub completed: Option<NaiveDate>,
    /// Id of the next occurrence this repeating task generated when it was
    /// completed. The chain's memory: re-completing after an undo asks "does
    /// that occurrence still exist?" instead of generating it again — which
    /// used to duplicate the chain on every complete/undo cycle (2026-08-05).
    pub spawned: Option<String>,
    /// Kept at the top of its list by hand (the card's bookmark, 2026-08-05).
    /// A hidden field rather than a tag: pinning is filing, not a label, and a
    /// `#pinned` tag would show up as a coloured pill and in the tag manager.
    /// A tag typed by hand still counts — see [`Task::is_pinned`].
    pub pinned: bool,
    pub due: Option<NaiveDate>,
    /// 1 (highest) to 3 (lowest).
    pub priority: Option<u8>,
    pub tags: Vec<String>,
    /// Files attached to the task, as the link line under it carries them.
    pub files: Vec<Attachment>,
    /// Free text under the task, kept line by line as written.
    pub description: Vec<String>,
    pub subtasks: Vec<Subtask>,
    pub repeat: Option<Repeat>,
    /// Leading whitespace of the task line, so a task nested inside someone
    /// else's markdown structure survives a rewrite.
    pub indent: String,
    /// Metadata written by an older version of the app. Preserved verbatim so
    /// upgrading and downgrading does not destroy data.
    pub meta: Option<serde_json::Value>,
}

impl Task {
    /// Builds a new, unsaved task. The text is collapsed to a single line —
    /// see [`single_line`] for why a stray `\n` is corruption, not content.
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: single_line(&text.into()),
            ..Default::default()
        }
    }

    pub fn has_tag(&self, tag: &str) -> bool {
        self.tags.iter().any(|t| t == tag)
    }

    /// Marked urgent by hand. Being urgent *because of a date* is a decision
    /// that needs the clock and a preference, so it lives in the notebook.
    pub fn is_marked_urgent(&self) -> bool {
        self.has_tag(TAG_URGENT)
    }

    /// Pinned to the top of its list — by the app's hidden field, or by a
    /// `#pinned` tag someone wrote by hand (what the human writes keeps
    /// counting; the app just stops writing it that way).
    pub fn is_pinned(&self) -> bool {
        self.pinned || self.has_tag(TAG_PINNED)
    }

    /// Parses the first line of a task. Returns `None` for anything that is
    /// not a checkbox — headings, prose and blank lines are the normal case in
    /// a document a human writes.
    pub fn parse(line: &str) -> Option<Self> {
        let indent_len = line.len() - line.trim_start().len();
        let indent = line[..indent_len].to_string();
        let (done, body) = parse_checkbox(&line[indent_len..])?;
        let (text, comment) = split_trailing_comment(body);

        let mut task = Self {
            text: text.trim().to_string(),
            done,
            indent,
            ..Default::default()
        };
        if let Some(comment) = comment {
            task.apply_comment(&comment);
        }
        Some(task)
    }

    /// Absorbs a line indented under this task. Returns whether it was taken —
    /// `false` means the line is not ours and belongs to the document.
    pub(crate) fn absorb(&mut self, line: &str) -> bool {
        let body = line.trim_start();
        if body.is_empty() {
            return false;
        }

        if let Some((done, text)) = parse_checkbox(body) {
            let (text, _) = split_trailing_comment(text);
            self.subtasks.push(Subtask {
                text: text.trim().to_string(),
                done,
            });
            return true;
        }

        if let Some((key, value)) = parse_field(body) {
            if key == "repeat" {
                // An unparseable value would be silently dropped on rewrite,
                // so keep it as description instead.
                if let Some(repeat) = Repeat::parse(value) {
                    self.repeat = Some(repeat);
                    return true;
                }
            }
        }

        if let Some(files) = parse_attachments(body) {
            self.files.extend(files);
            return true;
        }

        if let Some(metadata) = Metadata::parse(body) {
            self.due = metadata.due.or(self.due);
            self.priority = metadata.priority.or(self.priority);
            for tag in metadata.tags {
                if !self.has_tag(&tag) {
                    self.tags.push(tag);
                }
            }
            return true;
        }

        self.description.push(body.to_string());
        true
    }

    fn apply_comment(&mut self, comment: &str) {
        self.id = read_field(comment, "id:").map(str::to_string);
        self.origin = read_field(comment, "origin:").map(str::to_string);
        self.created = read_field(comment, "created:").and_then(parse_date);
        self.completed = read_field(comment, "completed:").and_then(parse_date);
        self.spawned = read_field(comment, "spawned:").map(str::to_string);
        self.pinned = read_field(comment, "pinned:") == Some("true");
        self.meta = read_meta(comment);
    }

    /// Renders the task, first line first. A task with nothing extra is a
    /// single plain checkbox line.
    pub fn render(&self) -> Vec<String> {
        let checkbox = if self.done { "[x]" } else { "[ ]" };
        let mut first = format!("{}- {} {}", self.indent, checkbox, self.text);
        if let Some(comment) = self.render_comment() {
            first.push(' ');
            first.push_str(&comment);
        }

        let mut lines = vec![first];
        let child_indent = format!("{}{INDENT}", self.indent);

        // Order on write is fixed; order on read is not. Metadata first
        // because it is what the eye looks for.
        if let Some(metadata) = self.render_metadata() {
            lines.push(format!("{child_indent}{metadata}"));
        }
        if !self.files.is_empty() {
            let links: Vec<String> = self.files.iter().map(Attachment::render).collect();
            lines.push(format!("{child_indent}{}", links.join(" ")));
        }
        for line in &self.description {
            lines.push(format!("{child_indent}{line}"));
        }
        if let Some(repeat) = self.repeat {
            lines.push(format!("{child_indent}repeat: {}", repeat.render()));
        }
        for subtask in &self.subtasks {
            let checkbox = if subtask.done { "[x]" } else { "[ ]" };
            lines.push(format!("{child_indent}- {checkbox} {}", subtask.text));
        }
        lines
    }

    /// The whole task as text, lines joined. Convenience for tests and for
    /// anything that wants the block as one string.
    pub fn render_block(&self) -> String {
        self.render().join("\n")
    }

    fn render_metadata(&self) -> Option<String> {
        let mut parts = Vec::new();
        if let Some(due) = self.due {
            parts.push(format!("@{due}"));
        }
        for tag in &self.tags {
            parts.push(format!("#{tag}"));
        }
        if let Some(priority) = self.priority {
            parts.push(format!("!{priority}"));
        }
        (!parts.is_empty()).then(|| parts.join(" "))
    }

    fn render_comment(&self) -> Option<String> {
        let mut fields: Vec<String> = Vec::new();
        if let Some(id) = &self.id {
            fields.push(format!("id:{}", quote_if_spaced(id)));
        }
        if let Some(origin) = &self.origin {
            fields.push(format!("origin:{}", quote_if_spaced(origin)));
        }
        if let Some(created) = self.created {
            fields.push(format!("created:{created}"));
        }
        if let Some(completed) = self.completed {
            fields.push(format!("completed:{completed}"));
        }
        if let Some(spawned) = &self.spawned {
            fields.push(format!("spawned:{}", quote_if_spaced(spawned)));
        }
        // Only written while true: unpinning removes the field instead of
        // leaving `pinned:false` behind (same pact as a cleared optional).
        if self.pinned {
            fields.push("pinned:true".to_string());
        }
        // meta goes last: its JSON may contain spaces, so keeping it at the
        // end lets the parser read it by brace matching to the end.
        if let Some(meta) = &self.meta {
            fields.push(format!("meta:{meta}"));
        }
        (!fields.is_empty())
            .then(|| format!("{COMMENT_OPEN}{}{COMMENT_CLOSE}", fields.join(" ")))
    }
}

/// The `@date #tag !priority` line.
#[derive(Debug, Default, PartialEq)]
struct Metadata {
    due: Option<NaiveDate>,
    priority: Option<u8>,
    tags: Vec<String>,
}

impl Metadata {
    /// Parses a line made **only** of metadata tokens. Any loose word makes it
    /// description instead — that is what lets a description start with `#`.
    ///
    /// The chain reads as the rule it implements: a token is a date, a tag, a
    /// priority, or the line is not metadata. Clippy would fold the last arm
    /// into a `?`, which hides the "or else this is not metadata" behind an
    /// operator — the one thing this function exists to say.
    #[allow(clippy::question_mark)]
    fn parse(line: &str) -> Option<Self> {
        let mut metadata = Self::default();
        let mut found = false;

        for token in line.split_whitespace() {
            found = true;
            if let Some(rest) = token.strip_prefix('@') {
                metadata.due = Some(parse_date(rest)?);
            } else if let Some(rest) = token.strip_prefix('#') {
                if rest.is_empty() {
                    return None;
                }
                metadata.tags.push(rest.to_string());
            } else if let Some(rest) = token.strip_prefix('!') {
                let priority: u8 = rest.parse().ok()?;
                if !(1..=3).contains(&priority) {
                    return None;
                }
                metadata.priority = Some(priority);
            } else {
                return None;
            }
        }
        found.then_some(metadata)
    }
}

/// `- [ ] text`, `* [x] text`, `+ [X] text`.
fn parse_checkbox(body: &str) -> Option<(bool, &str)> {
    let rest = body
        .strip_prefix("- ")
        .or_else(|| body.strip_prefix("* "))
        .or_else(|| body.strip_prefix("+ "))?;

    let (done, rest) = match rest.strip_prefix("[ ]") {
        Some(r) => (false, r),
        None => (
            true,
            rest.strip_prefix("[x]").or_else(|| rest.strip_prefix("[X]"))?,
        ),
    };
    Some((done, rest.strip_prefix(' ').unwrap_or(rest)))
}

/// `key: value`, but only for keys the app owns.
fn parse_field(body: &str) -> Option<(&str, &str)> {
    let (key, value) = body.split_once(':')?;
    let key = key.trim();
    KNOWN_FIELDS
        .contains(&key)
        .then(|| (key, value.trim()))
}

/// Normalises a tag into a single `#`-less token, or `None` when nothing is
/// left.
///
/// This is a **format rule, so it lives in the core**: a tag containing a
/// space renders as `#casa nova`, the loose word stops the metadata line from
/// being all-tokens, and on the next read the whole line silently degrades to
/// description — taking the date and the priority down with it. Every writer
/// (the app today, another frontend tomorrow) has to go through this; a UI
/// may still clean tags earlier for nicer feedback, but the core is the wall.
pub fn normalize_tag(text: &str) -> Option<String> {
    let cleaned = text
        .trim()
        .trim_start_matches('#')
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-");
    (!cleaned.is_empty()).then_some(cleaned)
}

/// Collapses a would-be single line into one: newlines become spaces.
///
/// A task name or subtask with a `\n` inside would render as two lines and
/// re-read as something else entirely — same family of silent corruption as
/// the spaced tag.
pub fn single_line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Accepts the canonical ISO form and the two shapes people type by hand.
/// Written back as ISO, so a hand-typed date is normalised on the next save.
pub fn parse_date(text: &str) -> Option<NaiveDate> {
    let text = text.trim();
    for format in ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"] {
        if let Ok(date) = NaiveDate::parse_from_str(text, format) {
            return Some(date);
        }
    }
    None
}

/// The editable fields of a task, all optional.
///
/// Absent means "leave alone"; present-but-null means "clear". Without that
/// distinction there would be no way to remove a due date. Lives in the core
/// (moved from the bridge, 2026-08-19): every rule below is a decision about
/// the task format, and a second frontend would otherwise have to reinvent
/// each one.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TaskFields {
    pub text: Option<String>,
    #[serde(deserialize_with = "present_or_absent")]
    pub due: Option<Option<String>>,
    #[serde(deserialize_with = "present_or_absent")]
    pub priority: Option<Option<u8>>,
    pub tags: Option<Vec<String>>,
    pub description: Option<Vec<String>>,
    /// The task's attachments, whole. Sent as `{label, address}` and not as a
    /// list of addresses, so a label someone wrote by hand in the `.md`
    /// survives an add or a remove made in the app.
    pub files: Option<Vec<Attachment>>,
    #[serde(deserialize_with = "present_or_absent")]
    pub repeat: Option<Option<String>>,
    pub subtasks: Option<Vec<Subtask>>,
}

/// Tells "field absent" apart from "field sent as null".
///
/// By default serde collapses both into `None`, which would make clearing a
/// due date impossible: the UI has no other way to say "remove this".
fn present_or_absent<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::deserialize(deserializer).map(Some)
}

impl TaskFields {
    /// Applies every field that was sent, leaving the rest alone.
    pub fn apply_to(self, task: &mut Task) {
        if let Some(text) = self.text {
            task.text = single_line(&text);
        }
        if let Some(due) = self.due {
            // An unparseable date clears it rather than being stored wrong.
            task.due = due.as_deref().and_then(parse_date);
        }
        if let Some(priority) = self.priority {
            task.priority = priority.filter(|p| (1..=3).contains(p));
        }
        if let Some(tags) = self.tags {
            // Normalised here too, not just in the UI: a spaced tag would
            // silently turn the whole metadata line into description on the
            // next read.
            let mut cleaned: Vec<String> = Vec::new();
            for tag in &tags {
                if let Some(tag) = normalize_tag(tag) {
                    if !cleaned.contains(&tag) {
                        cleaned.push(tag);
                    }
                }
            }
            task.tags = cleaned;
        }
        if let Some(description) = self.description {
            // An embedded newline becomes a further line; a blank line would
            // end the task's block in the file and cut the description short.
            task.description = description
                .iter()
                .flat_map(|entry| entry.lines())
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(str::to_string)
                .collect();
        }
        if let Some(files) = self.files {
            // Only addresses of the notebook's own library are kept: the line
            // is written as Markdown links, and a link to anywhere else would
            // be read back as description on the next open (see
            // `parse_attachments`).
            task.files = files
                .into_iter()
                .filter(|file| crate::assets::name_of(&file.address).is_some())
                .collect();
        }
        if let Some(repeat) = self.repeat {
            task.repeat = repeat.as_deref().and_then(Repeat::parse);
        }
        if let Some(subtasks) = self.subtasks {
            task.subtasks = subtasks
                .into_iter()
                .map(|s| Subtask {
                    text: single_line(&s.text),
                    done: s.done,
                })
                .collect();
        }
    }
}

/// Splits the trailing `<!--...-->` off a task body, if present.
fn split_trailing_comment(body: &str) -> (&str, Option<String>) {
    let trimmed = body.trim_end();
    let Some(stripped) = trimmed.strip_suffix(COMMENT_CLOSE) else {
        return (body, None);
    };
    let Some(open_at) = stripped.rfind(COMMENT_OPEN) else {
        return (body, None);
    };
    let inner = stripped[open_at + COMMENT_OPEN.len()..].to_string();
    (&trimmed[..open_at], Some(inner))
}

/// Wraps a comment value in quotes when it contains whitespace.
///
/// `origin:Meu Mercado` used to be read back as `Meu` — the reader stops at
/// whitespace — so undoing a completed task **created a new list** with the
/// truncated name. Spaced list names are a documented case (`Projeto Y.md` is
/// the example in the spec), and phase 7 turns every origin into a relative
/// path, where spaces are the norm. Quoting only when needed keeps every file
/// already on disk byte-identical.
fn quote_if_spaced(value: &str) -> String {
    if value.chars().any(char::is_whitespace) {
        format!("\"{value}\"")
    } else {
        value.to_string()
    }
}

/// Reads a `key:value` field. A quoted value runs to the closing quote, an
/// unquoted one to the next whitespace — see [`quote_if_spaced`].
fn read_field<'a>(comment: &'a str, key: &str) -> Option<&'a str> {
    let start = find_field(comment, key)? + key.len();
    let rest = &comment[start..];

    if let Some(quoted) = rest.strip_prefix('"') {
        let end = quoted.find('"')?;
        return (end > 0).then(|| &quoted[..end]);
    }

    let value = rest.split_whitespace().next().unwrap_or_default();
    (!value.is_empty()).then_some(value)
}

/// Reads `meta:{...}` by brace matching, so JSON containing spaces survives.
fn read_meta(comment: &str) -> Option<serde_json::Value> {
    let start = find_field(comment, "meta:")? + "meta:".len();
    let json = &comment[start..];
    if !json.starts_with('{') {
        return None;
    }

    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    let mut end = None;

    for (i, c) in json.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        match c {
            '\\' if in_string => escaped = true,
            '"' => in_string = !in_string,
            '{' if !in_string => depth += 1,
            '}' if !in_string => {
                depth -= 1;
                if depth == 0 {
                    end = Some(i + 1);
                    break;
                }
            }
            _ => {}
        }
    }

    // Malformed metadata is dropped rather than failing the whole parse: one
    // bad line must never make a notebook unreadable.
    serde_json::from_str(&json[..end?]).ok()
}

/// Finds a field key at a token boundary, so `origin:` does not match inside
/// another value.
fn find_field(comment: &str, key: &str) -> Option<usize> {
    let mut from = 0;
    while let Some(found) = comment[from..].find(key) {
        let at = from + found;
        let at_boundary = at == 0
            || comment[..at]
                .chars()
                .next_back()
                .is_some_and(char::is_whitespace);
        if at_boundary {
            return Some(at);
        }
        from = at + key.len();
    }
    None
}

