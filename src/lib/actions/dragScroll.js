// `use:dragScroll` — lets a MOUSE drag a horizontal scroller the way a finger
// does. It only moves `scrollLeft`: on release the scroller's own
// `scroll-snap` settles on the nearest page, so the action never decides
// where the strip lands. A drag that moved is not a click — the click that
// follows the release is swallowed once. Touch and pen are left to the browser.
export function dragScroll(node, options = {}) {
  let { threshold = 4 } = options;
  let drag = null;

  function down(event) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, left: node.scrollLeft, moved: false };
    // Snapping fights a drag in progress: the browser keeps pulling the strip
    // back to a page while the hand is still moving it. Off until release.
    node.style.scrollSnapType = "none";
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
    node.style.scrollSnapType = "";
    if (!moved) return;
    // Snap back on: the scroller lands on the nearest page on its own.
    // Nudge it, since a scroller that stopped moving does not re-snap until
    // the next scroll.
    if (typeof node.scrollBy === "function") node.scrollBy({ left: 0, behavior: "smooth" });
    const swallow = (click) => {
      click.stopPropagation();
      click.preventDefault();
    };
    node.addEventListener("click", swallow, { capture: true, once: true });
    // A release with no click after it (the pointer left the strip) must
    // not swallow the NEXT click either.
    setTimeout(() => node.removeEventListener("click", swallow, { capture: true }), 0);
  }

  node.addEventListener("pointerdown", down);
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", up);
  return {
    update(next = {}) {
      threshold = next.threshold ?? 4;
    },
    destroy() {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
    },
  };
}
