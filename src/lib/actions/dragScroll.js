// `use:dragScroll` — a horizontal scroller dragged by hand. It only moves
// `scrollLeft`: on release the scroller's own `scroll-snap` settles on the
// nearest page, so the action never decides where the strip lands. A drag that
// moved is not a click — the click that follows the release is swallowed once.
//
// A MOUSE goes by pointer events. A FINGER has to be carried by `touchmove`
// and `preventDefault`: inside the compact shell the browser is told to keep
// only the vertical pan (`touch-action: pan-y`, shell.css), which no
// descendant can hand back. `data-swipes` keeps drawerSwipe off the strip.
// See docs/platform-gotchas.md#webview-e-gestos

/// The first movement decides which gesture this is.
const LOCK = 8;
/// A finger carried by script has no momentum of its own, so the release has
/// to answer for it: past this speed (px per ms) the direction is the answer
/// however short the travel — which is how a strip is actually flicked.
const FLICK = 0.5;
/// …or the drag simply got this far into the next page.
const COMMIT = 0.25;

export function dragScroll(node, options = {}) {
  let { threshold = 4 } = options;
  let drag = null;
  let touch = null;

  /// Snapping fights a drag in progress: the browser keeps pulling the strip
  /// back to a page while the hand is still moving it. Off until release.
  function hold() {
    node.style.scrollSnapType = "none";
  }
  /// Snap back on: the scroller lands on the nearest page on its own. Nudge
  /// it, since a scroller that stopped moving does not re-snap until the next
  /// scroll.
  function release() {
    node.style.scrollSnapType = "";
    if (typeof node.scrollBy === "function") node.scrollBy({ left: 0, behavior: "smooth" });
  }

  /// The release moved the strip: the click it produces is not a day being
  /// picked.
  function swallowClick() {
    const swallow = (click) => {
      click.stopPropagation();
      click.preventDefault();
    };
    node.addEventListener("click", swallow, { capture: true, once: true });
    // A release with no click after it (the pointer left the strip) must
    // not swallow the NEXT click either.
    setTimeout(() => node.removeEventListener("click", swallow, { capture: true }), 0);
  }

  // ---- the mouse ----
  function down(event) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, left: node.scrollLeft, moved: false };
    hold();
  }

  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < threshold) return;
    if (!drag.moved) {
      drag.moved = true;
      node.setPointerCapture?.(drag.id);
    }
    event.preventDefault();
    node.scrollLeft = drag.left - dx;
  }

  function up(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    release();
    if (moved) swallowClick();
  }

  // ---- the finger ----
  function touchStart(event) {
    // A second finger is a pinch, never this.
    if (event.touches.length !== 1) return letGo();
    const t = event.touches[0];
    touch = {
      x: t.clientX,
      y: t.clientY,
      left: node.scrollLeft,
      at: event.timeStamp,
      dx: 0,
      axis: null,
    };
  }

  function touchMove(event) {
    if (!touch) return;
    if (event.touches.length !== 1) return letGo();
    const t = event.touches[0];
    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;
    if (!touch.axis) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      // Vertical is the head's fold, not ours. And a move the browser will not
      // let us cancel is one it is already scrolling with: leaving it alone
      // beats moving the strip twice.
      if (Math.abs(dy) >= Math.abs(dx) || !event.cancelable) {
        touch = null;
        return;
      }
      touch.axis = "x";
      hold();
    }
    event.preventDefault();
    touch.dx = dx;
    node.scrollLeft = touch.left - dx;
  }

  function touchEnd(event) {
    if (!touch) return;
    const settled = touch;
    touch = null;
    if (settled.axis !== "x") return;
    release();
    land(settled, event?.timeStamp);
    swallowClick();
  }

  /// Where the release lands. A page is the scroller's own width, and the page
  /// it started on is the one it goes back to unless the hand meant the next:
  /// a flick, or a drag already a quarter of the way there.
  function land(settled, at) {
    const page = node.clientWidth;
    if (!page || typeof node.scrollTo !== "function") return;
    const elapsed = Math.max(1, (at ?? settled.at) - settled.at);
    const meant =
      Math.abs(settled.dx) / elapsed > FLICK || Math.abs(settled.dx) > page * COMMIT;
    if (!meant) return;
    const from = Math.round(settled.left / page);
    const last = Math.max(0, Math.round(node.scrollWidth / page) - 1);
    const to = Math.min(last, Math.max(0, from + (settled.dx < 0 ? 1 : -1)));
    node.scrollTo({ left: to * page, behavior: "smooth" });
  }

  function letGo() {
    if (touch?.axis === "x") release();
    touch = null;
  }

  node.addEventListener("pointerdown", down);
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", up);
  node.addEventListener("touchstart", touchStart, { passive: true });
  // `passive: false`, because a passive listener may not call
  // `preventDefault` — the only thing that takes the gesture back.
  node.addEventListener("touchmove", touchMove, { passive: false });
  node.addEventListener("touchend", touchEnd);
  node.addEventListener("touchcancel", letGo);

  // Marks the strip as owning the sideways gesture, so drawerSwipe keeps off
  // it: without this a drag here opens the sidebar instead.
  node.dataset.swipes = "x";

  return {
    update(next = {}) {
      threshold = next.threshold ?? 4;
    },
    destroy() {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
      node.removeEventListener("touchstart", touchStart);
      node.removeEventListener("touchmove", touchMove);
      node.removeEventListener("touchend", touchEnd);
      node.removeEventListener("touchcancel", letGo);
      delete node.dataset.swipes;
    },
  };
}
