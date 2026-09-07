// What KIND of line each fold chevron stands beside.
//
// CodeMirror gives a gutter cell the height of the WHOLE line it stands
// beside and leaves the marker at its top, so a chevron only lands on the
// item's first line if something moves it — and how far depends on what that
// line is: a heading opens with air and reads at its own size, while a list
// item, a paragraph or a quote reads at the note's (user call, 2026-09-07:
// "a calha deve alinhar a primeira linha de um item, seja titulo, bullet com
// indents ou o que for" — folding already works on both).
//
// Nothing inside the gutter can see the line beside it, so the line says what
// it is: this puts a class on the gutter's own element and
// `styles/components/editor.css` does the arithmetic, in the same tokens that
// drew the line in the first place. The DEFAULT — no class — is the note's
// own text, which is what a bullet, a paragraph and a quote all are.
//
// Read from the TEXT and not from the syntax tree, unlike the line classes in
// `markdown.js`: this is a state facet, so it is computed when the DOCUMENT
// changes, while the tree goes on parsing after that — a heading below the
// first parse would keep the wrong offset until the next keystroke. The cost
// is Setext headings (`Title` over `=====`), which read here as ordinary text
// and whose chevron sits a heading's air too high. The app writes `#`.

import { RangeSetBuilder } from "@codemirror/state";
import { GutterMarker, gutterLineClass } from "@codemirror/view";

/// `#` to `######`, with the up-to-three-space indent CommonMark allows and
/// the space that separates the hashes from the title.
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]|$)/;

/// The level a line is drawn at, or 0 for everything else.
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
