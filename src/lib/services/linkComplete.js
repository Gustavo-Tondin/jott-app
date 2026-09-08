// What `[[` offers while it is being typed. Two namespaces, as
// `services/embeds.js` writes them: `[[` asks about NOTES (the notebook's
// search, which answers nothing to an empty query — `core/src/search.rs`),
// `[[/` about the notebook's FILES (the library, small enough to list whole).
// Arrow keys and Enter are CodeMirror's own (`completionKeymap`).

import { api } from "./api.js";
import { embedMarkdown, noteMarkdown } from "./embeds.js";

/// How many suggestions are worth showing. Past this the list stops being a
/// list and starts being a screen — and the search box is the screen.
const LIMIT = 20;

/// Matches the way a person means it: case-insensitively, anywhere in the name.
const matches = (haystack, needle) =>
  String(haystack).toLowerCase().includes(needle.toLowerCase());

/// Writes the picked reference, and eats a `]]` the bracket-closing already
/// put to the right of the caret (`services/autoClose.js`). A picked option
/// writes the WHOLE reference, brackets included; the closing brackets are
/// read off the document, since the caret may sit in a hand-typed `[[…]]`.
function writes(text) {
  return (view, _completion, from, to) => {
    const after = view.state.sliceDoc(to, to + 2);
    const extra = after === "]]" ? 2 : after.startsWith("]") ? 1 : 0;
    view.dispatch({
      changes: { from, to: to + extra, insert: text },
      selection: { anchor: from + text.length },
      userEvent: "input.complete",
    });
  };
}

/// CodeMirror's completion source for `[[`. Built with its two answers rather
/// than importing them, so the rule can be tested without a bridge.
export function referenceCompletions({ notes, files } = {}) {
  return async (context) => {
    // Everything between `[[` and the cursor. What sits to the RIGHT of it is
    // not matched here — a `]]` there is the auto-closing's, and `writes()`
    // above is what takes it back when an option is picked.
    const open = context.matchBefore(/\[\[[^[\]\n]*/);
    if (!open) return null;
    const typed = open.text.slice(2);

    const options = typed.startsWith("/")
      ? await fileOptions(files, typed.slice(1))
      : await noteOptions(notes, typed);

    return {
      from: open.from,
      options,
      // `filter: false`, and it is not an optimisation: CodeMirror would filter
      // by the text from `from` (the first `[`, what a pick REPLACES) — `[[fo`
      // matches no name, and the panel never opened. The narrowing is done by
      // the two halves. No `validFor`, so CodeMirror re-asks on each keystroke.
      filter: false,
    };
  };
}

async function fileOptions(files, typed) {
  const library = (await files?.()) ?? [];
  return library
    .filter((asset) => matches(asset.name, typed))
    .slice(0, LIMIT)
    .map((asset) => ({
      label: `/${asset.name}`,
      // What the app can DRAW is worth saying, because it is the difference
      // between a picture in the note and a chip.
      detail: asset.image ? "image" : "file",
      type: asset.image ? "image" : "file",
      // What picking one writes comes from the module that OWNS the syntax.
      apply: writes(embedMarkdown(asset.path)),
    }));
}

async function noteOptions(notes, typed) {
  // An empty query finds nothing, by the core's rule; asking anyway would be
  // a round trip for a guaranteed empty answer.
  if (!typed.trim()) return [];
  const found = (await notes?.(typed)) ?? [];
  return found.slice(0, LIMIT).map((note) => ({
    label: note.title,
    detail: note.space || undefined,
    type: "text",
    apply: writes(noteMarkdown(note.title)),
  }));
}

/// The two answers, as the app asks them. The library is re-read on every
/// `[[/` because importing a file is exactly when someone reaches for it.
export const fromNotebook = {
  files: () => api.assets(),
  notes: (query) => api.search(query, LIMIT).then((results) => results?.notes ?? []),
};
