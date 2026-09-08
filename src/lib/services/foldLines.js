// What KIND of line each fold chevron stands beside. CodeMirror leaves the
// marker at the top of a cell as tall as the whole line, and the offset to
// the item's first line depends on the kind (a heading opens with air): a
// class goes on the gutter element and `styles/components/editor.css` does
// the arithmetic; no class = the note's text. See docs/platform-gotchas.md#codemirror

import { RangeSetBuilder } from "@codemirror/state";
import { foldNodeProp } from "@codemirror/language";
import { GutterMarker, gutterLineClass } from "@codemirror/view";

/// What the chevron is NOT offered on. `@codemirror/lang-markdown` folds every
/// block that is not a heading or a list, so a paragraph of two or more lines
/// gets one beside ordinary prose. Only a CONTAINER folds — heading, list item,
/// quote, code, table — and a paragraph is the one block that holds nothing.
/// Goes to `markdown({ extensions })`; a later `foldNodeProp` wins.
export const foldsContainersOnly = {
  props: [foldNodeProp.add({ Paragraph: () => null })],
};

/// `#` to `######`, with the up-to-three-space indent CommonMark allows and
/// the space that separates the hashes from the title.
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]|$)/;

/// The level a line is drawn at, or 0. Read from the TEXT, not the syntax
/// tree: a state facet is computed on the document change while the tree
/// goes on parsing, so a tree-read heading would keep the wrong offset until
/// the next keystroke. Setext headings read as text; the app writes `#`.
export function headingLevelOf(text) {
  const found = ATX_HEADING.exec(text);
  return found ? found[1].length : 0;
}

/// One marker per level, made once: the gutter compares them by identity when
/// it decides whether an element has to be redrawn.
const markers = new Map();

function markerFor(level) {
  let marker = markers.get(level);
  if (!marker) {
    marker = new (class extends GutterMarker {
      elementClass = `cm-fold-line--h${level}`;
    })();
    markers.set(level, marker);
  }
  return marker;
}

/// The classes for `state`, as the range set the gutter facet takes.
export function foldLineClassesFor(state) {
  const builder = new RangeSetBuilder();
  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number);
    const level = headingLevelOf(line.text);
    if (level) builder.add(line.from, line.from, markerFor(level));
  }
  return builder.finish();
}

/// The extension itself. Recomputed on a document change and nothing else —
/// what a line IS cannot change without its text changing.
export const foldLineClasses = gutterLineClass.compute(["doc"], foldLineClassesFor);
