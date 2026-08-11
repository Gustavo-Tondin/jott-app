// Drag-to-reorder, as one reusable Svelte action — the single capability the
// tabs, subtasks, tasks, notes, lists and workspaces all reorder through.
//
// Pointer-based, never native drag-and-drop: HTML5 DnD in WebKitGTK paints a
// red "no-drop" cursor over every gap the pointer crosses, and no amount of
// dragover-accepting silenced the flicker (the same reason the tabs went this
// way first). Driving it by pointer means the OS never starts a drag, so there
// is nothing to fight, and a release in the wrong place simply does nothing.
//
// Used on the CONTAINER of the items:
//   <ul use:reorderable={{ axis: "y", item: ".row", onReorder }}>
// Every direct child of the container matching `item` is a slot; on drop the
// action calls `onReorder(from, to)` with indices into that filtered list.
// Pass `handle` to start a drag only from a grip inside each item; omit it to
// drag by the whole item (what the tabs do).
//
// `axis: "grid"` is the 2D variant, for a wrapping board of cards (the notes
// widget): the carried card follows the pointer on both axes, the target slot
// is the card whose centre is nearest, and each card between the two slots
// glides into its neighbour's place — the same gap-opening feel, generalised.
//
// A drag that starts off ACROSS the axis is not ours and is dropped on the
// spot: on a task card a sideways drag is the swipe (lib/actions/swipe.js), and
// the two must never both engage — they each capture the pointer, and the
// second capture leaves the first deaf to every move that follows. That was the
// frozen drag of 2026-08-06. The direction decides, in the first few pixels;
// there is nothing to wait for.
//
// Two options exist for lists that need more than "put it between those two":
//
//   `onDropInto`  — the middle of an item is a target of its own, drawn as a
//                   ring around it instead of a gap beside it. It is how a
//                   workspace dropped ON another makes a group of the two.
//   `dropZones`   — elements OUTSIDE this list that can receive the carried
//                   item, as `() => elements`. Reordering is per container,
//                   and a sidebar of nested groups is many containers: without
//                   this, moving a list from one group to another meant
//                   dragging it out to the root first and in again — two
//                   gestures for one intent (user call, 2026-08-11). A zone
//                   under the pointer wins over everything else, including
//                   "released clear of the list": the pointer is not nowhere,
//                   it is on that group.
//   `onDragOut`   — released clear of the container, the item is asking to
//                   LEAVE it. A workspace dragged out of a group is how it
//                   stops being a member; without it, joining would be a one
//                   way door. While the pointer is out there the carried item
//                   says so (`.reorder-item--leaving`) and the list it is
//                   abandoning stops opening a gap: there is no slot to aim
//                   at inside it any more.
//
// The feel, Chrome's: the carried item tracks the pointer 1:1 (no transition),
// and the others glide aside to open the gap where it will land (a transform
// transition, from .reorder-item in reorder.css). The commit is synchronous —
// remove the transitions, clear the transforms and reorder in one frame, so
// the browser paints the settled result once, with no flash or backtrack.

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
    [...node.children].filter((el) => opts.item == null || el.matches(opts.item));

  const coord = (e) => (horizontal() ? e.clientX : e.clientY);
  const start = (r) => (horizontal() ? r.left : r.top);
  const size = (r) => (horizontal() ? r.width : r.height);
  const mid = (r) => start(r) + size(r) / 2;
  const shift = (px) => (horizontal() ? `translateX(${px}px)` : `translateY(${px}px)`);

  const centreOf = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  function onPointerDown(e) {
    if (e.button !== 0 || drag) return; // left button only
    // The INNERMOST reorderable owns the gesture. Nested lists (a group's
    // members inside the sidebar's column) would otherwise both start, and the
    // member would drag its whole group along with it (user report,
    // 2026-08-06). `stopPropagation` in the markup cannot do this: Svelte
    // delegates pointerdown to the root, so it runs AFTER an ancestor's real
    // listener has already seen the event.
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
    };
  }

  function begin() {
    const list = items();
    const rects = list.map((c) => c.getBoundingClientRect());
    drag.rects = rects;
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
    list.forEach((c, i) => {
      c.classList.add("reorder-item");
      if (i === drag.from) c.classList.add("reorder-item--carried");
    });
    try {
      drag.el.setPointerCapture(drag.pointerId);
    } catch {
      // No pointer capture (jsdom): the reorder still resolves on release.
    }
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.originX;
    const dy = e.clientY - drag.originY;
    const delta = coord(e) - drag.origin;
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
      drag.el.style.transform = `translate(${dx}px, ${dy}px)`;
      const rects = drag.rects;
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
      items().forEach((el, i) => {
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
    drag.el.style.transform = shift(delta);

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
      for (const c of items()) {
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

    const list = items();

    // Out of the container altogether: it is leaving, not moving within. Say
    // so on the carried item and stop pretending there is a slot for it here
    // (user report, 2026-08-06 — dragging a workspace out of a group gave no
    // sign of what would happen).
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
        if (i === drag.from) continue;
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

  function clear() {
    node.removeAttribute("data-reordering");
    drag?.zone?.classList.remove("reorder-item--into");
    for (const c of items()) {
      c.classList.remove(
        "reorder-item",
        "reorder-item--carried",
        "reorder-item--into",
        "reorder-item--leaving",
      );
      c.style.transform = "";
    }
  }

  /// Gives the gesture up without committing anything.
  function cancel() {
    if (!drag) return;
    drag = null;
    clear();
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    try {
      d.el.releasePointerCapture(d.pointerId);
    } catch {
      // ignore
    }
    if (!d.moved) return; // a plain click — let the item handle it

    // Swallow the click WebKit fires next, so a drag never also selects/opens.
    const swallow = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      node.removeEventListener("click", swallow, true);
    };
    node.addEventListener("click", swallow, true);
    if (typeof requestAnimationFrame === "function")
      requestAnimationFrame(() => node.removeEventListener("click", swallow, true));

    // Commit in one frame: drop the transitions, clear the transforms and
    // reorder together, so the settled order is the only thing painted.
    d.zone?.classList.remove("reorder-item--into");
    clear();
    // Released on a zone: it is going THERE, wherever it came from.
    if (d.zone) opts.onDropZone?.(d.from, d.zone);
    // Released clear of the list: the item is leaving, not moving within.
    else if (d.leaving) opts.onDragOut(d.from);
    else if (d.into != null) opts.onDropInto?.(d.from, d.into);
    else if (d.to !== d.from) opts.onReorder?.(d.from, d.to);
  }

  /// The declared drop zone under the pointer, if any. A zone inside the
  /// carried item never counts — see `dropZones` at the top.
  function zoneAt(e) {
    if (!opts.dropZones) return null;
    for (const zone of opts.dropZones()) {
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

  const onPointerCancel = cancel;

  node.setAttribute("data-reorderable", "");
  node.addEventListener("pointerdown", onPointerDown);
  node.addEventListener("pointermove", onPointerMove);
  node.addEventListener("pointerup", onPointerUp);
  node.addEventListener("pointercancel", onPointerCancel);

  return {
    update(next) {
      opts = next ?? {};
    },
    destroy() {
      node.removeAttribute("data-reorderable");
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", onPointerUp);
      node.removeEventListener("pointercancel", onPointerCancel);
    },
  };
}
