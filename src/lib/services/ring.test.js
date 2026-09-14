import { describe, test, expect } from "vitest";
import {
  RING_ITEM,
  RING_MAX,
  RING_STEP,
  fitRing,
  ringBox,
  ringQuadrant,
  ringRowCenter,
  ringSize,
  ringSlotAt,
} from "./ring.js";

const phone = { width: 412, height: 915 };
const down = { x: 1, y: 1 };
const up = { x: -1, y: -1 };

describe("which quarter the column grows into", () => {
  test("it opens away from the edge the finger is nearest", () => {
    const viewport = { width: 400, height: 800 };
    expect(ringQuadrant({ x: 40, y: 60 }, viewport)).toEqual({ x: 1, y: 1 });
    expect(ringQuadrant({ x: 360, y: 60 }, viewport)).toEqual({ x: -1, y: 1 });
    expect(ringQuadrant({ x: 360, y: 740 }, viewport)).toEqual({ x: -1, y: -1 });
    expect(ringQuadrant({ x: 40, y: 740 }, viewport)).toEqual({ x: 1, y: -1 });
  });
});

describe("how big the column is", () => {
  test("a square each, and a gap between them — never after the last", () => {
    expect(ringSize(5)).toEqual({ width: RING_ITEM, height: 5 * RING_STEP - (RING_STEP - RING_ITEM) });
    expect(ringSize(1)).toEqual({ width: RING_ITEM, height: RING_ITEM });
  });

  test("more than five never reaches the column", () => {
    expect(ringSize(9).height).toBe(ringSize(RING_MAX).height);
    expect(fitRing([1, 2, 3, 4, 5, 6, 7])).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("where the column goes", () => {
  test("it stands to the SIDE of the finger and is centred on it", () => {
    const at = { x: 60, y: 460 };
    const box = ringBox(at, phone, 5, down);
    expect(box.x).toBeGreaterThan(at.x);
    // Centred: as much of the column above the finger as below it.
    expect(box.y + box.height / 2).toBeCloseTo(at.y, 0);
    // Never under the finger: letting go where the card is has to cancel.
    expect(ringSlotAt(at, at, { count: 5, box })).toBeNull();
  });

  test("a finger on the right half opens it to the left, still centred", () => {
    const at = { x: 360, y: 460 };
    const box = ringBox(at, phone, 5, up);
    expect(box.x + box.width).toBeLessThan(at.x);
    expect(box.y + box.height / 2).toBeCloseTo(at.y, 0);
  });

  test("a side with no room flips rather than draw off the screen", () => {
    // The quarter points left, but a finger 30 in has no 64 of room there.
    const at = { x: 30, y: 460 };
    const box = ringBox(at, phone, 5, up);
    expect(box.x).toBeGreaterThan(at.x);
  });

  test("it is centred UNLESS the screen runs out, and then it is pulled in", () => {
    for (const at of [
      { x: 2, y: 2 },
      { x: 410, y: 913 },
      { x: 206, y: 457 },
    ]) {
      const box = ringBox(at, phone, 5, ringQuadrant(at, phone));
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(phone.width);
      expect(box.y + box.height).toBeLessThanOrEqual(phone.height);
    }
    // At the top of the screen there is no room above: the column sits as
    // high as it may and the finger is simply near its bottom.
    const high = ringBox({ x: 200, y: 20 }, phone, 5, down);
    expect(high.y).toBeGreaterThan(0);
    expect(high.y + high.height / 2).toBeGreaterThan(20);
  });

  test("a click sits closer than a finger does — nothing is covering the card", () => {
    const at = { x: 60, y: 460 };
    const held = ringBox(at, phone, 5, down);
    const clicked = ringBox(at, phone, 5, down, 12);
    expect(clicked.x).toBeLessThan(held.x);
    expect(clicked.y).toBe(held.y);
  });
});

describe("the square under the finger", () => {
  const at = { x: 60, y: 60 };
  const box = ringBox(at, phone, 5, down);
  const ring = { count: 5, box };
  const on = (i) => ringRowCenter(box, i);

  test("each square answers on its own middle", () => {
    for (let i = 0; i < 5; i += 1) expect(ringSlotAt(at, on(i), ring)).toBe(i);
  });

  test("the squares read top to bottom, whichever way the column opened", () => {
    const back = ringBox({ x: 360, y: 820 }, phone, 5, up);
    const upward = { count: 5, box: back };
    expect(ringSlotAt({ x: 360, y: 820 }, ringRowCenter(back, 0), upward)).toBe(0);
    expect(ringSlotAt({ x: 360, y: 820 }, ringRowCenter(back, 4), upward)).toBe(4);
    expect(ringRowCenter(back, 0).y).toBeLessThan(ringRowCenter(back, 4).y);
  });

  test("the gap between two squares belongs to the one above it", () => {
    // Just past the first square's bottom edge, inside the gap: still the
    // first — a thumb crossing it has not let go of anything.
    expect(ringSlotAt(at, { x: on(0).x, y: box.y + RING_ITEM + 2 }, ring)).toBe(0);
    expect(ringSlotAt(at, { x: on(0).x, y: box.y + RING_STEP + 2 }, ring)).toBe(1);
  });

  test("resting on the card cancels: the square around the finger is nobody's", () => {
    expect(ringSlotAt(at, at, ring)).toBeNull();
    expect(ringSlotAt(at, { x: at.x + 10, y: at.y + 10 }, ring)).toBeNull();
  });

  test("a thumb that overshoots an edge still holds the square it left", () => {
    expect(ringSlotAt(at, { x: box.x + box.width + 12, y: on(2).y }, ring)).toBe(2);
    expect(ringSlotAt(at, { x: on(4).x, y: box.y + box.height + 12 }, ring)).toBe(4);
  });

  test("far off the column is nothing at all", () => {
    expect(ringSlotAt(at, { x: box.x + box.width + 120, y: on(2).y }, ring)).toBeNull();
    expect(ringSlotAt(at, { x: on(0).x, y: box.y + box.height + 120 }, ring)).toBeNull();
  });

  test("a column of three answers three squares and no more", () => {
    const small = ringBox(at, phone, 3, down);
    const three = { count: 3, box: small };
    expect(ringSlotAt(at, ringRowCenter(small, 2), three)).toBe(2);
    expect(ringSlotAt(at, { x: ringRowCenter(small, 0).x, y: small.y + small.height + 8 }, three))
      .toBe(2);
  });
});
