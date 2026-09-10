// The arithmetic and the DOM walk behind "keep the cursor on screen".
//
// The scroll itself is not tested here and could not be: jsdom lays nothing
// out, so every rectangle it reports is zero. What IS testable is the pair of
// decisions the module makes — which element is a scroller, and how far it has
// to move — and those are the two that were wrong in the engine's own version
// (the module's header says how). The scroll was proven by measuring the app
// on the emulator.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { keepCaretInView, scrollNeeded, scrollableAround, visibleBox } from "./caretScroll.js";

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

// The one integration that could break, exercised on a real EditorView (a
// handler nobody calls does not fail — only the keystroke finds it).
describe("when CodeMirror itself asks for the scroll", () => {
  // The measure phase has to RUN here, and jsdom's Range cannot be measured:
  // stand in the two readers CodeMirror calls, answering "no rectangles".
  const zero = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
  let saved;
  beforeAll(() => {
    saved = [Range.prototype.getClientRects, Range.prototype.getBoundingClientRect];
    Range.prototype.getClientRects = () => [];
    Range.prototype.getBoundingClientRect = () => zero;
  });
  afterAll(() => {
    [Range.prototype.getClientRects, Range.prototype.getBoundingClientRect] = saved;
  });

  /// A scroller around the editor that jsdom would otherwise measure as
  /// nothing, and a caret rectangle hanging below it.
  function mount() {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    Object.defineProperties(scroller, {
      scrollHeight: { value: 1000, configurable: true },
      clientHeight: { value: 100, configurable: true },
    });
    document.body.appendChild(scroller);
    const caught = [];
    const view = new EditorView({
      parent: scroller,
      state: EditorState.create({
        doc: "one\ntwo\nthree",
        extensions: [keepCaretInView, EditorView.exceptionSink.of((e) => caught.push(e))],
      }),
    });
    // The real one answers nothing in jsdom; this one answers a rectangle and
    // keeps the real one's rule — asked during an update, it throws.
    view.coordsAtPos = () => {
      view.readMeasured();
      return { top: 500, bottom: 520, left: 0, right: 1 };
    };
    // An editor with no height never asks for a scroll: give CodeMirror's own
    // scroller the size jsdom will not compute.
    const size = { top: 0, left: 0, right: 300, bottom: 100, width: 300, height: 100 };
    Object.defineProperties(view.scrollDOM, {
      clientHeight: { value: 100, configurable: true },
      clientWidth: { value: 300, configurable: true },
      getBoundingClientRect: { value: () => size, configurable: true },
    });
    return { scroller, view, caught };
  }

  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

  it("reads the layout in the measure phase, never inside the update", async () => {
    // CodeMirror runs scroll handlers with the layout locked: a `coordsAtPos`
    // there threw on every typed character, CodeMirror logged it, and the
    // scroll never happened (seen on the phone with `?perf=1`, 2026-09-09).
    const { scroller, view, caught } = mount();
    try {
      view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
      await frame();
      await frame();
      expect(caught).toEqual([]);
      expect(scroller.scrollTop).toBeGreaterThan(0);
    } finally {
      view.destroy();
      scroller.remove();
    }
  });

  it("follows the caret, but not the head of a range being selected", async () => {
    // Dragging a selection across a picture moved its head past a line as
    // tall as the picture, and chasing it made the page jump.
    const { scroller, view, caught } = mount();
    try {
      view.focus();
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
      await frame();
      await frame();
      expect(scroller.scrollTop).toBe(0);

      view.dispatch({ selection: { anchor: view.state.doc.length } });
      await frame();
      await frame();
      expect(caught).toEqual([]);
      expect(scroller.scrollTop).toBeGreaterThan(0);
    } finally {
      view.destroy();
      scroller.remove();
    }
  });

  it("leaves a deliberate `center`/`start`/`end` request alone", async () => {
    const { scroller, view, caught } = mount();
    try {
      view.dispatch({
        selection: { anchor: view.state.doc.length },
        effects: EditorView.scrollIntoView(view.state.doc.length, { y: "center" }),
      });
      await frame();
      await frame();
      expect(caught).toEqual([]);
      expect(scroller.scrollTop).toBe(0);
    } finally {
      view.destroy();
      scroller.remove();
    }
  });
});
