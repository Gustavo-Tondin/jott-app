// THE ACTION RING, as the gesture talks to it. Holding a card opens the ring
// around the finger (`actions/reorder.js`); the same finger picks a slice and
// lets go. One ring for the whole window, drawn by `components/ActionRing.svelte`
// and registered here — the same arrangement as `services/dragLayer.js`, and
// for the same reason: handing it down as a prop would cost six components.
//
// With nobody registered (a component mounted on its own, a test) every call
// is a no-op: the gesture still resolves, it simply draws nothing.

import { fitRing, ringQuadrant, ringRadius } from "./ring.js";

let host = null;

/// The page's ring, registered by App.svelte (null on teardown).
export function setActionRing(controller) {
  host = controller ?? null;
}

/// Opens it: `{ actions, at: {x, y}, quadrant, radius }`. `actions` is what
/// the slices carry — `{ icon, label, run }`, at most `RING_MAX` of them.
export function openRing(ring) {
  host?.open(ring);
}

/// The slice under the finger this frame, or null for none.
export function hoverRing(slot) {
  host?.hover(slot);
}

export function closeRing() {
  host?.close();
}

/// THE SAME RING WITHOUT A FINGER: opened by a click (the card's ⋮ on the
/// desktop, where nothing is held), so it stays up and the slices are pressed
/// rather than travelled to. Clicking anywhere else closes it.
export function popRing({ actions, at }) {
  const slices = fitRing(actions);
  if (!slices.length) return;
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const quadrant = ringQuadrant(at, viewport);
  host?.open({
    actions: slices,
    at,
    count: slices.length,
    quadrant,
    radius: ringRadius(at, viewport, quadrant),
    sticky: true,
  });
}
