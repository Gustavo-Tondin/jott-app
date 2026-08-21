import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { paneSwipe } from "./paneSwipe.js";

/// The Tasks screen: a pane of a known width with a card that owns its own
/// swipe and a strip of empty ground.
function pane() {
  document.body.innerHTML = `
    <div class="tasks-view">
      <div class="card" data-swipes="x"><span class="label">Fix website</span></div>
      <p class="empty">nothing here</p>
      <input class="field" />
    </div>`;
  const node = document.querySelector(".tasks-view");
  Object.defineProperty(node, "offsetWidth", { value: 360, configurable: true });
  node.setPointerCapture = () => {};
  node.releasePointerCapture = () => {};
  return node;
}

function touch(el, type, { x = 0, y = 0, at = 0 } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const list = [{ clientX: x, clientY: y }];
  Object.assign(event, { touches: type === "touchend" ? [] : list, changedTouches: list });
  Object.defineProperty(event, "timeStamp", { value: at, configurable: true });
  el.dispatchEvent(event);
  return event;
}

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

function drag(from, { dx, dy = 0, ms = 400 }) {
  touch(from, "touchstart", { x: 100, y: 200, at: 0 });
  touch(from, "touchmove", { x: 100 + dx / 2, y: 200 + dy / 2, at: ms / 2 });
  const last = touch(from, "touchmove", { x: 100 + dx, y: 200 + dy, at: ms });
  touch(from, "touchend", { x: 100 + dx, y: 200 + dy, at: ms });
  return last;
}

function dragMouse(from, { dx, dy = 0, ms = 400 }) {
  pointer(from, "pointerdown", { x: 100, y: 200, at: 0 });
  pointer(from, "pointermove", { x: 100 + dx / 2, y: 200 + dy / 2, at: ms / 2 });
  pointer(from, "pointermove", { x: 100 + dx, y: 200 + dy, at: ms });
  pointer(from, "pointerup", { x: 100 + dx, y: 200 + dy, at: ms });
}

let node;
let calls;
let action;
const empty = () => document.querySelector(".empty");

function mount(opts = {}) {
  calls = { prev: 0, next: 0 };
  action = paneSwipe(node, {
    enabled: true,
    canPrev: true,
    canNext: true,
    onPrev: () => calls.prev++,
    onNext: () => calls.next++,
    ...opts,
  });
  return action;
}

beforeEach(() => {
  node = pane();
});
afterEach(() => {
  action?.destroy?.();
  action = null;
});

describe("what it tells the drawer", () => {
  it("claims both directions when there is a page on each side", () => {
    mount();
    expect(node.getAttribute("data-swipes")).toBe("x");
  });
  it("claims only the side it can turn to", () => {
    mount({ canPrev: false });
    expect(node.getAttribute("data-swipes")).toBe("left");
    action.update({ enabled: true, canPrev: true, canNext: false });
    expect(node.getAttribute("data-swipes")).toBe("right");
  });
  it("claims nothing with no neighbour, or switched off", () => {
    mount({ canPrev: false, canNext: false });
    expect(node.hasAttribute("data-swipes")).toBe(false);
    action.update({ enabled: false, canPrev: true, canNext: true });
    expect(node.hasAttribute("data-swipes")).toBe(false);
  });
  it("takes the mark with it on destroy", () => {
    mount();
    action.destroy();
    action = null;
    expect(node.hasAttribute("data-swipes")).toBe(false);
  });
});

describe("whose gesture it is", () => {
  it("turns the page from empty ground", () => {
    mount();
    drag(empty(), { dx: -200 });
    expect(calls).toEqual({ prev: 0, next: 1 });
  });
  it("leaves a card that swipes alone", () => {
    mount();
    drag(document.querySelector(".label"), { dx: -200 });
    expect(calls).toEqual({ prev: 0, next: 0 });
  });
  it("leaves a field alone under a mouse, and takes it under a finger", () => {
    mount();
    dragMouse(document.querySelector(".field"), { dx: -200 });
    expect(calls.next).toBe(0);
    drag(document.querySelector(".field"), { dx: -200 });
    expect(calls.next).toBe(1);
  });
  it("drops a drag that is mostly vertical", () => {
    mount();
    drag(empty(), { dx: 40, dy: 200 });
    expect(calls).toEqual({ prev: 0, next: 0 });
    expect(node.classList.contains("is-turning")).toBe(false);
  });
});

describe("following the finger", () => {
  it("carries the pane and takes the gesture from the browser", () => {
    mount();
    touch(empty(), "touchstart", { x: 100, y: 200, at: 0 });
    const move = touch(empty(), "touchmove", { x: 40, y: 202, at: 100 });
    expect(move.defaultPrevented).toBe(true);
    expect(node.classList.contains("is-turning")).toBe(true);
    expect(node.style.getPropertyValue("--pane-x")).toBe("-60px");
    touch(empty(), "touchend", { x: 40, y: 202, at: 100 });
    expect(node.classList.contains("is-turning")).toBe(false);
    expect(node.style.getPropertyValue("--pane-x")).toBe("");
  });
  it("only rubber-bands towards a side with no page", () => {
    mount({ canPrev: false });
    touch(empty(), "touchstart", { x: 100, y: 200, at: 0 });
    touch(empty(), "touchmove", { x: 180, y: 200, at: 100 });
    expect(node.style.getPropertyValue("--pane-x")).toBe("20px");
    touch(empty(), "touchend", { x: 180, y: 200, at: 100 });
    expect(calls.prev).toBe(0);
  });
});

describe("committing", () => {
  it("turns on a slow drag past 30% of the width", () => {
    mount();
    drag(empty(), { dx: 120, ms: 1000 });
    expect(calls.prev).toBe(1);
  });
  it("springs back when a slow drag stops short", () => {
    mount();
    drag(empty(), { dx: 60, ms: 1000 });
    expect(calls).toEqual({ prev: 0, next: 0 });
  });
  it("turns on a flick, however short", () => {
    mount();
    drag(empty(), { dx: -40, ms: 40 });
    expect(calls.next).toBe(1);
  });
  it("does the same with a mouse", () => {
    mount();
    dragMouse(empty(), { dx: -200 });
    expect(calls.next).toBe(1);
  });
  it("lets go of a drag in flight when switched off", () => {
    mount();
    touch(empty(), "touchstart", { x: 100, y: 200, at: 0 });
    touch(empty(), "touchmove", { x: 40, y: 200, at: 100 });
    action.update({ enabled: false });
    expect(node.classList.contains("is-turning")).toBe(false);
    touch(empty(), "touchend", { x: 40, y: 200, at: 200 });
    expect(calls.next).toBe(0);
  });
});
