// `use:pullToSearch={{ enabled, onPull }}` on the compact shell's SCROLLER:
// a downward drag from `scrollTop` 0 writes `--pull`/`--pull-ratio` on the
// node and marks it `is-pulling`, then `is-pull-ready` past THRESHOLD
// (components/pull-search.css draws it); released there, `onPull()`. A drag
// that starts on CLAIMED, or is not mostly downward, is left to its owner.

import { clamp } from "../services/num.js";

/// How far the indicator has to be pulled for the release to open the search.
const THRESHOLD = 72;
/// And no further than this, however far the finger goes.
const MAX = 112;
/// The first movement decides which gesture this is.
const LOCK = 8;
/// The rubber band: the indicator covers this fraction of what the finger does.
const RESIST = 0.55;
/// Never from a card or a list of them: a finger there is scrolling, swiping
/// or about to rest and pick the card up.
const CLAIMED =
  "input, textarea, [contenteditable], .cm-editor, .sheet, .theme-modal, .theme-popover," +
  " [data-swipes], [data-reorderable], [data-flicks], .task-row, .note-card, .theme-row, .theme-btn, .theme-btn--icon";

export function pullToSearch(node, params) {
  let opts = params ?? {};
  let drag = null;
  let pointer = null;

  function paint(px) {
    if (px === null) {
      node.style.removeProperty("--pull");
      node.style.removeProperty("--pull-ratio");
      node.classList.remove("is-pulling", "is-pull-ready");
      return;
    }
    node.style.setProperty("--pull", `${px}px`);
    // The same distance as a share of the threshold (0 → 1), for sizes and
    // angles: not every engine the app ships on divides lengths in `calc()`.
    node.style.setProperty("--pull-ratio", `${Math.min(1, px / THRESHOLD).toFixed(3)}`);
    node.classList.add("is-pulling");
    node.classList.toggle("is-pull-ready", px >= THRESHOLD);
  }

  function begin(target, x, y) {
    if (opts.enabled === false) return false;
    if (node.scrollTop > 0) return false;
    if (target?.closest?.(CLAIMED)) return false;
    drag = { x, y, axis: null, pulled: 0 };
    return true;
  }

  /// Returns true once the pull is ours — the cue to take the gesture from
  /// the browser.
  function follow(x, y) {
    if (!drag) return false;
    const dx = x - drag.x;
    const dy = y - drag.y;
    if (!drag.axis) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return false;
      // Upward, or sideways, is someone else's: a scroll, a swipe, the drawer.
      if (dy <= 0 || Math.abs(dx) > dy) {
        drag = null;
        return false;
      }
      drag.axis = "y";
    }
    drag.pulled = clamp(dy * RESIST, 0, MAX);
    paint(drag.pulled);
    return true;
  }

  function finish() {
    const settled = drag;
    drag = null;
    if (!settled || !settled.axis) return;
    paint(null);
    if (settled.pulled >= THRESHOLD) opts.onPull?.();
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
    begin(event.target, t.clientX, t.clientY);
  }
  // `preventDefault` only once the pull is ours — before that the drag IS a
  // scroll; without it the WebView sends `pointercancel` and keeps the drag.
  // See docs/platform-gotchas.md#webview-e-gestos
  function touchMove(event) {
    if (!drag) return;
    if (event.touches.length !== 1) return abandon();
    const t = event.touches[0];
    if (follow(t.clientX, t.clientY) && event.cancelable) event.preventDefault();
  }
  function touchEnd() {
    if (!drag) return;
    finish();
  }

  // ---- the mouse ----
  function pointerDown(event) {
    if (event.pointerType === "touch") return;
    if (!event.isPrimary || event.button !== 0) return;
    if (begin(event.target, event.clientX, event.clientY)) pointer = event.pointerId;
  }
  function pointerMove(event) {
    if (pointer === null || event.pointerId !== pointer) return;
    if (follow(event.clientX, event.clientY)) node.setPointerCapture?.(pointer);
  }
  function pointerUp(event) {
    if (pointer === null || event.pointerId !== pointer) return;
    node.releasePointerCapture?.(pointer);
    pointer = null;
    finish();
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

  return {
    update(next) {
      opts = next ?? {};
      if (opts.enabled === false) abandon();
    },
    destroy() {
      for (const [type, fn] of handlers) node.removeEventListener(type, fn, LISTEN);
      paint(null);
    },
  };
}
