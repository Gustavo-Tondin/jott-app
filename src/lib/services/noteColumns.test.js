import { describe, expect, it } from "vitest";
import {
  CARD_MIN,
  columnCount,
  columnLayout,
  projectMove,
} from "./noteColumns.js";
import { movedItem, movedItems } from "./spaceOrder.js";

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
    expect(movedItem(cards, order[1], order[2])).toEqual([
      "1",
      "4",
      "2",
      "3",
      "5",
      "6",
    ]);
  });
});

describe("where the cards will stand after a drop (the drag's preview)", () => {
  /// A 3-column board of six cards with UNEQUAL heights, laid out the way the
  /// browser would: DOM order 1 4 2 5 3 6, columns 100 wide, 10 apart, a 10px
  /// gap between rows. Heights by card: 1→40, 2→60, 3→30, 4→50, 5→20, 6→70.
  const heights = { 1: 40, 2: 60, 3: 30, 4: 50, 5: 20, 6: 70 };
  function board() {
    const cards = ["1", "2", "3", "4", "5", "6"];
    const { order } = columnLayout(cards.length, 3);
    const tops = [0, 0, 0];
    const rects = order.map((m) => {
      const column = m % 3;
      const height = heights[cards[m]];
      const top = tops[column];
      tops[column] += height + 10;
      return {
        left: column * 110,
        top,
        width: 100,
        height,
        right: column * 110 + 100,
        bottom: top + height,
      };
    });
    return { cards, order, rects };
  }

  it("puts a card down where the re-read board will draw it, columns restacked", () => {
    const { cards, order, rects } = board();
    // Card 1 (DOM 0) dropped on card 6's slot (DOM 5): the board becomes
    // 2 3 4 / 5 6 1, so every card changes column and the columns restack.
    const placed = projectMove(rects, order, 3, 0, 5);
    const next = movedItem(cards, 0, 5);
    expect(next).toEqual(["2", "3", "4", "5", "6", "1"]);
    const at = (card) => placed[order.indexOf(cards.indexOf(card))];
    expect(at("2")).toMatchObject({ left: 0, top: 0, height: 60 });
    expect(at("3")).toMatchObject({ left: 110, top: 0 });
    expect(at("4")).toMatchObject({ left: 220, top: 0 });
    expect(at("5")).toMatchObject({ left: 0, top: 70 });
    expect(at("6")).toMatchObject({ left: 110, top: 40 });
    expect(at("1")).toMatchObject({
      left: 220,
      top: 60,
      width: 100,
      height: 40,
    });
  });

  it("moves nothing when the card is put back on its own slot", () => {
    const { order, rects } = board();
    const placed = projectMove(rects, order, 3, 2, 2);
    placed.forEach((p, i) =>
      expect(p).toMatchObject({ left: rects[i].left, top: rects[i].top }),
    );
  });

  it("carries a pile together, in the order it stood", () => {
    const { cards, order, rects } = board();
    // Cards 1 and 2 (DOM 0 and 2) dropped on card 5's slot (DOM 3) — in the
    // board's own order, cards 0 and 1 moved to position 4.
    const placed = projectMove(rects, order, 3, [0, 2], 3);
    const next = movedItems(cards, [order[0], order[2]], order[3]);
    const at = (card) => placed[order.indexOf(cards.indexOf(card))];
    next.forEach((card, m) => expect(at(card).left).toBe((m % 3) * 110));
    expect(next.indexOf("2")).toBe(next.indexOf("1") + 1);
  });

  it("answers an empty board with nothing", () => {
    expect(projectMove([], [], 3, 0, 0)).toEqual([]);
  });
});
