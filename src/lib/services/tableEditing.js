// Tables in the open note — the commands, and the one piece of editor state
// they read (2026-08-24).
//
// `tables.js` knows what a table IS; this file knows where one is in the
// document and which cell the person is in. It draws nothing (that is
// `tableWidget.js`), which is what keeps it runnable against a bare
// `EditorState` in a test and importable by `markdownCommands.js`, the table
// every formatting button and chord presses through.
//
// **Where the cell comes from.** A table is drawn as a widget whose cells are
// edited in place, so the CodeMirror selection never sits inside one — the
// widget says which cell holds the focus through `setActiveCell`, and the
// commands read that. With the widget switched off (App Functions) the same
// table is raw text under the caret, and the commands still work: the row
// and column are then counted from the caret's line and the pipes before it.
// One question, two answers, the widget's first.

import { EditorSelection, StateEffect, StateField } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {
  addColumn as addColumnTo,
  addRow as addRowTo,
  deleteColumn as deleteColumnOf,
  deleteRow as deleteRowOf,
  emptyTable,
  parseTable,
  renderTable,
} from "./tables.js";
import { S } from "./strings.js";

/// "The focus is in this cell" — `{from, row, col}` (`from` the table's
/// start, `row` -1 for the header) or `null` when no cell holds it.
export const setActiveCell = StateEffect.define();

/// "Put the focus in this cell" — the same shape, dispatched by a command
/// after it moved things around, and answered by the widget. Positions in the
/// payload are as of AFTER the transaction that carries it.
export const focusCell = StateEffect.define();

/// The cell the widget says is focused. Its `from` follows the document: a
/// paragraph typed above the table moves the table, not the person out of it.
export const activeCell = StateField.define({
  create: () => null,
  update(value, tr) {
    // The old value is mapped first; an effect in the same transaction
    // already speaks in the positions of AFTER the change.
    if (value && tr.docChanged) value = { ...value, from: tr.changes.mapPos(value.from, 1) };
    for (const effect of tr.effects) if (effect.is(setActiveCell)) value = effect.value;
    return value;
  },
});

/// Every table of `state`, as `{from, to, text, model}` — `from` at the start
/// of its first line, `to` at the end of its last.
export function tablesIn(state) {
  const out = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Table") return;
      const from = state.doc.lineAt(node.from).from;
      const to = state.doc.lineAt(node.to).to;
      const text = state.doc.sliceString(from, to);
      out.push({ from, to, text, model: parseTable(text) });
      return false;
    },
  });
  return out;
}

/// The table holding `pos`, or null.
export function tableAt(state, pos) {
  return tablesIn(state).find((table) => pos >= table.from && pos <= table.to) ?? null;
}

/// Which cell the caret is in when it sits in RAW table text: the line says
/// the row (the delimiter counts as the header — there is nothing else it
/// could mean), the unescaped pipes before the caret say the column.
function cellUnderCaret(state, table) {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const index = line.number - state.doc.lineAt(table.from).number;
  const row = index <= 1 ? -1 : index - 2;
  const before = line.text.slice(0, head - line.from);
  const pipes = (before.match(/(^|[^\\])\|/g) ?? []).length;
  const lead = before.trimStart().startsWith("|") ? 1 : 0;
  const col = Math.max(0, Math.min(table.model.header.length - 1, pipes - lead));
  return { from: table.from, row, col };
}

/// Where the person is: `{table, row, col}`, or null outside any table.
export function currentCell(state) {
  const focused = state.field(activeCell, false);
  if (focused) {
    const table = tableAt(state, focused.from);
    if (table && table.from === focused.from) return { table, row: focused.row, col: focused.col };
  }
  const table = tableAt(state, state.selection.main.head);
  if (!table) return null;
  const { row, col } = cellUnderCaret(state, table);
  return { table, row, col };
}

/// What the formatting panel needs to know to grey its buttons:
/// `{header}` when a cell is current (header true when it is a header cell),
/// null outside any table.
export function tableStatus(state) {
  const cell = currentCell(state);
  return cell ? { header: cell.row < 0 } : null;
}

