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

/// TOUCH ONLY: how long a finger rests on an item before it is carried. Drag
/// and scroll share the vertical axis, so time tells them apart (rest to pick
/// up, move to scroll). A mouse drags at once.
const HOLD_MS = 400;
/// How far the finger may stray while resting; past it the gesture is a scroll.
const HOLD_SLOP = 8;

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
    const list = items();
    const rects = list.map((c) => c.getBoundingClientRect());
    drag.rects = rects;
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
      drag.el.style.transform = `translate(${dx}px, ${dy}px)`;
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
      drag.el.style.transform = `translate(${dx}px, ${dy}px)`;
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
        items().forEach((el, i) => {
          el.classList.toggle("reorder-item--into", i === drag.into);
          if (i !== drag.from) el.style.transform = "";
        });
        return;
      }
      for (const c of items()) c.classList.remove("reorder-item--into");
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

  /// Takes the carried item OUT OF FLOW (`position: fixed`, so no scroller
  /// clips it) and leaves a placeholder its exact size behind, so the list
  /// keeps its layout and the rects measured above stay true.
  function lift(rect) {
    const ghost = node.ownerDocument.createElement(drag.el.tagName);
    ghost.className = "reorder-ghost";
    ghost.style.cssText = `width:${rect.width}px;height:${rect.height}px;visibility:hidden`;
    drag.el.after(ghost);
    drag.ghost = ghost;
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
  }

  function drop(d) {
    d?.ghost?.remove();
    if (!d?.el) return;
    for (const property of [
      "position",
      "inset-inline-start",
      "inset-block-start",
      "inline-size",
      "block-size",
      "margin",
    ])
      d.el.style.removeProperty(property);
  }

  /// `d` is passed in because the release nulls `drag` before it tidies up:
  /// what has to be put back is the gesture that just ended, not the one
  /// running now (there is none).
  function clear(d = drag) {
    drop(d);
    node.removeAttribute("data-reordering");
    drag?.zone?.classList.remove("reorder-item--into");
    for (const c of items()) {
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

  /// Gives the gesture up without committing anything.
  function cancel() {
    if (!drag) return;
    clearTimeout(drag.holdTimer);
    drag = null;
    clear();
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

    // Commit in one frame: drop the transitions, clear the transforms and
    // reorder together, so the settled order is the only thing painted.
    d.zone?.classList.remove("reorder-item--into");
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
  }

  /// Swallow the click WebKit fires next, so a drag (or a hold that was
  /// answered) never also selects/opens.
  function swallowNextClick() {
    const swallow = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      node.removeEventListener("click", swallow, true);
    };
    node.addEventListener("click", swallow, true);
    if (typeof requestAnimationFrame === "function")
      requestAnimationFrame(() => node.removeEventListener("click", swallow, true));
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
