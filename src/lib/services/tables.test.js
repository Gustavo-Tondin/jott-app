import { describe, it, expect } from "vitest";
import {
  addColumn,
  addRow,
  cellOf,
  clearWidths,
  deleteColumn,
  deleteRow,
  emptyTable,
  escapeCell,
  isColumnsLine,
  isDelimiterRow,
  isTableRow,
  moveColumn,
  moveRow,
  normalizeWidths,
  parseTable,
  renderTable,
  resizeColumn,
  setCell,
  setWidths,
  splitRow,
} from "./tables.js";

// The reference note (user, 2026-08-24): one table padded by hand, one
// written as tight as it goes. Both are the same table to GitHub and to us.
const TIGHT = ["| Tarjeta | Texto | PDF |", "|---|---|---|", "| **A** | dos | `x.pdf` |"];

describe("reading a table", () => {
  it("reads the padded and the tight spelling alike", () => {
    const padded = parseTable([
      "| Tarjeta | Texto | PDF     |",
      "| ------- | ----- | ------- |",
      "| **A**   | dos   | `x.pdf` |",
    ]);
    expect(parseTable(TIGHT)).toEqual(padded);
    expect(padded.header).toEqual(["Tarjeta", "Texto", "PDF"]);
    expect(padded.rows).toEqual([["**A**", "dos", "`x.pdf`"]]);
  });

  it("reads a row written without the outer pipes", () => {
    expect(splitRow("a | b | c")).toEqual(["a", "b", "c"]);
    expect(splitRow("| a | b |")).toEqual(["a", "b"]);
  });

  it("keeps a short row and a long row rectangular, the way GFM does", () => {
    const model = parseTable(["| a | b |", "| - | - |", "| only |", "| 1 | 2 | 3 |"]);
    expect(model.rows).toEqual([
      ["only", ""],
      ["1", "2"],
    ]);
  });

  it("reads `\\|` as a pipe inside a cell, and writes it back escaped", () => {
    const model = parseTable(["| a \\| b | c |", "| - | - |"]);
    expect(model.header).toEqual(["a | b", "c"]);
    expect(renderTable(model)).toContain("| a \\| b | c   |");
  });

  it("keeps the alignment marks a file already carries", () => {
    const model = parseTable(["| a | b | c | d |", "| :- | :-: | -: | - |"]);
    expect(model.align).toEqual(["left", "center", "right", null]);
    expect(renderTable(model).split("\n")[1]).toBe("| :-- | :-: | --: | --- |");
  });

  it("reads a table that lost its delimiter row, and gives it one back", () => {
    const model = parseTable(["| a | b |", "| 1 | 2 |"]);
    expect(model.rows).toEqual([["1", "2"]]);
    expect(renderTable(model).split("\n")[1]).toBe("| --- | --- |");
  });

  it("knows a delimiter row from a row of text", () => {
    expect(isDelimiterRow("|---|---|")).toBe(true);
    expect(isDelimiterRow("| :-: | --: |")).toBe(true);
    expect(isDelimiterRow("| - a | b |")).toBe(false);
    expect(isTableRow("a | b")).toBe(true);
    expect(isTableRow("a \\| b")).toBe(false);
    expect(isTableRow("plain")).toBe(false);
  });
});

describe("writing a table", () => {
  it("pads every column to its widest cell, in a monospaced grid", () => {
    expect(renderTable(parseTable(TIGHT))).toBe(
      [
        "| Tarjeta | Texto | PDF     |",
        "| ------- | ----- | ------- |",
        "| **A**   | dos   | `x.pdf` |",
      ].join("\n"),
    );
  });

  it("never writes a column narrower than the shortest delimiter", () => {
    expect(renderTable(parseTable(["| a | b |", "| - | - |"]))).toBe(
      "| a   | b   |\n| --- | --- |",
    );
  });

  it("counts an emoji as one column of the grid", () => {
    const lines = renderTable(parseTable(["| 🙂 | b |", "| - | - |", "| xx | y |"])).split("\n");
    expect([...lines[0]].length).toBe([...lines[2]].length);
  });

  it("flattens a newline into a space — a GFM cell is one line", () => {
    expect(escapeCell("a\nb|c")).toBe("a b\\|c");
  });

  it("starts a fresh table 2 × 2, header included", () => {
    expect(renderTable(emptyTable())).toBe(
      "| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |",
    );
  });
});

