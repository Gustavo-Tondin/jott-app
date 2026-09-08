// Live preview for Markdown on CodeMirror 6: the syntax the selection is
// INSIDE shows itself; everything else shows the result. `syntaxHighlighting`
// names content (classes only — the look is styles/components/editor.css),
// `livePreview` hides marks by `revealedBy`, `blockLook` dresses whole lines
// by `caretLines`. Nothing here changes the file: hiding is a decoration.

import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { listIndent } from "./listIndent.js";

/// Syntax that is noise once the line reads as formatted text. `ListMark`
/// and `TaskMarker` are absent because they are DRAWN (a •, a checkbox);
/// `URL` is hidden only inside a `[text](address)`, never when it is the text.
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

/// The checkbox a `[ ]` becomes on an inactive line. Clicking it rewrites the
/// two characters; a checklist inside a note never becomes a task of the app.
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
    // A wrapper only so a finger has a bigger hit area than the box: padding
    // on an inline span widens the target without raising the line. The
    // lengths are in touch.css, under `(pointer: coarse)`.
    const hit = document.createElement("span");
    hit.className = "cm-task-box";

    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    // Dressed as the app's own checkbox (`.theme-checkbox` is worn, never copied).
    box.className = "cm-task-checkbox theme-checkbox";

    const flip = () =>
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.checked ? "[ ]" : "[x]",
        },
      });

    // The finger is answered on `touchstart`, default prevented: a WebView
    // synthesises `mousedown` only after the touch, by which time the caret is
    // in the line, the line went raw and this box is no longer in the document.
    // See docs/platform-gotchas.md#codemirror
    hit.addEventListener(
      "touchstart",
      (event) => {
        event.preventDefault();
        flip();
      },
      { passive: false },
    );
    // `mousedown`, not `click`: the editor would otherwise move the cursor
    // into the line first, which un-hides the syntax under the pointer.
    hit.addEventListener("mousedown", (event) => {
      event.preventDefault();
      flip();
    });

    hit.appendChild(box);
    return hit;
  }

  ignoreEvent() {
    return false;
  }
}

/// The bullet a `-`, `*` or `+` becomes on an inactive line: drawn, not
/// hidden — a bullet IS the formatted form. An ordered list keeps its `1.`.
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

/// Does the selection ask to see the syntax of the span `from`…`to`? TOUCHING
/// without COVERING: a caret inside, or a selection starting or ending inside,
/// is editing it; a selection that swallows it whole is moving text, and the
/// marks stay hidden. `services/embeds.js` reuses it so the answers never differ.
export function revealedBy(state) {
  const ranges = state.selection.ranges;
  return (from, to) =>
    ranges.some(
      (range) =>
        range.from <= to &&
        range.to >= from &&
        !(range.from <= from && range.to >= to),
    );
}

/// Marks whose span is the LINE they sit on, not the node they belong to: a
/// `-` belongs to an item that may hold three paragraphs, a `>` to a ten-line
/// quote, and a caret in a child must not strip the mark off the whole block.
const LINE_SCOPED = new Set(["HeaderMark", "QuoteMark", "ListMark", "TaskMarker"]);

/// The span a mark is asked about: its own line, or the piece of syntax it
/// belongs to — the `**…**` around an `EmphasisMark`, the `[…](…)` around a
/// `LinkMark`. The parent is what makes both marks of a pair answer together:
/// without it, a caret between the two asterisks would show one of them.
function scopeOf(state, node) {
  if (LINE_SCOPED.has(node.name)) {
    const line = state.doc.lineAt(node.from);
    return [line.from, line.to];
  }
  const parent = node.node.parent;
  return parent ? [parent.from, parent.to] : [node.from, node.to];
}

/// Line numbers that carry a bare CARET — the lines the band is drawn on. A
/// selection produces NO band: band and selection are the same colour, and one
/// under the other hid the selection. The raw syntax follows `revealedBy`.
export function caretLines(state) {
  const lines = new Set();
  for (const range of state.selection.ranges) {
    if (!range.empty) continue;
    lines.add(state.doc.lineAt(range.head).number);
  }
  return lines;
}

/// The decorations for `ranges` of `state` — hidden marks and checkboxes.
/// Takes a state and plain ranges rather than a view: testable without a DOM.
export function decorationsFor(state, ranges) {
  const builder = new RangeSetBuilder();
  const reveals = revealedBy(state);
  /// Is this mark being worked on — and so drawn as the text it is?
  const raw = (node) => reveals(...scopeOf(state, node));

  for (const { from, to } of ranges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (raw(node)) return;

        if (node.name === "TaskMarker") {
          const text = state.doc.sliceString(node.from, node.to);
          // The space after the box goes with it: the marker column
          // (services/listIndent.js) wraps `- [ ] ` in one span, and a text
          // node left after the widget split it in two and broke the indent.
          let end = node.to;
          if (state.doc.sliceString(end, end + 1) === " ") end += 1;
          builder.add(
            node.from,
            end,
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
            // On a task line the checkbox IS the bullet: drawing both put a
            // stray • beside every box. The space goes with the mark.
            if (node.node.parent?.getChild("Task")) {
              let end = node.to;
              if (state.doc.sliceString(end, end + 1) === " ") end += 1;
              builder.add(node.from, end, HIDDEN);
              return;
            }
            // With the space after it, for the reason the task box gives
            // above: one widget, one span, one column.
            let end = node.to;
            if (state.doc.sliceString(end, end + 1) === " ") end += 1;
            builder.add(node.from, end, Decoration.replace({ widget: new BulletWidget() }));
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

        // The brackets of a link that goes NOWHERE stay: the parser reads any
        // `[text]` as a Link, and the inner half of `[[Nota]]` is that shape —
        // hiding those marks left `[Nota]` on screen.
        if (node.name === "LinkMark") {
          const parent = node.node.parent;
          if (parent?.name === "Link" && !parent.getChild("URL")) return;
        }

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

/// The lines a block owns, and the class that dresses them. A quote, a code
/// block and a rule are SHAPES that need the whole line, which a tag cannot
/// say — hence line decorations, not part of `markdownLook`.
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

/// The line decorations for `ranges` of `state` — same shape as
/// `decorationsFor`, testable without a DOM.
export function blockDecorationsFor(state, ranges) {
  const banded = caretLines(state);
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
      if (banded.has(line.number)) dress(line.number, "cm-md-editing");
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
/// Not the library's `highlightActiveLine`, whose rule differs. Not fed to
/// `atomicRanges`: nothing here replaces text.
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

/// What each piece of Markdown IS — a class per role, never a measurement or
/// a colour: the look lives in styles/components/editor.css, in reach of a
/// theme. Which ladder H1–H6 stand on is the `headingColor` setting (roles.css).
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
  listIndent,
];
