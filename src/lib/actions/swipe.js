// Swiping a card sideways. Used on the ITEM:
//   <li use:swipe={{ onLeft, onRight, leftHalf, rightHalf, leftEnabled, rightEnabled }}>
// LEFT reveals the action on the right, RIGHT the one on the left; the reveal
// is CSS (`data-swipe` + `--swipe-x`, swipe.css), committed only on release.
// The direction decides in the first pixels — the reorder owns the vertical.

import { clamp } from "../services/num.js";

/// Where a release starts to count, as a share of the card's width. An action
/// that keeps the card (`*Half`) arms halfway and the card springs back; one
/// that takes it away arms near the end, and the card leaves with it.
const HALF = 0.5;
const END = 0.7;
/// The first movement decides which gesture this is. Ahead of the axis lock the
/// card does not move at all, so a vertical drag never nudges it sideways.
const LOCK = 8;
/// How far a direction with nothing behind it gives before it stops.
const BAND = 40;
/// A card sent away that is still here this long after (the action kept it, or
/// failed) comes back.
const GONE_MS = 700;
/// Matches `--app-duration-fast`: the snap between armed and not.
const SNAP_MS = 150;
/// Matches `--app-duration-medium`: the glide home.
const RETURN_MS = 260;

export function swipe(node, params) {
  let opts = params ?? {};
  let drag = null;
  let returning = null;
  let snapping = null;
  let gone = null;

  const allowed = (dx) =>
    dx < 0 ? opts.leftEnabled !== false && !!opts.onLeft : opts.rightEnabled !== false && !!opts.onRight;
  const half = (dx) => (dx < 0 ? !!opts.leftHalf : !!opts.rightHalf);

  function paint(dx) {
    node.style.setProperty("--swipe-x", `${dx}px`);
    if (dx === 0) node.removeAttribute("data-swipe");
    else node.setAttribute("data-swipe", dx < 0 ? "left" : "right");
  }

  /// A short transition for the jump between armed and not, so the card and
  /// the square glide there instead of teleporting under the finger.
  function snap() {
    node.classList.add("swipe--snap");
    clearTimeout(snapping);
    snapping = setTimeout(() => node.classList.remove("swipe--snap"), SNAP_MS);
  }

  /// Cancels whatever the last gesture left running, before a new one starts.
  function settle() {
    clearTimeout(returning);
    clearTimeout(snapping);
    clearTimeout(gone);
    node.classList.remove("swipe--returning", "swipe--snap", "swipe--armed");
  }

  function reset() {
    const travelled = node.hasAttribute("data-swipe");
    clearTimeout(gone);
    clearTimeout(snapping);
    node.style.removeProperty("--swipe-x");
    node.classList.remove("swipe--dragging", "swipe--armed", "swipe--snap");
    if (!travelled) return;
    // The glide home is a class ADDED for the return only: a standing
    // `transition: transform` would also catch the reorder's transform. The
    // direction stays until it lands, so the square shrinks with the card.
    node.classList.add("swipe--returning");
    clearTimeout(returning);
    returning = setTimeout(() => {
      node.classList.remove("swipe--returning");
      node.removeAttribute("data-swipe");
    }, RETURN_MS);
  }

  /// Past the axis lock: the gesture is ours from here.
  function lock() {
    settle();
    drag.width = node.offsetWidth;
    drag.armed = false;
    node.classList.add("swipe--dragging");
  }

  /// The card under the finger. A direction with nothing behind it gives, but
  /// only a little — it rubber-bands instead of opening onto no action.
  function carry(dx) {
    const ok = allowed(dx);
    const x = ok ? clamp(dx, -drag.width, drag.width) : clamp(dx / 6, -BAND, BAND);
    drag.dx = x;
    const armed = ok && drag.width > 0 && Math.abs(x) >= (half(x) ? HALF : END) * drag.width;
    if (armed !== drag.armed) {
      drag.armed = armed;
      node.classList.toggle("swipe--armed", armed);
      snap();
    }
    // Armed at the end, the card is already on its way out: the square takes the row.
    paint(armed && !half(x) ? Math.sign(x) * drag.width : x);
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
      lock();
      try {
        node.setPointerCapture(drag.id);
      } catch {
        // No pointer capture (jsdom): release still resolves the gesture.
      }
    }
    carry(dx);
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
    if (!d.armed) {
      reset();
      return;
    }
    const run = dx < 0 ? opts.onLeft : opts.onRight;
    if (half(dx)) {
      reset();
    } else {
      // Gone: the square keeps the row until the list drops the card.
      node.classList.remove("swipe--dragging");
      gone = setTimeout(reset, GONE_MS);
    }
    run?.();
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
      lock();
    }
    // Ours now: the list must not scroll under it.
    e.preventDefault();
    carry(dx);
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
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", onPointerUp);
      node.removeEventListener("pointercancel", onPointerCancel);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", onTouchEnd);
      reset();
      settle();
    },
  };
}
