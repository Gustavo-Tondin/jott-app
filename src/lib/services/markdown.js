// Live preview for Markdown — the Obsidian behaviour, on CodeMirror 6.
//
// The rule, and the whole point of the phase: **the line the cursor is on
// shows its syntax; every other line shows the result.** You see `## Título`
// while you are writing it, and `Título` the moment you leave.
//
// Three independent pieces do that:
//
// 1. `syntaxHighlighting` names the *content* (this run is a heading, this one
//    is strong) — declarative, from the syntax tree's tags. It hands out
//    CLASSES only: what a heading looks like is written once, in
//    styles/components/editor.css, next to the rest of the app's visual layer.
// 2. `livePreview` hides the *marks* (`#`, `**`, `>`) on inactive lines, and
//    turns `[ ]` into a real checkbox.
// 3. `blockLook` dresses whole LINES — the quote's bar, the code block's box,
//    the rule, and the soft accent band on the lines being edited.
//
// Pieces 2 and 3 read the same `activeLines`, and that is the point: the lines
// wearing the accent band are exactly the lines showing their raw syntax, so
// the band explains why those lines look different from the rest.
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
/// checkbox *are* the formatted form, so they are drawn (a •, a real
/// checkbox) instead of removed. `URL` is absent for the opposite reason —
/// it is hidden, but only inside a `[text](address)`, never when the address
/// is the text.
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

/// The bullet a `-`, `*` or `+` becomes on an inactive line.
///
/// Not a hidden mark: a bullet IS the formatted form of a list, so it is the
/// one piece of syntax that gets DRAWN rather than removed (Notes wireframe,
/// where a list reads with a real •). An ordered list keeps its `1.`, which is
/// already the form it takes on paper.
class BulletWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const dot = document.createElement("span");
    dot.className = "cm-md-bullet";
    dot.textContent = "\u2022";
    return dot;
  }

  ignoreEvent() {
    return false;
  }
}

/// The three marks a bullet list can be written with.
const BULLETS = new Set(["-", "*", "+"]);

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

        if (node.name === "ListMark") {
          const text = state.doc.sliceString(node.from, node.to);
          if (BULLETS.has(text)) {
            builder.add(
              node.from,
              node.to,
              Decoration.replace({ widget: new BulletWidget() }),
            );
          }
          return;
        }

        // The address of a link, but never the text of an autolink: in
        // `<http://x.dev>` the URL *is* what the reader sees, and hiding it
        // would leave an empty line where a link was.
        if (node.name === "URL") {
          const parent = node.node.parent?.name;
          if (parent === "Link" || parent === "Image") {
            builder.add(node.from, node.to, HIDDEN);
          }
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

/// The lines a block owns, and the class that dresses them.
///
/// A quote, a code block and a rule are not runs of text — they are SHAPES,
/// and a shape needs the whole line to draw itself on: a bar down the side, a
/// box with two rounded ends, a hairline across. A tag cannot say that, which
/// is why these are line decorations and not part of `markdownLook`.
const BLOCK_LINE = {
  Blockquote: "cm-md-quote",
  FencedCode: "cm-md-code",
  CodeBlock: "cm-md-code",
  HorizontalRule: "cm-md-rule",
  ATXHeading1: "cm-md-heading",
  ATXHeading2: "cm-md-heading",
  ATXHeading3: "cm-md-heading",
  ATXHeading4: "cm-md-heading",
  ATXHeading5: "cm-md-heading",
  ATXHeading6: "cm-md-heading",
  SetextHeading1: "cm-md-heading",
  SetextHeading2: "cm-md-heading",
};

/// Blocks drawn as a box, whose first and last lines round the far corners.
const BOXED = new Set(["cm-md-quote", "cm-md-code"]);

/// The line decorations for `ranges` of `state`.
///
/// Same shape as `decorationsFor`: a state and plain ranges, no view, so the
/// rule is testable without a DOM.
export function blockDecorationsFor(state, ranges) {
  const active = activeLines(state);
  /// line number → the classes that line wears
  const lines = new Map();

  const dress = (lineNumber, className) => {
    let classes = lines.get(lineNumber);
    if (!classes) lines.set(lineNumber, (classes = new Set()));
    classes.add(className);
  };

  for (const { from, to } of ranges) {
    // The band first, walking the lines this range covers. Only the visible
    // ones: a decoration outside the viewport is work nobody sees.
    for (let pos = from; pos <= to; ) {
      const line = state.doc.lineAt(pos);
      if (active.has(line.number)) dress(line.number, "cm-md-editing");
      pos = line.to + 1;
    }

    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === "TaskMarker") {
          const text = state.doc.sliceString(node.from, node.to);
          if (text.toLowerCase() === "[x]") {
            dress(state.doc.lineAt(node.from).number, "cm-md-done");
          }
          return;
        }

        const className = BLOCK_LINE[node.name];
        if (!className) return;

        const first = state.doc.lineAt(node.from).number;
        const last = state.doc.lineAt(node.to).number;
        for (let n = first; n <= last; n++) dress(n, className);
        if (BOXED.has(className)) {
          dress(first, "cm-md-open");
          dress(last, "cm-md-close");
        }
      },
    });
  }

  const builder = new RangeSetBuilder();
  for (const number of [...lines.keys()].sort((a, b) => a - b)) {
    builder.add(
      state.doc.line(number).from,
      state.doc.line(number).from,
      Decoration.line({ class: [...lines.get(number)].join(" ") }),
    );
  }
  return builder.finish();
}

