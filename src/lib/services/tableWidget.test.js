// The table drawn as a grid — driven through a real EditorView, because
// what can break is the editor's handling of a widget that holds the focus
// (services/tableWidget.js says why that is the whole trick).
import { afterEach, describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { noteTables, refreshTables, tableDecorationsFor } from "./tableWidget.js";
import { activeCell, addRow, currentCell, insertTable } from "./tableEditing.js";

const TABLE = "| a | b |\n| - | - |\n| 1 | 2 |";

let views = [];
afterEach(() => {
  for (const { view, parent } of views) {
    view.destroy();
    parent.remove();
  }
  views = [];
});

function mount(doc, { shows } = {}) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        markdown({ base: markdownLanguage }),
        activeCell,
        noteTables(shows ? { shows } : {}),
      ],
    }),
  });
  views.push({ view, parent });
  return view;
}

const cell = (view, row, col) =>
  view.dom.querySelector(`.cm-md-table__cell[data-row="${row}"][data-col="${col}"]`);

const key = (target, key, init = {}) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));

const flush = () => new Promise((resolve) => queueMicrotask(resolve));

describe("the grid", () => {
  it("draws the table as one widget of editable cells, header and body", () => {
    const view = mount(`um\n\n${TABLE}\n\ndois`);
    expect(view.dom.querySelectorAll(".cm-md-table").length).toBe(1);
    expect(view.dom.querySelectorAll("th .cm-md-table__cell").length).toBe(2);
    expect(view.dom.querySelectorAll("td .cm-md-table__cell").length).toBe(2);
    expect(cell(view, -1, 1).textContent).toBe("b");
    expect(cell(view, 0, 0).textContent).toBe("1");
    // The pipes are not in the DOM: the widget replaced them.
    expect(view.dom.querySelector(".cm-content").textContent).not.toContain("|");
  });

  it("wears the layout it is told, and changes it on refresh (Settings → Notes)", () => {
    let layout = "";
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: TABLE,
        extensions: [
          markdown({ base: markdownLanguage }),
          activeCell,
          noteTables({ layout: () => layout }),
        ],
      }),
    });
    views.push({ view, parent });
    expect(view.dom.querySelector(".cm-md-table--scroll")).toBe(null);
    layout = "scroll";
    view.dispatch({ effects: refreshTables.of(null) });
    expect(view.dom.querySelector(".cm-md-table--scroll")).not.toBe(null);
  });

  it("draws nothing when tables are switched off, and again when they return", () => {
    let on = false;
    const view = mount(TABLE, { shows: () => on });
    expect(view.dom.querySelector(".cm-md-table")).toBe(null);
    on = true;
    view.dispatch({ effects: refreshTables.of(null) });
    expect(view.dom.querySelector(".cm-md-table")).not.toBe(null);
    expect(tableDecorationsFor(view.state, { shows: () => false }).size).toBe(0);
  });

  it("writes a typed cell back into the note, aligned, and keeps the focus in it", () => {
    const view = mount(TABLE);
    const target = cell(view, 0, 0);
    target.focus();
    expect(currentCell(view.state)).toMatchObject({ row: 0, col: 0 });
    target.textContent = "longer";
    target.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(view.state.doc.toString()).toBe("| a      | b   |\n| ------ | --- |\n| longer | 2   |");
    // Same DOM, same focus: the widget was patched, not rebuilt.
    expect(document.activeElement).toBe(target);
    expect(cell(view, 0, 0)).toBe(target);
    expect(cell(view, -1, 0).textContent).toBe("a");
  });

  it("escapes a pipe typed into a cell", () => {
    const view = mount(TABLE);
    const target = cell(view, 0, 1);
    target.focus();
    target.textContent = "x|y";
    target.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(view.state.doc.toString().split("\n")[2]).toBe("| 1   | x\\|y |");
    expect(cell(view, 0, 1).textContent).toBe("x|y");
  });

  it("walks the cells with Tab and grows the table from the last one", async () => {
    const view = mount(TABLE);
    cell(view, -1, 0).focus();
    key(cell(view, -1, 0), "Tab");
    expect(document.activeElement).toBe(cell(view, -1, 1));
    key(cell(view, -1, 1), "Tab");
    expect(document.activeElement).toBe(cell(view, 0, 0));
    key(cell(view, 0, 0), "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(cell(view, -1, 1));
    // The last cell: a new row, and the focus lands in it once the DOM has.
    cell(view, 0, 1).focus();
    key(cell(view, 0, 1), "Tab");
    expect(view.state.doc.toString().split("\n").length).toBe(4);
    await flush();
    expect(document.activeElement).toBe(cell(view, 1, 0));
  });

  it("moves down a row on Enter, and out of the table on Escape", async () => {
    const view = mount(`${TABLE}\n| 3 | 4 |\n\nfim`);
    cell(view, 0, 1).focus();
    const enter = key(cell(view, 0, 1), "Enter");
    expect(enter).toBe(false);
    expect(document.activeElement).toBe(cell(view, 1, 1));
    key(cell(view, 1, 1), "Escape");
    expect(view.state.field(activeCell)).toBe(null);
    expect(view.state.selection.main.head).toBe(TABLE.length + "\n| 3 | 4 |".length + 1);
  });

  it("refuses the formatting chords inside a cell", () => {
    const view = mount(TABLE);
    cell(view, 0, 0).focus();
    expect(key(cell(view, 0, 0), "b", { ctrlKey: true })).toBe(false);
    expect(key(cell(view, 0, 0), "x", { ctrlKey: true })).toBe(true);
  });

  it("puts the focus where a command said, once the grid has followed", async () => {
    const view = mount(TABLE);
    cell(view, 0, 0).focus();
    expect(addRow(view)).toBe(true);
    await flush();
    expect(document.activeElement).toBe(cell(view, 1, 0));
    expect(currentCell(view.state)).toMatchObject({ row: 1, col: 0 });
  });

  it("lands in the header of a table just inserted", async () => {
    const view = mount("texto");
    view.dispatch({ selection: { anchor: 5 } });
    expect(insertTable(view)).toBe(true);
    await flush();
    expect(document.activeElement).toBe(cell(view, -1, 0));
    expect(cell(view, -1, 0).textContent).toBe("Column 1");
  });

  it("draws a handle above each column and beside each body row, none on the header", () => {
    const view = mount(`${TABLE}\n| 3 | 4 |`);
    expect(view.dom.querySelectorAll(".cm-md-table__handle--col").length).toBe(2);
    expect(view.dom.querySelectorAll(".cm-md-table__handle--row").length).toBe(2);
    expect(view.dom.querySelectorAll("th .cm-md-table__handle--row").length).toBe(0);
  });
});

