// Swiping a card, tested on its own — the gesture has to be told apart from
// reordering by direction alone, and it must never fire on a half-hearted drag.

import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { swipe } from "./swipe.js";

/// jsdom lays nothing out; the gesture measures the card, so the card says.
const WIDTH = 300;

function card() {
  const li = document.createElement("li");
  // The real card's shape: a checkbox, a TITLE that is a button, and a
  // bookmark that opts out of the gesture.
  li.innerHTML =
    '<input class="check" type="checkbox">' +
    '<button class="title">task</button>' +
    '<button class="mark" data-no-swipe></button>';
  Object.defineProperty(li, "offsetWidth", { value: WIDTH });
  document.body.append(li);
  return li;
}

function fire(el, type, props) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, props);
  el.dispatchEvent(ev);
  return ev;
}

/// One pointer drag from `from` to `to`, released there unless `hold`.
function drag(el, from, to, { id = 1, hold = false } = {}) {
  fire(el, "pointerdown", { button: 0, pointerId: id, clientX: from, clientY: 10 });
  fire(el, "pointermove", { pointerId: id, clientX: to, clientY: 10 });
  if (!hold) fire(el, "pointerup", { pointerId: id, clientX: to, clientY: 10 });
}

const travel = (el) => parseFloat(el.style.getPropertyValue("--swipe-x"));