/// Dresses whole lines: the blocks that have a shape, and the editing zone.
///
/// Deliberately not `highlightActiveLine` from the library: that one gives up
/// the moment the selection stops being a bare cursor, and the zone we want to
/// mark is every line the selection touches — one line while typing, the whole
/// block while selecting across it.
///
/// Its decorations are NOT fed to `atomicRanges` (the way `livePreview`'s are):
/// nothing here replaces text, so there is nothing for the cursor to step over.
export const blockLook = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = blockDecorationsFor(view.state, view.visibleRanges);
    }

    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = blockDecorationsFor(
          update.view.state,
          update.view.visibleRanges,
        );
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/// What each piece of Markdown IS — a class per role, and not one measurement.
///
/// The look itself is in styles/components/editor.css, for the same reason no
/// component in this app carries a `<style>` block: a colour or a size written
/// here would be a visual decision hiding in a service, out of reach of a
/// theme and of anyone reading the stylesheet. Previously this table held the
/// sizes and the `var(--theme-heading-N)` colours; they moved, the names
/// stayed.
///
/// Which ladder H1–H6 stand on — the accent's or the ink's — is still the
/// `headingColor` setting, resolved in styles/roles.css. This table says
/// nothing about colour at all now.
export const markdownLook = HighlightStyle.define([
  { tag: tags.heading1, class: "cm-md-h1" },
  { tag: tags.heading2, class: "cm-md-h2" },
  { tag: tags.heading3, class: "cm-md-h3" },
  { tag: tags.heading4, class: "cm-md-h4" },
  { tag: tags.heading5, class: "cm-md-h5" },
  { tag: tags.heading6, class: "cm-md-h6" },
  { tag: tags.strong, class: "cm-md-strong" },
  { tag: tags.emphasis, class: "cm-md-em" },
  { tag: tags.strikethrough, class: "cm-md-strike" },
  { tag: tags.link, class: "cm-md-link" },
  { tag: tags.url, class: "cm-md-url" },
  // `InlineCode` and the text inside a fenced block share this tag. The chip
  // is dropped inside a block, where the box already says "code".
  { tag: tags.monospace, class: "cm-md-mono" },
  { tag: tags.contentSeparator, class: "cm-md-separator" },
]);

/// Everything the note editor needs to render Markdown live.
export const markdownPreview = [
  syntaxHighlighting(markdownLook),
  livePreview,
  blockLook,
];
