import { describe, expect, it } from "vitest";
import { CARD_MIN, columnCount, columnLayout } from "./noteColumns.js";
import { movedItem } from "./spaceOrder.js";

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

describe("how the board is laid out", () => {
  it("reads by rows: 1 2 3 over 4 5 6, rendered column by column", () => {
    const { order, breaks } = columnLayout(9, 3);
    expect(order).toEqual([0, 3, 6, 1, 4, 7, 2, 5, 8]);
    expect([...breaks]).toEqual([6, 7]);
  });

  it("keeps reading by rows when the last row is short", () => {
    const { order, breaks } = columnLayout(5, 3);
    expect(order).toEqual([0, 3, 1, 4, 2]);
    expect([...breaks]).toEqual([3, 4]);
  });

  it("gives every column a card when there are fewer cards than columns", () => {
    // The browser's own balancing put four cards in two of three columns and
    // left the third empty; a break after each card keeps it from choosing.
    const { order, breaks } = columnLayout(2, 3);
    expect(order).toEqual([0, 1]);
    expect([...breaks]).toEqual([0]);
  });

  it("breaks nothing when there is one column, or nothing at all", () => {
    expect(columnLayout(3, 1)).toEqual({ order: [0, 1, 2], breaks: new Set() });
    expect(columnLayout(0, 3)).toEqual({ order: [], breaks: new Set() });
  });

  it("maps a drag between DOM slots back onto the board's own order", () => {
    // What the board does with reorder.js's indices: the DOM runs 1 4 2 5 3 6,
    // so card 4 (DOM slot 1) dropped on card 2's slot (DOM slot 2) lands
    // between 1 and 2.
    const cards = ["1", "2", "3", "4", "5", "6"];
    const { order } = columnLayout(cards.length, 3);
    expect(order).toEqual([0, 3, 1, 4, 2, 5]);
    expect(movedItem(cards, order[1], order[2])).toEqual(["1", "4", "2", "3", "5", "6"]);
  });
});
