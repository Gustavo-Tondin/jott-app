// Drag-to-reorder as one Svelte action, used on the CONTAINER of the items:
//   <ul use:reorderable={{ axis: "y" | "x" | "grid", item, handle, onReorder }}>
// Pointer-driven, never native DnD (WebKitGTK paints a no-drop cursor). A drag
// that sets off ACROSS the axis is left to the card's swipe: two captures on
// one pointer leave the first deaf. See docs/platform-gotchas.md#webview-e-gestos

/// Options beyond `onReorder(from, to)`: `onDropInto(from, i)` + `canDropInto`
/// (an item's middle is a target); `dropZones(from) => elements` outside the
/// list + `onDropZone(from, zone)`; `onDragOut(from)` (released clear of the
/// container); `free(e)` + `freeZones` (no axis lock, no gap, zones only);
/// `onHold(from)` (true = the caller took the rest); `carried(from)` +
/// `onReorderMany(indices, to)` (a selection travels together); `holdMs`; `hold`.

import { dragLayer } from "../services/dragLayer.js";

/// TOUCH ONLY: how long a finger rests on an item before it is carried. Drag
/// and scroll share the vertical axis, so time tells them apart (rest to pick
/// up, move to scroll). A mouse drags at once.
const HOLD_MS = 400;
/// How far the finger may stray while resting; past it the gesture is a scroll.
const HOLD_SLOP = 8;
/// What the item INHERITED from the list it is about to leave. Out in the
/// drag layer nothing hands it a size or an ink — the inspector's panel sets
/// `font-size` on itself, and a subtask carried out of it came back a third
/// bigger (measured 2026-09-14). Written back as the values it already had,
/// so the only thing that changes is the parent.
const INHERITED = [
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "line-height",
  "text-align",
];
/// The lift and the landing, in ms, and the curve both fly on: a CONTAINED
/// spring (the `--app-ease-settle` of styles/tokens.css, which is the same
/// curve said in CSS). Layout that accommodates may not overshoot the way a
/// knob does — this happens inside a scroller, which cuts the excess.
const LIFT_MS = 140;
const LAND_MS = 160;
const FLY = "cubic-bezier(0.2, 1.05, 0.35, 1)";
/// How far past the scroller's edge the carried item may hang, so its shadow
/// has room. It STOPS there rather than being cut by it.
const SLACK = 8;

