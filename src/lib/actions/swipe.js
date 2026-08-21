// Swiping a card sideways, as a reusable Svelte action.
//
// Two actions live on the same card and must not fight: reordering (vertical)
// and this one (horizontal). **The direction decides**, in the first few
// pixels, and each drops the gesture the moment it sees the other's axis.
//
// It has to be that clean, because both would otherwise call
// `setPointerCapture` on the same pointer — and the second capture leaves the
// first deaf to every move that follows. That was the drag that froze and then
// snapped back (user report, 2026-08-06); a press-and-hold was tried first and
// made it worse, since holding does not stop the other action from engaging.
//
// Used on the ITEM:
//   <li use:swipe={{ onLeft, onRight, leftEnabled, rightEnabled }}>
//
// LEFT reveals the action on the right (delete), RIGHT reveals the one on the
// left (take out of the day) — the direction the card travels uncovers the side
// it travels away from, which is how every list on a phone behaves.
//
// The reveal itself is CSS: the action carries `data-swipe` with the direction
// and `--swipe-x` with how far, and swipe.css does the rest. Nothing is
// committed until release: released short of the threshold, the card comes
// back and nothing happened.

import { clamp } from "../services/num.js";

/// How far the card must travel for the release to count. Just past the point
/// where the action square is fully out, so committing and seeing it line up.
const THRESHOLD = 60;
/// And no further. Without a stop the card kept sliding while the square, which
/// is already at full size, sat there being re-measured every frame — it read
/// as the square fighting to grow (user report, 2026-08-06). Past the reveal
/// there is nothing left to show, so the gesture stops moving.
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
    // The glide home is a class we ADD, never a transition the card carries
    // all the time: a standing `transition: transform` also caught the reorder
    // writing its own transform, so every drag played out a quarter second
    // late (user report, 2026-08-06). Now nothing animates unless a swipe is
    // actually coming back.
    node.classList.add("swipe--returning");
    clearTimeout(returning);
    returning = setTimeout(() => node.classList.remove("swipe--returning"), 260);
  }

  function onPointerDown(e) {
    if (e.button !== 0 || drag) return;
    // A real control owns its own press: sliding the card out from under the
    // checkbox you are about to tick would be a trap. Anything else marks
    // itself `data-no-swipe`.
    //
    // What is NOT excluded is every `<button>`, which is what the first
    // version said (2026-08-06) — and the card's TITLE is a button covering
    // most of its width, so the gesture could only start from the thin padding
    // around it and looked broken everywhere. The title is the card's own
    // surface: clicking it does what clicking the card does.
    if (e.target.closest("input, select, textarea, a, [data-no-swipe]")) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null };
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;

    if (!drag.axis) {
      // A reorder already has this pointer: the finger rested on the card long
      // enough to pick it up (reorder.js, HOLD_MS), and it is now being
      // carried. Taking the gesture here would be the second
      // `setPointerCapture` on one pointer, which leaves the first action deaf
      // to every move that follows — the frozen drag of 2026-08-06, which is
      // also why press-and-hold failed the first time it was tried. Reading
      // the mark the container raises is what makes holding safe now.
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

  /// A FINGER DRIVES THIS BY TOUCH EVENTS, measured on the running app
  /// (2026-08-19): a sideways drag over a list that scrolls vertically gets
  /// `pointerdown, pointermove, pointercancel` and nothing more — the browser
  /// claims the gesture two moves in, so the card never moved at all on a
  /// phone. The `touchmove`s keep coming, and a `preventDefault()` on them is
  /// what takes the gesture back. Exactly what the drawer's swipe documents
  /// (actions/drawerSwipe.js) and what the reorder needed for the same reason.
  ///
  /// A mouse keeps the pointer path: there is no scroller competing for it.
  function onTouchMove(e) {
    if (!drag) return;
    const t = e.changedTouches[0];
    if (!t) return;
    drag.touch = true;
    const dx = t.clientX - drag.x;
    const dy = t.clientY - drag.y;
    if (!drag.axis) {
      // The reorder has the card (it was held long enough to be picked up):
      // the gesture is not ours, and taking it would leave both half-driving
      // the same finger — the frozen drag of 2026-08-06.
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

  // Marks the card as owning the horizontal gesture, so the drawer's swipe
  // (actions/drawerSwipe.js) knows to keep its hands off it: the sidebar opens
  // from an EMPTY area, and a card is not one (user call, 2026-08-18). Set by
  // the action rather than written into every card's markup, so any future
  // user of `swipe` is excluded the moment it starts using it.
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
