// Opening and closing the sidebar drawer with a drag (user call, 2026-08-18).
//
//   swipe right from the left edge  → open
//   swipe left, anywhere            → close
//
// NOT `actions/swipe.js`. That one is for a CARD: it clamps the travel at 76px
// because past the reveal there is nothing more to show, and it reports a
// direction rather than a distance. A drawer travels its whole 240px and has to
// arrive under the finger, so the two share the shape of the problem and none
// of the numbers.
//
// It listens on the DOCUMENT, in the capture phase, above both the page and the
// drawer, and that is what makes the conflict manageable. Three gestures could
// otherwise claim the same pointer — this one, a card's `swipe`, and a row's
// `reorderable` — and two of them calling `setPointerCapture` on one pointer
// leaves the first deaf to every move after (the drag that froze and snapped
// back, 2026-08-06).
//
// THE DRAWER OPENS FROM AN EMPTY AREA (user call, 2026-08-18). Swiping a card
// still swipes the card; the sidebar answers a swipe that started on nothing
// in particular. So the decision is made from the TARGET, before anything
// moves:
//
//   - the finger went down on something that owns the horizontal gesture — a
//     card marked `data-swipes` by actions/swipe.js, or text that can be
//     selected — → this action never engages, and the event reaches it
//     untouched;
//   - anywhere else → the drawer takes it;
//   - open → the page is behind the (invisible) sheet that catches the tap, so
//     the only things under the finger are that sheet and the drawer, and a
//     leftward drag on either closes.
//
// Reading the mark instead of listing card classes is what keeps the two in
// step: whatever starts using `swipe` next is excluded on the same day.
//
// TOUCH EVENTS ON A FINGER, POINTER EVENTS ON A MOUSE — measured, not chosen.
// Written first on pointer events alone (they are the modern API and the rest
// of the app uses them), it did not work on the device at all: two moves in,
// Android's WebView fires `pointercancel` and stops, because a horizontal drag
// over a scrolling panel is a gesture the browser claims for itself. The
// `touchmove`s keep arriving the whole time — that is the difference — and a
// `preventDefault()` on the first of them is what actually takes the gesture
// back. Hence the two paths, and hence `{ passive: false }`.
//
// A `touch-action` of `pan-y` alone does NOT prevent this, and neither does
// dropping `setPointerCapture`; both were tried against the running app.
//
// Used on the shell:
//   <div class="shell" use:drawerSwipe={{ enabled, open, onOpen, onClose, onDrag }}>

import { clamp } from "../services/num.js";

/// What already means something else when dragged sideways. `[data-swipes]` is
/// every card carrying actions/swipe.js; then text a drag SELECTS, where
/// hijacking the gesture would take away the only way to select anything; then
/// the things that are raised OVER the shell — a bottom sheet, a modal, a
/// popover. Those three came in with the listeners moving to the document (see
/// the header): they are not inside the shell, so the old arrangement excluded
/// them by construction, and a sheet whose own content slides sideways must not
/// also be dragging the app's drawer out from under it.
const CLAIMED =
  "[data-swipes], .sheet, .sheet-scrim, .theme-modal, .theme-modal-backdrop," +
  " .theme-popover";
/// …and what is claimed BY A MOUSE ONLY: text, where dragging is how a
/// selection is made and hijacking it would leave no way to select anything.
///
/// A FINGER DOES NOT SELECT BY DRAGGING. Touch selection is a long press and
/// then the handles; a plain horizontal drag across text means nothing to the
/// platform, which is why every Android app with a drawer opens it from over
/// its own content. Claiming text on both paths is what left a phone with no
/// way to reach the sidebar while a note was open — the editor is one
/// `.cm-editor` filling the screen (user report on device, 2026-08-20).
///
/// The obvious alternative, an exception for the leading EDGE, was tried
/// against the running app and does not work at all: on gesture navigation the
/// left edge is the SYSTEM's back gesture, and a drag that starts there never
/// reaches the page. Measured — the app went back a screen instead of opening
/// anything.
const CLAIMED_BY_MOUSE = "input, textarea, [contenteditable], .cm-editor";
/// The first movement decides which gesture this is. Ahead of the lock nothing
/// moves at all, so a vertical scroll never nudges the drawer sideways.
const LOCK = 8;
/// How far the drawer has to travel AWAY FROM WHERE THE DRAG STARTED for
/// letting go to finish the job. Measured from the start, not from the closed
/// end: a single absolute threshold reads correctly opening and backwards
/// closing — a drag that took the drawer more than halfway shut still sat past
/// the mark and sprang back open (caught by drawerSwipe.test.js).
const COMMIT = 0.4;
/// …unless it was a flick: px per ms, past which the direction is taken as the
/// answer however short the travel. Without it a quick, small flick — which is
/// how a drawer is actually opened — springs back and reads as a dead gesture.
const FLICK = 0.5;

