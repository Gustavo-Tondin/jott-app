import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dragScroll } from "./dragScroll.js";

/// A strip of five pages, each its own width — the carrousel of the Home's
/// week. jsdom lays nothing out, so the boxes are declared.
function strip(left = 672) {
  const node = document.createElement("div");
  node.scrollLeft = left;
  Object.defineProperty(node, "clientWidth", { value: 336 });
  Object.defineProperty(node, "scrollWidth", { value: 336 * 5 });
  node.scrollBy = () => {};
  dragScroll(node);
  return node;
}

/// A touch at `(x, y)` with a time on it: the speed of the release is read
/// from the last instants of the drag, so a test has to say when each move
/// happened.
function touch(node, type, x, y, at = 0) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = { clientX: x, clientY: y };
  event.touches = type === "touchend" ? [] : [point];
  event.changedTouches = [point];
  Object.defineProperty(event, "timeStamp", { value: at });
  node.dispatchEvent(event);
  return event;
}

/// Runs the glide to its end.
const glideOut = () => vi.advanceTimersByTime(1000);

describe("a finger on the strip", () => {
  it("carries it, and takes the move from the browser", () => {
    const node = strip();
    touch(node, "touchstart", 200, 100, 0);
    const move = touch(node, "touchmove", 140, 104, 16);
    expect(node.scrollLeft).toBe(732);
    // Inside the compact shell nothing else would scroll it.
    expect(move.defaultPrevented).toBe(true);
  });

  it("leaves a vertical drag alone — that one folds the head", () => {
    const node = strip();
    touch(node, "touchstart", 200, 100, 0);
    const move = touch(node, "touchmove", 204, 160, 16);
    expect(node.scrollLeft).toBe(672);
    expect(move.defaultPrevented).toBe(false);
  });

  it("does not move the strip twice when the browser already owns the gesture", () => {
    const node = strip();
    touch(node, "touchstart", 200, 100, 0);
    const event = new Event("touchmove", { bubbles: true, cancelable: false });
    event.touches = [{ clientX: 140, clientY: 104 }];
    node.dispatchEvent(event);
    expect(node.scrollLeft).toBe(672);
  });

  it("says it owns the sideways gesture, so the drawer keeps off it", () => {
    expect(strip().dataset.swipes).toBe("x");
  });
});

describe("letting go", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lands square on a page, never between two", () => {
    const node = strip();
    touch(node, "touchstart", 300, 100, 0);
    touch(node, "touchmove", 240, 100, 100);
    touch(node, "touchmove", 200, 100, 400);
    touch(node, "touchend", 200, 100, 500);
    glideOut();
    expect(node.scrollLeft % 336).toBe(0);
  });

  it("turns the page a slow drag got a quarter of the way into", () => {
    const node = strip();
    touch(node, "touchstart", 300, 100, 0);
    touch(node, "touchmove", 240, 100, 200);
    touch(node, "touchmove", 200, 100, 600);
    // Slow enough to be a let-go, far enough to mean the next week.
    touch(node, "touchend", 200, 100, 700);
    glideOut();
    expect(node.scrollLeft).toBe(1008);
  });

  it("goes back to the week it started on when the hand barely moved", () => {
    const node = strip();
    touch(node, "touchstart", 300, 100, 0);
    touch(node, "touchmove", 285, 100, 300);
    touch(node, "touchend", 285, 100, 800);
    glideOut();
    expect(node.scrollLeft).toBe(672);
  });

  it("carries a hard throw past the next week, and stops at the end of the strip", () => {
    const node = strip();
    touch(node, "touchstart", 330, 100, 0);
    touch(node, "touchmove", 200, 100, 50);
    touch(node, "touchmove", 60, 100, 100);
    // ~2.8 px/ms at the release: two pages of glide, and the strip holds two.
    touch(node, "touchend", 60, 100, 100);
    glideOut();
    expect(node.scrollLeft).toBe(336 * 4);
  });

  it("a throw the other way lands the same distance back", () => {
    const node = strip();
    touch(node, "touchstart", 60, 100, 0);
    touch(node, "touchmove", 200, 100, 50);
    touch(node, "touchmove", 330, 100, 100);
    touch(node, "touchend", 330, 100, 100);
    glideOut();
    expect(node.scrollLeft).toBe(0);
  });

  it("slows down on the way — it does not jump", () => {
    const node = strip();
    touch(node, "touchstart", 300, 100, 0);
    touch(node, "touchmove", 200, 100, 50);
    touch(node, "touchend", 200, 100, 60);
    const seen = [];
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(50);
      seen.push(node.scrollLeft);
    }
    // Moving, and each step no bigger than the one before it.
    const steps = seen.slice(1).map((v, i) => v - seen[i]);
    expect(steps[0]).toBeGreaterThan(0);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThanOrEqual(steps[i - 1]);
  });

  it("swallows the click a drag ends on: that is not a day being picked", () => {
    const node = strip();
    const day = document.createElement("button");
    node.append(day);
    let picked = 0;
    node.addEventListener("click", () => (picked += 1));
    touch(node, "touchstart", 200, 100, 0);
    touch(node, "touchmove", 140, 100, 50);
    touch(node, "touchend", 140, 100, 60);
    day.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    expect(picked).toBe(0);
    vi.advanceTimersByTime(10);
    day.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    expect(picked).toBe(1);
  });
});

describe("a mouse", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /// The pointer events the action listens to, with a time on them.
  function pointer(node, type, x, at) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerType: "mouse", pointerId: 1, button: 0, clientX: x });
    Object.defineProperty(event, "timeStamp", { value: at });
    node.dispatchEvent(event);
    return event;
  }

  it("drags the strip and lands it on a page", () => {
    const node = strip();
    pointer(node, "pointerdown", 300, 0);
    pointer(node, "pointermove", 240, 100);
    pointer(node, "pointermove", 180, 400);
    pointer(node, "pointerup", 180, 500);
    glideOut();
    expect(node.scrollLeft).toBe(1008);
  });

  it("a press that never moved leaves the strip where it stands", () => {
    const node = strip();
    pointer(node, "pointerdown", 300, 0);
    pointer(node, "pointerup", 300, 80);
    glideOut();
    expect(node.scrollLeft).toBe(672);
  });
});