export function reorderable(node, params) {
  let opts = params ?? {};
  let drag = null;

  const horizontal = () => opts.axis === "x";
  const grid = () => opts.axis === "grid";
  const threshold = () => opts.threshold ?? 5;
  /// How much of an item's middle counts as "drop INTO this one" rather than
  /// "drop next to it". Half: enough to aim at without swallowing the
  /// boundaries, which is what ordering needs.
  const INTO_BAND = 0.5;

  const items = () =>
    [...node.children].filter(
      (el) =>
        !el.classList.contains("reorder-ghost") &&
        (opts.item == null || el.matches(opts.item)),
    );

  const coord = (e) => (horizontal() ? e.clientX : e.clientY);
  const start = (r) => (horizontal() ? r.left : r.top);
  const size = (r) => (horizontal() ? r.width : r.height);
  const mid = (r) => start(r) + size(r) / 2;
  const shift = (px) => (horizontal() ? `translateX(${px}px)` : `translateY(${px}px)`);

  const centreOf = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  function onPointerDown(e) {
    if (e.button !== 0 || drag) return; // left button only
    // A landing still in flight: the item is in the air and the list is
    // settling under it. A second grab now would measure a list in motion.
    if (node.hasAttribute("data-reordering")) return;
    // The INNERMOST reorderable owns the gesture: nested lists would both
    // start. `stopPropagation` in markup cannot do it — Svelte delegates
    // pointerdown to the root, after an ancestor's real listener ran.
    if (e.target.closest("[data-reorderable]") !== node) return;
    if (opts.handle && !e.target.closest(opts.handle)) return;
    const el = e.target.closest(opts.item ?? "*");
    if (!el || el.parentElement !== node) return;
    const list = items();
    const from = list.indexOf(el);
    if (from < 0) return;
    drag = {
      from,
      el,
      pointerId: e.pointerId,
      origin: coord(e),
      originX: e.clientX,
      originY: e.clientY,
      moved: false,
      into: null,
      holdTimer: null,
      touch: e.pointerType === "touch",
      // Free of the list (see `free` at the top): only a free zone can take
      // it, and it starts at once — the modifier IS the intent.
      free: !!(opts.freeZones && opts.free?.(e)),
    };
    if (drag.free) return;
    // A finger on an item dragged by itself rests first (HOLD_MS). With a
    // `handle` the grip is the intent — unless `hold: true` says the handle
    // is also the row's button. A mouse on a handle is always immediate.
    const rests = opts.handle
      ? opts.hold && e.pointerType === "touch"
      : e.pointerType === "touch" || opts.onHold;
    if (rests) {
      drag.holdTimer = setTimeout(hold, opts.holdMs ?? HOLD_MS);
    }
  }

  /// The finger rested: the item is picked up where it stands, with no
  /// movement yet. From here every move drags, and the scroller has already
  /// lost the gesture to our pointer capture.
  function hold() {
    if (!drag) return;
    drag.holdTimer = null;
    // The caller may want the rest for itself (entering selection mode).
    if (opts.onHold?.(drag.from)) {
      const el = drag.el;
      try {
        el.releasePointerCapture?.(drag.pointerId);
      } catch {
        // ignore
      }
      drag = null;
      navigator.vibrate?.(8);
      swallowNextClick();
      return;
    }
    drag.moved = true;
    begin();
    // The one moment the app can say "you have it now" on a screen with no
    // cursor to change and no hover to light up. Optional everywhere: a
    // desktop has no vibrator and a phone may have it switched off.
    navigator.vibrate?.(8);
  }

  function begin() {
    // THE LIST OF THE GESTURE, held from here: `from`, `to` and `into` are
    // positions in THIS list, and the carried item is about to leave the
    // container for the drag layer — asking the DOM again mid-drag would
    // answer with one item fewer, and every index would be off by one.
    const list = items();
    const rects = list.map((c) => c.getBoundingClientRect());
    drag.rects = rects;
    drag.list = list;
    // The box the carried item is kept inside (see `carry`): the scroller
    // around the list, which is exactly as far as this drag means anything.
    drag.bounds = (scrollerOf(node) ?? node).getBoundingClientRect();
    lift(rects[drag.from]);
    // One slot's worth of movement = the carried item's own size plus the gap
    // to its neighbour — how far the others slide to open room for it.
    const r = rects[drag.from];
    let gap = 0;
    if (rects.length > 1) {
      const a = drag.from < rects.length - 1 ? drag.from : drag.from - 1;
      gap = Math.max(0, start(rects[a + 1]) - (start(rects[a]) + size(rects[a])));
    }
    drag.step = size(r) + gap;
    drag.to = drag.from;
    node.setAttribute("data-reordering", "");
    if (drag.free) drag.el.classList.add("reorder-item--free");
    // The pile: what else is picked travels with the carried item.
    const stack = (opts.carried?.(drag.from) ?? [drag.from]).filter((i) => i !== drag.from);
    drag.stack = [drag.from, ...stack];
    if (stack.length) drag.el.setAttribute("data-carry", String(drag.stack.length));
    list.forEach((c, i) => {
      c.classList.add("reorder-item");
      if (i === drag.from) c.classList.add("reorder-item--carried");
      else if (stack.includes(i)) c.classList.add("reorder-item--stacked");
    });
    try {
      drag.el.setPointerCapture(drag.pointerId);
    } catch {
      // No pointer capture (jsdom): the reorder still resolves on release.
    }
    // In the layer the item is no longer inside `node`, so its events stop
    // passing through the container: the document hears them from here on.
    listenLoose();
    rise();
  }

  /// The scroller the list lives in. Null when nothing around it scrolls —
  /// then the list's own box is the limit.
  function scrollerOf(el) {
    const view = node.ownerDocument.defaultView;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const style = view?.getComputedStyle?.(p);
      if (!style) break;
      if (/auto|scroll/.test(`${style.overflowY} ${style.overflowX}`)) return p;
    }
    return null;
  }

  /// Reduced motion: the flight is skipped, never the outcome.
  const still = () =>
    !!node.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  /// Writes where the carried item IS this frame. It is kept inside the
  /// scroller with a little slack: it stops at the edge instead of being cut
  /// by it, and what takes the list further is the pointer — never clamped,
  /// so the target keeps following the hand. The FREE drag (Ctrl, on its way
  /// to the sidebar) is the exception the drag layer exists for: crossing
  /// everything is the whole point there.
  function carry(dx, dy) {
    const b = drag.free ? null : drag.bounds;
    if (b) {
      const r = drag.rects[drag.from];
      dx = Math.min(Math.max(dx, b.left - SLACK - r.left), b.right + SLACK - r.right);
      dy = Math.min(Math.max(dy, b.top - SLACK - r.top), b.bottom + SLACK - r.bottom);
    }
    drag.el.style.transform =
      grid() || drag.free ? `translate(${dx}px, ${dy}px)` : shift(horizontal() ? dx : dy);
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.originX;
    const dy = e.clientY - drag.originY;
    const delta = coord(e) - drag.origin;
    // Still waiting for the finger to settle: any real movement means this was
    // a scroll (or a swipe) all along, and we let go rather than compete for
    // it. Nothing was captured yet, so the scroller keeps the gesture whole.
    if (drag.holdTimer) {
      if (Math.hypot(dx, dy) <= HOLD_SLOP) return;
      // A finger that moved was scrolling. A MOUSE that moved (it only waits
      // when there is an `onHold` to ask) was dragging, as it always did.
      if (drag.touch) return cancel();
      clearTimeout(drag.holdTimer);
      drag.holdTimer = null;
    }
    if (drag.free) {
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < threshold()) return;
        drag.moved = true;
        begin();
      }
      carry(dx, dy);
      const zone = zoneAt(e);
      if (drag.zone !== zone) {
        drag.zone?.classList.remove("reorder-item--into");
        zone?.classList.add("reorder-item--into");
        drag.zone = zone;
      }
      return;
    }
    if (!drag.moved) {
      if ((grid() ? Math.hypot(dx, dy) : Math.abs(delta)) < threshold()) return;
      // The axis lock: a drag that set off across our axis belongs to whatever
      // else is listening (the card's swipe), and taking it would leave both
      // half-driving the same pointer.
      const across = horizontal() ? Math.abs(dy) : Math.abs(dx);
      if (!grid() && across > Math.abs(delta)) {
        cancel();
        return;
      }
      drag.moved = true;
      begin();
    }

    if (grid()) {
      // 2D: the carried card follows the pointer on both axes, the target is
      // the slot whose centre is nearest, and everything between the two
      // slots glides into its neighbour's place.
      carry(dx, dy);
      const rects = drag.rects;

      // A declared zone under the pointer wins over every slot (a folder
      // card on the notes board).
      const zone = zoneAt(e);
      if (drag.zone !== zone) {
        drag.zone?.classList.remove("reorder-item--into");
        zone?.classList.add("reorder-item--into");
        drag.zone = zone;
      }
      // ...and the middle of another CARD is a target of its own, when the
      // caller has somewhere for it to go (`onDropInto` — two notes made into
      // a folder). The band is the card's own middle in both axes, so aiming
      // at a card is a deliberate act rather than a near miss.
      drag.into = null;
      if (!zone && opts.onDropInto) {
        for (let i = 0; i < rects.length; i++) {
          if (i === drag.from || !accepts(i)) continue;
          const r = rects[i];
          const mx = (r.width * (1 - INTO_BAND)) / 2;
          const my = (r.height * (1 - INTO_BAND)) / 2;
          if (
            e.clientX > r.left + mx &&
            e.clientX < r.right - mx &&
            e.clientY > r.top + my &&
            e.clientY < r.bottom - my
          ) {
            drag.into = i;
            break;
          }
        }
      }
      if (zone || drag.into != null) {
        // Nothing is making room: the drop goes INSIDE something.
        drag.list.forEach((el, i) => {
          el.classList.toggle("reorder-item--into", i === drag.into);
          if (i !== drag.from) el.style.transform = "";
        });
        return;
      }
      for (const c of drag.list) c.classList.remove("reorder-item--into");
      const origin = centreOf(rects[drag.from]);
      const centre = { x: origin.x + dx, y: origin.y + dy };
      let to = drag.from;
      let best = Infinity;
      rects.forEach((r, i) => {
        const m = centreOf(r);
        const d = (m.x - centre.x) ** 2 + (m.y - centre.y) ** 2;
        if (d < best) {
          best = d;
          to = i;
        }
      });
      drag.to = to;
      drag.list.forEach((el, i) => {
        if (i === drag.from) return;
        let slot = null;
        if (drag.from < to && i > drag.from && i <= to) slot = rects[i - 1];
        else if (to < drag.from && i >= to && i < drag.from) slot = rects[i + 1];
        el.style.transform = slot
          ? `translate(${slot.left - rects[i].left}px, ${slot.top - rects[i].top}px)`
          : "";
      });
      return;
    }

    // The carried item follows the pointer.
    carry(dx, dy);

    // A drop zone outside this list, under the pointer? That is where it is
    // going, and nothing else this frame matters — not the gap, not "leaving".
    // Zones inside the carried item are skipped: that is a group being asked
    // to hold itself, and the branch would be carrying itself.
    const zone = zoneAt(e);
    if (drag.zone !== zone) {
      drag.zone?.classList.remove("reorder-item--into");
      zone?.classList.add("reorder-item--into");
      drag.zone = zone;
    }
    if (zone) {
      drag.leaving = false;
      drag.el.classList.remove("reorder-item--leaving");
      drag.into = null;
      for (const c of drag.list) {
        c.classList.remove("reorder-item--into");
        if (c !== drag.el) c.style.transform = "";
      }
      return;
    }

    // Which slot its centre now sits over.
    const rects = drag.rects;
    const centre = mid(rects[drag.from]) + delta;
    let to = drag.from;
    if (delta > 0) {
      for (let i = drag.from + 1; i < rects.length; i++)
        if (mid(rects[i]) < centre) to = i;
        else break;
    } else {
      for (let i = drag.from - 1; i >= 0; i--)
        if (mid(rects[i]) > centre) to = i;
        else break;
    }
    drag.to = to;

    const list = drag.list;

    // Out of the container altogether: leaving, not moving within — say so
    // on the carried item and stop opening a gap.
    drag.leaving = !!opts.onDragOut && outside(e);
    drag.el.classList.toggle("reorder-item--leaving", drag.leaving);
    if (drag.leaving) {
      for (const c of list) {
        c.classList.remove("reorder-item--into");
        if (c !== drag.el) c.style.transform = "";
      }
      drag.into = null;
      return;
    }

    // Is the pointer sitting on the MIDDLE of another item? Then the target is
    // that item, not the gap next to it — and nothing slides, because nothing
    // is making room. The ring says which one will receive the drop.
    drag.into = null;
    if (opts.onDropInto) {
      const at = coord(e);
      for (let i = 0; i < rects.length; i++) {
        if (i === drag.from || !accepts(i)) continue;
        const r = rects[i];
        const margin = (size(r) * (1 - INTO_BAND)) / 2;
        if (at > start(r) + margin && at < start(r) + size(r) - margin) {
          drag.into = i;
          break;
        }
      }
    }
    list.forEach((c, i) => c.classList.toggle("reorder-item--into", i === drag.into));
    if (drag.into != null) {
      for (const c of list) if (c !== drag.el) c.style.transform = "";
      return;
    }

    // The others open the gap: everything between the origin and the target
    // slides one step in the opposite direction.
    list.forEach((c, i) => {
      if (i === drag.from) return;
      let d = 0;
      if (drag.from < to && i > drag.from && i <= to) d = -drag.step;
      else if (to < drag.from && i >= to && i < drag.from) d = drag.step;
      c.style.transform = d ? shift(d) : "";
    });
  }

  /// Takes the carried item OUT OF FLOW (`position: fixed`) and out of the
  /// COLUMN (into the drag layer), leaving a placeholder its exact size
  /// behind, so the list keeps its layout and the rects measured above stay
  /// true. `fixed` alone was never enough: a screen column sets
  /// `container-type`, which implies `contain: layout` and makes the column
  /// the containing block of every fixed descendant — so the item rode inside
  /// the column and was cut by its overflow, which is the whole reason the
  /// layer exists (services/dragLayer.js).
  function lift(rect) {
    const ghost = node.ownerDocument.createElement(drag.el.tagName);
    ghost.className = "reorder-ghost";
    ghost.style.cssText = `width:${rect.width}px;height:${rect.height}px;visibility:hidden`;
    drag.el.after(ghost);
    drag.ghost = ghost;
    // Colour roles are inherited and the layer is in no region: the item
    // takes its own across, the same crossing `actions/portal.js` makes —
    // and with it whatever else it was inheriting.
    const region = drag.el.closest?.("[data-region]")?.dataset.region;
    if (region && !drag.el.dataset.region) {
      drag.el.dataset.region = region;
      drag.regioned = true;
    }
    const inherited = node.ownerDocument.defaultView?.getComputedStyle?.(drag.el);
    if (inherited)
      for (const property of INHERITED)
        drag.el.style.setProperty(property, inherited.getPropertyValue(property));
    const layer = opts.layer?.() ?? dragLayer(node.ownerDocument);
    layer.append(drag.el);
    // The item keeps the size it had: out of flow it would otherwise shrink to
    // its content, and a card that changes shape as it is picked up reads as a
    // different card.
    Object.assign(drag.el.style, {
      position: "fixed",
      insetInlineStart: `${rect.left}px`,
      insetBlockStart: `${rect.top}px`,
      inlineSize: `${rect.width}px`,
      blockSize: `${rect.height}px`,
      margin: "0",
    });
    // AND THEN WHERE IT REALLY LANDED. `fixed` counts from the viewport only
    // while nothing above the layer makes a containing block — with the
    // drawer open the page is pushed aside by a `translate`, and a card put
    // down at "x" arrives somewhere else entirely. Rather than work out which
    // box won, put it down, measure, and correct by the difference (measured
    // on a phone-width window with the drawer open, 2026-09-14).
    const at = drag.el.getBoundingClientRect();
    if (at.left !== rect.left) drag.el.style.insetInlineStart = `${2 * rect.left - at.left}px`;
    if (at.top !== rect.top) drag.el.style.insetBlockStart = `${2 * rect.top - at.top}px`;
  }

  /// The lift is a MOVEMENT, not a change of looks: the item grows and its
  /// shadow arrives from where it lay. Animated from here rather than by a
  /// CSS transition, because the class lands in the same frame as the element
  /// leaves the flow — a transition would have nothing to start from.
  function rise() {
    const view = node.ownerDocument.defaultView;
    if (still() || typeof drag.el.animate !== "function") return;
    const risen = view?.getComputedStyle?.(drag.el);
    drag.el.animate(
      [
        { scale: "1", boxShadow: "none" },
        { scale: risen?.scale ?? "1", boxShadow: risen?.boxShadow ?? "none" },
      ],
      { duration: LIFT_MS, easing: FLY },
    );
  }

  function drop(d) {
    if (!d?.el) {
      d?.ghost?.remove();
      return;
    }
    // Back into the list at the ghost's place — the only way an item returns
    // exactly where it left, committed or cancelled. If the list was redrawn
    // under the drag and the ghost went with it, the end of the list still
    // beats the drag layer, where nothing would ever see it again.
    if (d.ghost?.isConnected) d.ghost.before(d.el);
    else if (d.el.parentElement !== node) node.append(d.el);
    d.ghost?.remove();
    if (d.regioned) delete d.el.dataset.region;
    for (const property of [
      "position",
      "inset-inline-start",
      "inset-block-start",
      "inline-size",
      "block-size",
      "margin",
      ...INHERITED,
    ])
      d.el.style.removeProperty(property);
  }

  /// `d` is passed in because the release nulls `drag` before it tidies up:
  /// what has to be put back is the gesture that just ended, not the one
  /// running now (there is none).
  function clear(d = drag) {
    unlistenLoose();
    drop(d);
    node.removeAttribute("data-reordering");
    d?.zone?.classList.remove("reorder-item--into");
    // The gesture's list AND the container's, which are the same set unless
    // something redrew the list under the drag: whatever was marked is
    // unmarked, even if it no longer belongs to either.
    for (const c of new Set([...(d?.list ?? []), ...items()])) {
      c.classList.remove(
        "reorder-item",
        "reorder-item--carried",
        "reorder-item--stacked",
        "reorder-item--into",
        "reorder-item--leaving",
        "reorder-item--free",
      );
      c.removeAttribute("data-carry");
      c.style.transform = "";
    }
  }

  /// Gives the gesture up without committing anything — and puts the item
  /// back, which is the same tidying the release does: `clear` is told WHICH
  /// gesture ended, because `drag` is already gone by then.
  function cancel() {
    if (!drag) return;
    clearTimeout(drag.holdTimer);
    const d = drag;
    drag = null;
    clear(d);
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    clearTimeout(d.holdTimer);
    drag = null;
    try {
      d.el.releasePointerCapture(d.pointerId);
    } catch {
      // ignore
    }
    if (!d.moved) return; // a plain click — let the item handle it

    swallowNextClick();

    d.zone?.classList.remove("reorder-item--into");
    // The item ARRIVES at its new place instead of appearing in it: it flies
    // from where the hand let go, and only on landing does it come back into
    // the flow and the move commit — otherwise the list reorders under
    // something still in the air. Then the settled order is painted in one
    // frame, as it always was.
    land(d, () => {
      clear(d);
      const many = d.stack && d.stack.length > 1;
      const what = many ? d.stack : d.from;
      // A free drag goes to its zone or nowhere: the list was never in play.
      if (d.free) {
        if (d.zone) opts.onDropZone?.(what, d.zone);
        return;
      }
      // Released on a zone: it is going THERE, wherever it came from.
      if (d.zone) opts.onDropZone?.(what, d.zone);
      // Released clear of the list: the item is leaving, not moving within.
      else if (d.leaving) opts.onDragOut(what);
      else if (d.into != null) opts.onDropInto?.(what, d.into);
      else if (many) opts.onReorderMany?.(d.stack, d.to);
      else if (d.to !== d.from) opts.onReorder?.(d.from, d.to);
    });
  }

  /// Where the carried item is going, as a shift from where it set off. The
  /// neighbours have already opened the gap, and with rows of different
  /// heights the slot is not `to * step` — it is the destination's own rect.
  function landing(d) {
    const r = d.rects;
    if (grid()) return { x: r[d.to].left - r[d.from].left, y: r[d.to].top - r[d.from].top };
    const at = d.to > d.from ? start(r[d.to]) + size(r[d.to]) - size(r[d.from]) : start(r[d.to]);
    const px = at - start(r[d.from]);
    return horizontal() ? { x: px, y: 0 } : { x: 0, y: px };
  }

  /// Flies the carried item home and calls `commit` when it arrives. Without
  /// `element.animate` (jsdom), with reduced motion, or when the drop is not
  /// a place in this list (a zone, a drag out, a free drag), it commits at
  /// once — exactly as it always did.
  function land(d, commit) {
    const view = node.ownerDocument.defaultView;
    const lands = !d.free && !d.zone && !d.leaving && !!d.rects?.[d.to];
    if (!lands || still() || typeof d.el.animate !== "function") return commit();
    const to = d.into != null ? null : landing(d);
    const now = view?.getComputedStyle?.(d.el);
    const from = {
      transform: d.el.style.transform || "none",
      scale: now?.scale && now.scale !== "none" ? now.scale : "1",
      opacity: now?.opacity ?? "1",
    };
    const flight = to
      ? { transform: `translate(${to.x}px, ${to.y}px)`, scale: "1", opacity: from.opacity }
      : // INTO another item: nothing opened a gap, so there is no house to fly
        // to — it shrinks into the one receiving it.
        { transform: from.transform, scale: "0.82", opacity: "0" };
    let landed = false;
    const flown = () => {
      if (landed) return;
      landed = true;
      // `fill: forwards` would keep painting the flight over the settled list.
      try {
        voo.cancel();
      } catch {
        // already gone
      }
      commit();
    };
    const voo = d.el.animate([from, flight], {
      duration: LAND_MS,
      easing: FLY,
      fill: "forwards",
    });
    voo.onfinish = flown;
    voo.oncancel = flown;
  }

  /// Swallow the click WebKit fires next, so a drag (or a hold that was
  /// answered) never also selects/opens.
  function swallowNextClick() {
    const doc = node.ownerDocument;
    const swallow = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      doc.removeEventListener("click", swallow, true);
    };
    // On the DOCUMENT, not the container: the carried item spends the gesture
    // in the drag layer, so the click that follows the release may never pass
    // through the list at all.
    doc.addEventListener("click", swallow, true);
    if (typeof requestAnimationFrame === "function")
      requestAnimationFrame(() => doc.removeEventListener("click", swallow, true));
  }

  /// May the carried item be dropped INTO the item at `i`? Everything may,
  /// unless the caller says otherwise — see `canDropInto` at the top.
  function accepts(i) {
    return opts.canDropInto?.(drag.from, i) ?? true;
  }

  /// The declared drop zone under the pointer, if any. A zone inside the
  /// carried item never counts — see `dropZones` at the top.
  function zoneAt(e) {
    const zones = drag.free ? opts.freeZones : opts.dropZones;
    if (!zones) return null;
    for (const zone of zones(drag.from)) {
      if (drag.el.contains(zone)) continue;
      const r = zone.getBoundingClientRect();
      const inside =
        e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside) return zone;
    }
    return null;
  }

  /// Is the pointer clear of the container? The margin keeps a release right
  /// on the edge from counting as "out" when the hand only wobbled.
  function outside(e) {
    const OUT_MARGIN = 12;
    const r = node.getBoundingClientRect();
    return (
      e.clientX < r.left - OUT_MARGIN ||
      e.clientX > r.right + OUT_MARGIN ||
      e.clientY < r.top - OUT_MARGIN ||
      e.clientY > r.bottom + OUT_MARGIN
    );
  }

  /// A carried item is driven by TOUCH events: once picked up, the WebView
  /// fires `pointercancel` and stops sending moves, while `touchmove`s keep
  /// arriving — `preventDefault()` on them takes the gesture back. Nothing is
  /// prevented before the hold is up. See docs/platform-gotchas.md#webview-e-gestos
  const touchOf = (e) =>
    [...e.changedTouches].find((t) => t.identifier === drag.touchId) ?? e.changedTouches[0];

  function onTouchStart(e) {
    if (drag && drag.touch && drag.touchId == null) drag.touchId = e.changedTouches[0]?.identifier;
  }

  function onTouchMove(e) {
    if (!drag || !drag.touch) return;
    const t = touchOf(e);
    if (!t) return;
    if (drag.holdTimer) {
      if (Math.hypot(t.clientX - drag.originX, t.clientY - drag.originY) > HOLD_SLOP) cancel();
      return;
    }
    if (!drag.moved) return;
    e.preventDefault();
    // The same engine the mouse drives, fed the finger's position: everything
    // below reads `clientX`/`clientY` and the pointer id, and nothing else.
    onPointerMove({ pointerId: drag.pointerId, clientX: t.clientX, clientY: t.clientY });
  }

  function onTouchEnd(e) {
    if (!drag || !drag.touch) return;
    const t = touchOf(e);
    onPointerUp({
      pointerId: drag.pointerId,
      clientX: t?.clientX ?? drag.originX,
      clientY: t?.clientY ?? drag.originY,
    });
  }

  /// The browser taking the gesture for its scroller: kills a drag not yet
  /// picked up, never one past the hold (the touch path has it back).
  function onPointerCancel() {
    if (drag?.touch && drag.moved) return;
    cancel();
  }

  /// THE DRAG IS HEARD TWICE OVER. A carried item lives in the drag layer,
  /// so its pointer and touch events bubble through the LAYER's ancestors and
  /// never reach the container — and the pointer capture delivers them to the
  /// item, wherever it is. So from `begin()` until the gesture ends the
  /// document listens too, and ignores whatever is still inside `node`
  /// (already heard, by the listeners below).
  const doc = node.ownerDocument;
  const loose = (handler) => (e) => {
    if (!node.contains(e.target)) handler(e);
  };
  const looseMove = loose(onPointerMove);
  const looseUp = loose(onPointerUp);
  const looseCancel = loose((e) => {
    if (!drag || e.pointerId === drag.pointerId) onPointerCancel();
  });
  const looseTouchMove = loose(onTouchMove);
  const looseTouchEnd = loose(onTouchEnd);
  let listening = false;

  function listenLoose() {
    if (listening) return;
    listening = true;
    doc.addEventListener("pointermove", looseMove);
    doc.addEventListener("pointerup", looseUp);
    doc.addEventListener("pointercancel", looseCancel);
    doc.addEventListener("touchmove", looseTouchMove, { passive: false });
    doc.addEventListener("touchend", looseTouchEnd);
    doc.addEventListener("touchcancel", looseTouchEnd);
  }

  function unlistenLoose() {
    if (!listening) return;
    listening = false;
    doc.removeEventListener("pointermove", looseMove);
    doc.removeEventListener("pointerup", looseUp);
    doc.removeEventListener("pointercancel", looseCancel);
    doc.removeEventListener("touchmove", looseTouchMove);
    doc.removeEventListener("touchend", looseTouchEnd);
    doc.removeEventListener("touchcancel", looseTouchEnd);
  }

  node.setAttribute("data-reorderable", "");
  node.addEventListener("pointerdown", onPointerDown);
  node.addEventListener("pointermove", onPointerMove);
  node.addEventListener("pointerup", onPointerUp);
  node.addEventListener("pointercancel", onPointerCancel);
  // `passive: false` is load-bearing: a passive listener may not call
  // `preventDefault`, which is the only thing that takes the gesture back.
  node.addEventListener("touchstart", onTouchStart, { passive: true });
  node.addEventListener("touchmove", onTouchMove, { passive: false });
  node.addEventListener("touchend", onTouchEnd);
  node.addEventListener("touchcancel", onTouchEnd);

  return {
    update(next) {
      opts = next ?? {};
    },
    destroy() {
      unlistenLoose();
      node.removeAttribute("data-reorderable");
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", onPointerUp);
      node.removeEventListener("pointercancel", onPointerCancel);
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", onTouchEnd);
    },
  };
}
