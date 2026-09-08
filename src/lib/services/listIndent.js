// How indentation is DRAWN in a note, beside `markdown.js` (what each mark
// looks like) and `markdownCommands.js` (a level is four spaces, `INDENT`).
// Hands out two marks (`cm-md-indent`, `cm-md-marker`), one line class
// (`cm-md-indented`) and two counts (`--cm-level`, `--cm-marker`) — never a
// length: those live in editor.css. Code, quote and blank lines are left alone.

import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin } from "@codemirror/view";
import { INDENT } from "./markdownCommands.js";

/// A list marker with the space after it, and the task box when there is one:
/// `- `, `12. `, `- [ ] `. The task box is part of the marker COLUMN — the
/// checkbox it becomes stands where the bullet would.
const MARKER = /^(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/;

/// Blocks whose lines are not indented list content, whatever they start with.
const OPAQUE = new Set(["FencedCode", "CodeBlock", "Blockquote", "HTMLBlock"]);

/// Does `pos` fall inside a block this module keeps its hands off?
function inOpaqueBlock(state, pos) {
  let node = syntaxTree(state).resolveInner(pos, 1);
  while (node) {
    if (OPAQUE.has(node.name)) return true;
    node = node.parent;
  }
  return false;
}

/// What the start of a line is made of: whole indentation levels, where the
/// marker (if any) starts and ends, and how many marker columns it takes.
/// `null` for a line with nothing to draw. Pure, so the rule is testable as
/// text: `- a` is `{levels: 0, marker: 1}`.
export function indentOf(text) {
  if (!text.trim()) return null;
  const spaces = /^[ \t]*/.exec(text)[0];
  // A tab counts as one level, the way every editor draws it.
  const width = spaces.replace(/\t/g, INDENT).length;
  const levels = Math.floor(width / INDENT.length);
  const marker = MARKER.exec(text.slice(spaces.length));
  if (levels === 0 && !marker) return null;
  return {
    levels,
    // Where the marker sits in the line, in characters from its start.
    markerFrom: spaces.length,
    markerTo: spaces.length + (marker ? marker[0].length : 0),
    // Columns: a bullet or a number is one; a bullet with a box is wider
    // (`TASK_COLUMNS`); the task box in editor.css is sized by the same number.
    marker: marker ? (/\[/.test(marker[0]) ? TASK_COLUMNS : 1) : 0,
  };
}

/// How many marker columns a task's checkbox takes (`- [ ] `).
export const TASK_COLUMNS = 1.4;

/// Is the next non-blank line indented deeper than `levels`?
function nextDeeper(state, line, levels) {
  let n = line.number + 1;
  while (n <= state.doc.lines) {
    const next = state.doc.line(n);
    if (next.text.trim()) {
      const shape = indentOf(next.text);
      return !!shape && shape.levels > levels;
    }
    n++;
  }
  return false;
}

const INDENT_MARK = Decoration.mark({ class: "cm-md-indent" });
const MARKER_MARK = Decoration.mark({ class: "cm-md-marker" });

/// The decorations for `ranges` of `state`. Same shape as `decorationsFor`
/// in markdown.js: a state and plain ranges, testable without a DOM.
export function indentDecorationsFor(state, ranges) {
  const builder = new RangeSetBuilder();
  for (const { from, to } of ranges) {
    for (let pos = from; pos <= to; ) {
      const line = state.doc.lineAt(pos);
      pos = line.to + 1;
      const shape = indentOf(line.text);
      if (!shape) continue;
      // Resolved at the first non-blank character: at `line.from` the
      // indentation itself may belong to the paragraph above.
      if (inOpaqueBlock(state, line.from + shape.markerFrom)) continue;

      // A PARENT — an item with something nested under it — draws the guide
      // from under its own marker down through its wrapped lines, so the
      // children's guide has something to meet; the stylesheet draws the stub.
      const parent = shape.marker > 0 && nextDeeper(state, line, shape.levels);

      builder.add(
        line.from,
        line.from,
        Decoration.line({
          class: parent ? "cm-md-indented cm-md-indented--parent" : "cm-md-indented",
          attributes: { style: `--cm-level:${shape.levels};--cm-marker:${shape.marker}` },
        }),
      );
      // One span per whole level — the tabs were widened to `INDENT` for the
      // count, but the spans follow the characters actually there.
      let at = line.from;
      let drawn = 0;
      while (drawn < shape.levels) {
        const ch = state.doc.sliceString(at, at + 1);
        const step = ch === "\t" ? 1 : INDENT.length;
        builder.add(at, at + step, INDENT_MARK);
        at += step;
        drawn++;
      }
      if (shape.marker) {
        builder.add(line.from + shape.markerFrom, line.from + shape.markerTo, MARKER_MARK);
      }
    }
  }
  return builder.finish();
}

/// Draws the indentation of every visible line. A `ViewPlugin`, like
/// `blockLook`: nothing here is a block widget. Its decorations are not
/// atomic — the caret walks through the spaces; they only LOOK wider.
export const listIndent = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = indentDecorationsFor(view.state, view.visibleRanges);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = indentDecorationsFor(update.view.state, update.view.visibleRanges);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
