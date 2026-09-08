// How the notes board splits into columns. CSS multicol reads DOWN a
// column, so the split is decided here: cards are RENDERED column by column
// (`order`), each column's last one carrying `break-after: column`
// (`breaks`), and stay direct children of the board (dragging). Card `i`
// sits in column `i % count`: the board reads by ROWS; heights unbalanced.

import { clamp } from "./num.js";

/// The narrowest a card may be, in px, and the gap between columns. Both are
/// the CSS values (controls/layout.css, `.theme-note-board`, `--app-space-12`); they are repeated
/// here because the count has to be computed, not read back off the layout.
export const CARD_MIN = 176;
export const COLUMN_GAP = 12;

/// The most columns the board ever draws. Three is what the wireframe shows at
/// the app's reading width; past that a card would be narrower than its own
/// banner deserves.
export const MAX_COLUMNS = 3;

/// Never fewer than two columns above this width: a board of one column is
/// a list, and a list loses the only thing a board is for. Below it there is
/// genuinely no room for two.
export const PAIR_FLOOR = 300;

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
