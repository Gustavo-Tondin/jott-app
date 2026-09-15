// How the notes board splits into columns. CSS multicol reads DOWN a
// column, so the split is decided here: cards are RENDERED column by column
// (`order`), each column's last one carrying `break-after: column`
// (`breaks`), and stay direct children of the board (dragging). Card `i`
// sits in column `i % count`: the board reads by ROWS; heights unbalanced.

import { clamp } from "./num.js";
import { movedItems } from "./spaceOrder.js";

/// The narrowest a card may be, in px, and the gap between columns. Both are
/// the CSS values (controls/layout.css, `.theme-note-board`, `--app-space-12`); they are repeated
/// here because the count has to be computed, not read back off the layout.
export const CARD_MIN = 176;
const COLUMN_GAP = 12;

/// The most columns the board ever draws. Three is what the wireframe shows at
/// the app's reading width; past that a card would be narrower than its own
/// banner deserves.
const MAX_COLUMNS = 3;

/// Never fewer than two columns above this width: a board of one column is
/// a list, and a list loses the only thing a board is for. Below it there is
/// genuinely no room for two.
const PAIR_FLOOR = 300;

/// How many columns fit in `width` px.
export function columnCount(width, min = CARD_MIN, gap = COLUMN_GAP) {
  if (!(width > 0)) return 1;
  const fits = Math.floor((width + gap) / (min + gap));
  const floor = width >= PAIR_FLOOR ? 2 : 1;
  return clamp(fits, floor, MAX_COLUMNS);
}

/// The board's arrangement for `length` cards in `count` columns: `order` is
/// the model index of each card in DOM order (column by column), `breaks` the
/// model indices that end a column. Fewer cards than columns: one each.
export function columnLayout(length, count) {
  const order = [];
  const breaks = new Set();
  const used = Math.max(1, Math.min(count, length));
  for (let column = 0; column < used; column++) {
    for (let i = column; i < length; i += used) order.push(i);
    if (column < used - 1) breaks.add(order[order.length - 1]);
  }
  return { order, breaks };
}

/// Where every card would STAND once DOM item(s) `from` are put down at DOM
/// slot `to` — the board re-read by rows and each column stacked from the
/// top, exactly as `columnLayout` will lay it out after the commit. `rects`
/// are the cards' boxes in DOM order, as measured; the answer is in DOM order
/// too, one `{left, top, width, height}` per card, the carried one(s)
/// included (that is where they land). This is the drag's preview: a card is
/// only ever shown where it will be, so nothing jumps on the drop.
export function projectMove(rects, order, count, from, to) {
  const length = rects.length;
  if (!length) return [];
  const used = Math.max(1, Math.min(count, length));
  // DOM index of each model position, then the arrangement the drop makes.
  const model = new Array(length);
  order.forEach((m, dom) => (model[m] = dom));
  const froms = (Array.isArray(from) ? from : [from]).map((dom) => order[dom]);
  const next = movedItems(model, froms, order[to]);
  // Column edges and the vertical gap, read off the board as it stands: the
  // first card of each column, and the space between two neighbours in one.
  const lefts = [];
  let gap = 0;
  let top = Infinity;
  order.forEach((m, dom) => {
    const column = m % used;
    if (lefts[column] == null) lefts[column] = rects[dom].left;
    top = Math.min(top, rects[dom].top);
    const below = order[dom + 1];
    if (below != null && below % used === column && !gap)
      gap = Math.max(0, rects[dom + 1].top - rects[dom].bottom);
  });
  const tops = lefts.map(() => top);
  const placed = new Array(length);
  next.forEach((dom, m) => {
    const column = m % used;
    const r = rects[dom];
    placed[dom] = {
      left: lefts[column],
      top: tops[column],
      width: r.width,
      height: r.height,
    };
    tops[column] += r.height + gap;
  });
  return placed;
}
