// The resting finger: it runs `onHold` and eats the click its lift sends,
// while a moving finger or a mouse keeps the plain click.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { hold } from "./hold.js";

function fire(el, type, props = {}) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, props);
  el.dispatchEvent(ev);
  return ev;
}

const touch = (x = 10, y = 10) => ({ pointerType: "touch", clientX: x, clientY: y });

describe("hold", () => {
  let button, clicks, holds, action;
  beforeEach(() => {
    vi.useFakeTimers();
    button = document.createElement("button");
    document.body.append(button);
    clicks = 0;
    holds = 0;
    button.addEventListener("click", () => clicks++);
    action = hold(button, { onHold: () => holds++ });
  });
  afterEach(() => {
    action.destroy();
    button.remove();
    vi.useRealTimers();
  });

  test("a resting finger holds, and its lift is not a click", () => {
    fire(button, "pointerdown", touch());
    vi.advanceTimersByTime(400);
    expect(holds).toBe(1);
    expect(fire(button, "contextmenu").defaultPrevented).toBe(true);
    fire(button, "pointerup", touch());
    fire(button, "click");
    expect(clicks).toBe(0);
    // The next tap is a tap again.
    fire(button, "pointerdown", touch());
    fire(button, "pointerup", touch());
    fire(button, "click");
    expect(clicks).toBe(1);
  });

  test("a short tap, a moving finger and a mouse never hold", () => {
    fire(button, "pointerdown", touch());
    vi.advanceTimersByTime(200);
    fire(button, "pointerup", touch());
    fire(button, "pointerdown", touch());
    fire(button, "pointermove", touch(30, 10));
    vi.advanceTimersByTime(400);
    fire(button, "pointerdown", { pointerType: "mouse", clientX: 0, clientY: 0 });
    vi.advanceTimersByTime(400);
    expect(holds).toBe(0);
  });

  test("without onHold it is inert", () => {
    action.update({});
    fire(button, "pointerdown", touch());
    vi.advanceTimersByTime(400);
    expect(fire(button, "contextmenu").defaultPrevented).toBe(false);
    fire(button, "click");
    expect(clicks).toBe(1);
  });
});
