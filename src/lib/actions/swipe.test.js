// Swiping a card, tested on its own — the gesture has to be told apart from
// reordering by direction alone, and it must never fire on a half-hearted drag.

import { describe, expect, test, beforeEach } from "vitest";
import { swipe } from "./swipe.js";

function card() {
  const li = document.createElement("li");
  // The real card's shape: a checkbox, a TITLE that is a button, and a
  // bookmark that opts out of the gesture.
  li.innerHTML =
    '<input class="check" type="checkbox">' +
    '<button class="title">task</button>' +
    '<button class="mark" data-no-swipe></button>';
  document.body.append(li);
  return li;
}

function fire(el, type, props) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, props);
  el.dispatchEvent(ev);
  return ev;
}

describe("swipe", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("far enough to the left deletes; the same distance right takes it out", () => {
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left"), onRight: () => fired.push("right") });

    fire(el, "pointerdown", { button: 0, pointerId: 1, clientX: 200, clientY: 10 });
    fire(el, "pointermove", { pointerId: 1, clientX: 100, clientY: 10 });
    fire(el, "pointerup", { pointerId: 1, clientX: 100, clientY: 10 });
    expect(fired).toEqual(["left"]);

    fire(el, "pointerdown", { button: 0, pointerId: 2, clientX: 100, clientY: 10 });
    fire(el, "pointermove", { pointerId: 2, clientX: 200, clientY: 10 });
    fire(el, "pointerup", { pointerId: 2, clientX: 200, clientY: 10 });
    expect(fired).toEqual(["left", "right"]);
  });

  test("released short of the threshold, nothing happened", () => {
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left") });

    fire(el, "pointerdown", { button: 0, pointerId: 1, clientX: 200, clientY: 10 });
    fire(el, "pointermove", { pointerId: 1, clientX: 170, clientY: 10 });
    fire(el, "pointerup", { pointerId: 1, clientX: 170, clientY: 10 });

    expect(fired).toEqual([]);
    // And the card is back where it was, with no band showing.
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
    fire(el, "pointermove", { pointerId: 1, clientX: 60, clientY: 90 });
    fire(el, "pointerup", { pointerId: 1, clientX: 60, clientY: 90 });
    expect(fired).toEqual([]);
  });

  test("a direction with no action behind it gives, but does not fire", () => {
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left") }); // no onRight

    fire(el, "pointerdown", { button: 0, pointerId: 1, clientX: 100, clientY: 10 });
    fire(el, "pointermove", { pointerId: 1, clientX: 220, clientY: 10 });
    // It rubber-bands a fraction of the distance instead of sliding open.
    const travelled = Math.abs(parseFloat(el.style.getPropertyValue("--swipe-x")));
    expect(travelled).toBeGreaterThan(0);
    expect(travelled).toBeLessThan(120);
    fire(el, "pointerup", { pointerId: 1, clientX: 220, clientY: 10 });
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
        clientX: 200,
        clientY: 10,
      });
      fire(el, "pointermove", { pointerId: 1, clientX: 100, clientY: 10 });
      fire(el, "pointerup", { pointerId: 1, clientX: 100, clientY: 10 });
      expect(fired, control).toEqual([]);
    }
  });

  test("but the TITLE is the card, and swipes with it", () => {
    // The title is a <button> covering most of the card's width. Excluding
    // every button left the gesture startable only from the thin padding
    // around it, which is why it looked broken everywhere (user report,
    // 2026-08-06). Clicking the title does what clicking the card does.
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left") });

    fire(el.querySelector(".title"), "pointerdown", {
      button: 0,
      pointerId: 1,
      clientX: 200,
      clientY: 10,
    });
    fire(el, "pointermove", { pointerId: 1, clientX: 100, clientY: 10 });
    fire(el, "pointerup", { pointerId: 1, clientX: 100, clientY: 10 });
    expect(fired).toEqual(["left"]);
  });

  // ---- a finger drives this by touch events (2026-08-19) ----
  //
  // Measured on the running app: a sideways drag over a list that scrolls
  // vertically gets `pointerdown, pointermove, pointercancel` and nothing
  // more, so the card never moved at all on a phone. The `touchmove`s keep
  // coming, and preventing them is what takes the gesture back.
  const touch = (x, y = 10) => ({
    changedTouches: [{ identifier: 0, clientX: x, clientY: y }],
  });

  test("a finger swipes the card even after the browser cancels the pointer", () => {
    const el = card();
    const fired = [];
    swipe(el, { onLeft: () => fired.push("left"), onRight: () => fired.push("right") });

    fire(el, "pointerdown", { button: 0, pointerId: 1, clientX: 200, clientY: 10 });
    fire(el, "touchmove", touch(180));
    // The browser gives up on the pointer here; the touch path carries on.
    fire(el, "pointercancel", { pointerId: 1 });
    fire(el, "touchmove", touch(120));
    expect(el.getAttribute("data-swipe")).toBe("left");

    fire(el, "touchend", touch(120));
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

  test("it lets go when the card is already being CARRIED (2026-08-19)", () => {
    // The finger rested on the card long enough for the reorder to pick it up
    // (reorder.js, HOLD_MS), and the reorder holds the pointer. Taking the
    // gesture here would be the second `setPointerCapture` on one pointer,
    // which leaves the first action deaf — the frozen drag of 2026-08-06, and
    // the reason press-and-hold failed when it was first tried.
    const list = document.createElement("ul");
    list.setAttribute("data-reordering", "");
    document.body.append(list);
    const el = card();
    list.append(el);

    const fired = [];
    swipe(el, { onLeft: () => fired.push("left"), onRight: () => fired.push("right") });

    fire(el, "pointerdown", { button: 0, pointerId: 1, clientX: 200, clientY: 10 });
    fire(el, "pointermove", { pointerId: 1, clientX: 100, clientY: 10 });
    fire(el, "pointerup", { pointerId: 1, clientX: 100, clientY: 10 });

    expect(fired).toEqual([]);
    // And the card never moved: no `--swipe-x`, no direction attribute.
    expect(el.hasAttribute("data-swipe")).toBe(false);
  });

  test("a swipe swallows the click, so it never also opens the card", () => {
    const el = card();
    swipe(el, { onLeft: () => {} });
    let opened = 0;
    el.addEventListener("click", () => (opened += 1));

    fire(el, "pointerdown", { button: 0, pointerId: 1, clientX: 200, clientY: 10 });
    fire(el, "pointermove", { pointerId: 1, clientX: 100, clientY: 10 });
    fire(el, "pointerup", { pointerId: 1, clientX: 100, clientY: 10 });
    fire(el, "click", {});

    expect(opened).toBe(0);
  });
});