/// The one transaction every table edit ends in: the table's text replaced
/// by `model` written back, the cell to land in named for the widget. Same
/// pact as `markdownCommands.edit` — read-only answers `false`, the change is
/// tagged so undo groups it apart from typing.
export function applyTable(view, table, model, land = null) {
  if (view.state.readOnly) return false;
  const text = renderTable(model);
  const effects = [];
  if (land) {
    const cell = { from: table.from, ...land };
    effects.push(setActiveCell.of(cell), focusCell.of(cell));
  }
  if (text === table.text) {
    if (effects.length) view.dispatch({ effects });
    return true;
  }
  view.dispatch(
    view.state.update({
      changes: { from: table.from, to: table.to, insert: text },
      effects,
      userEvent: "input.format",
    }),
  );
  return true;
}

/// A 2 × 2 table on its own lines, below the caret's line — the same placing
/// `insertRule` uses. Refused inside a table: one does not nest.
export function insertTable(view) {
  const { state } = view;
  if (state.readOnly || currentCell(state)) return false;
  const line = state.doc.lineAt(state.selection.main.head);
  const text = renderTable(emptyTable({ label: (n) => `${S.tableColumn} ${n}` }));
  const lead = line.text.trim() ? "\n\n" : "";
  const insert = `${lead}${text}\n`;
  const from = line.to + lead.length;
  const cell = { from, row: -1, col: 0 };
  view.dispatch(
    state.update({
      changes: { from: line.to, insert },
      selection: EditorSelection.cursor(line.to + insert.length),
      effects: [setActiveCell.of(cell), focusCell.of(cell)],
      scrollIntoView: true,
      userEvent: "input.format",
    }),
  );
  return true;
}

/// A column to the right of the current one, focus in its header.
export function addColumn(view) {
  const cell = currentCell(view.state);
  if (!cell) return false;
  return applyTable(view, cell.table, addColumnTo(cell.table.model, cell.col), {
    row: cell.row,
    col: cell.col + 1,
  });
}

/// A row under the current one (under the header when that is where the
/// person is), focus in its first cell of the same column.
export function addRow(view) {
  const cell = currentCell(view.state);
  if (!cell) return false;
  return applyTable(view, cell.table, addRowTo(cell.table.model, cell.row), {
    row: cell.row + 1,
    col: cell.col,
  });
}

/// The current column gone; the focus moves to the neighbour that took its
/// place. The last column is kept (`tables.deleteColumn`).
export function deleteColumn(view) {
  const cell = currentCell(view.state);
  if (!cell || cell.table.model.header.length <= 1) return false;
  const model = deleteColumnOf(cell.table.model, cell.col);
  return applyTable(view, cell.table, model, {
    row: cell.row,
    col: Math.min(cell.col, model.header.length - 1),
  });
}

/// The current body row gone. The header is not a body row and is refused —
/// a table without one is not a table.
export function deleteRow(view) {
  const cell = currentCell(view.state);
  if (!cell || cell.row < 0) return false;
  const model = deleteRowOf(cell.table.model, cell.row);
  return applyTable(view, cell.table, model, {
    row: Math.min(cell.row, model.rows.length - 1),
    col: cell.col,
  });
}

/// The whole table gone, and the blank line under it when there is one, so
/// the paragraphs around close up. The caret lands where it stood.
export function deleteTable(view) {
  const { state } = view;
  const cell = currentCell(state);
  if (!cell || state.readOnly) return false;
  const { from } = cell.table;
  let { to } = cell.table;
  if (to < state.doc.length) to += 1;
  if (to < state.doc.length && state.doc.lineAt(to).text.trim() === "") {
    to = Math.min(state.doc.length, state.doc.lineAt(to).to + 1);
  }
  view.dispatch(
    state.update({
      changes: { from, to },
      selection: EditorSelection.cursor(from),
      effects: setActiveCell.of(null),
      scrollIntoView: true,
      userEvent: "delete",
    }),
  );
  view.focus();
  return true;
}

/// The commands by the id the registry knows them as — spread into
/// `markdownCommands.EDITOR_COMMANDS`, so a button and a chord reach the
/// same function.
export const TABLE_COMMANDS = {
  "table.insert": insertTable,
  "table.addColumn": addColumn,
  "table.addRow": addRow,
  "table.deleteColumn": deleteColumn,
  "table.deleteRow": deleteRow,
  "table.delete": deleteTable,
};

/// The same ids as a list — what the shell hides or greys as one.
export const TABLE_FORMATS = Object.keys(TABLE_COMMANDS);
