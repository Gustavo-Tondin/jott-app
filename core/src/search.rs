//! Searching the whole notebook — every tasks list and every notes folder in
//! one answer.
//!
//! Notes could already be searched one folder at a time
//! ([`crate::notefolder::NoteFolder::search`]); this is the notebook-wide
//! question the user actually asks, and the only one that also covers tasks.
//!
//! Three rules shape it:
//!
//! * **Searching never writes.** It reads lists through `open_list`, not
//!   `tasks_in` — the latter repairs duplicated ids and saves, and a search box
//!   must never rewrite a file just by being typed into.
//! * **An empty query finds nothing.** Per-folder search answers "everything"
//!   for an empty query because it backs a browsing screen; a notebook-wide
//!   search box that answered the whole notebook would just be a slow way to
//!   show a list the user already has.
//! * **Tasks and notes stay apart.** They are two answers, not one ranked
//!   list: a single ordering would let a hundred matching tasks bury every
//!   note, and the screen shows them in separate sections anyway.

use serde::Serialize;

/// How many hits of each kind are collected before the answer is called
/// truncated. Enough to fill a panel several times over; far below the point
/// where reading every note's body starts to cost.
pub const DEFAULT_LIMIT: usize = 50;

/// Characters of context shown around a match found in a body of text.
const SNIPPET_CHARS: usize = 120;

/// What a hit is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HitKind {
    Task,
    Note,
}

/// One thing the query found, with everything the interface needs to draw it
/// and to open it — never a path for the frontend to take apart.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub kind: HitKind,
    /// A task: the list's root-relative address (`jott.tasks/task-list.md`).
    /// A note: its address inside `folder`, which is what `read_note` takes.
    pub path: String,
    /// A note: the notes workspace this `path` is relative to. Empty for a
    /// task, whose `path` is already root-relative.
    pub folder: String,
    /// The task's id, when it has earned one. Notes never have one.
    pub id: Option<String>,
    /// What the hit calls itself: the task's text, or the note's title.
    pub title: String,
    /// Context around the match, when it was found somewhere other than the
    /// title — a description line, a subtask, the note's body. Empty when the
    /// title itself is the match.
    pub snippet: String,
    /// The workspace's readable address (`Design/Tasks`), as `ListEntry`
    /// reports it. Never derived from the path on the other side.
    pub workspace: String,
    /// What holds it, as the user reads it: the list's name for a task, the
    /// folder's for a note (empty at a notes workspace's root).
    pub container: String,
    /// A completed task. Shown, but after the open ones.
    pub done: bool,
}

/// Everything a query found, kept in two answers.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    pub tasks: Vec<SearchHit>,
    pub notes: Vec<SearchHit>,
    /// Something matched that is not in here, because a limit was reached.
    /// Said out loud rather than passing a partial answer off as the whole
    /// one.
    pub truncated: bool,
}

impl SearchResults {
    pub fn is_empty(&self) -> bool {
        self.tasks.is_empty() && self.notes.is_empty()
    }
}

/// The query as everything below compares against it: trimmed and lowercased.
/// An empty result means the query asks for nothing.
pub fn needle(query: &str) -> String {
    query.trim().to_lowercase()
}

/// Whether `text` contains the (already lowercased) needle.
pub fn contains(text: &str, needle: &str) -> bool {
    text.to_lowercase().contains(needle)
}

/// A window of `text` around the first occurrence of `needle`, with an ellipsis
/// on whichever side was cut. Empty when the needle is not in there.
///
/// Cuts on character boundaries, never bytes: a notebook is written by hand, in
/// Portuguese here, and slicing "não" mid-character would panic.
pub fn snippet_around(text: &str, needle: &str) -> String {
    let lowered = text.to_lowercase();
    let Some(byte_at) = lowered.find(needle) else {
        return String::new();
    };
    // Byte offset → char offset: the lowercased copy can differ in byte length
    // from the original, but not in char count for the alphabets this app is
    // written for.
    let chars: Vec<char> = text.chars().collect();
    let at = lowered[..byte_at].chars().count();

    let margin = SNIPPET_CHARS.saturating_sub(needle.chars().count()) / 2;
    let start = at.saturating_sub(margin);
    let end = (at + needle.chars().count() + margin).min(chars.len());

    let mut snippet = String::new();
    if start > 0 {
        snippet.push('…');
    }
    snippet.extend(&chars[start..end]);
    if end < chars.len() {
        snippet.push('…');
    }
    snippet.trim().to_string()
}

/// Where a task matches, if it does: `Some("")` when the match is in the text
/// the card already shows, `Some(snippet)` when it is in something the card
/// does not show and the result has to prove it found.
///
/// Tags are searched with and without the `#`, because that is how people type
/// them into a search box.
pub fn task_match(task: &crate::task::Task, needle: &str) -> Option<String> {
    if contains(&task.text, needle) {
        return Some(String::new());
    }
    for line in &task.description {
        if contains(line, needle) {
            return Some(snippet_around(line, needle));
        }
    }
    for subtask in &task.subtasks {
        if contains(&subtask.text, needle) {
            return Some(snippet_around(&subtask.text, needle));
        }
    }
    let bare = needle.strip_prefix('#').unwrap_or(needle);
    for tag in &task.tags {
        if contains(tag, bare) {
            return Some(format!("#{tag}"));
        }
    }
    None
}