describe("swipe", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("carried to the end, left deletes and right takes it out", () => {
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left"), onRight: () => fired.push("right") });

    drag(el, 280, 60);
    expect(fired).toEqual(["left"]);

    drag(el, 20, 240, { id: 2 });
    expect(fired).toEqual(["left", "right"]);
  });

  test("short of the point, a delete does not count", () => {
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left") });

    drag(el, 280, 190, { hold: true }); // 30% of the card
    expect(el.classList.contains("swipe--armed")).toBe(false);
    fire(el, "pointerup", { pointerId: 1, clientX: 190, clientY: 10 });
    expect(fired).toEqual([]);
  });

  test("a delete arms from a press mid-card, well before the finger reaches the edge", () => {
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left") });

    drag(el, 150, 40, { hold: true }); // 37%, from the middle
    expect(el.classList.contains("swipe--armed")).toBe(true);
    // Armed, the card is drawn all the way out whatever the finger's travel.
    expect(travel(el)).toBe(-WIDTH);
    fire(el, "pointerup", { pointerId: 1, clientX: 40, clientY: 10 });
    expect(fired).toEqual(["left"]);
  });

  test("a half action counts halfway, and the card springs back", () => {
    const el = card();
    const fired = [];
    swipe(el, { onRight: () => fired.push("right"), rightHalf: true });

    drag(el, 20, 150); // 43%: not yet
    expect(fired).toEqual([]);

    drag(el, 20, 180, { id: 2, hold: true }); // 53%
    expect(el.classList.contains("swipe--armed")).toBe(true);
    // Armed halfway the card stays under the finger; it is not carried off.
    expect(travel(el)).toBe(160);
    fire(el, "pointerup", { pointerId: 2, clientX: 180, clientY: 10 });
    expect(fired).toEqual(["right"]);
    expect(el.style.getPropertyValue("--swipe-x")).toBe("");
  });

  test("armed at the end, the card leaves whole and the square takes the row", () => {
    const el = card();
    swipe(el, { onLeft: () => {} });

    drag(el, 280, 60, { hold: true });
    expect(el.classList.contains("swipe--armed")).toBe(true);
    expect(travel(el)).toBe(-WIDTH);
  });

  test("dragged back below the point, it is not armed any more", () => {
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left") });

    drag(el, 280, 60, { hold: true });
    fire(el, "pointermove", { pointerId: 1, clientX: 200, clientY: 10 });
    expect(el.classList.contains("swipe--armed")).toBe(false);
    expect(travel(el)).toBe(-80);
    fire(el, "pointerup", { pointerId: 1, clientX: 200, clientY: 10 });
    expect(fired).toEqual([]);
  });

  test("a card sent away stays out, and comes back if the list keeps it", () => {
    vi.useFakeTimers();
    const el = card();
    swipe(el, { onLeft: () => {} });

    drag(el, 280, 60);
    expect(travel(el)).toBe(-WIDTH);
    expect(el.getAttribute("data-swipe")).toBe("left");

    vi.advanceTimersByTime(2000);
    expect(el.style.getPropertyValue("--swipe-x")).toBe("");
    expect(el.getAttribute("data-swipe")).toBeNull();
  });

  test("released short of the threshold, nothing happened", () => {
    vi.useFakeTimers();
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left") });

    drag(el, 200, 170);

    expect(fired).toEqual([]);
    // The card heads home at once; the square goes with it, then the direction.
    expect(el.style.getPropertyValue("--swipe-x")).toBe("");
    vi.advanceTimersByTime(500);
    expect(el.getAttribute("data-swipe")).toBeNull();
  });

  test("a vertical drag is not ours — the card never even moves", () => {
    // That drag belongs to the reorder action, which is waiting out its hold.
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left"), onRight: () => fired.push("right") });

    fire(el, "pointerdown", { button: 0, pointerId: 1, clientX: 200, clientY: 10 });
    fire(el, "pointermove", { pointerId: 1, clientX: 195, clientY: 90 });
    expect(el.style.getPropertyValue("--swipe-x")).toBe("");
    // Even carrying on sideways afterwards: the axis was decided.
    fire(el, "pointermove", { pointerId: 1, clientX: 0, clientY: 90 });
    fire(el, "pointerup", { pointerId: 1, clientX: 0, clientY: 90 });
    expect(fired).toEqual([]);
  });

  test("a direction with no action behind it gives, but does not fire", () => {
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left") }); // no onRight

    drag(el, 20, 290, { hold: true });
    // It rubber-bands a fraction of the distance instead of sliding open.
    expect(travel(el)).toBeGreaterThan(0);
    expect(travel(el)).toBeLessThan(60);
    fire(el, "pointerup", { pointerId: 1, clientX: 290, clientY: 10 });
    expect(fired).toEqual([]);
  });

  test("a press that starts on a real control is that control's", () => {
    // Sliding the card out from under the checkbox you are about to tick is a
    // trap; same for the bookmark, which says so with `data-no-swipe`.
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left") });

    for (const control of [".check", ".mark"]) {
      fire(el.querySelector(control), "pointerdown", {
        button: 0,
        pointerId: 1,
        clientX: 280,
        clientY: 10,
      });
      fire(el, "pointermove", { pointerId: 1, clientX: 20, clientY: 10 });
      fire(el, "pointerup", { pointerId: 1, clientX: 20, clientY: 10 });
      expect(fired, control).toEqual([]);
    }
  });

  test("but the TITLE is the card, and swipes with it", () => {
    // The title is a <button> covering most of the card's width. Excluding
    // every button left the gesture startable only from the thin padding
    // around it. Clicking the title does what clicking the card does.
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left") });

    fire(el.querySelector(".title"), "pointerdown", {
      button: 0,
      pointerId: 1,
      clientX: 280,
      clientY: 10,
    });
    fire(el, "pointermove", { pointerId: 1, clientX: 20, clientY: 10 });
    fire(el, "pointerup", { pointerId: 1, clientX: 20, clientY: 10 });
    expect(fired).toEqual(["left"]);
  });

  // ---- a finger drives this by touch events ----
  //
  // A sideways drag over a list that scrolls vertically gets `pointerdown,
  // pointermove, pointercancel` and nothing more; the `touchmove`s keep
  // coming, and preventing them is what takes the gesture back.
  const touch = (x, y = 10) => ({
    changedTouches: [{ identifier: 0, clientX: x, clientY: y }],
  });

  test("a finger swipes the card even after the browser cancels the pointer", () => {
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left"), onRight: () => fired.push("right") });

    fire(el, "pointerdown", { button: 0, pointerId: 1, clientX: 280, clientY: 10 });
    fire(el, "touchmove", touch(260));
    // The browser gives up on the pointer here; the touch path carries on.
    fire(el, "pointercancel", { pointerId: 1 });
    fire(el, "touchmove", touch(40));
    expect(el.getAttribute("data-swipe")).toBe("left");

    fire(el, "touchend", touch(40));
    expect(fired).toEqual(["left"]);
  });

  test("a vertical finger is not ours: the list keeps its scroll", () => {
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left") });

    fire(el, "pointerdown", { button: 0, pointerId: 1, clientX: 200, clientY: 10 });
    fire(el, "touchmove", touch(198, 60));
    fire(el, "touchend", touch(198, 60));

    expect(fired).toEqual([]);
    expect(el.hasAttribute("data-swipe")).toBe(false);
  });

  test("it lets go when the card is already being CARRIED", () => {
    // The finger rested on the card long enough for the reorder to pick it up
    // (reorder.js, HOLD_MS), and the reorder holds the pointer. Taking the
    // gesture here would be the second `setPointerCapture` on one pointer,
    // which leaves the first action deaf.
    const list = document.createElement("ul");
    list.setAttribute("data-reordering", "");
    document.body.append(list);
    const el = card();
    list.append(el);

    const fired = [];
    swipe(el, { onLeft: () => fired.push("left"), onRight: () => fired.push("right") });

    drag(el, 280, 20);

    expect(fired).toEqual([]);
    // And the card never moved: no `--swipe-x`, no direction attribute.
    expect(el.hasAttribute("data-swipe")).toBe(false);
  });

  test("a swipe swallows the click, so it never also opens the card", () => {
    const el = card();
    swipe(el, { onLeft: () => {} });
    let opened = 0;
    el.addEventListener("click", () => (opened += 1));

    drag(el, 200, 100);
    fire(el, "click", {});

    expect(opened).toBe(0);
  });
});
