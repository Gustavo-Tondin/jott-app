// The arithmetic and the DOM walk behind "keep the cursor on screen".
//
// The scroll itself is not tested here and could not be: jsdom lays nothing
// out, so every rectangle it reports is zero. What IS testable is the pair of
// decisions the module makes — which element is a scroller, and how far it has
// to move — and those are the two that were wrong in the engine's own version
// (the module's header says how). The scroll was proven by measuring the app
// on the emulator.

import { describe, expect, it } from "vitest";
import { scrollNeeded, scrollableAround, visibleBox } from "./caretScroll.js";

const box = { top: 100, bottom: 500 };

describe("how far the page has to move", () => {
  it("does not move for a cursor already inside", () => {
    expect(scrollNeeded({ top: 200, bottom: 220 }, box)).toBe(0);
  });

  it("moves down by what hangs below", () => {
    expect(scrollNeeded({ top: 510, bottom: 530 }, box)).toBe(30);
  });

  it("moves up by what hangs above", () => {
    expect(scrollNeeded({ top: 60, bottom: 80 }, box)).toBe(-40);
  });

  it("leaves the asked-for air under the cursor", () => {
    expect(scrollNeeded({ top: 470, bottom: 490 }, box, 40)).toBe(30);
  });

  it("leaves the same air above it", () => {
    expect(scrollNeeded({ top: 120, bottom: 140 }, box, 40)).toBe(-20);
  });

  // A cursor taller than the space left cannot have both margins, and the
  // half worth keeping is the top of the line.
  it("shows the top of a cursor taller than the room", () => {
    expect(scrollNeeded({ top: 480, bottom: 980 }, box)).toBe(380);
  });
});

describe("which element scrolls", () => {
  /// Builds `outer > middle > inner` with the given styles, and lets the test
  /// say what each one's scrollHeight is — jsdom reports 0 for everything.
  function chain(styles, heights) {
    const nodes = styles.map((style, i) => {
      const el = document.createElement("div");
      el.style.cssText = style;
      Object.defineProperty(el, "scrollHeight", { value: heights[i] });
      Object.defineProperty(el, "clientHeight", { value: 100 });
      return el;
    });
    nodes.reduce((parent, child) => (parent.appendChild(child), child));
    document.body.appendChild(nodes[0]);
    return nodes;
  }

  it("is the nearest one that scrolls and has something to scroll", () => {
    const [outer, middle, inner] = chain(
      ["overflow-y: auto", "overflow-y: auto", "overflow-y: visible"],
      [400, 100, 100],
    );

    expect(scrollableAround(inner)).toBe(outer);
    expect(middle).toBeTruthy();
  });

  // The one that made the note unusable: a box that overflows but cannot
  // scroll is not a scroller, and the walk has to go past it.
  it("is not an element that merely overflows", () => {
    const [outer, , inner] = chain(
      ["overflow-y: auto", "overflow-y: visible", "overflow-y: visible"],
      [400, 400, 100],
    );

    expect(scrollableAround(inner)).toBe(outer);
  });

  it("is nothing when nothing can scroll", () => {
    const [, , inner] = chain(
      ["overflow-y: visible", "overflow-y: clip", "overflow-y: visible"],
      [400, 400, 100],
    );

    expect(scrollableAround(inner)).toBe(null);
  });
});

// The strip floats over the bottom of the scroller, so the scroller's own edge
// is not where the visible part ends — `scroll-padding` is how the page says
// so, and the caret has to stop above it rather than behind it (device,
// 2026-08-21).
describe("where the visible part of a scroller ends", () => {
  function scroller(css) {
    const el = document.createElement("div");
    el.style.cssText = css;
    Object.defineProperty(el, "clientHeight", { value: 400, configurable: true });
    el.getBoundingClientRect = () => ({ top: 100, bottom: 500, height: 400 });
    document.body.appendChild(el);
    return el;
  }

  it("is the box itself with nothing floating over it", () => {
    expect(visibleBox(scroller(""))).toEqual({ top: 100, bottom: 500 });
  });

  it("stops short of what floats over the bottom edge", () => {
    expect(visibleBox(scroller("scroll-padding-block-end: 56px"))).toEqual({
      top: 100,
      bottom: 444,
    });
  });

  it("starts below what floats over the top edge", () => {
    expect(visibleBox(scroller("scroll-padding-block-start: 40px"))).toEqual({
      top: 140,
      bottom: 500,
    });
  });
});
