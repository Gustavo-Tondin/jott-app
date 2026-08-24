import { describe, it, expect } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  TABLE_COMMANDS,
  TABLE_FORMATS,
  activeCell,
  addColumn,
  addRow,
  currentCell,
  deleteColumn,
  deleteRow,
  deleteTable,
  insertTable,
  setActiveCell,
  tableStatus,
  tablesIn,
} from "./tableEditing.js";

const TABLE = "| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |";

// The commands only ever read `state` and call `dispatch`, so a view is two
// fields — the same stand-in `markdownCommands.test.js` uses. The Markdown
// language is real: a table is what the syntax tree says is one.
function editor(doc, at = 0, extra = []) {
  const view = {
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(at),
      extensions: [markdown({ base: markdownLanguage }), activeCell, ...extra],
    }),
    // A command hands over either a Transaction (`state.update(...)`) or a
    // bare spec; both end as the next state.
    dispatch(tr) {
      view.state = tr.state ?? view.state.update(tr).state;
    },
    focus() {},
  };
  return view;
}

describe("finding the table", () => {
  it("reads every table of the note with its lines and its model", () => {
    const view = editor(`um\n\n${TABLE}\n\ndois`);
    const [table] = tablesIn(view.state);
    expect(table.from).toBe(4);
    expect(table.text).toBe(TABLE);
    expect(table.model.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("counts the caret's row and column from the raw text", () => {
    const view = editor(TABLE, TABLE.indexOf("4"));
    expect(currentCell(view.state)).toMatchObject({ row: 1, col: 1 });
    expect(currentCell(editor(TABLE, 2).state)).toMatchObject({ row: -1, col: 0 });
    // The delimiter row is the header, for want of anything else it could be.
    expect(currentCell(editor(TABLE, TABLE.indexOf("-")).state)).toMatchObject({ row: -1 });
    expect(currentCell(editor("plain\n\n" + TABLE, 2).state)).toBe(null);
  });

  it("prefers the cell the widget said is focused", () => {
    const view = editor(TABLE, 0);
    view.dispatch(view.state.update({ effects: setActiveCell.of({ from: 0, row: 1, col: 0 }) }));
    expect(currentCell(view.state)).toMatchObject({ row: 1, col: 0 });
    expect(tableStatus(view.state)).toEqual({ header: false });
  });

  it("moves the focused cell with the text typed above the table", () => {
    const view = editor(`\n${TABLE}`, 0);
    view.dispatch(view.state.update({ effects: setActiveCell.of({ from: 1, row: 0, col: 1 }) }));
    view.dispatch(view.state.update({ changes: { from: 0, insert: "x" } }));
    expect(view.state.field(activeCell).from).toBe(2);
    expect(currentCell(view.state)).toMatchObject({ row: 0, col: 1 });
  });
});

describe("the commands", () => {
  it("inserts a 2 × 2 table under the caret's line, and refuses inside one", () => {
    const view = editor("texto", 5);
    expect(insertTable(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "texto\n\n| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |\n",
    );
    expect(insertTable(editor(TABLE, 2))).toBe(false);
  });

  it("adds a column to the right of the caret's, aligned", () => {
    const view = editor(TABLE, 2);
    expect(addColumn(view)).toBe(true);
    expect(view.state.doc.toString().split("\n")[0]).toBe("| a   |     | b   |");
    expect(currentCell(view.state)).toMatchObject({ row: -1, col: 1 });
  });

  it("adds a row under the caret's — under the header when that is where it is", () => {
    const view = editor(TABLE, 2);
    expect(addRow(view)).toBe(true);
    expect(view.state.doc.toString().split("\n")[2]).toBe("|     |     |");
    expect(currentCell(view.state)).toMatchObject({ row: 0, col: 0 });
  });

  it("deletes the caret's column and row, and never the header row", () => {
    const view = editor(TABLE, TABLE.indexOf("4"));
    expect(deleteColumn(view)).toBe(true);
    expect(view.state.doc.toString().split("\n")[0]).toBe("| a   |");
    expect(deleteRow(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("| a   |\n| --- |\n| 1   |");
    expect(deleteRow(editor(TABLE, 2))).toBe(false);
    expect(deleteColumn(editor("| a |\n| - |", 2))).toBe(false);
  });

  it("deletes the whole table with the blank line under it", () => {
    const view = editor(`um\n\n${TABLE}\n\ndois`, 6);
    expect(deleteTable(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("um\n\ndois");
    expect(view.state.selection.main.head).toBe(4);
  });

  it("answers false on a read-only note", () => {
    const view = editor(TABLE, 2, [EditorState.readOnly.of(true)]);
    expect(addColumn(view)).toBe(false);
    expect(insertTable(editor("", 0, [EditorState.readOnly.of(true)]))).toBe(false);
    expect(view.state.doc.toString()).toBe(TABLE);
  });

  it("names every command by the id the registry uses, and the list matches", () => {
    expect(Object.keys(TABLE_COMMANDS)).toEqual(TABLE_FORMATS);
    expect(TABLE_FORMATS).toContain("table.insert");
  });
});
