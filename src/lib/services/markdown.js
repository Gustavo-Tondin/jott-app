// Live preview for Markdown — the Obsidian behaviour, on CodeMirror 6.
//
// The rule, and the whole point of the phase: **the line the cursor is on
// shows its syntax; every other line shows the result.** You see `## Título`
// while you are writing it, and `Título` the moment you leave.
//
// Two independent pieces do that:
//
// 1. `syntaxHighlighting` styles the *content* (a heading is big, strong is
//    bold) — declarative, from the syntax tree's tags.
// 2. `livePreview` hides the *marks* (`#`, `**`, `>`) on inactive lines, and
//    turns `[ ]` into a real checkbox.
//
// Nothing here changes the file. Hiding is a decoration over the document;
// the `.md` on disk keeps every character the user typed, which is the whole
// contract with someone who opens the folder in another editor.

import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/// Syntax that is noise once the line reads as formatted text.
///
/// `ListMark` and `TaskMarker` are deliberately absent: a bullet and a
/// checkbox *are* the formatted form, so hiding them would remove meaning
/// rather than reveal it.
const HIDEABLE = new Set([
  "HeaderMark",
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
  "LinkMark",
  "QuoteMark",
]);

/// Marks that own the space after them (`# ` reads as one unit).
const EATS_TRAILING_SPACE = new Set(["HeaderMark", "QuoteMark"]);

const HIDDEN = Decoration.replace({});

/// The checkbox a `[ ]` becomes on an inactive line.
///
/// Clicking it rewrites the two characters in the document — which is all a
/// checkbox in a note ever is (spec 5: a checklist inside a note stays a
/// note; it never becomes a task of the app).
class CheckboxWidget extends WidgetType {
  constructor(checked, from, to) {
    super();
    this.checked = checked;
    this.from = from;
    this.to = to;
  }

  eq(other) {
    return other.checked === this.checked && other.from === this.from;
  }

  toDOM(view) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-task-checkbox";
    box.addEventListener("mousedown", (event) => {
      // `mousedown`, not `click`: the editor would otherwise move the cursor
      // into the line first, which un-hides the syntax under the pointer.
      event.preventDefault();
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.checked ? "[ ]" : "[x]",
        },
      });
    });
    return box;
  }

  ignoreEvent() {
    return false;
  }
}

/// Line numbers the selection touches — the lines that stay raw.
function activeLines(state) {
  const lines = new Set();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) lines.add(n);
  }
  return lines;
}

/// The decorations for `ranges` of `state` — hidden marks and checkboxes.
///
/// Takes a state and plain ranges rather than a view, so the rule can be
/// tested without a DOM: what gets hidden is a decision about the document
/// and the cursor, and nothing about layout.
export function decorationsFor(state, ranges) {
  const builder = new RangeSetBuilder();
  const active = activeLines(state);

  for (const { from, to } of ranges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const line = state.doc.lineAt(node.from);
        if (active.has(line.number)) return;

        if (node.name === "TaskMarker") {
          const text = state.doc.sliceString(node.from, node.to);
          builder.add(
            node.from,
            node.to,
            Decoration.replace({
              widget: new CheckboxWidget(
                text.toLowerCase() === "[x]",
                node.from,
                node.to,
              ),
            }),
          );
          return;
        }

        if (!HIDEABLE.has(node.name)) return;

        let end = node.to;
        if (
          EATS_TRAILING_SPACE.has(node.name) &&
          state.doc.sliceString(end, end + 1) === " "
        ) {
          end += 1;
        }
        // A zero-width mark would be an empty range, which the builder
        // refuses; nothing to hide there anyway.
        if (end > node.from) builder.add(node.from, end, HIDDEN);
      },
    });
  }
  return builder.finish();
}

/// Hides syntax on every line the cursor is not on.
export const livePreview = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = decorationsFor(view.state, view.visibleRanges);
    }

    update(update) {
      // The selection matters as much as the document: moving the cursor to
      // another line is what reveals and re-hides syntax.
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = decorationsFor(
          update.view.state,
          update.view.visibleRanges,
        );
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    // Hidden ranges must not swallow clicks meant for the text around them.
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
  },
);

/// How the formatted result looks. Sizes are relative so the editor inherits
/// whatever the app's type scale becomes in phase 10.
export const markdownLook = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.6em", fontWeight: "700", lineHeight: "1.3" },
  { tag: tags.heading2, fontSize: "1.35em", fontWeight: "700", lineHeight: "1.3" },
  { tag: tags.heading3, fontSize: "1.15em", fontWeight: "700" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "#2f6fed", textDecoration: "underline" },
  { tag: tags.url, color: "#2f6fed" },
  { tag: tags.monospace, fontFamily: "ui-monospace, monospace" },
  { tag: tags.quote, color: "#555", fontStyle: "italic" },
  { tag: tags.list, color: "inherit" },
]);

/// Everything the note editor needs to render Markdown live.
export const markdownPreview = [syntaxHighlighting(markdownLook), livePreview];
