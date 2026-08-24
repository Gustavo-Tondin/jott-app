import { describe, it, expect } from "vitest";
import {
  addColumn,
  addRow,
  cellOf,
  deleteColumn,
  deleteRow,
  emptyTable,
  escapeCell,
  isDelimiterRow,
  isTableRow,
  moveColumn,
  moveRow,
  parseTable,
  renderTable,
  setCell,
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
