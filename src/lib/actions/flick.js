// `use:flick={{ onUp, onDown, enabled }}` — a short vertical drag on an
// element, reported as a direction once the finger lets go.
//
// For the Home's head on a phone (user call, 2026-09-07: "área de interação
// diferente no canvas e no chrome no touch"): dragging DOWN on the chrome
// unfolds one more level of the head, dragging UP folds one away, and the
// canvas below keeps scrolling like a page. It is not `actions/swipe.js`
// (a card's horizontal reveal, clamped at 76px, with two actions to show)
// and not `actions/pullToSearch.js` (a distance painted live, from the top
// of a scroller only): this one moves nothing while the finger is down and
// answers one question at the end — up or down, if far enough.
//
// The gesture is claimed only once it is clearly vertical (`LOCK`), and then
// the `touchmove` is cancelled so the scroller the head lives in does not
// scroll under it — the measured lesson of actions/drawerSwipe.js: in the
// Android WebView a `pointercancel` arrives two moves into any drag the
// browser reads as a scroll, and only a `preventDefault` on the `touchmove`
// keeps the gesture. A drag that goes sideways first is someone else's (the
// week strip scrolls that way) and is let go untouched. A mouse gets the same
// through pointer events.
//
// The element is marked `data-flicks` while the action lives, so the
// scroller's own pull (pullToSearch) declines a drag that starts here — the
// two are both "drag down at the top of the page", and only one may answer.

/// The first movement decides which gesture this is.
const LOCK = 8;
/// How far the finger travels for the release to count.
const THRESHOLD = 40;

export function flick(node, params = {}) {
  let opts = params;
  let drag = null;
  let pointer = null;

  node.setAttribute("data-flicks", "");

  function begin(x, y) {
    if (opts.enabled === false) return false;
    drag = { x, y, axis: null, dy: 0 };
    return true;
  }

  /// Returns true once the drag is ours — the cue to take it from the browser.
  function follow(x, y) {
    if (!drag) return false;
    const dx = x - drag.x;
    const dy = y - drag.y;
    if (!drag.axis) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return false;
      if (Math.abs(dx) > Math.abs(dy)) {
        drag = null;
        return false;
      }
      drag.axis = "y";
    }
    drag.dy = dy;
    return true;
  }

  function finish() {
    const settled = drag;
    drag = null;
    if (!settled?.axis || Math.abs(settled.dy) < THRESHOLD) return;
    if (settled.dy < 0) opts.onUp?.();
    else opts.onDown?.();
  }

  const abandon = () => (drag = null);

  // ---- the finger ----
  function touchStart(event) {
    if (event.touches.length !== 1) return abandon();
    const t = event.touches[0];
    begin(t.clientX, t.clientY);
  }
  function touchMove(event) {
    if (!drag) return;
    if (event.touches.length !== 1) return abandon();
    const t = event.touches[0];
    if (follow(t.clientX, t.clientY) && event.cancelable) event.preventDefault();
  }
  function touchEnd() {
    if (drag) finish();
  }

  // ---- the mouse ----
  function pointerDown(event) {
    if (event.pointerType === "touch") return;
    if (!event.isPrimary || event.button !== 0) return;
    if (begin(event.clientX, event.clientY)) pointer = event.pointerId;
  }
  function pointerMove(event) {
    if (pointer === null || event.pointerId !== pointer) return;
    follow(event.clientX, event.clientY);
  }
  function pointerUp(event) {
    if (pointer === null || event.pointerId !== pointer) return;
    pointer = null;
    finish();
  }
  function pointerCancel(event) {
    if (pointer === null || event.pointerId !== pointer) return;
    pointer = null;
    abandon();
  }

  node.addEventListener("touchstart", touchStart, { passive: true });
  node.addEventListener("touchmove", touchMove, { passive: false });
  node.addEventListener("touchend", touchEnd);
  node.addEventListener("touchcancel", abandon);
  node.addEventListener("pointerdown", pointerDown);
  node.addEventListener("pointermove", pointerMove);
  node.addEventListener("pointerup", pointerUp);
  node.addEventListener("pointercancel", pointerCancel);

  return {
    update(next) {
      opts = next ?? {};
    },
    destroy() {
      node.removeAttribute("data-flicks");
      node.removeEventListener("touchstart", touchStart);
      node.removeEventListener("touchmove", touchMove);
      node.removeEventListener("touchend", touchEnd);
      node.removeEventListener("touchcancel", abandon);
      node.removeEventListener("pointerdown", pointerDown);
      node.removeEventListener("pointermove", pointerMove);
      node.removeEventListener("pointerup", pointerUp);
      node.removeEventListener("pointercancel", pointerCancel);
    },
  };
}
