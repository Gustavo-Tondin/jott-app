// Keeping the line being typed on screen.
//
// CodeMirror scrolls the cursor into view by walking up from its own DOM and
// scrolling whatever it finds on the way. The walk has one assumption that
// this app breaks: it treats an element whose content is taller than its box
// as a scroller, and this shell has one that is nothing of the sort —
// `.shell__canvas` is 481px tall with 697px of note spilling out of it on
// purpose, because the thing that scrolls is the PANEL AROUND IT (the header
// scrolls away with the note, shell.css). So CodeMirror set `scrollTop` on an
// element with `overflow: visible`, nothing moved, and — this is the part that
// bites — it then CLIPPED the cursor's rectangle to that element's box before
// carrying on. Trimmed to the edge, the cursor looked perfectly visible to the
// real scroller one level up, which therefore did nothing.
//
// Measured on the emulator (2026-08-20): typing three lines at the end of a
// note put the caret 62px below the visible bottom, with 216px of unused
// scroll underneath it and no scrolling at all. On a phone that bottom edge is
// the top of the keyboard, so the line being typed simply disappeared.
//
// This is not an Android bug and the fix is not an Android fix — the same
// layout does the same thing in a narrow window on the desktop.

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
///
/// `clientHeight`, not the rectangle's height: a horizontal scrollbar sits
/// inside the box and the last line would hide under it.
///
/// And `scroll-padding` off the top and bottom, which is the platform's way of
/// saying "something floats over this edge" — here the formatting strip above
/// the keyboard, and the title bar the note scrolls under. Without it the
/// cursor was scrolled to the true edge of the scroller and landed BEHIND the
/// strip, which is the same disappearing line this file exists for, arriving
/// from the other side (measured on device, 2026-08-21).
export function visibleBox(el) {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  // BOTH SPELLINGS. The stylesheets say `scroll-padding-block-end`, because
  // logical properties are the house rule; a browser resolves that to the
  // physical `scroll-padding-bottom` in the computed style, and jsdom does
  // not. Reading only one of them means either the app or the test is
  // measuring something that is always zero.
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
    follow(view, range.head, options.yMargin || 0);
    return false;
  }),
  // And when nothing asked at all, which is the case that made the note
  // unusable on a phone: TYPING does not request a scroll. CodeMirror leaves
  // ordinary input to the browser, which scrolls the caret into view on its
  // own — inside a contenteditable in a plain page. Measured in the app's
  // WebView, typing five lines at the end of a note scrolled nothing and left
  // the caret 62px under the keyboard (2026-08-20).
  //
  // `requestMeasure`, not a read in the listener: the update is still being
  // applied, and asking the DOM for a rectangle mid-update is what makes an
  // editor stutter.
  EditorView.updateListener.of((update) => {
    if (!update.docChanged && !update.selectionSet) return;
    if (!update.view.hasFocus) return;
    const head = update.state.selection.main.head;
    update.view.requestMeasure({ read: (view) => follow(view, head, marginOf(view)) });
  }),
];
