// The reusable reorder capability, tested on its own — the tabs exercise the
// whole-item path; this locks the parts they do not: a grip handle and a
// vertical axis. jsdom has no layout, so each row is given a fake 40px-tall
// rect stacked top to bottom, and the pointer is moved to the slot to land in.
import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { reorderable } from "./reorder.js";
import { ringBox, ringQuadrant, ringRowCenter } from "../services/ring.js";

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

/// Once the item is carried, the action reads at most one movement per FRAME
/// (reorder.js): an assertion made BETWEEN two moves has to let the frame
/// pass. A release needs none — it applies whatever is still in the air.
async function nextFrame() {
  if (vi.isFakeTimers()) {
    vi.advanceTimersByTime(20);
    return;
  }
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
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

  test("a grid with a `project` shows every card where the drop will put it", () => {
    // Four cards in a 2×2 grid. The caller's projection says what the board
    // will look like with card 0 at slot 3: the others shift back one slot —
    // a chain here, but the action does not know that; it only draws.
    const ul = list(4);
    const rect = (col, row) => ({
      left: col * 100,
      right: col * 100 + 100,
      width: 100,
      top: row * 40,
      bottom: row * 40 + 40,
      height: 40,
    });
    const cells = [rect(0, 0), rect(1, 0), rect(0, 1), rect(1, 1)];
    [...ul.children].forEach((li, i) => {
      li.getBoundingClientRect = () => ({ ...cells[i], x: cells[i].left, y: cells[i].top, toJSON() {} });
    });
    const asked = [];
    reorderable(ul, {
      axis: "grid",
      item: ".row",
      onReorder: () => {},
      project: (from, to, rects) => {
        asked.push([from, to, rects.length]);
        if (to !== 3) return null;
        return [cells[3], cells[0], cells[1], cells[2]];
      },
    });
    const rows = [...ul.children];
    const card = ul.children[0];
    fire(card, "pointerdown", { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fire(card, "pointermove", { pointerId: 1, clientX: 150, clientY: 60 });
    expect(asked).toContainEqual([0, 3, 4]);
    // Card 1 (top right) is drawn where card 0 stood; card 3 where card 2 did.
    expect(rows[1].style.transform).toBe("translate(-100px, 0px)");
    expect(rows[2].style.transform).toBe("translate(100px, -40px)");
    expect(rows[3].style.transform).toBe("translate(-100px, 0px)");
    fire(card, "pointerup", { pointerId: 1, clientX: 150, clientY: 60 });
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

    // Held from BEFORE the drag: the carried item leaves a placeholder in its
    // place (2026-08-19) and then the list altogether — it spends the gesture
    // in the drag layer, so nothing found by searching the list is the row
    // that was there.
    const rows = [...ul.children];
    const row = ul.children[0];
    vi.useFakeTimers();
    try {
      fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
      // Row 2 spans 80-120; its middle band is 92-108. Arriving there is not
      // yet aiming at it: the hand has to REST on the middle (INTO_MS).
      fire(row, "pointermove", { pointerId: 1, clientY: 100 });
      expect(rows[2].classList.contains("reorder-item--into")).toBe(false);
      vi.advanceTimersByTime(450);
      expect(rows[2].classList.contains("reorder-item--into")).toBe(true);
      fire(row, "pointerup", { pointerId: 1, clientY: 100 });
    } finally {
      vi.useRealTimers();
    }

    expect(intos).toEqual([[0, 2]]);
    expect(moves).toEqual([], "a drop INTO is not also a reorder");
  });

  test("a hand that only CROSSES a middle on its way past never goes into it", () => {
    // The notes board's accidental folders: dragging a card down the column
    // passes through every middle on the way. None of them is meant.
    const ul = list(4);
    layOut(ul);
    const moves = [];
    const intos = [];
    reorderable(ul, {
      axis: "y",
      item: ".row",
      onReorder: (f, t) => moves.push([f, t]),
      onDropInto: (f, t) => intos.push([f, t]),
    });
    const rows = [...ul.children];
    const row = ul.children[0];
    vi.useFakeTimers();
    try {
      fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
      fire(row, "pointermove", { pointerId: 1, clientY: 60 }); // row 1's middle
      vi.advanceTimersByTime(200);
      fire(row, "pointermove", { pointerId: 1, clientY: 100 }); // row 2's middle
      vi.advanceTimersByTime(200);
      // Past row 3's middle band (128-152), on its lower edge: no candidate
      // at all, and the clock starts over.
      fire(row, "pointermove", { pointerId: 1, clientY: 155 });
      vi.advanceTimersByTime(450);
      expect(rows.some((r) => r.classList.contains("reorder-item--into"))).toBe(false);
      fire(row, "pointerup", { pointerId: 1, clientY: 155 });
    } finally {
      vi.useRealTimers();
    }
    expect(intos).toEqual([]);
    expect(moves).toEqual([[0, 3]]);
  });

  test("canDropInto narrows which items may receive a drop", () => {
    // A list of more than one kind of thing: the notes board carries note
    // cards and FOLDER cards in one arrangement, and only two notes make a
    // folder of themselves. Without this the ring would light up around a
    // target whose drop does nothing — a promise the drop cannot keep.
    const ul = list();
    layOut(ul);
    const moves = [];
    const intos = [];
    reorderable(ul, {
      axis: "y",
      item: ".row",
      onReorder: (f, t) => moves.push([f, t]),
      canDropInto: (from, to) => to !== 2,
      onDropInto: (f, t) => intos.push([f, t]),
    });

    const rows = [...ul.children];
    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    // Right on row 2's middle band, which this list refuses.
    fire(row, "pointermove", { pointerId: 1, clientY: 100 });
    expect(rows[2].classList.contains("reorder-item--into")).toBe(false);
    fire(row, "pointerup", { pointerId: 1, clientY: 100 });

    expect(intos).toEqual([]);
    expect(moves).toEqual([[0, 1]], "refused as a target, it is just a gap");
  });

  test("the carried item leaves the flow, and its place is kept", () => {
    // Every list this action serves scrolls, and a scroller clips what sticks
    // out of it — a card dragged up the notes board was cut in half by the top
    // of the page (user report, 2026-08-19). Out of flow it escapes every
    // ancestor's overflow; the placeholder is what stops the list closing the
    // gap under it.
    const ul = list();
    layOut(ul);
    reorderable(ul, { axis: "y", item: ".row", onReorder: () => {} });

    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    fire(row, "pointermove", { pointerId: 1, clientY: 100 });

    expect(row.style.position).toBe("fixed");
    const ghost = ul.querySelector(".reorder-ghost");
    expect(ghost).toBeTruthy();
    expect(ghost.style.height).toBe("40px");

    fire(row, "pointerup", { pointerId: 1, clientY: 100 });
    expect(row.style.position).toBe("");
    expect(ul.querySelector(".reorder-ghost")).toBeNull();
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

  test("carried clear of the list, it says it is leaving — and then leaves", async () => {
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
    await nextFrame();
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

describe("reorderable that may not carry", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("a mouse on an item that may not be carried is left to the click", () => {
    const ul = list();
    layOut(ul);
    const moves = [];
    reorderable(ul, {
      axis: "y",
      item: ".row",
      canCarry: () => false,
      onReorder: (f, t) => moves.push([f, t]),
    });
    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, pointerType: "mouse", clientY: 20 });
    fire(row, "pointermove", { pointerId: 1, pointerType: "mouse", clientY: 100 });
    fire(row, "pointerup", { pointerId: 1, pointerType: "mouse", clientY: 100 });
    expect(moves).toEqual([]);
    expect(row.classList.contains("reorder-item--carried")).toBe(false);
  });

  test("a finger's rest still opens the ring, and with none to open it lets go", () => {
    vi.useFakeTimers();
    try {
      const ul = list();
      layOut(ul);
      const rung = [];
      reorderable(ul, {
        axis: "y",
        item: ".row",
        canCarry: () => false,
        ring: (i) => (i === 0 ? [{ id: "a", label: "a", run: () => rung.push("a") }] : []),
        onReorder: () => {},
      });
      const first = ul.children[0];
      fire(first, "pointerdown", { button: 0, pointerId: 1, pointerType: "touch", clientY: 20 });
      vi.advanceTimersByTime(450);
      expect(first.classList.contains("reorder-item--carried")).toBe(true, "lifted for the ring");
      fire(first, "pointerup", { pointerId: 1, pointerType: "touch", clientY: 20 });
      vi.runAllTimers();

      const second = ul.children[1];
      fire(second, "pointerdown", { button: 0, pointerId: 2, pointerType: "touch", clientY: 60 });
      vi.advanceTimersByTime(450);
      expect(second.classList.contains("reorder-item--carried")).toBe(false, "nothing to open");
      fire(second, "pointermove", { pointerId: 2, pointerType: "touch", clientY: 100 });
      fire(second, "pointerup", { pointerId: 2, pointerType: "touch", clientY: 100 });
      expect(second.style.transform).toBe("");
    } finally {
      vi.useRealTimers();
    }
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

// ---- a finger has to rest first (user report, 2026-08-19) ----
//
// Dragging a card up the list and SCROLLING the list are the same movement on
// the same axis, so five pixels of it used to carry a card away while the user
// was only scrolling. Time is what separates the two intents.
describe("reorderable on a touch screen", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  const touchList = (onReorder, extra = {}) => {
    const ul = list();
    layOut(ul);
    reorderable(ul, { axis: "y", item: ".row", onReorder, ...extra });
    return ul;
  };

  test("a finger that moves straight away is scrolling, and nothing is carried", () => {
    const moves = [];
    const ul = touchList((f, t) => moves.push([f, t]));
    const row = ul.children[0];

    fire(row, "pointerdown", { button: 0, pointerId: 1, pointerType: "touch", clientY: 5, clientX: 5 });
    // The scroll begins before the hold is up.
    vi.advanceTimersByTime(120);
    fire(row, "pointermove", { pointerId: 1, clientY: 95, clientX: 5 });
    fire(row, "pointerup", { pointerId: 1, clientY: 95, clientX: 5 });

    expect(moves).toEqual([]);
    // And the list never entered the dragging state, so nothing was captured.
    expect(ul.hasAttribute("data-reordering")).toBe(false);
  });

  test("a finger that rests picks the item up, before it has moved at all", () => {
    const ul = touchList(() => {});
    const row = ul.children[0];

    fire(row, "pointerdown", { button: 0, pointerId: 1, pointerType: "touch", clientY: 5, clientX: 5 });
    expect(ul.hasAttribute("data-reordering")).toBe(false);

    vi.advanceTimersByTime(400);

    // Picked up where it stands — the whole point of the indicator.
    expect(ul.hasAttribute("data-reordering")).toBe(true);
    expect(row.classList.contains("reorder-item--carried")).toBe(true);
  });

  test("...and then it drags, the way it always did", () => {
    const moves = [];
    const ul = touchList((f, t) => moves.push([f, t]));
    const row = ul.children[0];

    fire(row, "pointerdown", { button: 0, pointerId: 1, pointerType: "touch", clientY: 5, clientX: 5 });
    vi.advanceTimersByTime(400);
    fire(row, "pointermove", { pointerId: 1, clientY: 95, clientX: 5 });
    fire(row, "pointerup", { pointerId: 1, clientY: 95, clientX: 5 });

    expect(moves).toEqual([[0, 2]]);
  });

  test("a mouse still drags immediately — it has no second intent", () => {
    const moves = [];
    const ul = touchList((f, t) => moves.push([f, t]));
    const row = ul.children[0];

    fire(row, "pointerdown", { button: 0, pointerId: 1, pointerType: "mouse", clientY: 5, clientX: 5 });
    fire(row, "pointermove", { pointerId: 1, clientY: 95, clientX: 5 });
    fire(row, "pointerup", { pointerId: 1, clientY: 95, clientX: 5 });

    expect(moves).toEqual([[0, 2]]);
  });

  test("a grip needs no wait: pressing it is already the whole intent", () => {
    const moves = [];
    const ul = touchList((f, t) => moves.push([f, t]), { handle: ".grip" });
    const grip = ul.children[0].querySelector(".grip");

    fire(grip, "pointerdown", { button: 0, pointerId: 1, pointerType: "touch", clientY: 5, clientX: 5 });
    fire(grip, "pointermove", { pointerId: 1, clientY: 95, clientX: 5 });
    fire(grip, "pointerup", { pointerId: 1, clientY: 95, clientX: 5 });

    expect(moves).toEqual([[0, 2]]);
  });

  test("`hold: true` asks the finger to rest even on a grip", () => {
    // The sidebar's grip is also the button that opens the space, so a finger
    // on it proves nothing — scrolling the column kept picking spaces up
    // (user call, 2026-08-24).
    const moves = [];
    const ul = touchList((f, t) => moves.push([f, t]), { handle: ".grip", hold: true });
    const grip = ul.children[0].querySelector(".grip");

    // Moving straight away is a scroll: nothing is carried.
    fire(grip, "pointerdown", { button: 0, pointerId: 1, pointerType: "touch", clientY: 5, clientX: 5 });
    fire(grip, "pointermove", { pointerId: 1, clientY: 95, clientX: 5 });
    fire(grip, "pointerup", { pointerId: 1, clientY: 95, clientX: 5 });
    expect(moves).toEqual([]);

    // Resting first picks it up, and then it drags.
    fire(grip, "pointerdown", { button: 0, pointerId: 2, pointerType: "touch", clientY: 5, clientX: 5 });
    vi.advanceTimersByTime(400);
    fire(grip, "pointermove", { pointerId: 2, clientY: 95, clientX: 5 });
    fire(grip, "pointerup", { pointerId: 2, clientY: 95, clientX: 5 });
    expect(moves).toEqual([[0, 2]]);
  });

  test("`hold: true` leaves the mouse's immediate drag on the grip alone", () => {
    const moves = [];
    const ul = touchList((f, t) => moves.push([f, t]), { handle: ".grip", hold: true });
    const grip = ul.children[0].querySelector(".grip");

    fire(grip, "pointerdown", { button: 0, pointerId: 1, pointerType: "mouse", clientY: 5, clientX: 5 });
    fire(grip, "pointermove", { pointerId: 1, clientY: 95, clientX: 5 });
    fire(grip, "pointerup", { pointerId: 1, clientY: 95, clientX: 5 });

    expect(moves).toEqual([[0, 2]]);
  });

  test("`holdMs` stretches the rest for the list that asks", () => {
    const ul = touchList(() => {}, { holdMs: 700 });
    const row = ul.children[0];

    fire(row, "pointerdown", { button: 0, pointerId: 1, pointerType: "touch", clientY: 5, clientX: 5 });
    vi.advanceTimersByTime(400);
    // The default rest has passed and nothing happened: this list waits longer.
    expect(ul.hasAttribute("data-reordering")).toBe(false);
    vi.advanceTimersByTime(300);
    expect(ul.hasAttribute("data-reordering")).toBe(true);
  });

  test("letting go before the wait is over is a tap, not a drag", () => {
    const moves = [];
    const ul = touchList((f, t) => moves.push([f, t]));
    const row = ul.children[0];

    fire(row, "pointerdown", { button: 0, pointerId: 1, pointerType: "touch", clientY: 5, clientX: 5 });
    vi.advanceTimersByTime(100);
    fire(row, "pointerup", { pointerId: 1, clientY: 5, clientX: 5 });
    // The timer must not fire after the finger is gone.
    vi.advanceTimersByTime(400);

    expect(moves).toEqual([]);
    expect(ul.hasAttribute("data-reordering")).toBe(false);
  });
});

// ---- a list whose items can be picked (2026-08-21) ----
//
// Rest to mark (selection mode), tap to pick more, rest on one already picked
// to carry them all.
describe("reorderable with a selection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  const setup = (extra = {}) => {
    const ul = list(4);
    layOut(ul);
    const calls = { holds: [], many: [], one: [] };
    reorderable(ul, {
      axis: "y",
      item: ".row",
      onHold: (i) => (calls.holds.push(i), true),
      onReorder: (f, t) => calls.one.push([f, t]),
      onReorderMany: (f, t) => calls.many.push([f, t]),
      ...extra,
    });
    return { ul, calls };
  };

  test("a finger that rests asks the caller, and is not carried when it says so", () => {
    const { ul, calls } = setup();
    const row = ul.children[1];
    fire(row, "pointerdown", { button: 0, pointerId: 1, pointerType: "touch", clientY: 45, clientX: 5 });
    vi.advanceTimersByTime(400);
    expect(calls.holds).toEqual([1]);
    expect(ul.hasAttribute("data-reordering")).toBe(false);
    // The click that follows the release is swallowed — a hold is not a tap.
    const click = fire(row, "click", {});
    expect(click.defaultPrevented).toBe(true);
  });

  test("a mouse that rests asks too, once there is someone to ask", () => {
    const { ul, calls } = setup();
    fire(ul.children[2], "pointerdown", { button: 0, pointerId: 1, pointerType: "mouse", clientY: 85, clientX: 5 });
    vi.advanceTimersByTime(400);
    expect(calls.holds).toEqual([2]);
  });

  test("a mouse that moves before the wait is up drags, as it always did", () => {
    const { ul, calls } = setup();
    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, pointerType: "mouse", clientY: 5, clientX: 5 });
    fire(row, "pointermove", { pointerId: 1, clientY: 95, clientX: 5 });
    fire(row, "pointerup", { pointerId: 1, clientY: 95, clientX: 5 });
    expect(calls.holds).toEqual([]);
    expect(calls.one).toEqual([[0, 2]]);
  });

  test("told the item is part of a pile, it carries the pile and reports them all", () => {
    const { ul, calls } = setup({ onHold: () => false, carried: () => [1, 3] });
    // Held from before the lift: the carried row leaves a ghost in its place
    // and then the list itself, so the rows are no longer where a search of
    // the list would find them.
    const rows = [...ul.children];
    const row = rows[1];
    fire(row, "pointerdown", { button: 0, pointerId: 1, pointerType: "touch", clientY: 45, clientX: 5 });
    vi.advanceTimersByTime(400);
    expect(row.classList.contains("reorder-item--carried")).toBe(true);
    expect(row.getAttribute("data-carry")).toBe("2");
    expect(rows[3].classList.contains("reorder-item--stacked")).toBe(true);
    fire(row, "pointermove", { pointerId: 1, clientY: -20, clientX: 5 });
    fire(row, "pointerup", { pointerId: 1, clientY: -20, clientX: 5 });
    expect(calls.many).toEqual([[[1, 3], 0]]);
    expect(calls.one).toEqual([]);
    expect(row.hasAttribute("data-carry")).toBe(false);
    expect(rows[3].classList.contains("reorder-item--stacked")).toBe(false);
  });

  test("a free drag (Ctrl) leaves the list alone and lands only on a free zone", async () => {
    // 2026-08-26: Ctrl held at pointerdown is the intent — no rest, no axis
    // lock, no gap — and the sidebar's spaces are the only places it can go.
    const ul = list(3);
    layOut(ul);
    const zone = document.createElement("div");
    zone.dataset.spaceDrop = "Mercado";
    zone.getBoundingClientRect = () => ({ left: 300, right: 400, top: 0, bottom: 40, width: 100, height: 40, x: 300, y: 0, toJSON() {} });
    document.body.append(zone);
    const reordered = [];
    const dropped = [];
    reorderable(ul, {
      axis: "y",
      item: ".row",
      onReorder: (from, to) => reordered.push([from, to]),
      free: (e) => e.ctrlKey,
      freeZones: () => [zone],
      onDropZone: (from, el) => dropped.push([from, el.dataset.spaceDrop]),
    });
    const row = ul.children[0];
    // Sideways at once — the axis lock would have dropped this as a swipe.
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientX: 10, clientY: 5, ctrlKey: true });
    fire(row, "pointermove", { pointerId: 1, clientX: 60, clientY: 8 });
    expect(row.classList.contains("reorder-item--free")).toBe(true);
    fire(row, "pointermove", { pointerId: 1, clientX: 350, clientY: 20 });
    await nextFrame();
    expect(zone.classList.contains("reorder-item--into")).toBe(true);
    fire(row, "pointerup", { pointerId: 1, clientX: 350, clientY: 20 });
    expect(dropped).toEqual([[0, "Mercado"]]);
    expect(reordered).toEqual([]);
    expect(zone.classList.contains("reorder-item--into")).toBe(false);

    // Released anywhere else: nothing happens, the card snaps back.
    fire(row, "pointerdown", { button: 0, pointerId: 2, clientX: 10, clientY: 5, ctrlKey: true });
    fire(row, "pointermove", { pointerId: 2, clientX: 10, clientY: 95 });
    fire(row, "pointerup", { pointerId: 2, clientX: 10, clientY: 95 });
    expect(dropped).toHaveLength(1);
    expect(reordered).toEqual([]);
    zone.remove();
  });
});

describe("reorderable in the drag layer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const bound = (ul) => {
    ul.getBoundingClientRect = () => ({
      left: 0, right: 200, width: 200, top: 0, bottom: 120, height: 120,
      x: 0, y: 0, toJSON() {},
    });
  };

  test("the carried item leaves the list, and comes back where it left", () => {
    // Why it leaves at all: `position: fixed` is relative to the viewport
    // only while no ancestor makes a containing block, and every screen
    // column makes one (`container-type` implies `contain: layout`) — so the
    // item rode INSIDE the column and was cut by its overflow. This is the
    // test that catches the expensive mistake: an item that does not come
    // back is an item the user watched disappear.
    const ul = list();
    layOut(ul);
    reorderable(ul, { axis: "y", item: ".row", onReorder: () => {} });

    const rows = [...ul.children];
    fire(rows[0], "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    fire(rows[0], "pointermove", { pointerId: 1, clientY: 100 });

    expect(rows[0].parentElement).not.toBe(ul);
    expect(rows[0].parentElement.classList.contains("drag-layer")).toBe(true);
    expect(ul.querySelector(".reorder-ghost")).toBeTruthy();

    fire(rows[0], "pointerup", { pointerId: 1, clientY: 100 });
    expect([...ul.children]).toEqual(rows);
    expect(ul.querySelector(".reorder-ghost")).toBeNull();
  });

  test("...and comes back when the gesture is taken away, too", () => {
    const ul = list();
    layOut(ul);
    reorderable(ul, { axis: "y", item: ".row", onReorder: () => {} });

    const rows = [...ul.children];
    fire(rows[1], "pointerdown", { button: 0, pointerId: 1, clientY: 45 });
    fire(rows[1], "pointermove", { pointerId: 1, clientY: 100 });
    fire(rows[1], "pointercancel", { pointerId: 1 });

    expect([...ul.children]).toEqual(rows);
    expect(rows[1].style.position).toBe("");
  });

  test("released on its own slot, it still comes home", () => {
    const ul = list();
    layOut(ul);
    const moves = [];
    reorderable(ul, { axis: "y", item: ".row", onReorder: (f, t) => moves.push([f, t]) });

    const rows = [...ul.children];
    fire(rows[1], "pointerdown", { button: 0, pointerId: 1, clientY: 45 });
    fire(rows[1], "pointermove", { pointerId: 1, clientY: 55 });
    fire(rows[1], "pointerup", { pointerId: 1, clientY: 55 });

    expect([...ul.children]).toEqual(rows);
    expect(moves).toEqual([]);
  });

  test("carried past the edge, it STOPS at the edge", () => {
    // Out of the column it could float over the whole window. It does not:
    // the limit is now a decision (the scroller's box, plus the slack the
    // shadow needs) instead of a scroller's cut.
    const ul = list();
    layOut(ul);
    bound(ul);
    reorderable(ul, { axis: "y", item: ".row", onReorder: () => {} });

    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    fire(row, "pointermove", { pointerId: 1, clientY: 900 });

    // 120 (the list's bottom) + 8 of slack − 40 (the row's own height).
    expect(row.style.transform).toBe("translateY(88px)");
  });

  test("a card in the air carries no tooltip, and gets it back on landing", () => {
    const ul = list();
    layOut(ul);
    bound(ul);
    reorderable(ul, { axis: "y", item: ".row", onReorder: () => {} });

    const row = ul.children[0];
    const grip = row.querySelector(".grip");
    grip.setAttribute("title", "click to open, double-click to rename");
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    fire(row, "pointermove", { pointerId: 1, clientY: 60 });
    expect(grip.hasAttribute("title")).toBe(false);

    fire(row, "pointerup", { pointerId: 1, clientY: 60 });
    expect(grip.getAttribute("title")).toBe("click to open, double-click to rename");
  });

  test("a free drag is not contained — crossing is the whole point", () => {
    const ul = list();
    layOut(ul);
    bound(ul);
    reorderable(ul, {
      axis: "y",
      item: ".row",
      free: () => true,
      freeZones: () => [],
      onReorder: () => {},
    });

    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientX: 5, clientY: 20 });
    fire(row, "pointermove", { pointerId: 1, clientX: 5, clientY: 900 });

    expect(row.style.transform).toBe("translate(0px, 880px)");
  });
});

