// What `[[` offers while it is being typed.
//
// One trigger, two namespaces — the same split `services/embeds.js` writes
// down: `[[` asks about NOTES, `[[/` asks about the notebook's FILES. Typing
// the slash switches the list under the cursor, which is the whole reason the
// slash was chosen as the marker (user call, 2026-08-19).
//
// Nothing is invented here: notes come from the notebook's own search — the
// same one Ctrl+F asks — and files from the library listing. Arrow keys and
// Enter are CodeMirror's own (`completionKeymap`), so the gesture is the one
// every other editor already taught the user.
//
// The empty query is deliberately different in the two halves, because the
// two questions are: the library is a flat folder small enough to show whole,
// so `[[/` lists everything at once; the notebook's search answers nothing to
// an empty query on purpose (`core/src/search.rs`), so `[[` waits for a
// letter rather than dumping every note.

import { api } from "./api.js";
import { embedMarkdown, noteMarkdown } from "./embeds.js";

/// How many suggestions are worth showing. Past this the list stops being a
/// list and starts being a screen — and the search box is the screen.
const LIMIT = 20;

/// Matches the way a person means it: case-insensitively, anywhere in the name.
const matches = (haystack, needle) =>
  String(haystack).toLowerCase().includes(needle.toLowerCase());

/// Writes the picked reference, and eats a `]]` the bracket-closing already
/// put to the right of the caret (`services/autoClose.js`, 2026-08-19).
///
/// A picked option writes the WHOLE reference, brackets included — so with
/// `[[` now typed as two keystrokes that leave `[[|]]`, a plain string `apply`
/// replaced only up to the caret and the note ended up holding
/// `[[/foto.jpg]]]]`. The closing brackets are read off the document at the
/// moment of picking rather than assumed, because the caret may equally be
/// sitting in a `[[…]]` the user typed out by hand.
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

/// CodeMirror's completion source for `[[`.
///
/// Built with its two answers rather than importing them, for the same reason
/// the embeds are: so the rule can be tested without a bridge.
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
      // **`filter: false`, and it is not an optimisation.** CodeMirror filters
      // options by the text between `from` and the cursor, and `from` has to
      // be the first `[` — that is what a picked option REPLACES. So the text
      // it would filter by is `[[fo`, and no name in either list has brackets
      // in it: every option was thrown away and the panel never opened. The
      // narrowing is done here instead, where the two halves already know how
      // to ask (`fileOptions` filters, and the search does its own).
      //
      // With no `validFor`, CodeMirror re-asks on each keystroke — which is
      // exactly what makes that narrowing happen.
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
      // What picking one writes comes from the module that OWNS the syntax —
      // a second copy of it here is the drift this app keeps designing out.
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
