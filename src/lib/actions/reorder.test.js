// The reusable reorder capability, tested on its own — the tabs exercise the
// whole-item path; this locks the parts they do not: a grip handle and a
// vertical axis. jsdom has no layout, so each row is given a fake 40px-tall
// rect stacked top to bottom, and the pointer is moved to the slot to land in.
import { describe, expect, test, beforeEach } from "vitest";
import { reorderable } from "./reorder.js";

function list(rows = 3) {
  const ul = document.createElement("ul");
  for (let i = 0; i < rows; i++) {
    const li = document.createElement("li");
    li.className = "row";
    const grip = document.createElement("span");
    grip.className = "grip";
    li.append(grip);
    ul.append(li);
  }
  document.body.append(ul);
  return ul;
}

function layOut(ul) {
  [...ul.children].forEach((li, i) => {
    li.getBoundingClientRect = () => ({
      left: 0,
      right: 200,
      width: 200,
      top: i * 40,
      bottom: i * 40 + 40,
      height: 40,
      x: 0,
      y: i * 40,
      toJSON() {},
    });
  });
}

function fire(el, type, props) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, props);
  el.dispatchEvent(ev);
  return ev;
}

describe("reorderable", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("dragging a row's grip past another reports the move", () => {
    const ul = list();
    layOut(ul);
    const moves = [];
    reorderable(ul, { axis: "y", item: ".row", handle: ".grip", onReorder: (f, t) => moves.push([f, t]) });

    const grip = ul.children[0].querySelector(".grip");
    fire(grip, "pointerdown", { button: 0, pointerId: 1, clientY: 5 });
    fire(grip, "pointermove", { pointerId: 1, clientY: 95 }); // past row 2's midpoint (100)
    fire(grip, "pointerup", { pointerId: 1, clientY: 95 });

    expect(moves).toEqual([[0, 2]]);
  });

  test("a drag that does not start on the handle never begins", () => {
    const ul = list();
    layOut(ul);
    const moves = [];
    reorderable(ul, { axis: "y", item: ".row", handle: ".grip", onReorder: (f, t) => moves.push([f, t]) });

    const row = ul.children[0]; // the row itself, not its grip
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 5 });
    fire(row, "pointermove", { pointerId: 1, clientY: 95 });
    fire(row, "pointerup", { pointerId: 1, clientY: 95 });

    expect(moves).toEqual([]);
  });

  test("a move under the threshold is a click, not a reorder", () => {
    const ul = list();
    layOut(ul);
    const moves = [];
    reorderable(ul, { axis: "y", item: ".row", handle: ".grip", onReorder: (f, t) => moves.push([f, t]) });

    const grip = ul.children[1].querySelector(".grip");
    fire(grip, "pointerdown", { button: 0, pointerId: 1, clientY: 45 });
    fire(grip, "pointermove", { pointerId: 1, clientY: 48 }); // 3px < 5px threshold
    fire(grip, "pointerup", { pointerId: 1, clientY: 48 });

    expect(moves).toEqual([]);
  });

  test("a grid drag lands on the nearest card in both axes", () => {
    // The notes board: 2×2 cards of 100×40. Dragging the first card onto the
    // last one must cross a row AND a column — the 2D path of the action.
    const ul = list(4);
    [...ul.children].forEach((li, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      li.getBoundingClientRect = () => ({
        left: col * 100,
        right: col * 100 + 100,
        width: 100,
        top: row * 40,
        bottom: row * 40 + 40,
        height: 40,
        x: col * 100,
        y: row * 40,
        toJSON() {},
      });
    });
    const moves = [];
    reorderable(ul, { axis: "grid", item: ".row", onReorder: (f, t) => moves.push([f, t]) });

    const card = ul.children[0];
    fire(card, "pointerdown", { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fire(card, "pointermove", { pointerId: 1, clientX: 110, clientY: 50 });
    fire(card, "pointerup", { pointerId: 1, clientX: 110, clientY: 50 });

    expect(moves).toEqual([[0, 3]]);
  });

  test("a drag that sets off sideways is not ours", () => {
    // It is the card's swipe. Taking it would have both actions capturing the
    // same pointer, and the second capture leaves the first deaf — the frozen
    // drag of 2026-08-06.
    const ul = list();
    layOut(ul);
    const moves = [];
    reorderable(ul, { axis: "y", item: ".row", onReorder: (f, t) => moves.push([f, t]) });

    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientX: 100, clientY: 5 });
    fire(row, "pointermove", { pointerId: 1, clientX: 40, clientY: 15 });
    fire(row, "pointermove", { pointerId: 1, clientX: 40, clientY: 95 });
    fire(row, "pointerup", { pointerId: 1, clientX: 40, clientY: 95 });
    expect(moves).toEqual([]);
    expect(row.classList.contains("reorder-item--carried")).toBe(false);

    // Straight down, and it reorders as always.
    fire(row, "pointerdown", { button: 0, pointerId: 2, clientX: 100, clientY: 5 });
    fire(row, "pointermove", { pointerId: 2, clientX: 102, clientY: 95 });
    fire(row, "pointerup", { pointerId: 2, clientX: 102, clientY: 95 });
    expect(moves).toEqual([[0, 2]]);
  });

  test("dropped on the middle of another item, it goes INTO it", () => {
    // The sidebar's "make a group of these two": the middle of a row is a
    // target of its own, and nothing slides aside because nothing is making
    // room for anything.
    const ul = list();
    layOut(ul);
    const moves = [];
    const intos = [];
    reorderable(ul, {
      axis: "y",
      item: ".row",
      onReorder: (f, t) => moves.push([f, t]),
      onDropInto: (f, t) => intos.push([f, t]),
    });

    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    // Row 2 spans 80-120; its middle band is 90-110.
    fire(row, "pointermove", { pointerId: 1, clientY: 100 });
    expect(ul.children[2].classList.contains("reorder-item--into")).toBe(true);
    fire(row, "pointerup", { pointerId: 1, clientY: 100 });

    expect(intos).toEqual([[0, 2]]);
    expect(moves).toEqual([], "a drop INTO is not also a reorder");
  });

  test("without onDropInto the middle is just another gap", () => {
    const ul = list();
    layOut(ul);
    const moves = [];
    reorderable(ul, { axis: "y", item: ".row", onReorder: (f, t) => moves.push([f, t]) });

    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    fire(row, "pointermove", { pointerId: 1, clientY: 100 });
    fire(row, "pointerup", { pointerId: 1, clientY: 100 });
    // The gap-between rule: the carried centre landed exactly ON row 2's
    // midpoint, which is not yet past it.
    expect(moves).toEqual([[0, 1]]);
  });

  test("carried clear of the list, it says it is leaving — and then leaves", () => {
    // A space dragged out of a group: while it is out there the row is
    // marked, and nothing inside opens a gap for it (user report, 2026-08-06).
    const ul = list();
    layOut(ul);
    ul.getBoundingClientRect = () => ({
      left: 0, right: 200, width: 200, top: 0, bottom: 120, height: 120,
      x: 0, y: 0, toJSON() {},
    });
    const out = [];
    const moves = [];
    reorderable(ul, {
      axis: "y",
      item: ".row",
      onReorder: (f, t) => moves.push([f, t]),
      onDragOut: (i) => out.push(i),
    });

    const row = ul.children[1];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientX: 100, clientY: 60 });
    // Still inside: an ordinary reorder in progress, nothing marked.
    fire(row, "pointermove", { pointerId: 1, clientX: 100, clientY: 20 });
    expect(row.classList.contains("reorder-item--leaving")).toBe(false);

    // Well clear of the list.
    fire(row, "pointermove", { pointerId: 1, clientX: 400, clientY: 300 });
    expect(row.classList.contains("reorder-item--leaving")).toBe(true);
    fire(row, "pointerup", { pointerId: 1, clientX: 400, clientY: 300 });

    expect(out).toEqual([1]);
    expect(moves).toEqual([]);
    expect(row.classList.contains("reorder-item--leaving")).toBe(false);
  });

  test("released on its own slot moves nothing", () => {
    const ul = list();
    layOut(ul);
    const moves = [];
    reorderable(ul, { axis: "y", item: ".row", handle: ".grip", onReorder: (f, t) => moves.push([f, t]) });

    const grip = ul.children[1].querySelector(".grip");
    fire(grip, "pointerdown", { button: 0, pointerId: 1, clientY: 65 });
    fire(grip, "pointermove", { pointerId: 1, clientY: 75 }); // moved, but still over its own row
    fire(grip, "pointerup", { pointerId: 1, clientY: 75 });

    expect(moves).toEqual([]);
  });
});

