import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawerSwipe } from "./drawerSwipe.js";

/// A shell with a drawer of a known width and a card that owns its own swipe,
/// so the "empty area" rule can be tested against a real target.
function shell() {
  // The drawer and the sheet that catches the tap are rendered OUTSIDE the
  // shell in the app (they must sit still while the shell slides), which is
  // why the action listens on the document rather than on its own node.
  document.body.innerHTML = `
    <div class="shell">
      <section class="shell__centre">
        <div class="card" data-swipes="x"><span class="label">Fix website</span></div>
        <p class="empty">nothing here</p>
      </section>
    </div>
    <div class="shell__drawer-scrim"></div>
    <nav class="shell__sidebar--drawer"></nav>
    <div class="sheet"><p class="sheet-line">a sheet over everything</p></div>`;
  const node = document.querySelector(".shell");
  // jsdom gives every element a zero layout, and the action measures the
  // drawer to know how far the gesture has to travel.
  Object.defineProperty(document.querySelector(".shell__sidebar--drawer"), "offsetWidth", {
    value: 240,
    configurable: true,
  });
  node.setPointerCapture = () => {};
  node.releasePointerCapture = () => {};
  return node;
}

/// A touch event with the one field the action reads. jsdom has no usable
/// Touch/TouchEvent constructor, and the action only ever asks a touch for its
/// coordinates, so a plain Event carrying a touch list is the real shape.
function touch(el, type, { x = 0, y = 0, at = 0 } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const list = [{ clientX: x, clientY: y }];
  Object.assign(event, { touches: type === "touchend" ? [] : list, changedTouches: list });
  Object.defineProperty(event, "timeStamp", { value: at, configurable: true });
  el.dispatchEvent(event);
  return event;
}

/// The same, on the mouse path.
function pointer(el, type, { x = 0, y = 0, at = 0, id = 1 } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId: id,
    isPrimary: true,
    pointerType: "mouse",
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, "timeStamp", { value: at, configurable: true });
  el.dispatchEvent(event);
  return event;
}

/// One whole gesture with a FINGER — the path that matters on a phone, and the
/// one the device forced (see the action's header).
function drag(node, from, { dx, dy = 0, ms = 400, x0 = 100 }) {
  touch(from, "touchstart", { x: x0, y: 200, at: 0 });
  touch(from, "touchmove", { x: x0 + dx / 2, y: 200 + dy / 2, at: ms / 2 });
  const last = touch(from, "touchmove", { x: x0 + dx, y: 200 + dy, at: ms });
  touch(from, "touchend", { x: x0 + dx, y: 200 + dy, at: ms });
  return last;
}

/// The same gesture with a mouse.
function dragMouse(node, from, { dx, dy = 0, ms = 400 }) {
  pointer(from, "pointerdown", { x: 100, y: 200, at: 0 });
  pointer(from, "pointermove", { x: 100 + dx / 2, y: 200 + dy / 2, at: ms / 2 });
  pointer(from, "pointermove", { x: 100 + dx, y: 200 + dy, at: ms });
  pointer(from, "pointerup", { x: 100 + dx, y: 200 + dy, at: ms });
}

let node;
let calls;
let action;

function mount(opts = {}) {
  calls = { open: 0, close: 0, drags: [] };
  action = drawerSwipe(node, {
    enabled: true,
    open: false,
    onOpen: () => calls.open++,
    onClose: () => calls.close++,
    onDrag: (at) => calls.drags.push(at),
    ...opts,
  });
  return action;
}

beforeEach(() => {
  node = shell();
  action = null;
});

// The action listens on the DOCUMENT (it has to: the drawer and the sheet over
// the pushed page are rendered outside the shell). A document outlives the
// markup each test throws away, so an action left mounted would keep answering
// the next test's gestures — which is exactly what happened, and it counted
// every one of them.
afterEach(() => {
  action?.destroy?.();
  action = null;
});

