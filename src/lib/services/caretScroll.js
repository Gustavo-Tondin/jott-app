// Keeping the line being typed on screen. CodeMirror's scroll-into-view walk
// treats any element whose content overflows as a scroller; `.shell__canvas`
// overflows on purpose (the panel around it scrolls), so CodeMirror scrolls
// nothing and clips the caret's rectangle to that box, and the real scroller
// sees a visible caret. Not Android-only. See docs/platform-gotchas.md#codemirror

import { EditorView } from "@codemirror/view";

/// The nearest ancestor of `node` that can ACTUALLY scroll: one that both
/// declares a scrolling overflow and has something to scroll. An element that
/// merely overflows is not a scroller, which is the whole point.
export function scrollableAround(node) {
  for (let el = node?.parentElement; el; el = el.parentElement) {
    const style = getComputedStyle(el);
    const scrolls = /auto|scroll/.test(style.overflowY);
    if (scrolls && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

/// How far `el` has to scroll for the band `top`…`bottom` to sit inside it,
/// leaving `margin` of air. Zero when it already does. Positive scrolls down.
export function scrollNeeded({ top, bottom }, box, margin = 0) {
  // A cursor taller than the room it has cannot have both margins, and can be
  // shown from one end only: the TOP, which is where the line starts.
  if (bottom - top + 2 * margin > box.bottom - box.top) return top - box.top;
  if (bottom > box.bottom - margin) return bottom - (box.bottom - margin);
  if (top < box.top + margin) return top - (box.top + margin);
  return 0;
}

/// The part of `el` that is genuinely visible, in viewport coordinates.
/// `clientHeight`, not the rectangle's height (a horizontal scrollbar hides
/// the last line), minus `scroll-padding` top and bottom — the formatting
/// strip and the title bar float over those edges, and the caret landed behind them.
export function visibleBox(el) {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  // BOTH SPELLINGS: the stylesheets say `scroll-padding-block-end`; a browser
  // resolves it to the physical `scroll-padding-bottom` in computed style and
  // jsdom does not. Reading one means the app or the test measures zero.
  const pad = (...names) =>
    Math.max(0, ...names.map((n) => Number.parseFloat(style.getPropertyValue(n)) || 0));
  return {
    top: rect.top + pad("scroll-padding-top", "scroll-padding-block-start"),
    bottom: rect.top + el.clientHeight - pad("scroll-padding-bottom", "scroll-padding-block-end"),
  };
}

/// Scrolls `el` so the cursor at `head` sits inside it. The one piece of DOM
/// work in this file; everything above is arithmetic.
function follow(view, head, margin) {
  const el = scrollableAround(view.dom);
  const caret = el && view.coordsAtPos(head);
  if (!caret) return;

  const move = scrollNeeded(caret, visibleBox(el), margin);
  if (move) el.scrollTop += move;
}

/// How much air to leave, as the editor was configured (Editor.svelte).
const marginOf = (view) => view.state.facet(EditorView.cursorScrollMargin)?.y || 0;

/// Keeps the cursor on screen — in the two situations that need it, for two
/// different reasons.
export const keepCaretInView = [
  // When CodeMirror scrolls the cursor into view itself, its walk stops short
  // (see the top of this file), so the same scroll is done again on the
  // element that can actually perform it. `false` throughout: this ADDS a
  // scroll, it does not replace the editor's own handling.
  EditorView.scrollHandler.of((view, range, options) => {
    // Only the ordinary "keep it on screen" case. `center`/`start`/`end` are
    // asked for deliberately somewhere (a search hit, a restored position),
    // and guessing at those would fight whoever asked.
    if (options.y && options.y !== "nearest") return false;
    // CodeMirror calls this INSIDE its update, with the layout locked: a
    // `coordsAtPos` here throws ("isn't allowed during an update"), CodeMirror
    // swallows it, and the scroll never happens. Read in the measure phase.
    const margin = options.yMargin || 0;
    view.requestMeasure({ read: (v) => follow(v, range.head, margin) });
    return false;
  }),
  // And when nothing asked at all: TYPING does not request a scroll —
  // CodeMirror leaves ordinary input to the browser, which in the app's
  // WebView scrolled nothing. `requestMeasure`, not a read in the listener:
  // the update is still being applied, and a DOM read mid-update stutters.
  EditorView.updateListener.of((update) => {
    if (!update.docChanged && !update.selectionSet) return;
    if (!update.view.hasFocus) return;
    const head = update.state.selection.main.head;
    update.view.requestMeasure({ read: (view) => follow(view, head, marginOf(view)) });
  }),
];