describe("reorderable drop zones", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  /// A zone far from the list, with a fake rect the pointer can land in.
  function zone(id, top = 400) {
    const el = document.createElement("div");
    el.dataset.groupDrop = id;
    el.getBoundingClientRect = () => ({
      left: 0, right: 200, width: 200,
      top, bottom: top + 40, height: 40, x: 0, y: top, toJSON() {},
    });
    document.body.append(el);
    return el;
  }

  test("released on a zone, the item goes THERE instead of moving in place", () => {
    // The one-gesture move between two groups: reordering is per container,
    // so without zones this needed a trip out to the root first.
    const ul = list();
    layOut(ul);
    const target = zone("Design");
    const dropped = [];
    const reordered = [];
    const out = [];
    reorderable(ul, {
      axis: "y",
      item: ".row",
      onReorder: (f, t) => reordered.push([f, t]),
      onDragOut: (i) => out.push(i),
      dropZones: () => document.querySelectorAll("[data-group-drop]"),
      onDropZone: (from, el) => dropped.push([from, el.dataset.groupDrop]),
    });

    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 5, clientX: 5 });
    fire(row, "pointermove", { pointerId: 1, clientY: 420, clientX: 5 });
    expect(target.classList.contains("reorder-item--into")).toBe(true);
    fire(row, "pointerup", { pointerId: 1, clientY: 420, clientX: 5 });

    expect(dropped).toEqual([[0, "Design"]]);
    // The zone wins over both of the other readings of that release: the
    // pointer is clear of the list, but it is not nowhere.
    expect(out).toEqual([]);
    expect(reordered).toEqual([]);
    expect(target.classList.contains("reorder-item--into")).toBe(false);
  });

  test("a zone inside the carried item is not a target", () => {
    // A group cannot be asked to hold itself: the branch would carry itself,
    // and everything under it would leave the notebook with the move.
    const ul = list();
    layOut(ul);
    const own = document.createElement("div");
    own.dataset.groupDrop = "Itself";
    own.getBoundingClientRect = () => ({
      left: 0, right: 200, width: 200,
      top: 400, bottom: 440, height: 40, x: 0, y: 400, toJSON() {},
    });
    ul.children[0].append(own);

    const dropped = [];
    const out = [];
    reorderable(ul, {
      axis: "y",
      item: ".row",
      onDragOut: (i) => out.push(i),
      dropZones: () => document.querySelectorAll("[data-group-drop]"),
      onDropZone: (from, el) => dropped.push([from, el.dataset.groupDrop]),
    });

    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 5, clientX: 5 });
    fire(row, "pointermove", { pointerId: 1, clientY: 420, clientX: 5 });
    fire(row, "pointerup", { pointerId: 1, clientY: 420, clientX: 5 });

    expect(dropped).toEqual([]);
    // With no zone to land on, the release far from the list reads as leaving.
    expect(out).toEqual([0]);
  });
});
