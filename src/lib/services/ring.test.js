import { describe, test, expect } from "vitest";
import {
  RING_MAX,
  RING_RADIUS,
  fitRing,
  ringQuadrant,
  ringRadius,
  ringSlotAt,
  ringSlots,
} from "./ring.js";

const at = { x: 200, y: 300 };
const down = { x: 1, y: 1 };

describe("which quarter the ring opens into", () => {
  test("it opens away from the edge the finger is nearest", () => {
    const viewport = { width: 400, height: 800 };
    expect(ringQuadrant({ x: 40, y: 60 }, viewport)).toEqual({ x: 1, y: 1 });
    expect(ringQuadrant({ x: 360, y: 60 }, viewport)).toEqual({ x: -1, y: 1 });
    expect(ringQuadrant({ x: 360, y: 740 }, viewport)).toEqual({ x: -1, y: -1 });
    expect(ringQuadrant({ x: 40, y: 740 }, viewport)).toEqual({ x: 1, y: -1 });
  });
});

describe("how far the pills sit", () => {
  const phone = { width: 360, height: 780 };

  test("the whole radius wherever there is room for it", () => {
    expect(ringRadius({ x: 40, y: 40 }, { width: 1280, height: 800 }, down)).toBe(RING_RADIUS);
  });

  test("a 360-wide phone still fits the whole ring from the middle", () => {
    expect(ringRadius({ x: 180, y: 300 }, phone, down)).toBe(RING_RADIUS);
  });

  test("a narrower screen pulls the ring in rather than draw it off the edge", () => {
    // 320 across, the finger in the middle and the ring opening right: 160
    // of room, less half a pill and the margin it keeps off the edge.
    const small = { width: 320, height: 780 };
    expect(ringRadius({ x: 160, y: 300 }, small, down)).toBe(130);
  });

  test("it never closes past the point where the slices stop being targets", () => {
    expect(ringRadius({ x: 20, y: 20 }, phone, { x: -1, y: -1 })).toBe(96);
  });
});

describe("where the pills sit", () => {
  test("five spread over the quarter, the first on one axis and the last on the other", () => {
    const slots = ringSlots(5, down);
    expect(slots.map((s) => s.angle)).toEqual([0, 22.5, 45, 67.5, 90]);
    expect(slots[0].x).toBeCloseTo(RING_RADIUS);
    expect(slots[0].y).toBeCloseTo(0);
    expect(slots[4].x).toBeCloseTo(0);
    expect(slots[4].y).toBeCloseTo(RING_RADIUS);
  });

  test("the quarter is mirrored into the corner with room", () => {
    const [first] = ringSlots(4, { x: -1, y: -1 });
    expect(first.x).toBeCloseTo(-RING_RADIUS);
    expect(first.y).toBeCloseTo(0);
  });

  test("four slices is a ring too — the sidebar has nothing else to offer", () => {
    expect(ringSlots(4, down).map((s) => s.angle)).toEqual([0, 30, 60, 90]);
  });

  test("more than five never reaches the ring", () => {
    expect(ringSlots(9, down)).toHaveLength(RING_MAX);
    expect(fitRing([1, 2, 3, 4, 5, 6, 7])).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("the slice under the finger", () => {
  const ring = { count: 5, quadrant: down };
  const on = (angle, reach = RING_RADIUS) => {
    const rad = (angle * Math.PI) / 180;
    return { x: at.x + reach * Math.cos(rad), y: at.y + reach * Math.sin(rad) };
  };

  test("each pill answers on its own angle", () => {
    expect(ringSlotAt(at, on(0), ring)).toBe(0);
    expect(ringSlotAt(at, on(22.5), ring)).toBe(1);
    expect(ringSlotAt(at, on(45), ring)).toBe(2);
    expect(ringSlotAt(at, on(67.5), ring)).toBe(3);
    expect(ringSlotAt(at, on(90), ring)).toBe(4);
  });

  test("the sector reaches halfway to each neighbour", () => {
    expect(ringSlotAt(at, on(10), ring)).toBe(0);
    expect(ringSlotAt(at, on(13), ring)).toBe(1);
  });

  test("resting on the card cancels: the hole around the finger is nobody's", () => {
    expect(ringSlotAt(at, on(45, RING_RADIUS * 0.3), ring)).toBeNull();
    expect(ringSlotAt(at, at, ring)).toBeNull();
  });

  test("far past the pills is off the ring", () => {
    expect(ringSlotAt(at, on(45, RING_RADIUS * 3), ring)).toBeNull();
  });

  test("a thumb that overshoots the end axis still holds the end slice", () => {
    expect(ringSlotAt(at, on(-10), ring)).toBe(0);
    expect(ringSlotAt(at, on(100), ring)).toBe(4);
  });

  test("the other side of the finger is nothing at all", () => {
    expect(ringSlotAt(at, on(180), ring)).toBeNull();
    expect(ringSlotAt(at, on(-90), ring)).toBeNull();
  });

  test("a mirrored ring reads mirrored", () => {
    const left = { count: 5, quadrant: { x: -1, y: -1 } };
    expect(ringSlotAt(at, { x: at.x - RING_RADIUS, y: at.y }, left)).toBe(0);
    expect(ringSlotAt(at, { x: at.x, y: at.y - RING_RADIUS }, left)).toBe(4);
    expect(ringSlotAt(at, { x: at.x + RING_RADIUS, y: at.y }, left)).toBeNull();
  });
});
