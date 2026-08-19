// How the notes board splits into columns.
//
// **Why this is not CSS.** The board is a masonry: cards of different heights,
// packed so the next one starts where the last ended. CSS multicol is the only
// thing in a browser that does that (`grid-template-rows: masonry` is not
// shipped anywhere the app runs), and its own distribution — `column-fill:
// balance` — decides how many columns to actually USE by balancing heights. On
// a board with a handful of cards and one long one it settles on two of three
// columns and leaves the third empty, which reads as a broken layout and is
// exactly what was reported (2026-08-19, twice).
//
// So the SPLIT is decided here and handed to the browser as breaks: the cards
// stay direct children of the board (which is what keeps dragging working —
// see actions/reorder.js), and each column's last card carries
// `break-after: column`.
//
// The weights are estimates, not measurements. Nothing is read from the DOM:
// this file is pure, and a card's height is guessed from what it holds. An
// estimate that is off makes one column longer than another — never one empty.

/// The narrowest a card may be, in px, and the gap between columns. Both are
/// the CSS values (notes-space.css, `--theme-space-12`); they are repeated
/// here because the count has to be computed, not read back off the layout.
export const CARD_MIN = 176;
export const COLUMN_GAP = 12;

/// The most columns the board ever draws. Three is what the wireframe shows at
/// the app's reading width; past that a card would be narrower than its own
/// banner deserves.
export const MAX_COLUMNS = 3;

/// How many columns fit in `width` px.
///
/// Never fewer than two above `PAIR_FLOOR`, and that is a decision rather than
/// arithmetic (2026-08-18): a board of one column is a list, and a list loses
/// the only thing a board is for — seeing several notes at once. Below it
/// there is genuinely no room for two.
export const PAIR_FLOOR = 300;

export function columnCount(width, min = CARD_MIN, gap = COLUMN_GAP) {
  if (!(width > 0)) return 1;
  const fits = Math.floor((width + gap) / (min + gap));
  const floor = width >= PAIR_FLOOR ? 2 : 1;
  return Math.max(floor, Math.min(MAX_COLUMNS, fits));
}

/// Which items end a column: a Set of indices into `weights`.
///
/// Greedy, in order — the cards keep the arrangement the user chose and are
/// simply cut into `count` runs of roughly equal weight. A run is never left
/// empty: with fewer cards than columns each column gets one, which is the
/// case the browser's own balancing got wrong.
export function columnBreaks(weights, count) {
  const breaks = new Set();
  if (count < 2 || weights.length === 0) return breaks;
  if (weights.length <= count) {
    // One each, and nothing to balance.
    for (let i = 0; i < weights.length - 1; i++) breaks.add(i);
    return breaks;
  }

  const total = weights.reduce((sum, w) => sum + w, 0);
  let carried = 0;
  let column = 1;
  for (let i = 0; i < weights.length && column < count; i++) {
    carried += weights[i];
    // The share this column was owed, and the cards left after this one.
    const share = (total * column) / count;
    const left = weights.length - 1 - i;
    // Two reasons to end a column here. The first is the share: it has had its
    // weight, and there are still enough cards to give every column after it
    // one. The second is the one that MATTERS on a nearly empty board, and its
    // absence was the whole bug (user report, 2026-08-19 — the third column
    // stayed empty even with the breaks in place): when what is left is
    // exactly the number of columns still to fill, every remaining card has to
    // start one, whatever the shares say. Four cards into three columns never
    // reached a single share in time, so nothing broke and the browser went
    // back to balancing — which is what put them in two columns.
    if (left === count - column || (carried >= share && left >= count - column)) {
      breaks.add(i);
      column += 1;
    }
  }
  return breaks;
}

/// What a card is worth, in rough line-heights: its banner, its title, and as
/// much of its preview as the card will draw. A folder card is its own header
/// plus the small cards inside it.
export function weightOfNote(entry) {
  const preview = entry?.preview ?? "";
  const lines = Math.min(14, Math.ceil(preview.length / 34));
  return 2 + (entry?.banner ? 5 : 0) + lines;
}

export function weightOfGroup(group) {
  return 2 + Math.ceil((group?.notes?.length ?? 0) / 2) * 3;
}
