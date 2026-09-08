// `use:flick={{ onUp, onDown, onMove, onEnd, enabled }}` — a short vertical
// drag, answered as a direction on release. It moves nothing itself: `onMove(dy)`
// follows the finger once the drag is clearly vertical, `onEnd(dy)` fires
// before `onUp`/`onDown` decide. A drag that goes sideways first is left to the
// browser. `data-flicks` marks the element so pullToSearch declines a drag here.

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
    opts.onMove?.(dy);
    return true;
  }

  function finish() {
    const settled = drag;
    drag = null;
    if (!settled?.axis) return;
    opts.onEnd?.(settled.dy);
    if (Math.abs(settled.dy) < THRESHOLD) return;
    if (settled.dy < 0) opts.onUp?.();
    else opts.onDown?.();
  }

  function abandon() {
    const was = drag;
    drag = null;
    if (was?.axis) opts.onEnd?.(0);
  }

  // ---- the finger ----
  function touchStart(event) {
    if (event.touches.length !== 1) return abandon();
    const t = event.touches[0];
    begin(t.clientX, t.clientY);
  }
  // Once the drag is ours the `touchmove` is cancelled, or the Android WebView
  // sends `pointercancel` and keeps it as a scroll.
  // See docs/platform-gotchas.md#webview-e-gestos
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
