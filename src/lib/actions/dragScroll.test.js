import { describe, expect, it } from "vitest";
import { dragScroll } from "./dragScroll.js";

/// A scroller with a width and a `scrollLeft` that can be written, which jsdom
/// gives no element on its own.
function strip() {
  const node = document.createElement("div");
  node.scrollLeft = 0;
  node.scrollBy = () => {};
  dragScroll(node);
  return node;
}

const touch = (node, type, x, y) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  event.touches = type === "touchend" ? [] : [{ clientX: x, clientY: y }];
  node.dispatchEvent(event);
  return event;
};

describe("a finger on a horizontal strip", () => {
  it("carries it, and takes the move from the browser", () => {
    const node = strip();
    touch(node, "touchstart", 200, 100);
    const move = touch(node, "touchmove", 140, 104);
    expect(node.scrollLeft).toBe(60);
    // Inside the compact shell nothing else would scroll it.
    expect(move.defaultPrevented).toBe(true);
    touch(node, "touchend", 140, 104);
    expect(node.style.scrollSnapType).toBe("");
  });

  it("leaves a vertical drag alone — that one folds the head", () => {
    const node = strip();
    touch(node, "touchstart", 200, 100);
    const move = touch(node, "touchmove", 204, 160);
    expect(node.scrollLeft).toBe(0);
    expect(move.defaultPrevented).toBe(false);
  });

  it("does not move the strip twice when the browser already owns the gesture", () => {
    const node = strip();
    touch(node, "touchstart", 200, 100);
    const event = new Event("touchmove", { bubbles: true, cancelable: false });
    event.touches = [{ clientX: 140, clientY: 104 }];
    node.dispatchEvent(event);
    expect(node.scrollLeft).toBe(0);
  });

  it("swallows the click a drag ends on: that is not a day being picked", () => {
    const node = strip();
    const day = document.createElement("button");
    node.append(day);
    let picked = 0;
    node.addEventListener("click", () => (picked += 1));
    touch(node, "touchstart", 200, 100);
    touch(node, "touchmove", 140, 100);
    touch(node, "touchend", 140, 100);
    day.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    expect(picked).toBe(0);
    day.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    expect(picked).toBe(1);
  });
});

describe("letting go of a flick", () => {
  /// A strip whose pages are its own width, and which remembers where it was
  /// told to go.
  function pages() {
    const node = document.createElement("div");
    node.scrollLeft = 336;
    Object.defineProperty(node, "clientWidth", { value: 336 });
    Object.defineProperty(node, "scrollWidth", { value: 1008 });
    const went = [];
    node.scrollTo = (opts) => went.push(opts.left);
    node.scrollBy = () => {};
    dragScroll(node);
    return { node, went };
  }

  it("turns the page a short, quick drag meant — there is no momentum to do it", () => {
    const { node, went } = pages();
    touch(node, "touchstart", 300, 100);
    touch(node, "touchmove", 240, 100);
    touch(node, "touchend", 240, 100);
    // A finger carried by script arrives with no fling: without this the strip
    // slid back to the week it started on.
    expect(went).toEqual([672]);
  });

  it("stays where it was when the hand barely moved", () => {
    const { node, went } = pages();
    const start = new Event("touchstart", { bubbles: true, cancelable: true });
    start.touches = [{ clientX: 300, clientY: 100 }];
    Object.defineProperty(start, "timeStamp", { value: 0 });
    node.dispatchEvent(start);
    const move = new Event("touchmove", { bubbles: true, cancelable: true });
    move.touches = [{ clientX: 285, clientY: 100 }];
    node.dispatchEvent(move);
    const end = new Event("touchend", { bubbles: true, cancelable: true });
    end.touches = [];
    end.changedTouches = [{ clientX: 285, clientY: 100 }];
    Object.defineProperty(end, "timeStamp", { value: 600 });
    node.dispatchEvent(end);
    expect(went).toEqual([]);
  });
});

describe("the strip", () => {
  it("says it owns the sideways gesture, so the drawer keeps off it", () => {
    expect(strip().dataset.swipes).toBe("x");
  });
});
