import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { firstMatch, foundMark, markFound } from "./foundMark.js";

describe("firstMatch", () => {
  test("finds the first occurrence ignoring case, like the core's search", () => {
    expect(firstMatch("Buy milk. MILK again", " milk ")).toEqual({ from: 4, to: 8 });
    expect(firstMatch("nothing here", "milk")).toBeNull();
    expect(firstMatch("anything", "  ")).toBeNull();
  });
});

describe("markFound, on a real editor", () => {
  // The scroll effect runs CodeMirror's measure, and jsdom's Range cannot be
  // measured: the two readers it calls answer "no rectangles".
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
  let view;
  afterEach(() => {
    view?.destroy();
    vi.useRealTimers();
  });

  const open = (doc) => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    view = new EditorView({ parent, state: EditorState.create({ doc, extensions: [foundMark] }) });
  };
  const lit = () => [...view.dom.querySelectorAll(".cm-found")].map((n) => n.textContent);

  test("lights the first match, then takes the mark away on its own", () => {
    vi.useFakeTimers();
    open("A list.\nFinish the book, then the second book.");
    expect(markFound(view, "BOOK", 1000)).toBeTypeOf("function");
    expect(lit()).toEqual(["book"]);
    vi.advanceTimersByTime(1000);
    expect(lit()).toEqual([]);
  });

  test("a note without the words is left alone", () => {
    open("Nothing to see.");
    expect(markFound(view, "book")).toBeNull();
    expect(lit()).toEqual([]);
  });
});
