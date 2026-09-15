// `use:dragScroll` — a horizontal carrousel dragged by hand, landing square on
// a page. The hand carries the strip; the release throws it: past a little
// speed the strip glides on, slowing down, and the page it stops on is the one
// the throw reached. It never stops between pages.
//
// A MOUSE goes by pointer events. A FINGER has to be carried by `touchmove`
// and `preventDefault`: inside the compact shell the browser is told to keep
// only the vertical pan (`touch-action: pan-y`, shell.css), which no
// descendant can hand back — and with the pan goes the momentum a finger
// expects, which is why the glide below is ours to draw. `data-swipes` keeps
// drawerSwipe off the strip.
// See docs/platform-gotchas.md#webview-e-gestos

/// The first movement decides which gesture this is.
const LOCK = 8;
/// px per ms, past which the release counts as a throw rather than a let-go.
const FLICK = 0.25;
/// How fast a throw loses speed, px per ms². It is what decides how far a
/// flick carries: a hard one (2 px/ms) travels some two pages, a gentle one
/// barely one.
const DECAY = 0.0035;
/// A throw can only land on a page the carrousel is holding.
const GLIDE_MIN = 200;
const GLIDE_MAX = 620;
/// How far back the speed is read from: the last instant of the drag, not its
/// average — a hand that stopped before letting go threw nothing.
const SAMPLE_MS = 100;
/// A drag with no throw behind it still turns the page once it got this far.
const COMMIT = 0.25;

export function dragScroll(node, options = {}) {
  let { threshold = 4 } = options;
  let drag = null;
  let touch = null;
  let gliding = null;

  const pageWidth = () => node.clientWidth;
  const still = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /// Snapping fights a drag in progress: the browser keeps pulling the strip
  /// back to a page while the hand is still moving it. Off until the strip
  /// has landed.
  function hold() {
    stopGlide();
    node.style.scrollSnapType = "none";
  }
  /// The strip is on the move: what the fade at its edges reads. Written only
  /// once the strip is actually travelling, so a press that picks a day never
  /// dims the two at the ends.
  function moving() {
    node.dataset.scrolling = "";
  }
  /// Snap back on: the strip is already square on a page, so this only hands
  /// the last word back to the browser. Nudge it, since a scroller that
  /// stopped moving does not re-snap until the next scroll.
  function release() {
    node.style.scrollSnapType = "";
    delete node.dataset.scrolling;
    if (typeof node.scrollBy === "function") node.scrollBy({ left: 0, behavior: "smooth" });
  }

  function stopGlide() {
    if (gliding !== null) cancelAnimationFrame(gliding);
    gliding = null;
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

  /// Keeps the last instant of the drag — the two or more points inside
  /// `SAMPLE_MS` — which is what the speed of the release is read from.
  function sample(state, x, at) {
    state.track.push({ x, at });
    while (state.track.length > 2 && at - state.track[0].at > SAMPLE_MS) state.track.shift();
  }

  /// Where the release lands, in pages. A throw is projected by its speed
  /// (`v²/2a`, a body slowing down at `DECAY`); a let-go turns the page it
  /// already got a quarter of the way into; anything smaller goes back.
  function pageFor(settled, x, at) {
    const width = pageWidth();
    const from = Math.round(settled.left / width);
    const first = settled.track[0];
    const elapsed = Math.max(1, at - first.at);
    const speed = (x - first.x) / elapsed;
    const travelled = node.scrollLeft - settled.left;
    if (Math.abs(speed) > FLICK) {
      // The finger goes one way, the strip the other.
      const thrown = node.scrollLeft - (speed * Math.abs(speed)) / (2 * DECAY);
      return Math.round(thrown / width);
    }
    if (Math.abs(travelled) > width * COMMIT) return from + Math.sign(travelled);
    return from;
  }

  /// Lands on `page`, gliding there and slowing down. The pages the carrousel
  /// is not holding do not exist: the throw stops at the end of the strip.
  function land(settled, x, at) {
    const width = pageWidth();
    if (!width) return release();
    const last = Math.max(0, Math.round(node.scrollWidth / width) - 1);
    const page = Math.min(last, Math.max(0, pageFor(settled, x, at)));
    const to = page * width;
    const from = node.scrollLeft;
    const span = to - from;
    if (!span || still() || typeof requestAnimationFrame !== "function") {
      node.scrollLeft = to;
      return release();
    }
    const ms = Math.min(GLIDE_MAX, Math.max(GLIDE_MIN, (Math.abs(span) / width) * 320));
    const started = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - started) / ms);
      // Ease out cubic: the speed the throw arrived with, bleeding away.
      node.scrollLeft = from + span * (1 - (1 - k) ** 3);
      if (k < 1) {
        gliding = requestAnimationFrame(step);
        return;
      }
      gliding = null;
      release();
    };
    gliding = requestAnimationFrame(step);
  }

  // ---- the mouse ----
  function down(event) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      left: node.scrollLeft,
      moved: false,
      track: [{ x: event.clientX, at: event.timeStamp }],
    };
    hold();
  }

  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < threshold) return;
    if (!drag.moved) {
      drag.moved = true;
      moving();
      node.setPointerCapture?.(drag.id);
    }
    event.preventDefault();
    node.scrollLeft = drag.left - dx;
    sample(drag, event.clientX, event.timeStamp);
  }

  function up(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const settled = drag;
    drag = null;
    if (!settled.moved) return release();
    land(settled, event.clientX, event.timeStamp);
    swallowClick();
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
      axis: null,
      track: [{ x: t.clientX, at: event.timeStamp }],
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
      moving();
    }
    event.preventDefault();
    node.scrollLeft = touch.left - dx;
    sample(touch, t.clientX, event.timeStamp);
  }

  function touchEnd(event) {
    if (!touch) return;
    const settled = touch;
    touch = null;
    if (settled.axis !== "x") return;
    const t = event?.changedTouches?.[0];
    const last = settled.track[settled.track.length - 1];
    land(settled, t?.clientX ?? last.x, event?.timeStamp ?? last.at);
    swallowClick();
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
      stopGlide();
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
