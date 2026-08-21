import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pullToSearch } from "./pullToSearch.js";

function scroller() {
  document.body.innerHTML = `
    <section class="shell__centre">
      <p class="empty">a list</p>
      <ul class="theme-task-list" data-reorderable><li class="task-row"><span class="title">Fix website</span></li></ul>
      <input class="field" />
    </section>`;
  const node = document.querySelector(".shell__centre");
  node.scrollTop = 0;
  node.setPointerCapture = () => {};
  node.releasePointerCapture = () => {};
  return node;
}

function touch(el, type, { x = 100, y = 0 } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const list = [{ clientX: x, clientY: y }];
  Object.assign(event, { touches: type === "touchend" ? [] : list, changedTouches: list });
  el.dispatchEvent(event);
  return event;
}

function pull(from, dy, { dx = 0 } = {}) {
  touch(from, "touchstart", { y: 100 });
  touch(from, "touchmove", { x: 100 + dx / 2, y: 100 + dy / 2 });
  const last = touch(from, "touchmove", { x: 100 + dx, y: 100 + dy });
  touch(from, "touchend", { x: 100 + dx, y: 100 + dy });
  return last;
}

let node;
let pulls;
let action;
const empty = () => document.querySelector(".empty");

beforeEach(() => {
  node = scroller();
  pulls = 0;
  action = pullToSearch(node, { enabled: true, onPull: () => pulls++ });
});
afterEach(() => action.destroy());

describe("pullToSearch", () => {
  it("opens the search when pulled past the mark, and takes the gesture from the browser", () => {
    const last = pull(empty(), 200);
    expect(pulls).toBe(1);
    expect(last.defaultPrevented).toBe(true);
    expect(node.classList.contains("is-pulling")).toBe(false);
  });

  it("paints how far it has got, with resistance, and says when it is ready", () => {
    touch(empty(), "touchstart", { y: 100 });
    touch(empty(), "touchmove", { y: 160 });
    expect(node.style.getPropertyValue("--pull")).toBe("33px");
    expect(node.style.getPropertyValue("--pull-ratio")).toBe("0.458");
    expect(node.classList.contains("is-pull-ready")).toBe(false);
    touch(empty(), "touchmove", { y: 240 });
    expect(node.style.getPropertyValue("--pull")).toBe("77px");
    expect(node.classList.contains("is-pull-ready")).toBe(true);
    touch(empty(), "touchend", { y: 240 });
    expect(node.style.getPropertyValue("--pull")).toBe("");
  });

  it("lets go short of the mark, and nothing happens", () => {
    pull(empty(), 60);
    expect(pulls).toBe(0);
  });

  it("is not a scroll, and not a swipe", () => {
    const last = pull(empty(), -200);
    expect(last.defaultPrevented).toBe(false);
    pull(empty(), 60, { dx: 200 });
    expect(pulls).toBe(0);
  });

  it("only from the top of the page", () => {
    node.scrollTop = 40;
    pull(empty(), 200);
    expect(pulls).toBe(0);
  });

  it("never from a field, a card or a list, and never when switched off", () => {
    pull(document.querySelector(".field"), 200);
    pull(document.querySelector(".title"), 200);
    pull(document.querySelector(".theme-task-list"), 200);
    expect(pulls).toBe(0);
    action.update({ enabled: false, onPull: () => pulls++ });
    pull(empty(), 200);
    expect(pulls).toBe(0);
  });
});