describe("reorderable landing", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  /// jsdom has no animations: this is the smallest thing the action can fly
  /// with — every `animate()` call is kept, and the last one is the landing.
  function flights(el) {
    const made = [];
    el.animate = (frames, options) => {
      const flight = { frames, options, onfinish: null, oncancel: null, cancel() {} };
      made.push(flight);
      return flight;
    };
    return made;
  }

  test("the move commits when the item ARRIVES, not when the hand lets go", () => {
    const ul = list();
    layOut(ul);
    const moves = [];
    reorderable(ul, { axis: "y", item: ".row", onReorder: (f, t) => moves.push([f, t]) });

    const row = ul.children[0];
    const made = flights(row);
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    fire(row, "pointermove", { pointerId: 1, clientY: 100 });
    fire(row, "pointerup", { pointerId: 1, clientY: 100 });

    // Still in the air: nothing committed, nothing settled.
    expect(moves).toEqual([]);
    expect(row.classList.contains("reorder-item--carried")).toBe(true);
    expect(row.parentElement).not.toBe(ul);
    // Row 1 spans 40-80 and the carried row is 40 tall: it lands on 40.
    expect(made.at(-1).frames.at(-1).transform).toBe("translate(0px, 40px)");

    made.at(-1).onfinish();
    expect(moves).toEqual([[0, 1]]);
    expect(row.classList.contains("reorder-item--carried")).toBe(false);
    expect(row.parentElement).toBe(ul);
  });

  test("a second grab is refused while the first is still landing", () => {
    const ul = list();
    layOut(ul);
    const moves = [];
    reorderable(ul, { axis: "y", item: ".row", onReorder: (f, t) => moves.push([f, t]) });

    const row = ul.children[0];
    const made = flights(row);
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    fire(row, "pointermove", { pointerId: 1, clientY: 100 });
    fire(row, "pointerup", { pointerId: 1, clientY: 100 });

    const other = ul.children[2];
    fire(other, "pointerdown", { button: 0, pointerId: 2, clientY: 100 });
    fire(other, "pointermove", { pointerId: 2, clientY: 20 });
    fire(other, "pointerup", { pointerId: 2, clientY: 20 });
    expect(moves).toEqual([]);

    made.at(-1).onfinish();
    expect(moves).toEqual([[0, 1]]);
  });

  test("with less motion asked for, it commits at once", () => {
    const ul = list();
    layOut(ul);
    const moves = [];
    reorderable(ul, { axis: "y", item: ".row", onReorder: (f, t) => moves.push([f, t]) });

    const row = ul.children[0];
    flights(row);
    const before = window.matchMedia;
    window.matchMedia = () => ({ matches: true });
    try {
      fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
      fire(row, "pointermove", { pointerId: 1, clientY: 100 });
      fire(row, "pointerup", { pointerId: 1, clientY: 100 });
    } finally {
      window.matchMedia = before;
    }

    expect(moves).toEqual([[0, 1]]);
    expect(row.parentElement).toBe(ul);
  });
});