export function drawerSwipe(node, params) {
  let opts = params ?? {};
  let drag = null;
  /// The mouse pointer being followed, if any. Touch needs none: a one-finger
  /// gesture is identified by there being one finger.
  let pointer = null;

  /// How far the drawer travels: MEASURED, never restated. Its width is a token
  /// in rem (`--theme-drawer-width`), so a reader who raised their font size has
  /// a wider drawer, and a copy of 240 here would send the gesture to the wrong
  /// place for exactly the people the rem is there to serve. The fallback is
  /// only for a drag that somehow starts before the drawer is in the DOM.
  const width = () =>
    document.querySelector(opts.target ?? ".shell__sidebar--drawer")?.offsetWidth ||
    240;

  /// Engage, or decline. Returns whether the gesture is now ours to watch.
  ///
  /// `mouse` is what decides whether text counts as claimed — see
  /// CLAIMED_BY_MOUSE. The two callers already know which they are.
  function begin(target, x, y, at, mouse = false) {
    if (opts.enabled === false) return false;
    const open = !!opts.open;
    // Closed: only from an area that does not already own a sideways drag.
    // Open: from anywhere, because the only things reachable are the drawer
    // and the scrim over the page.
    const claimed = mouse ? `${CLAIMED}, ${CLAIMED_BY_MOUSE}` : CLAIMED;
    if (!open && target?.closest?.(claimed)) return false;
    drag = { x, y, at, axis: null, travel: 0, open };
    return true;
  }

  /// Follow. Returns true once the gesture is ours for good — which is the
  /// signal the touch path needs, because that is the moment it has to call
  /// `preventDefault` to stop the browser taking it back.
  function follow(x, y) {
    if (!drag) return false;
    const dx = x - drag.x;
    const dy = y - drag.y;

    if (!drag.axis) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return false;
      // Vertical wins outright: the page under a drawer still scrolls, and a
      // list that stops scrolling because a drawer was listening is worse than
      // a drawer that needs a straighter swipe.
      if (Math.abs(dy) > Math.abs(dx)) {
        drag = null;
        return false;
      }
      drag.axis = "x";
    }

    // Where the drawer is, in px from its closed position. Opening counts up
    // from 0, closing counts down from its full width; neither goes past the
    // ends, so the drawer never overshoots its own wall.
    const from = drag.open ? width() : 0;
    drag.travel = clamp(from + dx, 0, width());
    opts.onDrag?.(drag.travel);
    return true;
  }

  /// Let go: commit, or spring back.
  function finish(x, at) {
    const settled = drag;
    drag = null;
    if (!settled || !settled.axis) return;

    opts.onDrag?.(null);
    const dx = x - settled.x;
    const elapsed = Math.max(1, at - settled.at);
    const flicked = Math.abs(dx) / elapsed > FLICK;
    // A flick is answered by its DIRECTION; a slow drag by HOW FAR IT GOT from
    // where it started. `flips` is "it went far enough to mean it", and the
    // state it lands in is simply the other one.
    const span = width();
    const away = Math.abs(settled.travel - (settled.open ? span : 0));
    const flips = away > span * COMMIT;
    const open = flicked ? dx > 0 : settled.open !== flips;
    if (open) opts.onOpen?.();
    else opts.onClose?.();
  }

  function abandon() {
    if (!drag) return;
    drag = null;
    opts.onDrag?.(null);
  }

  // ---- the finger ----
  function touchStart(event) {
    // A second finger is a pinch or a two-finger scroll, never this.
    if (event.touches.length !== 1) return abandon();
    const t = event.touches[0];
    begin(event.target, t.clientX, t.clientY, event.timeStamp);
  }

  function touchMove(event) {
    if (!drag) return;
    if (event.touches.length !== 1) return abandon();
    const t = event.touches[0];
    if (follow(t.clientX, t.clientY) && event.cancelable) {
      // The line that makes the whole thing work on a device: without it the
      // WebView takes the gesture, fires `pointercancel`, and the drawer never
      // moves again (see the header).
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
  // Pointer events are right here: nothing in the browser competes for a mouse
  // drag, and capture is what keeps it alive when the cursor leaves the node.
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
    // Only the mouse path answers this. The touch path deliberately does not:
    // `pointercancel` is exactly what the WebView sends when it wants the
    // gesture, and obeying it would undo the drag just taken back.
    if (pointer === null) return;
    pointer = null;
    abandon();
  }

  // ON THE DOCUMENT, not on the node the action is used on.
  //
  // The drawer and the transparent sheet over the pushed page are rendered
  // OUTSIDE the shell (App.svelte: they have to sit still while the shell
  // slides, which a child of the sliding thing cannot do). So while the drawer
  // is open nothing the finger can reach is inside the node any more, and
  // every closing gesture landed on an element the listeners never saw. The
  // document sees all of them, and the target check above is what keeps the
  // gesture from stealing anyone else's.
  //
  // Capture phase throughout: the decision about whose gesture this is has to
  // be made on the way DOWN the tree, before a card sees it. `passive: false`
  // on the moves, because a passive listener may not call `preventDefault` —
  // and that call is the one thing standing between this and a dead gesture.
  const LISTEN = { capture: true, passive: false };
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
  const on = node.ownerDocument ?? document;
  for (const [type, fn] of handlers) on.addEventListener(type, fn, LISTEN);

  return {
    update(next) {
      opts = next ?? {};
      // Turned off mid-drag (the window widened out of the compact shell):
      // let go of whatever was in flight rather than leaving it half open.
      if (opts.enabled === false) abandon();
    },
    destroy() {
      for (const [type, fn] of handlers) on.removeEventListener(type, fn, LISTEN);
    },
  };
}
