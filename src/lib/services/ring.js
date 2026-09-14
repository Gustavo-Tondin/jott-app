// WHERE A CARD'S ACTIONS SIT — the column of squares that opens beside the
// finger, and which of them the finger is on. Pure: no DOM, no state, so the geometry
// can be read in a test. What draws it is `components/ActionRing.svelte`; what
// feeds the pointer in is `actions/reorder.js`.

import { clamp } from "./num.js";

/// Five is the ceiling: past it the column is taller than a thumb travels
/// comfortably, and it stops being a glance. What does not fit goes behind
/// the last square, the ⋮, which opens the menu proper.
export const RING_MAX = 5;

/// The column in CSS pixels: the square of one action, and the step from one
/// to the next — the square plus the gap that keeps them separate things.
/// MIRRORED by styles/components/action-ring.css; drawn any other size, a
/// square lights up under a finger that is on its neighbour.
export const RING_ITEM = 44;
export const RING_STEP = 52;

/// How far the sheet stands off the finger, and the dead square around it.
/// The sheet may not open UNDER the finger: the hold would already be resting
/// on a row, and letting go there is what cancels.
const GAP = 24;
/// Opened by a CLICK there is no finger over the card, so the sheet sits at
/// the pointer the way every other menu in the app does.
export const RING_CLICK_GAP = 4;
/// The margin the sheet keeps off the window's edges.
const EDGE = 8;
/// How far off the column the pointer may stray and still hold the square it
/// left. Wider than it looks on purpose: a column of squares is a narrow
/// thing, and a thumb sliding down it wanders sideways.
const SLACK = 32;

/// The quarter the sheet grows into, as the SIGN of each axis: away from the
/// edges the finger is nearest, so it always lands on screen. A sheet opened
/// at the bottom right of the phone grows up and to the left.
export function ringQuadrant(at, viewport) {
  const w = viewport?.width ?? 0;
  const h = viewport?.height ?? 0;
  return { x: at.x > w / 2 ? -1 : 1, y: at.y > h / 2 ? -1 : 1 };
}

/// The size a column of `count` squares takes — the last one carries no gap.
export function ringSize(count) {
  const n = Math.min(count, RING_MAX);
  return { width: RING_ITEM, height: n * RING_STEP - (RING_STEP - RING_ITEM) };
}

/// WHERE THE COLUMN GOES, in client coordinates. Beside the finger, growing
/// into the quarter with room; a side too tight for it flips to the other
/// rather than draw off the screen, and whatever still hangs off is pulled in.
/// The NAME of an action is not in here: it is drawn beside the square the
/// finger is on, outside the column, and nothing is aimed at it.
export function ringBox(at, viewport, count, quadrant, gap = GAP) {
  const { width, height } = ringSize(count);
  const vw = viewport?.width ?? 0;
  const vh = viewport?.height ?? 0;
  let x = quadrant.x === 1 ? at.x + gap : at.x - gap - width;
  let y = quadrant.y === 1 ? at.y + gap : at.y - gap - height;
  if (x + width > vw - EDGE) x = at.x - gap - width;
  if (x < EDGE) x = at.x + gap;
  if (y + height > vh - EDGE) y = at.y - gap - height;
  if (y < EDGE) y = at.y + gap;
  return {
    x: clamp(x, EDGE, Math.max(EDGE, vw - width - EDGE)),
    y: clamp(y, EDGE, Math.max(EDGE, vh - height - EDGE)),
    width,
    height,
  };
}

/// The middle of a square — the inverse of `ringSlotAt`, and where the
/// squares are aimed at from a test.
export function ringRowCenter(box, index) {
  return {
    x: box.x + RING_ITEM / 2,
    y: box.y + index * RING_STEP + RING_ITEM / 2,
  };
}

/// The square under the pointer, or null for none — which is what a release
/// reads as "cancelled". Null covers the two ways of meaning nothing: never
/// having left the card the finger is on, and being off the column
/// altogether. The gap between two squares belongs to the one ABOVE it: a
/// thumb crossing it has not let go of anything.
export function ringSlotAt(at, pointer, { count, box }) {
  const n = Math.min(count, RING_MAX);
  if (n < 1 || !box) return null;
  if (Math.abs(pointer.x - at.x) <= GAP && Math.abs(pointer.y - at.y) <= GAP) return null;
  const dx = Math.max(box.x - pointer.x, 0, pointer.x - (box.x + box.width));
  const dy = Math.max(box.y - pointer.y, 0, pointer.y - (box.y + box.height));
  if (Math.hypot(dx, dy) > SLACK) return null;
  return clamp(Math.floor((pointer.y - box.y) / RING_STEP), 0, n - 1);
}

/// The actions a sheet may carry: the first five, in the order given. The
/// rest is the caller's business — in this app it is already behind the ⋮.
export function fitRing(actions) {
  return (actions ?? []).slice(0, RING_MAX);
}
