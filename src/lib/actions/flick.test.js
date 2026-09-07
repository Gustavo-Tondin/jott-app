import { describe, expect, it } from "vitest";
import { flick } from "./flick.js";

/// A touch at `(x, y)` on `node`, as the events the action listens to.
const touch = (node, type, x, y) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  event.touches = type === "touchend" ? [] : [{ clientX: x, clientY: y }];
  node.dispatchEvent(event);
  return event;
};

function drag(node, from, to) {
  touch(node, "touchstart", from.x, from.y);
  const move = touch(node, "touchmove", to.x, to.y);
  touch(node, "touchend", to.x, to.y);
  return move;
}

function head() {
  const node = document.createElement("div");
  const calls = [];
  const action = flick(node, { onUp: () => calls.push("up"), onDown: () => calls.push("down") });
  return { node, calls, action };
}

describe("a vertical flick", () => {
  it("reports up and down once the finger lets go, and claims the move", () => {
    const { node, calls } = head();
    const move = drag(node, { x: 100, y: 200 }, { x: 104, y: 120 });
    expect(calls).toEqual(["up"]);
    // The scroller under the head must not scroll with it.
    expect(move.defaultPrevented).toBe(true);
    drag(node, { x: 100, y: 200 }, { x: 100, y: 260 });
    expect(calls).toEqual(["up", "down"]);
  });

  it("a short drag is nothing", () => {
    const { node, calls } = head();
    drag(node, { x: 100, y: 200 }, { x: 100, y: 180 });
    expect(calls).toEqual([]);
  });

  it("a sideways drag is someone else's — the week strip scrolls that way", () => {
    const { node, calls } = head();
    const move = drag(node, { x: 100, y: 200 }, { x: 180, y: 230 });
    expect(calls).toEqual([]);
    expect(move.defaultPrevented).toBe(false);
  });

  it("reports the drag live, and where it let go", () => {
    const node = document.createElement("div");
    const moves = [];
    let ended = null;
    flick(node, { onMove: (dy) => moves.push(dy), onEnd: (dy) => (ended = dy) });
    touch(node, "touchstart", 100, 200);
    touch(node, "touchmove", 100, 230);
    touch(node, "touchmove", 100, 260);
    touch(node, "touchend", 100, 260);
    expect(moves).toEqual([30, 60]);
    expect(ended).toBe(60);
  });

  it("marks the element so the page's own pull declines it", () => {
    const { node, action } = head();
    expect(node.hasAttribute("data-flicks")).toBe(true);
    action.destroy();
    expect(node.hasAttribute("data-flicks")).toBe(false);
  });

  it("can be switched off", () => {
    const { node, calls, action } = head();
    action.update({ enabled: false, onUp: () => calls.push("up") });
    drag(node, { x: 100, y: 200 }, { x: 100, y: 100 });
    expect(calls).toEqual([]);
  });
});