describe("dragging", () => {
  /// jsdom lays nothing out, so the geometry the widget reads is given here:
  /// each header cell 100px wide in a row, each body row 20px tall.
  function layout(view) {
    view.dom.querySelectorAll("thead th").forEach((th, i) => {
      th.getBoundingClientRect = () => ({ left: i * 100, width: 100, top: 0, height: 20 });
    });
    view.dom.querySelectorAll("tbody tr").forEach((tr, i) => {
      tr.getBoundingClientRect = () => ({ left: 0, width: 200, top: 20 + i * 20, height: 20 });
    });
  }

  const pointer = (target, type, init) =>
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, ...init }));

  it("moves a column to where the pointer let go of it", () => {
    const view = mount(`${TABLE}\n| 3 | 4 |`);
    layout(view);
    const handle = view.dom.querySelector('.cm-md-table__handle--col[data-index="0"]');
    pointer(handle, "pointerdown", { clientX: 50, clientY: 5 });
    expect(view.dom.querySelector(".cm-md-table--dragging")).not.toBe(null);
    pointer(handle, "pointermove", { clientX: 190, clientY: 5 });
    expect(view.dom.querySelectorAll(".cm-md-table__target").length).toBeGreaterThan(0);
    pointer(handle, "pointerup", { clientX: 190, clientY: 5 });
    expect(view.dom.querySelector(".cm-md-table--dragging")).toBe(null);
    expect(view.state.doc.toString().split("\n")[0]).toBe("| b   | a   |");
    expect(view.state.doc.toString().split("\n")[3]).toBe("| 4   | 3   |");
  });

  it("moves a row, and a cancelled drag moves nothing", () => {
    const view = mount(`${TABLE}\n| 3 | 4 |`);
    layout(view);
    const handle = view.dom.querySelector('.cm-md-table__handle--row[data-index="1"]');
    pointer(handle, "pointerdown", { clientX: 5, clientY: 50 });
    pointer(handle, "pointercancel", { clientX: 5, clientY: 25 });
    expect(view.state.doc.toString().split("\n")[2]).toBe("| 1 | 2 |");
    pointer(handle, "pointerdown", { clientX: 5, clientY: 50 });
    pointer(handle, "pointerup", { clientX: 5, clientY: 25 });
    expect(view.state.doc.toString().split("\n")[2]).toBe("| 3   | 4   |");
    expect(view.state.doc.toString().split("\n")[3]).toBe("| 1   | 2   |");
  });
});