describe("whose gesture it is", () => {
  // The rule the user set: cards keep their swipe, the drawer answers a swipe
  // that started on nothing in particular.
  it("ignores a drag that starts on a card that swipes", () => {
    mount();
    drag(node, document.querySelector(".card"), { dx: 200 });
    expect(calls).toMatchObject({ open: 0, close: 0 });
  });

  it("ignores one that starts on a child of that card", () => {
    mount();
    drag(node, document.querySelector(".label"), { dx: 200 });
    expect(calls.open).toBe(0);
  });

  it("takes one that starts on empty space", () => {
    mount();
    drag(node, document.querySelector(".empty"), { dx: 200 });
    expect(calls.open).toBe(1);
  });

  // Text is dragged to SELECT it WITH A MOUSE; taking that gesture would leave
  // no way to select anything.
  it("leaves editable text alone under a mouse", () => {
    document.querySelector(".empty").outerHTML = '<div class="cm-editor"><span class="line">x</span></div>';
    mount();
    dragMouse(node, document.querySelector(".line"), { dx: 200 });
    expect(calls.open).toBe(0);
  });

  // …BY A MOUSE. A finger does not select by dragging — touch selection is a
  // long press and then the handles — and claiming text on both paths left a
  // phone with no way to reach the sidebar while a note was open, because an
  // open note is one `.cm-editor` filling the screen (user report on device,
  // 2026-08-20).
  it("takes a finger drag over the editor", () => {
    document.querySelector(".empty").outerHTML = '<div class="cm-editor"><span class="line">x</span></div>';
    mount();
    drag(node, document.querySelector(".line"), { dx: 200 });
    expect(calls.open).toBe(1);
  });

  // A card still owns its own swipe on either path: that one is the app's
  // own gesture, not the platform's.
  it("still leaves a card alone on the finger path", () => {
    mount();
    drag(node, document.querySelector(".card"), { dx: 200 });
    expect(calls.open).toBe(0);
  });

  // A range's thumb is a sideways drag by definition; claiming it cancelled the
  // browser's own drag and left the slider answering only to taps (user report
  // on device, 2026-09-08).
  it("leaves a range input alone on the finger path", () => {
    document.querySelector(".empty").outerHTML = '<input class="theme-range" type="range" />';
    mount();
    const event = drag(node, document.querySelector(".theme-range"), { dx: 200 });
    expect(calls.open).toBe(0);
    expect(event?.defaultPrevented ?? false).toBe(false);
  });
});

describe("the axis", () => {
  it("drops the gesture when the drag is mostly vertical", () => {
    mount();
    drag(node, document.querySelector(".empty"), { dx: 30, dy: 120 });
    expect(calls).toMatchObject({ open: 0, close: 0 });
    expect(calls.drags).toEqual([]);
  });
});

describe("committing", () => {
  it("opens on a slow drag past 40% of the width", () => {
    mount();
    drag(node, document.querySelector(".empty"), { dx: 130, ms: 900 });
    expect(calls.open).toBe(1);
  });

  it("springs back when a slow drag stops short", () => {
    mount();
    drag(node, document.querySelector(".empty"), { dx: 60, ms: 900 });
    expect(calls).toMatchObject({ open: 0, close: 1 });
  });

  // The way a drawer is actually opened: a short, fast flick.
  it("opens on a flick, however short", () => {
    mount();
    drag(node, document.querySelector(".empty"), { dx: 40, ms: 20 });
    expect(calls.open).toBe(1);
  });

  it("closes on a leftward drag once it is open", () => {
    mount({ open: true });
    drag(node, document.querySelector(".empty"), { dx: -130, ms: 900 });
    expect(calls.close).toBe(1);
  });

  // While open, a card is behind a scrim — but the rule must not be the one
  // that stops the drawer closing if a drag does reach one.
  it("closes from a card too, once open", () => {
    mount({ open: true });
    drag(node, document.querySelector(".card"), { dx: -130, ms: 900 });
    expect(calls.close).toBe(1);
  });

  // The whole reason the listeners moved to the document. Once open, NOTHING
  // the finger can reach is inside the shell: the app is behind the tap-sheet
  // and the sidebar is a sibling of it. Listening on the shell alone, every
  // closing gesture landed on an element the action never saw.
  it("closes from the sheet over the pushed page", () => {
    mount({ open: true });
    drag(node, document.querySelector(".shell__drawer-scrim"), { dx: -130, ms: 900 });
    expect(calls.close).toBe(1);
  });

  it("closes from the drawer itself, which is not in the shell either", () => {
    mount({ open: true });
    drag(node, document.querySelector(".shell__sidebar--drawer"), { dx: -130, ms: 900 });
    expect(calls.close).toBe(1);
  });
});

