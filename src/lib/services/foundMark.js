// The word a notebook search matched, marked inside the note it opened: the
// first occurrence is brought to the middle of the screen and lit for a
// moment, then the mark goes away on its own. Nothing is selected and the
// cursor is not moved — the note was opened to be read.

import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

/// How long the mark stays lit. The fade is the stylesheet's (editor-search.css).
export const FOUND_MS = 2800;

const setFound = StateEffect.define();
const MARK = Decoration.mark({ class: "cm-found" });

/// The field holding the mark; mapped through edits so typing while it is lit
/// never points it at the wrong characters.
export const foundMark = StateField.define({
  create: () => Decoration.none,
  update(marks, tr) {
    let next = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setFound)) continue;
      next = effect.value ? Decoration.set([MARK.range(effect.value.from, effect.value.to)]) : Decoration.none;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/// Where `query` first occurs in `text`, ignoring case — the same comparison
/// the core's search makes — or null.
export function firstMatch(text, query) {
  const needle = (query ?? "").trim().toLowerCase();
  if (!needle) return null;
  const from = (text ?? "").toLowerCase().indexOf(needle);
  return from < 0 ? null : { from, to: from + needle.length };
}

/// Marks and centres the first occurrence of `query` in `view`. Returns a
/// function that takes the mark away early (the editor going away), or null
/// when the note does not contain the words — a title or tag match.
export function markFound(view, query, ms = FOUND_MS) {
  const at = firstMatch(view.state.doc.toString(), query);
  if (!at) return null;
  view.dispatch({
    effects: [setFound.of(at), EditorView.scrollIntoView(at.from, { y: "center" })],
  });
  const timer = setTimeout(() => view.dispatch({ effects: setFound.of(null) }), ms);
  return () => clearTimeout(timer);
}
