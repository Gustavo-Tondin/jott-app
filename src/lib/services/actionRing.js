// THE ACTION RING, as the gesture talks to it. Holding a card opens its
// actions beside the finger (`actions/reorder.js`); the same finger slides
// onto a row and lets go. One sheet for the whole window, drawn by
// `components/ActionRing.svelte` and registered here — the same arrangement
// as `services/dragLayer.js`, and for the same reason: handing it down as a
// prop would cost six components.
//
// With nobody registered (a component mounted on its own, a test) every call
// is a no-op: the gesture still resolves, it simply draws nothing.

import { RING_CLICK_REACH, fitRing, ringBox, ringQuadrant } from "./ring.js";

let host = null;

/// The page's ring, registered by App.svelte (null on teardown).
export function setActionRing(controller) {
  host = controller ?? null;
}

/// Opens it: `{ actions, at: {x, y}, quadrant, box }`. `actions` is what the
/// rows carry — `{ icon, label, run }`, at most `RING_MAX` of them.
export function openRing(ring) {
  host?.open(ring);
}

/// The row under the finger this frame, or null for none.
export function hoverRing(slot) {
  host?.hover(slot);
}

export function closeRing() {
  host?.close();
}

/// RUNS A SLICE ONE STEP AFTER THE COLUMN CLOSES. Closing is a state change,
/// and so is the panel a slice like "Edit" opens: in the same pass, a panel
/// that throws on the way up takes the column's removal down with it and the
/// column stands over every screen, dismissable by nothing. The microtask
/// queued here runs after the redraw that closing asked for.
export function afterRingCloses(run) {
  if (typeof queueMicrotask === "function") queueMicrotask(run);
  else run();
}

/// THE SAME SHEET WITHOUT A FINGER: opened by a click (the card's ⋮ on the
/// desktop, where nothing is held), so it stays up and the rows are pressed
/// rather than slid onto. Clicking anywhere else closes it.
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
    box: ringBox(at, viewport, slices.length, quadrant, RING_CLICK_REACH),
    sticky: true,
  });
}
