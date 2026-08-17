//! Searching the notebook — the whole of it, or one space.
//!
//! Reads through [`Notebook::open_list`], never `tasks_in`: typing into a
//! search box must not rewrite a single file. Tasks and notes stay two
//! answers (see [`crate::search`] for why).

use crate::error::Result;
use crate::search::{HitKind, SearchHit, SearchResults};

use super::*;

impl Notebook {
    /// Everything in the notebook that matches `query` — tasks and notes, kept
    /// as two answers (see [`crate::search`] for why).
    ///
    /// Reads through `open_list`, never `tasks_in`: typing into a search box
    /// must not rewrite a single file. An empty query finds nothing.
    pub fn search(&self, query: &str, limit: usize) -> Result<SearchResults> {
        self.search_in(query, limit, None)
    }

    /// The same search, narrowed to one space (2026-08-17).
    ///
    /// `scope` is a space's root-relative path — the address the sidebar and
    /// every list already speak. A space is the whole unit here: a list inside
    /// one is searched by naming its space, because "find inside this screen"
    /// is a question about the place, not about the file. `None` searches the
    /// notebook, which is what the Ctrl+F box does.
    pub fn search_in(
        &self,
        query: &str,
        limit: usize,
        scope: Option<&str>,
    ) -> Result<SearchResults> {
        let needle = crate::search::needle(query);
        let mut results = SearchResults::default();
        if needle.is_empty() {
            return Ok(results);
        }
        let in_scope = |prefix: &str| scope.is_none_or(|only| prefix == only);

        let labels = self.space_labels()?;
        let label_of = |prefix: &String| labels.get(prefix).cloned().unwrap_or_else(|| prefix.clone());

        for (prefix, folder) in self.task_folders()? {
            if !in_scope(&prefix) {
                continue;
            }
            let space = label_of(&prefix);
            for name in folder.list_names()? {
                let path = format!("{prefix}/{name}.md");
                for task in self.open_list(&path)?.tasks() {
                    let Some(snippet) = crate::search::task_match(task, &needle) else {
                        continue;
                    };
                    if results.tasks.len() >= limit {
                        results.truncated = true;
                        break;
                    }
                    results.tasks.push(SearchHit {
                        kind: HitKind::Task,
                        path: path.clone(),
                        folder: String::new(),
                        id: task.id.clone(),
                        title: task.text.clone(),
                        snippet,
                        space: space.clone(),
                        container: name.clone(),
                        done: task.done,
                    });
                }
            }
        }
        // Open tasks first: a search is nearly always about what is still to
        // do. Within each half the walk order (space, then list) stands.
        results.tasks.sort_by_key(|hit| hit.done);

        for (prefix, folder) in self.note_folders()? {
            if !in_scope(&prefix) {
                continue;
            }
            let space = label_of(&prefix);
            for entry in folder.search(&needle)? {
                if results.notes.len() >= limit {
                    results.truncated = true;
                    break;
                }
                // The title already matching is the match; otherwise the body
                // did, and the hit has to show where.
                let snippet = if crate::search::contains(&entry.title, &needle) {
                    String::new()
                } else {
                    crate::search::snippet_around(&folder.read(&entry.path)?.body, &needle)
                };
                results.notes.push(SearchHit {
                    kind: HitKind::Note,
                    path: entry.path,
                    folder: prefix.clone(),
                    id: None,
                    title: entry.title,
                    snippet,
                    space: space.clone(),
                    container: entry.folder,
                    done: false,
                });
            }
        }

        Ok(results)
    }
}
