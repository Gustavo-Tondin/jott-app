// Turning the page sideways: a horizontal swipe over a screen that has a
// neighbour on that side (the Tasks screen's Inbox → Today → Week).
//
// Used on the box that holds the pane:
//   <div class="tasks-view" use:paneSwipe={{ enabled, canPrev, canNext, onPrev, onNext }}>
//
//   swipe left  → onNext   (the page to the RIGHT comes in — the finger pushes
//                           the current one out to the left)
//   swipe right → onPrev
//
// While the finger is down the pane FOLLOWS it: the action writes `--pane-x`
// on the node and marks it `is-turning`, and the stylesheet translates the
// pane by that much (tasks-view.css). Nothing is committed until release;
// short of the threshold the pane glides home and nothing happened — the same
// pact actions/swipe.js keeps for a card.
//
// NOT actions/swipe.js, and not actions/drawerSwipe.js either, though it is
// built like the second. The card clamps at 76px and reports a side; the
// drawer travels a measured 240px and has to arrive under the hand; this one
// follows the finger across the whole pane and answers with a page turn. The
// shape is the same, the numbers and the answer are not.
//
// THE DRAWER AND THIS ONE SHARE THE SAME SWIPE, and the conflict is settled
// before anything moves. drawerSwipe listens on the document, in the capture
// phase, and yields every drag that starts on an element marked
// `data-swipes`. This action puts that mark on its node — but QUALIFIED by
// direction: `data-swipes="left"` when only a next page exists, `"right"` when
// only a previous one does, and the plain mark when both do. The drawer reads
// the qualifier at its axis lock and steps aside only for the direction this
// pane can use, so on the Inbox a swipe to the right still opens the sidebar
// (there is no page before the Inbox), and on Week a swipe to the right turns
// back to Today. A card inside the pane carries its own `data-swipes`, and a
// drag that starts on one is its — this action checks that the NEAREST mark
// is its own node before engaging.
//
// Touch events on a finger, pointer events on a mouse — for the reason
// drawerSwipe.js measured on the device: a horizontal drag over a scrolling
// panel is one the WebView claims with `pointercancel` two moves in, and only
// a `preventDefault` on a `touchmove` takes it back.

import { clamp } from "../services/num.js";

/// What a drag that starts here never means — the same list the drawer keeps.
const CLAIMED_BY_MOUSE = "input, textarea, [contenteditable], .cm-editor";
const RAISED = ".sheet, .sheet-scrim, .theme-modal, .theme-modal-backdrop, .theme-popover";
/// The first movement decides which gesture this is.
const LOCK = 8;
/// How much of the pane's width the drag has to cover for release to turn the
/// page; past this, letting go commits.
const COMMIT = 0.3;
/// …unless it was a flick (px per ms), which is answered by its direction.
const FLICK = 0.5;
/// A pane with no page on the side being dragged towards still follows the
/// finger, but at a fraction — the rubber band that says "nothing there".
const RESIST = 0.25;

export function paneSwipe(node, params) {
  let opts = params ?? {};
  let drag = null;
  let pointer = null;

  /// What this pane claims, written where the drawer reads it.
  function mark() {
    const prev = opts.enabled !== false && !!opts.canPrev;
    const next = opts.enabled !== false && !!opts.canNext;
    if (!prev && !next) node.removeAttribute("data-swipes");
    else node.setAttribute("data-swipes", prev && next ? "x" : prev ? "right" : "left");
  }

  let settling = null;

  function paint(dx) {
    if (dx === null) {
      node.style.removeProperty("--pane-x");
      node.classList.remove("is-turning", "is-settling");
      return;
    }
    clearTimeout(settling);
    node.classList.remove("is-settling");
    node.style.setProperty("--pane-x", `${dx}px`);
    node.classList.add("is-turning");
  }

  /// Let go short of the mark: the pane glides home. A class ADDED for the
  /// glide and taken off after it, never a standing transition — the
  /// stylesheet says why (tasks-view.css): a standing transform on the pane
  /// would hold every `position: fixed` descendant hostage.
  function settle() {
    node.classList.remove("is-turning");
    node.classList.add("is-settling");
    node.style.setProperty("--pane-x", "0px");
    clearTimeout(settling);
    settling = setTimeout(() => paint(null), 300);
  }

  function begin(target, x, y, at, mouse = false) {
    if (opts.enabled === false) return false;
    if (!opts.canPrev && !opts.canNext) return false;
    if (target?.closest?.("[data-swipes]") !== node) return false;
    if (target?.closest?.(RAISED)) return false;
    if (mouse && target?.closest?.(CLAIMED_BY_MOUSE)) return false;
    drag = { x, y, at, axis: null, dx: 0 };
    return true;
  }

  /// Returns true once the gesture is ours — the cue for the touch path to
  /// call `preventDefault`.
  function follow(x, y) {
    if (!drag) return false;
    const dx = x - drag.x;
    const dy = y - drag.y;
    if (!drag.axis) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return false;
      if (Math.abs(dy) > Math.abs(dx)) {
        drag = null;
        return false;
      }
      drag.axis = "x";
    }
    const room = dx < 0 ? opts.canNext : opts.canPrev;
    const width = node.offsetWidth || 360;
    drag.dx = room ? clamp(dx, -width, width) : dx * RESIST;
    paint(drag.dx);
    return true;
  }

  function finish(x, at) {
    const settled = drag;
    drag = null;
    if (!settled || !settled.axis) return;
    const dx = x - settled.x;
    const elapsed = Math.max(1, at - settled.at);
    const flicked = Math.abs(dx) / elapsed > FLICK;
    const width = node.offsetWidth || 360;
    const far = Math.abs(dx) > width * COMMIT;
    const turns = (flicked || far) && (dx < 0 ? !!opts.canNext : !!opts.canPrev);
    if (!turns) return settle();
    paint(null);
    if (dx < 0) opts.onNext?.();
    else opts.onPrev?.();
  }

  function abandon() {
    if (!drag) return;
    drag = null;
    paint(null);
  }

  // ---- the finger ----
  function touchStart(event) {
    if (event.touches.length !== 1) return abandon();
    const t = event.touches[0];
    begin(event.target, t.clientX, t.clientY, event.timeStamp);
  }
  function touchMove(event) {
    if (!drag) return;
    if (event.touches.length !== 1) return abandon();
    const t = event.touches[0];
    if (follow(t.clientX, t.clientY) && event.cancelable) {
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
    if (pointer === null) return;
    pointer = null;
    abandon();
  }

  const LISTEN = { passive: false };
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
  for (const [type, fn] of handlers) node.addEventListener(type, fn, LISTEN);
  mark();

  return {
    update(next) {
      opts = next ?? {};
      mark();
      if (opts.enabled === false) abandon();
    },
    destroy() {
      for (const [type, fn] of handlers) node.removeEventListener(type, fn, LISTEN);
      node.removeAttribute("data-swipes");
      clearTimeout(settling);
      paint(null);
    },
  };
}