// ---- the list SETTLES, it does not appear (2026-09-15) ----
describe("reorderable settling", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  /// Every row given something to fly with, and every flight kept per row.
  function flightsAll(ul) {
    const made = new Map();
    for (const li of ul.children) {
      const mine = [];
      made.set(li, mine);
      li.animate = (frames, options) => {
        const flight = { frames, options, onfinish: null, oncancel: null, cancel() {} };
        mine.push(flight);
        return flight;
      };
    }
    return made;
  }

  test("the redraw is flown into, however late it comes", async () => {
    const ul = list(3);
    layOut(ul);
    const made = flightsAll(ul);
    const rows = [...ul.children];
    // A caller that goes to disk: the new order arrives a turn later, which is
    // what the notes board does (onSetOrder → snapshot back).
    reorderable(ul, {
      axis: "y",
      item: ".row",
      onReorder: () => {
        setTimeout(() => {
          ul.append(ul.children[0]);
          layOut(ul);
        }, 0);
      },
    });

    const row = rows[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    fire(row, "pointermove", { pointerId: 1, clientY: 100 });
    fire(row, "pointerup", { pointerId: 1, clientY: 100 });
    made.get(row).at(-1).onfinish();

    // Until the redraw lands, the list stands exactly as the hand left it:
    // row 1 is still holding the gap open.
    expect(rows[1].style.transform).toBe("translateY(-40px)");

    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();

    expect(rows[1].style.transform).toBe("");
    // Row 1 moved from 40 up to 0 and flies the 40px back.
    const settle = made.get(rows[1]).at(-1);
    expect(settle.frames[0].transform).toBe("translate(0px, 40px)");
    expect(settle.frames.at(-1).transform).toBe("none");
  });

  test("a drop that redraws nothing still puts the list down", async () => {
    vi.useFakeTimers();
    try {
      const ul = list(3);
      layOut(ul);
      const made = flightsAll(ul);
      const rows = [...ul.children];
      reorderable(ul, { axis: "y", item: ".row", onReorder: () => {} });

      const row = rows[0];
      fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
      fire(row, "pointermove", { pointerId: 1, clientY: 100 });
      fire(row, "pointerup", { pointerId: 1, clientY: 100 });
      made.get(row).at(-1).onfinish();
      expect(rows[1].style.transform).toBe("translateY(-40px)");

      vi.advanceTimersByTime(1200);
      expect(rows[1].style.transform).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---- one reading per frame, and a threshold that stands still (2026-09-14) ----
describe("reorderable, a frame at a time", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  /// The list's own box, so the containment of `carry` has something to clamp
  /// against: without it every rect is jsdom's zero and the item is pinned.
  const bound = (ul) => {
    ul.getBoundingClientRect = () => ({
      left: 0, right: 200, width: 200, top: 0, bottom: 120, height: 120,
      x: 0, y: 0, toJSON() {},
    });
  };

  test("many movements inside one frame are read once, as the last one", async () => {
    // A 120 Hz pointer delivers twice the events the screen paints, and each
    // one used to walk the whole list.
    const ul = list();
    layOut(ul);
    bound(ul);
    reorderable(ul, { axis: "y", item: ".row", onReorder: () => {} });

    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    // The movement that STARTS the drag is read at once: it carries the
    // direction the gesture set off in, which the axis lock needs.
    fire(row, "pointermove", { pointerId: 1, clientY: 30 });
    expect(row.style.transform).toBe("translateY(10px)");

    fire(row, "pointermove", { pointerId: 1, clientY: 50 });
    fire(row, "pointermove", { pointerId: 1, clientY: 70 });
    expect(row.style.transform).toBe("translateY(10px)", "still the painted frame");

    await nextFrame();
    expect(row.style.transform).toBe("translateY(50px)");
  });

  test("the release reads the movement still in the air", async () => {
    // Letting go in the same frame as the last movement: without the flush the
    // item would be put down a slot behind the hand.
    const ul = list();
    layOut(ul);
    bound(ul);
    const moves = [];
    reorderable(ul, { axis: "y", item: ".row", onReorder: (f, t) => moves.push([f, t]) });

    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    fire(row, "pointermove", { pointerId: 1, clientY: 30 });
    fire(row, "pointermove", { pointerId: 1, clientY: 110 });
    fire(row, "pointerup", { pointerId: 1, clientY: 110 });

    expect(moves).toEqual([[0, 2]]);
  });

  test("a hand resting on the boundary does not make the list flutter", async () => {
    // The threshold is the neighbour's middle (60 here), and a hand holding
    // still on it swapped the two rows many times a second. Taking the slot
    // costs 12 % of a step past the middle; giving it back costs the same
    // coming home (dnd-kit #1456).
    const ul = list();
    layOut(ul);
    bound(ul);
    const moves = [];
    reorderable(ul, { axis: "y", item: ".row", onReorder: (f, t) => moves.push([f, t]) });

    const row = ul.children[0];
    const next = ul.children[1];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    // Exactly on the middle, and two pixels past it: not enough.
    fire(row, "pointermove", { pointerId: 1, clientY: 60 });
    await nextFrame();
    expect(next.style.transform).toBe("");
    fire(row, "pointermove", { pointerId: 1, clientY: 62 });
    await nextFrame();
    expect(next.style.transform).toBe("");

    // Past the hysteresis, the neighbour opens the gap...
    fire(row, "pointermove", { pointerId: 1, clientY: 66 });
    await nextFrame();
    expect(next.style.transform).toBe("translateY(-40px)");

    // ...and a hand that wanders back to the middle keeps it there.
    fire(row, "pointermove", { pointerId: 1, clientY: 58 });
    await nextFrame();
    expect(next.style.transform).toBe("translateY(-40px)");
    fire(row, "pointerup", { pointerId: 1, clientY: 58 });
    expect(moves).toEqual([[0, 1]]);
  });

  test("a list that changes under the drag gives the gesture up", async () => {
    // The watcher brought a task from another device and Svelte redrew: every
    // rect measured at the start is false, and what is at stake is a line in
    // the user's file.
    const ul = list();
    layOut(ul);
    bound(ul);
    const moves = [];
    reorderable(ul, { axis: "y", item: ".row", onReorder: (f, t) => moves.push([f, t]) });

    const rows = [...ul.children];
    fire(rows[0], "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    fire(rows[0], "pointermove", { pointerId: 1, clientY: 40 });
    expect(ul.hasAttribute("data-reordering")).toBe(true);

    const arrived = document.createElement("li");
    arrived.className = "row";
    ul.append(arrived);
    fire(rows[0], "pointermove", { pointerId: 1, clientY: 110 });
    await nextFrame();

    expect(ul.hasAttribute("data-reordering")).toBe(false);
    expect(rows[0].parentElement).toBe(ul);
    expect(ul.querySelector(".reorder-ghost")).toBeNull();
    fire(rows[0], "pointerup", { pointerId: 1, clientY: 110 });
    expect(moves).toEqual([]);
  });
});

describe("reorderable in a scroller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  /// A list inside something that scrolls. jsdom has no layout, so the box's
  /// rect is a stub and `scrollTop` is a plain number that stops at `max` —
  /// which is all "the end of the list" means here.
  function scroller(ul, max = 200) {
    const box = document.createElement("div");
    box.style.overflowY = "auto";
    ul.before(box);
    box.append(ul);
    box.getBoundingClientRect = () => ({
      left: 0, right: 200, width: 200, top: 0, bottom: 120, height: 120,
      x: 0, y: 0, toJSON() {},
    });
    let top = 0;
    Object.defineProperty(box, "scrollTop", {
      get: () => top,
      set: (v) => {
        top = Math.max(0, Math.min(max, v));
      },
    });
    return box;
  }

  const frames = async (n) => {
    for (let i = 0; i < n; i++) await nextFrame();
  };

  test("the list scrolling under the drag moves the slot, not just the pixels", async () => {
    // The rects were measured when the drag set off. Scroll the list and they
    // all lie: the hand has not moved, but what is under it has. Rows are 40
    // tall, so 40 of scroll is exactly one row's worth of slot.
    const ul = list(4);
    const box = scroller(ul);
    layOut(ul);
    const moves = [];
    reorderable(ul, { axis: "y", item: ".row", onReorder: (f, t) => moves.push([f, t]) });

    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    fire(row, "pointermove", { pointerId: 1, clientY: 45 });
    await nextFrame();
    // Short of row 1's middle: nothing has moved yet.
    expect(ul.children[1].style.transform).toBe("");

    box.scrollTop = 40;
    fire(row, "pointermove", { pointerId: 1, clientY: 45 });
    await nextFrame();
    fire(row, "pointerup", { pointerId: 1, clientY: 45 });

    expect(moves).toEqual([[0, 1]]);
  });

  test("carried into the bottom edge, the list comes to the hand", async () => {
    const ul = list(4);
    const box = scroller(ul);
    layOut(ul);
    reorderable(ul, { axis: "y", item: ".row", onReorder: () => {} });

    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    // 110, inside the last 40 of a 120-tall box: three quarters of the way
    // into the band, so it moves at three quarters of the speed.
    fire(row, "pointermove", { pointerId: 1, clientY: 110 });
    await frames(2);

    const first = box.scrollTop;
    expect(first).toBeGreaterThan(0);
    await frames(2);
    expect(box.scrollTop).toBeGreaterThan(first);

    fire(row, "pointerup", { pointerId: 1, clientY: 110 });
    const stopped = box.scrollTop;
    await frames(3);
    expect(box.scrollTop).toBe(stopped);
  });

  test("a hand in the middle of the list leaves it where it is", async () => {
    const ul = list(4);
    const box = scroller(ul);
    layOut(ul);
    reorderable(ul, { axis: "y", item: ".row", onReorder: () => {} });

    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    fire(row, "pointermove", { pointerId: 1, clientY: 60 });
    await frames(3);

    expect(box.scrollTop).toBe(0);
    fire(row, "pointerup", { pointerId: 1, clientY: 60 });
  });

  test("at the end of the list it stops asking for more", async () => {
    const ul = list(4);
    const box = scroller(ul, 20);
    layOut(ul);
    reorderable(ul, { axis: "y", item: ".row", onReorder: () => {} });

    const row = ul.children[0];
    fire(row, "pointerdown", { button: 0, pointerId: 1, clientY: 20 });
    fire(row, "pointermove", { pointerId: 1, clientY: 118 });
    await frames(5);

    expect(box.scrollTop).toBe(20);
    fire(row, "pointerup", { pointerId: 1, clientY: 118 });
  });
});

// ---- the action ring (2026-09-14) ----
//
// Holding a card opens the actions BESIDE the finger: the same finger slides
// onto one and lets go. Unlike the hold that enters selection, the gesture is
// not handed back — the action keeps the pointer, so what is tested here is
// that the column takes the gesture whole and the list never moves under it.
describe("reorderable with an action ring", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
    window.innerWidth = 400;
    window.innerHeight = 800;
  });
  afterEach(() => vi.useRealTimers());

  const setup = (extra = {}) => {
    const ul = list(4);
    layOut(ul);
    const calls = { hovered: [], chosen: [], ran: [], one: [], holds: [] };
    const actions = ["complete", "today", "pin", "move", "more"].map((id) => ({
      id,
      run: () => calls.ran.push(id),
    }));
    reorderable(ul, {
      axis: "y",
      item: ".row",
      ring: () => actions,
      onRingHover: (slot) => calls.hovered.push(slot),
      onReorder: (f, t) => calls.one.push([f, t]),
      ...extra,
    });
    return { ul, calls, actions };
  };

  /// The pointer on square `i` of the column opened at `at`. The column grows
  /// down-right from a finger in the top-left quarter of a 400×800 window,
  /// which is where these rows are.
  const onRow = (at, i, count = 5) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const box = ringBox(at, viewport, count, ringQuadrant(at, viewport));
    const { x, y } = ringRowCenter(box, i);
    return { clientX: x, clientY: y };
  };
  /// Clear of the column altogether — below every square and every bit of
  /// slack.
  const offSheet = (at, count = 5) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const box = ringBox(at, viewport, count, ringQuadrant(at, viewport));
    return { clientX: box.x + box.width / 2, clientY: box.y + box.height + 120 };
  };

  const openAt = (ul, row = 1, at = { x: 60, y: 50 }) => {
    const el = ul.children[row];
    fire(el, "pointerdown", {
      button: 0,
      pointerId: 1,
      pointerType: "touch",
      clientX: at.x,
      clientY: at.y,
    });
    vi.advanceTimersByTime(400);
    return { el, at };
  };

  test("the hold opens the ring and KEEPS the finger", () => {
    const { ul } = setup();
    const { el } = openAt(ul);
    // The card is in the air, exactly as a carried one is — same class, same
    // layer — and the gesture is still live: releasing is what ends it.
    expect(el.classList.contains("reorder-item--carried")).toBe(true);
    expect(ul.hasAttribute("data-reordering")).toBe(true);
  });

  test("moving after the hold picks a square and never moves the list", async () => {
    const { ul, calls } = setup();
    const { el, at } = openAt(ul);
    const others = [...ul.children].filter((c) => c !== el && c.className === "row");

    fire(el, "pointermove", { pointerId: 1, ...onRow(at, 0) });
    await nextFrame();
    expect(calls.hovered).toEqual([0]);

    fire(el, "pointermove", { pointerId: 1, ...onRow(at, 4) });
    await nextFrame();
    expect(calls.hovered).toEqual([0, 4]);
    // Not one neighbour opened a gap: the column is not a drag.
    expect(others.every((c) => !c.style.transform)).toBe(true);
  });

  test("the release runs the square the finger let go on", async () => {
    const { ul, calls } = setup();
    const { el, at } = openAt(ul);
    fire(el, "pointermove", { pointerId: 1, ...onRow(at, 2) });
    fire(el, "pointerup", { pointerId: 1, ...onRow(at, 2) });
    // The slice runs a microtask AFTER the column closes
    // (services/actionRing.js, `afterRingCloses`).
    await Promise.resolve();

    expect(calls.ran).toEqual(["pin"]);
    expect(calls.one).toEqual([]);
    // And the card is back in the list, in its own place.
    expect(el.parentElement).toBe(ul);
    expect(el.style.position).toBe("");
    expect(ul.hasAttribute("data-reordering")).toBe(false);
  });

  test("released clear of the column, or on the card itself, nothing happens", async () => {
    const { ul, calls } = setup();
    const first = openAt(ul);
    // Out past the column altogether.
    fire(first.el, "pointermove", { pointerId: 1, ...offSheet(first.at) });
    fire(first.el, "pointerup", { pointerId: 1, ...offSheet(first.at) });
    expect(calls.ran).toEqual([]);

    // And let go without moving at all: the finger is in the dead square
    // around itself, which is the card.
    const second = openAt(ul, 2, { x: 60, y: 90 });
    fire(second.el, "pointerup", { pointerId: 1, clientX: 60, clientY: 90 });
    // The slice runs a microtask AFTER the column closes
    // (services/actionRing.js, `afterRingCloses`).
    await Promise.resolve();
    expect(calls.ran).toEqual([]);
    expect(calls.one).toEqual([]);
  });

  test("`onRing` takes the release for itself when the caller wants it", async () => {
    const { ul, calls, actions } = setup({
      onRing: (from, action) => calls.chosen.push([from, action?.id ?? null]),
    });
    const { el, at } = openAt(ul);
    fire(el, "pointermove", { pointerId: 1, ...onRow(at, 0) });
    fire(el, "pointerup", { pointerId: 1, ...onRow(at, 0) });
    // The slice runs a microtask AFTER the column closes
    // (services/actionRing.js, `afterRingCloses`).
    await Promise.resolve();

    expect(calls.chosen).toEqual([[1, actions[0].id]]);
    expect(calls.ran).toEqual([]);
  });

  test("an item with no actions holds the way it always did", () => {
    const { ul, calls } = setup({
      ring: () => [],
      onHold: (i) => (calls.holds.push(i), true),
    });
    const { el } = openAt(ul);
    expect(calls.holds).toEqual([1]);
    expect(el.classList.contains("reorder-item--carried")).toBe(false);
  });

  test("more than five actions never reach the finger", async () => {
    const calls = [];
    const ul = list(4);
    layOut(ul);
    const many = ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({ id, run: () => calls.push(id) }));
    reorderable(ul, { axis: "y", item: ".row", ring: () => many });

    const { el, at } = openAt(ul);
    // The column is five squares, never seven: the last one is the fifth
    // action, and `f`/`g` are only in the ⋮.
    fire(el, "pointermove", { pointerId: 1, ...onRow(at, 4) });
    fire(el, "pointerup", { pointerId: 1, ...onRow(at, 4) });
    // The slice runs a microtask AFTER the column closes
    // (services/actionRing.js, `afterRingCloses`).
    await Promise.resolve();
    expect(calls).toEqual(["e"]);
  });
});
