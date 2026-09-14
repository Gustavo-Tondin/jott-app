// THE GEOMETRY OF THE ACTION RING — where each slice sits around the finger,
// and which one the finger is on. Pure: no DOM, no state, so the angles can be
// read in a test. What draws them is `components/ActionRing.svelte`; what
// feeds the pointer in is `actions/reorder.js`.

/// Five is the ceiling: past it the angular target is narrower than a thumb
/// and the gesture becomes a lottery. What does not fit goes in the ⋮ slice.
export const RING_MAX = 5;
/// How far from the finger the pills sit, and the quarter they spread over.
/// The radius is what keeps five 2.75rem pills APART: at 22.5° between them,
/// the gap between two centres is 2·r·sin(11.25°), so anything under ~130
/// overlaps them (seen in the app, 2026-09-14).
export const RING_RADIUS = 148;
/// As close as the pills may ever come, and how much screen is left beyond
/// the outermost one.
const RING_MIN = 96;
const EDGE = 8;
const SPAN = 90;
/// The hole around the finger: releasing there is releasing on the card
/// itself, which cancels. Anything past `FAR` is off the ring altogether.
const DEAD = 0.45;
const FAR = 2;
/// How far outside the quarter a finger may stray and still be aiming at the
/// end slice — a thumb travelling to the first pill overshoots the axis.
const SLACK = 18;

/// The quarter the ring opens into, as the SIGN of each axis: away from the
/// edges the finger is nearest, so the pills always land on screen. A ring
/// opened at the bottom right of the phone spreads up and to the left.
export function ringQuadrant(at, viewport) {
  const w = viewport?.width ?? 0;
  const h = viewport?.height ?? 0;
  return { x: at.x > w / 2 ? -1 : 1, y: at.y > h / 2 ? -1 : 1 };
}

/// HOW FAR THE PILLS CAN SIT from this finger. The full radius wherever there
/// is room for it; on a narrow phone, as much as the quarter has — a ring that
/// opens 148 px from a finger 120 px from the edge draws its first pill off
/// the screen. Never below `RING_MIN`, under which the slices stop being
/// separate targets at all.
export function ringRadius(at, viewport, quadrant, pill = 44) {
  const acrossX = quadrant.x === 1 ? (viewport?.width ?? 0) - at.x : at.x;
  const acrossY = quadrant.y === 1 ? (viewport?.height ?? 0) - at.y : at.y;
  const room = Math.min(acrossX, acrossY) - pill / 2 - EDGE;
  return Math.max(RING_MIN, Math.min(RING_RADIUS, room));
}

/// Where each pill goes, as an offset from the finger. The first sits on the
/// horizontal axis of the quarter, the last on the vertical one; a lone slice
/// sits on the diagonal.
export function ringSlots(count, quadrant, radius = RING_RADIUS) {
  const n = Math.min(count, RING_MAX);
  return Array.from({ length: n }, (_, i) => {
    const angle = n === 1 ? SPAN / 2 : (i * SPAN) / (n - 1);
    const rad = (angle * Math.PI) / 180;
    return {
      angle,
      x: quadrant.x * radius * Math.cos(rad),
      y: quadrant.y * radius * Math.sin(rad),
    };
  });
}

/// The slice under the pointer, or null for none — which is what a release
/// reads as "cancelled". Null covers the three ways of meaning nothing: too
/// near the finger's own card, too far past the pills, and outside the
/// quarter the ring opened into.
export function ringSlotAt(at, pointer, { count, quadrant, radius = RING_RADIUS }) {
  const n = Math.min(count, RING_MAX);
  if (n < 1) return null;
  const x = (pointer.x - at.x) * quadrant.x;
  const y = (pointer.y - at.y) * quadrant.y;
  const reach = Math.hypot(x, y);
  if (reach < radius * DEAD || reach > radius * FAR) return null;
  const angle = (Math.atan2(y, x) * 180) / Math.PI;
  if (angle < -SLACK || angle > SPAN + SLACK) return null;
  if (n === 1) return 0;
  const step = SPAN / (n - 1);
  const on = Math.round(Math.min(SPAN, Math.max(0, angle)) / step);
  return Math.min(n - 1, Math.max(0, on));
}

/// The actions a ring may carry: the first five, in the order given. The rest
/// is the caller's business — in this app it is already behind the ⋮ slice.
export function fitRing(actions) {
  return (actions ?? []).slice(0, RING_MAX);
}