describe("editing a table", () => {
  const base = parseTable(["| a | b |", "| - | - |", "| 1 | 2 |", "| 3 | 4 |"]);

  it("adds a column after the one asked for, in every row", () => {
    const next = addColumn(base, 0);
    expect(next.header).toEqual(["a", "", "b"]);
    expect(next.rows).toEqual([
      ["1", "", "2"],
      ["3", "", "4"],
    ]);
    expect(base.header).toEqual(["a", "b"]);
  });

  it("adds a row after the one asked for, as wide as the header", () => {
    expect(addRow(base, 0).rows).toEqual([
      ["1", "2"],
      ["", ""],
      ["3", "4"],
    ]);
    expect(addRow(base, -1).rows[0]).toEqual(["", ""]);
    expect(addRow(base).rows[2]).toEqual(["", ""]);
  });

  it("deletes a column and a row, and refuses to delete the last column", () => {
    expect(deleteColumn(base, 1).header).toEqual(["a"]);
    expect(deleteColumn(deleteColumn(base, 1), 0).header).toEqual(["a"]);
    expect(deleteRow(base, 0).rows).toEqual([["3", "4"]]);
    expect(deleteRow(base, 5)).toBe(base);
  });

  it("moves a column and a row to the index they land on", () => {
    expect(moveColumn(base, 0, 1).header).toEqual(["b", "a"]);
    expect(moveColumn(base, 0, 1).rows[0]).toEqual(["2", "1"]);
    expect(moveRow(base, 1, 0).rows).toEqual([
      ["3", "4"],
      ["1", "2"],
    ]);
    expect(moveRow(base, 0, 0)).toBe(base);
  });

  it("moves the alignment with its column", () => {
    const aligned = parseTable(["| a | b |", "| :- | -: |"]);
    expect(moveColumn(aligned, 0, 1).align).toEqual(["right", "left"]);
  });

  it("reads and writes one cell, with -1 for the header", () => {
    expect(cellOf(base, -1, 1)).toBe("b");
    expect(cellOf(base, 1, 0)).toBe("3");
    expect(cellOf(base, 9, 0)).toBe("");
    expect(setCell(base, -1, 0, "A").header[0]).toBe("A");
    expect(setCell(base, 1, 1, "x").rows[1]).toEqual(["3", "x"]);
  });
});

