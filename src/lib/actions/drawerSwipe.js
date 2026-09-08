// The sidebar drawer by drag: right from an EMPTY area opens, left anywhere
// closes. Listens on the DOCUMENT in capture phase and declines a target that
// already owns a sideways drag (`[data-swipes]`, sheets, modals, text under a
// mouse). A finger goes by touch events (docs/platform-gotchas.md#webview-e-gestos).
//   <div class="shell" use:drawerSwipe={{ enabled, open, onOpen, onClose, onDrag }}>

import { clamp } from "../services/num.js";

/// What already owns a sideways drag: cards carrying actions/swipe.js, and the
/// surfaces raised OVER the shell, whose own content may slide sideways.
const CLAIMED =
  "[data-swipes], .sheet, .sheet-scrim, .theme-modal, .theme-modal-backdrop," +
  " .theme-popover";
/// …and what only a MOUSE claims: text, where dragging selects. A finger does
/// not select by dragging, and the left edge is the system's back gesture on
/// Android — so touch must open the drawer from over the content (an editor
/// filling the screen included). See docs/platform-gotchas.md#android
const CLAIMED_BY_MOUSE = "input, textarea, [contenteditable], .cm-editor";
/// The first movement decides which gesture this is. Ahead of the lock nothing
/// moves at all, so a vertical scroll never nudges the drawer sideways.
const LOCK = 8;
/// How far the drawer must travel AWAY FROM WHERE THE DRAG STARTED for letting
/// go to commit — from the start, not the closed end, so closing reads right too.
const COMMIT = 0.4;
/// …unless it was a flick: px per ms, past which the direction is taken as the
/// answer however short the travel. Without it a quick, small flick — which is
/// how a drawer is actually opened — springs back and reads as a dead gesture.
const FLICK = 0.5;

