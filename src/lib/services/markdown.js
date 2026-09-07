// Live preview for Markdown — the Obsidian behaviour, on CodeMirror 6.
//
// The rule, and the whole point of the phase: **the syntax the cursor is
// inside shows itself; everything else shows the result.** You see `## Título`
// while you are writing it, and `Título` the moment you leave — and since
// 2026-09-07 the same holds for a `**word**` in the middle of a line: its
// asterisks come back when the caret or the selection is in it, not when the
// caret is merely on the line (`revealedBy`).
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
//    the rule, and the soft accent band on the line being edited.
//
// Pieces 2 and 3 ask two DIFFERENT questions about the selection, and the
// difference is deliberate (user report, 2026-08-19). The raw syntax follows
// `revealedBy` — the piece of syntax the selection is INSIDE, whatever line it
// is on. The band follows `caretLines` — only a bare caret, never a selection:
// the band and the text selection are the same colour, so drawing the band
// under a selection painted twenty rounded boxes down the page and hid the
// selection inside them.
//
// Nothing here changes the file. Hiding is a decoration over the document;
// the `.md` on disk keeps every character the user typed, which is the whole
// contract with someone who opens the folder in another editor.

import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { listIndent } from "./listIndent.js";

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
    // A wrapper, only so a finger has something bigger to hit than the box:
    // the box itself cannot grow (it is drawn mid-sentence, and a bigger one
    // would push the prose around), but an inline span can carry padding that
    // widens the HIT AREA without touching the line — vertical padding on an
    // inline box is hit-tested and does not raise the line's height. The
    // lengths are in touch.css, under `(pointer: coarse)`, so nothing changes
    // for a mouse.
    const hit = document.createElement("span");
    hit.className = "cm-task-box";

    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    // Dressed as the app's own checkbox (`.theme-checkbox` is worn, never
    // copied): the box in a note and the box on a task are the same control
    // to the eye, and the bare native input read as a glitch beside them
    // (user report, 2026-08-24).
    box.className = "cm-task-checkbox theme-checkbox";

    const flip = () =>
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.checked ? "[ ]" : "[x]",
        },
      });

    // THE FINGER IS ANSWERED FIRST, and it has to be answered on `touchstart`
    // (user report on device, 2026-08-31: "click e interação com checklist no
    // editor do celular está ruim"). A WebView synthesises `mousedown` only
    // after the whole touch is over — and by then the browser has put the
    // caret in the line, the line has gone raw, and the box the finger came
    // down on is no longer in the document, so its listener never runs.
    // Preventing the touch default is the only thing that stops that caret,
    // and it takes the synthesised mouse events with it, so nothing here
    // fires twice. What it costs is a pan begun with a finger resting on the
    // box, which is a 20px target inside a note that scrolls everywhere else.
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

/// Does the selection ask to see the syntax of the span `from`…`to`?
///
/// **Touching it without covering it** — one line, and the whole rule (user
/// call, 2026-09-07: "só deveria aparecer a sintaxe quando selecionados
/// diretamente ou com a linha seletor de onde está digitando dentro do texto,
/// não quando a linha/bloco está selecionada").
///
/// Until now this was a question about LINES: every line the selection touched
/// went raw, so dragging across a paragraph — or pressing Ctrl+A — turned the
/// whole note into asterisks and brackets, the text jumping as it went. The
/// two halves of the new rule are each half of that report:
///
///   * TOUCHING is what "directly selected" means. The caret inside a bold
///     word, or a selection that starts or ends inside it, is someone working
///     on that word, and the marks are what they are working with. A span the
///     selection never reaches keeps reading as formatted text, even when the
///     line it sits on is selected from end to end.
///   * NOT COVERING is what tells editing apart from selecting. A selection
///     that swallows a span whole — the line, the paragraph, the document — is
///     someone taking the text somewhere, not writing it, and every mark it
///     covers stays out of the way.
///
/// Exported because the file embeds (`services/embeds.js`) obey the same rule
/// and must obey the SAME answer: two implementations of "is this being
/// edited" would eventually disagree about one of them.
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

/// Marks whose span is the LINE they sit on, not the node they belong to.
///
/// A `-` belongs to a list item that may hold three paragraphs and a nested
/// list under it, and a `>` to a quote that runs for ten lines; asking about
/// the parent there would strip the bullet off a whole block because the caret
/// landed in one of its children. What a reader means by "the bullet of this
/// line" is the line.
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

/// Line numbers that carry a bare CARET — the lines the band is drawn on.
///
/// NOT the same question as `activeLines`, and that is the change (user
/// report with a screenshot, 2026-08-19: "o seletor de linhas está estranho,
/// criando diversos cantos arredondados... o seletor de linha somente no bloco
/// onde está a | de texto"). Until now the band followed the selection, so
/// dragging across twenty lines drew twenty rounded bands, each one a box the
/// eye had to take apart — and since the band and the text selection are the
/// same colour, the selection itself became impossible to see.
///
/// A selection produces NO band: it already says where you are, and saying it
/// twice in the same colour is what the screenshot showed. The band is for the
/// other case, the one it was drawn for — where the caret sits while typing.
///
/// The raw syntax follows `revealedBy` instead — the span the selection is
/// inside, which is a finer question than the line and is asked per mark.
export function caretLines(state) {
  const lines = new Set();
  for (const range of state.selection.ranges) {
    if (!range.empty) continue;
    lines.add(state.doc.lineAt(range.head).number);
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
          // The space after the box goes with it (2026-09-07): the marker
          // column (services/listIndent.js) wraps `- [ ] ` in one span, and a
          // text node left over after the widget split that span in two —
          // each a box of its own width, and the hanging indent no longer
          // added up. The widget's own width is the column now (editor.css).
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
            // On a task line the checkbox IS the bullet: `- [ ]` is one mark
            // in the reader's eye, and drawing both put a stray • beside
            // every box (user report, 2026-08-24). The space between the two
            // goes with the mark, so the box sits where the bullet would.
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

        // The brackets of a link that goes NOWHERE stay. The parser reads any
        // `[text]` as a Link — a shortcut reference, in CommonMark's terms —
        // and the inner half of the app's own `[[Nota]]` and `[[/foto.jpg]]`
        // is exactly that shape. Hiding those marks left `[Nota]` on the
        // screen: half the syntax, which is neither the text nor the meaning.
        // Only a link with an address is a link to the reader.
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
/// sizes and the `var(--app-heading-N)` colours; they moved, the names
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
  listIndent,
];
