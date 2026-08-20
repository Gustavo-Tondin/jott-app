import { describe, expect, it } from "vitest";
import {
  CARD_MIN,
  columnBreaks,
  columnCount,
  PREVIEW_LINES,
  weightOfGroup,
  weightOfNote,
} from "./noteColumns.js";

describe("how many columns fit", () => {
  it("gives three at the app's reading width and drops one as it narrows", () => {
    expect(columnCount(720)).toBe(3);
    expect(columnCount(500)).toBe(2);
    expect(columnCount(344)).toBe(2);
  });

  it("never draws one column on anything wider than a phone", () => {
    // A board of one column is a list, and a list loses the only thing a board
    // is for (2026-08-18).
    expect(columnCount(320)).toBe(2);
    expect(columnCount(280)).toBe(1);
  });

  it("answers one before anything has been measured", () => {
    expect(columnCount(0)).toBe(1);
  });

  it("never squeezes a card below its minimum", () => {
    expect(columnCount(CARD_MIN * 2)).toBe(2);
  });
});

describe("where the columns break", () => {
  it("gives every column a card when there are fewer cards than columns", () => {
    // THE bug this file exists for: the browser's own balancing put four cards
    // in two of three columns and left the third empty.
    expect([...columnBreaks([1, 1], 3)]).toEqual([0]);
    expect([...columnBreaks([9, 1, 1], 3)]).toEqual([0, 1]);
  });

  it("cuts the run into columns of roughly equal weight", () => {
    // Four ones into two columns: two each.
    expect([...columnBreaks([1, 1, 1, 1], 2)]).toEqual([1]);
    // One heavy card is a column of its own.
    expect([...columnBreaks([6, 1, 1, 1, 1, 1, 1], 2)]).toEqual([0]);
  });

  it("fills every column on a board with barely more cards than columns", () => {
    // THE case that was still broken after the first fix (user report,
    // 2026-08-19): a folder card, an empty note, a short one and a long one,
    // into three columns. No column ever reached its share of the weight in
    // time, so nothing broke, and the browser's own balancing put them all in
    // two columns — the very thing the breaks exist to prevent.
    expect([...columnBreaks([5, 2, 8, 13], 3)]).toEqual([1, 2]);
    // Five cards, one enormous: it takes a column, and the rest still spread.
    expect([...columnBreaks([50, 1, 1, 1, 1], 3)]).toEqual([0, 1]);
  });

  it("keeps the last columns from being starved", () => {
    // A first card heavy enough to claim every share must still leave one card
    // for each remaining column.
    const breaks = [...columnBreaks([50, 1, 1], 3)];
    expect(breaks).toEqual([0, 1]);
  });

  it("breaks nothing when there is one column", () => {
    expect(columnBreaks([1, 2, 3], 1).size).toBe(0);
    expect(columnBreaks([], 3).size).toBe(0);
  });
});

describe("what a card weighs", () => {
  it("counts the banner and the preview it will draw", () => {
    expect(weightOfNote({ preview: "" })).toBe(2);
    expect(weightOfNote({ preview: "", banner: { kind: "color", value: "red" } })).toBe(7);
    // The preview is clamped on screen, so it is clamped here too.
    expect(weightOfNote({ preview: "x".repeat(4000) })).toBe(2 + PREVIEW_LINES);
  });

  it("counts the BLOCKS, not the characters", () => {
    // Six one-word bullets are six lines however little they say — counting
    // characters called that card empty and packed the column around it.
    const listy = weightOfNote({ preview: "- um\n- dois\n- três\n- quatro" });
    expect(listy).toBe(weightOfNote({ preview: "x".repeat(4 * 34) }));
    // And a heading is taller than the line under it.
    expect(weightOfNote({ preview: "# Título" })).toBeGreaterThan(
      weightOfNote({ preview: "Título" }),
    );
  });

  it("counts a folder card by the small cards inside it", () => {
    expect(weightOfGroup({ notes: [] })).toBe(2);
    expect(weightOfGroup({ notes: [1, 2, 3, 4] })).toBe(8);
  });
});
