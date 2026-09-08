// Swiping a card sideways. Used on the ITEM:
//   <li use:swipe={{ onLeft, onRight, leftEnabled, rightEnabled }}>
// LEFT reveals the action on the right, RIGHT the one on the left; the reveal
// is CSS (`data-swipe` + `--swipe-x`, swipe.css), committed only on release.
// The direction decides in the first pixels — the reorder owns the vertical.

import { clamp } from "../services/num.js";

/// How far the card must travel for the release to count. Just past the point
/// where the action square is fully out, so committing and seeing it line up.
const THRESHOLD = 60;
/// And no further: past the reveal there is nothing left to show, and a card
/// that kept sliding read as the action square fighting to grow.
const MAX = 76;
/// The first movement decides which gesture this is. Ahead of the axis lock the
/// card does not move at all, so a vertical drag never nudges it sideways.
const LOCK = 8;

const held = (dx) => clamp(dx, -MAX, MAX);

export function swipe(node, params) {
  let opts = params ?? {};
  let drag = null;

  const allowed = (dx) =>
    dx < 0 ? opts.leftEnabled !== false && !!opts.onLeft : opts.rightEnabled !== false && !!opts.onRight;

  function paint(dx) {
    node.style.setProperty("--swipe-x", `${dx}px`);
    if (dx === 0) node.removeAttribute("data-swipe");
    else node.setAttribute("data-swipe", dx < 0 ? "left" : "right");
  }

  let returning = null;

  function reset() {
    const travelled = node.hasAttribute("data-swipe");
    node.style.removeProperty("--swipe-x");
    node.removeAttribute("data-swipe");
    node.classList.remove("swipe--dragging");
    if (!travelled) return;
    // The glide home is a class ADDED for the return only: a standing
    // `transition: transform` would also catch the reorder's transform.
    node.classList.add("swipe--returning");
    clearTimeout(returning);
    returning = setTimeout(() => node.classList.remove("swipe--returning"), 260);
  }

  function onPointerDown(e) {
    if (e.button !== 0 || drag) return;
    // A real control owns its own press; anything else opts out with
    // `data-no-swipe`. NOT `<button>`: the card's title is one, covering it.
    if (e.target.closest("input, select, textarea, a, [data-no-swipe]")) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null };
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;

    if (!drag.axis) {
      // A reorder already has this pointer (held long enough to be picked
      // up): a second `setPointerCapture` would leave the first action deaf.
      if (node.closest("[data-reordering]")) {
        drag = null;
        return;
      }
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      // Whichever way it went first is the gesture; the other one is not ours.
      drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (drag.axis !== "x") {
        drag = null;
        return;
      }
      node.classList.add("swipe--dragging");
      try {
        node.setPointerCapture(drag.id);
      } catch {
        // No pointer capture (jsdom): release still resolves the gesture.
      }
    }

    // A direction with nothing behind it gives, but only a little — the card
    // rubber-bands instead of sliding open onto an action that is not there.
    drag.dx = held(allowed(dx) ? dx : dx / 6);
    paint(drag.dx);
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    try {
      node.releasePointerCapture(d.id);
    } catch {
      // ignore
    }
    if (d.axis !== "x") return;

    // Swallow the click WebKit fires next, so a swipe never also opens the card.
    const swallow = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      node.removeEventListener("click", swallow, true);
    };
    node.addEventListener("click", swallow, true);
    if (typeof requestAnimationFrame === "function")
      requestAnimationFrame(() => node.removeEventListener("click", swallow, true));

    const dx = d.dx ?? 0;
    reset();
    if (!allowed(dx) || Math.abs(dx) < THRESHOLD) return;
    if (dx < 0) opts.onLeft?.();
    else opts.onRight?.();
  }

  function onPointerCancel() {
    // A gesture the touch path has taken over survives this: past the axis
    // lock the card is being carried sideways by `touchmove`, and the cancel
    // is only the browser saying its scroller gave up on the pointer.
    if (!drag || drag.touch) return;
    drag = null;
    reset();
  }

  /// A FINGER DRIVES THIS BY TOUCH EVENTS: over a list that scrolls, the
  /// WebView fires `pointercancel` two moves in, while `touchmove`s keep
  /// coming and `preventDefault()` on them takes the gesture back. A mouse
  /// keeps the pointer path. See docs/platform-gotchas.md#webview-e-gestos
  function onTouchMove(e) {
    if (!drag) return;
    const t = e.changedTouches[0];
    if (!t) return;
    drag.touch = true;
    const dx = t.clientX - drag.x;
    const dy = t.clientY - drag.y;
    if (!drag.axis) {
      // The reorder has the card: not ours.
      if (node.closest("[data-reordering]")) {
        drag = null;
        return;
      }
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (drag.axis !== "x") {
        drag = null;
        return;
      }
      node.classList.add("swipe--dragging");
    }
    // Ours now: the list must not scroll under it.
    e.preventDefault();
    drag.dx = held(allowed(dx) ? dx : dx / 6);
    paint(drag.dx);
  }

  function onTouchEnd() {
    if (!drag || !drag.touch) return;
    onPointerUp({ pointerId: drag.id });
  }

  node.addEventListener("pointerdown", onPointerDown);
  node.addEventListener("pointermove", onPointerMove);
  node.addEventListener("pointerup", onPointerUp);
  node.addEventListener("pointercancel", onPointerCancel);
  // `passive: false`, because a passive listener may not call
  // `preventDefault` — which is the only thing that takes the gesture back.
  node.addEventListener("touchmove", onTouchMove, { passive: false });
  node.addEventListener("touchend", onTouchEnd);
  node.addEventListener("touchcancel", onTouchEnd);

  // Marks the card as owning the horizontal gesture, so drawerSwipe keeps off
  // it. Set by the action, so any future user of `swipe` is excluded too.
  node.dataset.swipes = "x";

  return {
    update(next) {
      opts = next ?? {};
    },
    destroy() {
      delete node.dataset.swipes;
      clearTimeout(returning);
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", onPointerUp);
      node.removeEventListener("pointercancel", onPointerCancel);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", onTouchEnd);
      reset();
    },
  };
}