describe("what is raised over the shell", () => {
  // Excluded by construction while the listeners were on the shell; named
  // explicitly now that they are on the document. A bottom sheet's own content
  // must not drag the app's drawer out from under it.
  it("leaves a gesture inside a bottom sheet alone", () => {
    mount();
    drag(node, document.querySelector(".sheet-line"), { dx: 200 });
    expect(calls).toMatchObject({ open: 0, close: 0 });
  });
});

describe("taking the gesture back from the browser", () => {
  // The finding that forced the rewrite: Android's WebView claims a horizontal
  // drag over a scrolling panel and fires `pointercancel`. Calling
  // preventDefault on the touchmove is what stops it, so the action MUST do it
  // — and must not do it before the axis is locked, or it would swallow every
  // vertical scroll on the page.
  it("prevents the touchmove once the axis is locked, and not before", () => {
    mount();
    const empty = document.querySelector(".empty");
    touch(empty, "touchstart", { x: 100, y: 200, at: 0 });
    const early = touch(empty, "touchmove", { x: 103, y: 200, at: 20 });
    expect(early.defaultPrevented).toBe(false);
    const locked = touch(empty, "touchmove", { x: 160, y: 200, at: 60 });
    expect(locked.defaultPrevented).toBe(true);
  });

  it("never prevents a vertical scroll", () => {
    mount();
    const empty = document.querySelector(".empty");
    touch(empty, "touchstart", { x: 100, y: 200, at: 0 });
    const down = touch(empty, "touchmove", { x: 102, y: 320, at: 60 });
    expect(down.defaultPrevented).toBe(false);
  });

  // A pointercancel from the WebView must NOT undo a drag the touch path is
  // holding — obeying it is exactly the bug the rewrite fixed.
  it("ignores a pointercancel during a finger drag", () => {
    mount();
    const empty = document.querySelector(".empty");
    touch(empty, "touchstart", { x: 100, y: 200, at: 0 });
    touch(empty, "touchmove", { x: 160, y: 200, at: 60 });
    pointer(empty, "pointercancel", { x: 160, y: 200, at: 60 });
    touch(empty, "touchmove", { x: 240, y: 200, at: 120 });
    touch(empty, "touchend", { x: 240, y: 200, at: 300 });
    expect(calls.open).toBe(1);
  });
});

describe("the mouse", () => {
  it("opens on a drag, on the pointer path", () => {
    mount();
    dragMouse(node, document.querySelector(".empty"), { dx: 130, ms: 900 });
    expect(calls.open).toBe(1);
  });

  it("still leaves a card alone", () => {
    mount();
    dragMouse(node, document.querySelector(".card"), { dx: 200 });
    expect(calls.open).toBe(0);
  });
});

describe("following the finger", () => {
  it("reports the travel, then null on release", () => {
    mount();
    drag(node, document.querySelector(".empty"), { dx: 200 });
    expect(calls.drags.length).toBeGreaterThan(1);
    expect(calls.drags.at(0)).toBeGreaterThan(0);
    expect(calls.drags.at(-1)).toBeNull();
  });

  it("never carries the drawer past its own width", () => {
    mount();
    drag(node, document.querySelector(".empty"), { dx: 4000 });
    for (const at of calls.drags) if (at !== null) expect(at).toBeLessThanOrEqual(240);
  });
});

describe("switched off", () => {
  it("does nothing at all when disabled", () => {
    mount({ enabled: false });
    drag(node, document.querySelector(".empty"), { dx: 200 });
    expect(calls).toMatchObject({ open: 0, close: 0 });
  });

  // The window widened out of the compact shell mid-drag: let go rather than
  // leaving the drawer stuck halfway.
  it("releases a drag in flight when it is turned off", () => {
    mount();
    const empty = document.querySelector(".empty");
    touch(empty, "touchstart", { x: 100, y: 200, at: 0 });
    touch(empty, "touchmove", { x: 180, y: 200, at: 100 });
    const dropped = vi.fn();
    action.update({ enabled: false, open: false, onDrag: dropped });
    expect(dropped).toHaveBeenCalledWith(null);
  });
});