export function drawerSwipe(node, params) {
  let opts = params ?? {};
  let drag = null;
  /// The mouse pointer being followed, if any. Touch needs none: a one-finger
  /// gesture is identified by there being one finger.
  let pointer = null;

  /// How far the drawer travels: MEASURED, never restated — its width is a rem
  /// token (`--app-drawer-width`). The fallback is for a drag before the mount.
  const width = () =>
    document.querySelector(opts.target ?? ".shell__sidebar--drawer")?.offsetWidth ||
    240;

  /// Engage, or decline. Returns whether the gesture is now ours to watch;
  /// `mouse` decides whether text counts as claimed (CLAIMED_BY_MOUSE).
  function begin(target, x, y, at, mouse = false) {
    if (opts.enabled === false) return false;
    const open = !!opts.open;
    // Closed: only from an area that does not already own a sideways drag.
    // Open: from anywhere, because the only things reachable are the drawer
    // and the scrim over the page.
    const claimed = mouse ? `${CLAIMED}, ${CLAIMED_BY_MOUSE}` : CLAIMED;
    const owner = open ? null : target?.closest?.(claimed);
    if (owner) return false;
    drag = { x, y, at, axis: null, travel: 0, open };
    return true;
  }

  /// Follow. Returns true once the gesture is ours for good — which is the
  /// signal the touch path needs, because that is the moment it has to call
  /// `preventDefault` to stop the browser taking it back.
  function follow(x, y) {
    if (!drag) return false;
    const dx = x - drag.x;
    const dy = y - drag.y;

    if (!drag.axis) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return false;
      // Vertical wins outright: the page under a drawer still scrolls, and a
      // list that stops scrolling because a drawer was listening is worse than
      // a drawer that needs a straighter swipe.
      if (Math.abs(dy) > Math.abs(dx)) {
        drag = null;
        return false;
      }
      drag.axis = "x";
    }

    // Where the drawer is, in px from its closed position. Opening counts up
    // from 0, closing counts down from its full width; neither goes past the
    // ends, so the drawer never overshoots its own wall.
    const from = drag.open ? width() : 0;
    drag.travel = clamp(from + dx, 0, width());
    opts.onDrag?.(drag.travel);
    return true;
  }

  /// Let go: commit, or spring back.
  function finish(x, at) {
    const settled = drag;
    drag = null;
    if (!settled || !settled.axis) return;

    opts.onDrag?.(null);
    const dx = x - settled.x;
    const elapsed = Math.max(1, at - settled.at);
    const flicked = Math.abs(dx) / elapsed > FLICK;
    // A flick is answered by its DIRECTION; a slow drag by HOW FAR IT GOT from
    // where it started. `flips` is "it went far enough to mean it", and the
    // state it lands in is simply the other one.
    const span = width();
    const away = Math.abs(settled.travel - (settled.open ? span : 0));
    const flips = away > span * COMMIT;
    const open = flicked ? dx > 0 : settled.open !== flips;
    if (open) opts.onOpen?.();
    else opts.onClose?.();
  }

  function abandon() {
    if (!drag) return;
    drag = null;
    opts.onDrag?.(null);
  }

  // ---- the finger ----
  function touchStart(event) {
    // A second finger is a pinch or a two-finger scroll, never this.
    if (event.touches.length !== 1) return abandon();
    const t = event.touches[0];
    begin(event.target, t.clientX, t.clientY, event.timeStamp);
  }

  function touchMove(event) {
    if (!drag) return;
    if (event.touches.length !== 1) return abandon();
    const t = event.touches[0];
    if (follow(t.clientX, t.clientY) && event.cancelable) {
      // Without this the WebView takes the gesture and fires `pointercancel`.
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function touchEnd(event) {
    if (!drag) return;
    const t = event.changedTouches[0];
    finish(t?.clientX ?? drag.x, event.timeStamp);
  }

  // ---- the mouse (and a stylus) ----
  // Pointer events are right here: nothing in the browser competes for a mouse
  // drag, and capture is what keeps it alive when the cursor leaves the node.
  function pointerDown(event) {
    if (event.pointerType === "touch") return;
    if (!event.isPrimary || event.button !== 0) return;
    if (begin(event.target, event.clientX, event.clientY, event.timeStamp, true))
      pointer = event.pointerId;
  }

  function pointerMove(event) {
    if (pointer === null || event.pointerId !== pointer) return;
    if (follow(event.clientX, event.clientY)) {
      node.setPointerCapture?.(pointer);
      event.stopPropagation();
    }
  }

  function pointerUp(event) {
    if (pointer === null || event.pointerId !== pointer) return;
    node.releasePointerCapture?.(pointer);
    pointer = null;
    finish(event.clientX, event.timeStamp);
  }

  function pointerCancel() {
    // Only the mouse path answers this. The touch path deliberately does not:
    // `pointercancel` is exactly what the WebView sends when it wants the
    // gesture, and obeying it would undo the drag just taken back.
    if (pointer === null) return;
    pointer = null;
    abandon();
  }

  // ON THE DOCUMENT: the drawer and the scrim render outside the shell
  // (App.svelte), so an open drawer's closing gesture never lands in the node.
  // Capture phase, so whose gesture it is gets decided before a card sees it;
  // `passive: false`, because a passive listener may not `preventDefault`.
  const LISTEN = { capture: true, passive: false };
  const handlers = [
    ["touchstart", touchStart],
    ["touchmove", touchMove],
    ["touchend", touchEnd],
    ["touchcancel", abandon],
    ["pointerdown", pointerDown],
    ["pointermove", pointerMove],
    ["pointerup", pointerUp],
    ["pointercancel", pointerCancel],
  ];
  const on = node.ownerDocument ?? document;
  for (const [type, fn] of handlers) on.addEventListener(type, fn, LISTEN);

  return {
    update(next) {
      opts = next ?? {};
      // Turned off mid-drag (the window widened out of the compact shell):
      // let go of whatever was in flight rather than leaving it half open.
      if (opts.enabled === false) abandon();
    },
    destroy() {
      for (const [type, fn] of handlers) on.removeEventListener(type, fn, LISTEN);
    },
  };
}