// The widths a person drags a column to. They are a share of the table, not
// a measurement of the screen, so the same note reads right on a phone and on
// a monitor — and they live in a comment because a table without one has to
// stay a plain GFM table.
describe("column widths", () => {
  const plain = ["| a | b | c |", "| - | - | - |", "| 1 | 2 | 3 |"];
  const sized = ["<!--cols: 20,50,30-->", ...plain];

  it("knows the comment by its shape, whatever is inside it", () => {
    expect(isColumnsLine("<!--cols: 20,50,30-->")).toBe(true);
    expect(isColumnsLine("  <!--  COLS: 20 , 50%  -->  ")).toBe(true);
    expect(isColumnsLine("<!--banner: yellow-->")).toBe(false);
    expect(isColumnsLine("| a | b |")).toBe(false);
  });

  it("reads the comment and leaves the table itself untouched", () => {
    const model = parseTable(sized);
    expect(model.widths).toEqual([20, 50, 30]);
    expect(model.header).toEqual(["a", "b", "c"]);
    expect(model.rows).toEqual([["1", "2", "3"]]);
  });

  it("is a plain table without one", () => {
    expect(parseTable(plain).widths).toBe(null);
  });

  it("writes the comment back above the table, and only when there is one", () => {
    expect(renderTable(parseTable(sized)).split("\n")[0]).toBe("<!--cols: 20,50,30-->");
    expect(renderTable(parseTable(plain)).startsWith("| a")).toBe(true);
  });

  it("round-trips", () => {
    const text = renderTable(parseTable(sized));
    expect(renderTable(parseTable(text))).toBe(text);
  });

  it("scales any set of numbers to a hundred", () => {
    expect(normalizeWidths([1, 1], 2)).toEqual([50, 50]);
    expect(normalizeWidths([2, 1, 1], 3)).toEqual([50, 25, 25]);
    // Thirds do not round to a hundred; the drift goes on the widest column,
    // where a tenth of a percent cannot be seen. (`toBeCloseTo` because
    // adding tenths in binary floats is what drifts here, not the numbers.)
    expect(normalizeWidths([1, 1, 1], 3)).toEqual([33.4, 33.3, 33.3]);
    expect(normalizeWidths([1, 1, 1], 3).reduce((s, n) => s + n, 0)).toBeCloseTo(100, 6);
  });

  it("lifts a column off the floor at the expense of those above it", () => {
    const out = normalizeWidths([1, 99], 2);
    expect(out[0]).toBe(4);
    expect(out[1]).toBe(96);
  });

  it("refuses what it cannot draw, which reads as no widths at all", () => {
    expect(normalizeWidths([50, 50], 3)).toBe(null);
    expect(normalizeWidths([50, 0], 2)).toBe(null);
    expect(normalizeWidths([50, -10], 2)).toBe(null);
    expect(normalizeWidths(["x", 50], 2)).toBe(null);
    expect(normalizeWidths(null, 2)).toBe(null);
    // A comment that does not add up is still ours; it is dropped, not drawn.
    expect(parseTable(["<!--cols: 10,20-->", ...plain]).widths).toBe(null);
    expect(parseTable(["<!--cols: -->", ...plain]).widths).toBe(null);
  });

  it("puts widths on and takes them off", () => {
    const model = parseTable(plain);
    expect(setWidths(model, [25, 25, 50]).widths).toEqual([25, 25, 50]);
    expect(clearWidths(parseTable(sized)).widths).toBe(null);
    expect(renderTable(clearWidths(parseTable(sized)))).toBe(renderTable(parseTable(plain)));
  });

  it("trades room between the dragged border's two columns and nobody else", () => {
    const out = resizeColumn(parseTable(sized), 0, 35);
    expect(out.widths).toEqual([35, 35, 30]);
  });

  it("stops a column at the floor instead of letting it vanish", () => {
    expect(resizeColumn(parseTable(sized), 0, 0).widths).toEqual([4, 66, 30]);
    expect(resizeColumn(parseTable(sized), 0, 100).widths).toEqual([66, 4, 30]);
  });

  it("starts from the widths the drag began with, not the ones now in force", () => {
    // What the widget does: the pointer moved against the table as it was
    // when the finger went down.
    const model = setWidths(parseTable(plain), [20, 50, 30]);
    expect(resizeColumn(model, 0, 35, [20, 50, 30]).widths).toEqual([35, 35, 30]);
  });

  it("has no border to drag past the last column", () => {
    const model = parseTable(sized);
    expect(resizeColumn(model, 2, 40)).toBe(model);
    expect(resizeColumn(parseTable(plain), 0, 40)).toEqual(parseTable(plain));
  });

  it("keeps the total at a hundred through the structural edits", () => {
    const sums = (model) => model.widths.reduce((s, n) => s + n, 0);
    const model = parseTable(sized);
    expect(sums(addColumn(model, 0))).toBeCloseTo(100, 6);
    expect(addColumn(model, 0).widths.length).toBe(4);
    expect(sums(deleteColumn(model, 1))).toBeCloseTo(100, 6);
    expect(deleteColumn(model, 1).widths.length).toBe(2);
    // A row changes nothing about the columns.
    expect(addRow(model).widths).toEqual([20, 50, 30]);
  });

  it("moves a width with its column", () => {
    expect(moveColumn(parseTable(sized), 0, 2).widths).toEqual([50, 30, 20]);
  });

  it("gives a fresh table none", () => {
    expect(emptyTable().widths).toBe(null);
  });
});
