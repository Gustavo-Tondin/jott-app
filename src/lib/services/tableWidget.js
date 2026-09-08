// A Markdown table drawn as a grid of `contenteditable` cells — ALWAYS the
// grid, never the pipes. Every keystroke re-renders the whole table back into
// the document (`tables.renderTable`); `updateDOM` patches only changed cells,
// so focus and caret stay put. The focus lives in the widget, NOT in CodeMirror:
// its keymap and selection never see a cell, so Tab/Enter/Escape are answered here.

import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { addRow as addRowTo, cellOf, moveColumn, moveRow, setCell } from "./tables.js";
import { applyTable, focusCell, setActiveCell, tablesIn } from "./tableEditing.js";
import { S } from "./strings.js";

/// "Draw the tables again" — what the switch in Settings dispatches.
export const refreshTables = StateEffect.define();

/// A cell's identity in the DOM: `data-row` (-1 header) and `data-col`.
const cellSelector = (row, col) => `[data-row="${row}"][data-col="${col}"]`;

/// Puts the caret at the end of `element`'s text and focuses it.
function focusEnd(element) {
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = element.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/// `plaintext-only` where the engine has it (WebKit, Chromium — the two the
/// app ships on), so Ctrl+B in a cell cannot wrap the text in a `<b>` the
/// Markdown would never see. Where it does not, plain `true` and the keydown
/// handler below refuses the formatting chords.
function editableMode(doc) {
  const probe = doc.createElement("div");
  probe.setAttribute("contenteditable", "plaintext-only");
  return probe.isContentEditable || probe.contentEditable === "plaintext-only"
    ? "plaintext-only"
    : "true";
}

class TableWidget extends WidgetType {
  constructor(table, ctx) {
    super();
    this.table = table;
    this.ctx = ctx;
    // Read when the decoration is built, for the reason `EmbedWidget` gives:
    // it is part of what this widget IS, and `eq` has to see it change.
    this.layout = ctx.layout?.() ?? "";
  }

  eq(other) {
    return other.table.text === this.table.text && other.layout === this.layout;
  }

  /// The layout as a class on the wrapper — `scroll` runs wide, the default
  /// squeezes to the column.
  dress(dom) {
    dom.classList.toggle("cm-md-table--scroll", this.layout === "scroll");
  }

  toDOM(view) {
    const dom = document.createElement("div");
    dom.className = "cm-md-table";
    dom.setAttribute("data-region", "canvas");
    const scroll = document.createElement("div");
    scroll.className = "cm-md-table__scroll";
    const grid = document.createElement("table");
    grid.className = "cm-md-table__grid";
    scroll.appendChild(grid);
    dom.appendChild(scroll);
    dom.dataset.from = String(this.table.from);
    dom.tableWidget = { table: this.table, mode: editableMode(dom.ownerDocument) };
    this.dress(dom);
    this.fill(grid, dom);
    this.wire(dom, view);
    return dom;
  }

  /// Same DOM, new text: the cells that changed take their new text, the
  /// rest are left alone — the one being typed in above all. A change of
  /// SHAPE (a row, a column) redraws the grid, and the focus is put back by
  /// the `focusCell` effect the command sent along.
  updateDOM(dom, view) {
    if (!dom.tableWidget) return false;
    const previous = dom.tableWidget.table.model;
    const next = this.table.model;
    dom.tableWidget.table = this.table;
    dom.dataset.from = String(this.table.from);
    this.dress(dom);
    const grid = dom.querySelector(".cm-md-table__grid");
    const sameShape =
      previous.header.length === next.header.length && previous.rows.length === next.rows.length;
    if (!sameShape) {
      this.fill(grid, dom);
      return true;
    }
    for (const cell of grid.querySelectorAll(".cm-md-table__cell")) {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const text = cellOf(next, row, col);
      if (cell.textContent !== text) cell.textContent = text;
    }
    return true;
  }

  /// The grid from the model. Header cells are `<th>`, body cells `<td>`;
  /// each holds one editable element and, where it applies, a drag handle.
  fill(grid, dom) {
    const { model } = dom.tableWidget.table;
    const mode = dom.tableWidget.mode;
    grid.textContent = "";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    model.header.forEach((text, col) => {
      const th = document.createElement("th");
      th.className = "cm-md-table__head";
      th.appendChild(handle("col", col, S.tableMoveColumn));
      th.appendChild(editable(text, -1, col, mode));
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    grid.appendChild(head);
    const body = document.createElement("tbody");
    model.rows.forEach((cells, row) => {
      const tr = document.createElement("tr");
      cells.forEach((text, col) => {
        const td = document.createElement("td");
        td.className = "cm-md-table__body";
        if (col === 0) td.appendChild(handle("row", row, S.tableMoveRow));
        td.appendChild(editable(text, row, col, mode));
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    grid.appendChild(body);
  }

  /// The listeners, once per widget DOM — delegated, so a redraw of the grid
  /// does not have to wire anything again.
  wire(dom, view) {
    const current = () => dom.tableWidget.table;
    const cellAt = (target) => target?.closest?.(".cm-md-table__cell") ?? null;
    const place = (cell) => ({ row: Number(cell.dataset.row), col: Number(cell.dataset.col) });

    dom.addEventListener("focusin", (event) => {
      const cell = cellAt(event.target);
      if (!cell) return;
      dom.classList.add("cm-md-table--active");
      const { row, col } = place(cell);
      view.dispatch({ effects: setActiveCell.of({ from: current().from, row, col }) });
    });

    dom.addEventListener("focusout", (event) => {
      if (dom.contains(event.relatedTarget)) return;
      dom.classList.remove("cm-md-table--active");
      view.dispatch({ effects: setActiveCell.of(null) });
    });

    dom.addEventListener("input", (event) => {
      const cell = cellAt(event.target);
      if (!cell) return;
      const { row, col } = place(cell);
      const table = current();
      applyTable(view, table, setCell(table.model, row, col, cell.textContent));
    });

    // Where the engine has no `plaintext-only`, a paste would bring markup.
    dom.addEventListener("paste", (event) => {
      if (dom.tableWidget.mode === "plaintext-only" || !cellAt(event.target)) return;
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain") ?? "";
      document.execCommand("insertText", false, text.replace(/\r?\n/g, " "));
    });

    dom.addEventListener("keydown", (event) => {
      const cell = cellAt(event.target);
      if (!cell) return;
      const { row, col } = place(cell);
      const table = current();
      const width = table.model.header.length;
      const last = table.model.rows.length - 1;
      const go = (r, c) => {
        event.preventDefault();
        this.ctx.focus?.(dom, r, c);
      };
      if (event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (event.shiftKey) {
          if (col > 0) return go(row, col - 1);
          if (row >= 0) return go(row - 1, width - 1);
          return go(row, col);
        }
        if (col < width - 1) return go(row, col + 1);
        if (row < last) return go(row + 1, 0);
        // The last cell: Tab grows the table, the way it does in every
        // spreadsheet, and the new row takes the focus by the effect.
        event.preventDefault();
        applyTable(view, table, addRowTo(table.model), { row: row + 1, col: 0 });
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (row < last) return go(row + 1, col);
        event.preventDefault();
        applyTable(view, table, addRowTo(table.model), { row: row + 1, col });
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        view.focus();
        view.dispatch({
          selection: { anchor: Math.min(view.state.doc.length, current().to + 1) },
          effects: setActiveCell.of(null),
        });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && /^[biu]$/i.test(event.key) && !event.altKey) {
        // Formatting chords are the editor's, and the editor does not hear
        // them here; refused rather than left to the engine's own <b>.
        event.preventDefault();
      }
    });

    this.wireDrag(dom, view);
  }

  /// Dragging a column or a row by its handle, with pointer events (one path
  /// for mouse and finger; `touch-action: none` on the handle in editor.css
  /// keeps the finger's drag from scrolling). The target index is read from
  /// cell geometry; the class on the target cell draws the insertion line.
  wireDrag(dom, view) {
    let drag = null;

    const clear = () => {
      for (const marked of dom.querySelectorAll(".cm-md-table__target")) {
        marked.classList.remove("cm-md-table__target");
      }
      dom.classList.remove("cm-md-table--dragging");
    };

    const targetOf = (event) => {
      const grid = dom.querySelector(".cm-md-table__grid");
      if (drag.kind === "col") {
        const heads = [...grid.querySelectorAll("thead th")];
        // "Before column i" for the first i whose middle the pointer has not
        // passed; past them all, after the last.
        let index = heads.length;
        for (let i = 0; i < heads.length; i += 1) {
          const rect = heads[i].getBoundingClientRect();
          if (event.clientX < rect.left + rect.width / 2) {
            index = i;
            break;
          }
        }
        // Pointer past the middle of column i means "after i": the index it
        // LANDS on, once the dragged one is out of the way.
        return index > drag.index ? index - 1 : index;
      }
      const rows = [...grid.querySelectorAll("tbody tr")];
      let index = rows.length;
      for (let i = 0; i < rows.length; i += 1) {
        const rect = rows[i].getBoundingClientRect();
        if (event.clientY < rect.top + rect.height / 2) {
          index = i;
          break;
        }
      }
      return index > drag.index ? index - 1 : index;
    };

    const mark = (index) => {
      clear();
      dom.classList.add("cm-md-table--dragging");
      const grid = dom.querySelector(".cm-md-table__grid");
      if (drag.kind === "col") {
        for (const row of grid.querySelectorAll("tr")) {
          row.children[index]?.classList.add("cm-md-table__target");
        }
      } else {
        grid.querySelectorAll("tbody tr")[index]?.classList.add("cm-md-table__target");
      }
    };

    dom.addEventListener("pointerdown", (event) => {
      const handle = event.target?.closest?.(".cm-md-table__handle");
      if (!handle || !dom.contains(handle)) return;
      event.preventDefault();
      drag = { kind: handle.dataset.kind, index: Number(handle.dataset.index), pointer: event.pointerId };
      handle.setPointerCapture?.(event.pointerId);
      mark(drag.index);
    });

    dom.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      mark(targetOf(event));
    });

    const finish = (event, commit) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      const { kind, index } = drag;
      const to = commit ? targetOf(event) : index;
      drag = null;
      clear();
      if (to === index) return;
      const table = dom.tableWidget.table;
      const model = kind === "col" ? moveColumn(table.model, index, to) : moveRow(table.model, index, to);
      const land = kind === "col" ? { row: -1, col: to } : { row: to, col: 0 };
      applyTable(view, table, model, land);
    };
    dom.addEventListener("pointerup", (event) => finish(event, true));
    dom.addEventListener("pointercancel", (event) => finish(event, false));
  }

  ignoreEvent() {
    return true;
  }
}

/// One editable cell.
function editable(text, row, col, mode) {
  const cell = document.createElement("div");
  cell.className = "cm-md-table__cell";
  cell.setAttribute("contenteditable", mode);
  cell.setAttribute("role", "textbox");
  cell.setAttribute("aria-label", row < 0 ? S.tableHeaderCell : S.tableCell);
  cell.spellcheck = true;
  cell.dataset.row = String(row);
  cell.dataset.col = String(col);
  cell.textContent = text;
  return cell;
}

/// A drag handle for column `index` (`kind: "col"`) or body row `index`.
function handle(kind, index, label) {
  const grip = document.createElement("span");
  grip.className = `cm-md-table__handle cm-md-table__handle--${kind}`;
  grip.dataset.kind = kind;
  grip.dataset.index = String(index);
  grip.setAttribute("role", "button");
  grip.setAttribute("aria-label", label);
  grip.setAttribute("title", label);
  grip.setAttribute("contenteditable", "false");
  return grip;
}

/// Focuses cell (`row`, `col`) of the widget `dom`, caret at the end.
function focusIn(dom, row, col) {
  const cell = dom.querySelector(`.cm-md-table__cell${cellSelector(row, col)}`);
  if (cell) focusEnd(cell);
}

/// The decorations for `state`: one block widget per table, when tables are
/// switched on. Exported the way the other builders are, so a test can read
/// the set without a view.
export function tableDecorationsFor(state, ctx = {}) {
  if (ctx.shows && !ctx.shows()) return Decoration.none;
  const decorations = [];
  for (const table of tablesIn(state)) {
    decorations.push(
      Decoration.replace({ widget: new TableWidget(table, ctx), block: true }).range(
        table.from,
        table.to,
      ),
    );
  }
  return Decoration.set(decorations, true);
}

/// Draws every table of the note as a grid. `ctx.shows` says whether tables
/// are drawn at all (off, the pipes stay; the commands still work on the
/// caret's cell); `ctx.layout` is `""` or `scroll`; both re-read on `refreshTables`.
/// A `StateField`, not a `ViewPlugin`: see docs/platform-gotchas.md#codemirror.
export function noteTables(ctx = {}) {
  const context = { ...ctx, focus: focusIn };
  const field = StateField.define({
    create: (state) => tableDecorationsFor(state, context),
    update(value, tr) {
      if (tr.effects.some((effect) => effect.is(refreshTables))) {
        return tableDecorationsFor(tr.state, context);
      }
      return tr.docChanged ? tableDecorationsFor(tr.state, context) : value;
    },
    provide: (f) => [
      EditorView.decorations.from(f),
      // A grid is ONE thing to the caret: an arrow key steps over the whole
      // table rather than into pipes nobody can see. The known cost, accepted:
      // Backspace right after the table takes the table, and undo brings it
      // back.
      EditorView.atomicRanges.of((view) => view.state.field(f, false) ?? Decoration.none),
    ],
  });

  // The command moved something; now that the DOM has followed, the focus
  // goes where the command said. After the update, not during it: a focus
  // fires `focusin`, which dispatches, and a dispatch inside an update is an
  // error CodeMirror throws on.
  const focusing = ViewPlugin.fromClass(
    class {
      update(update) {
        for (const tr of update.transactions) {
          for (const effect of tr.effects) {
            if (!effect.is(focusCell)) continue;
            const { from, row, col } = effect.value;
            queueMicrotask(() => {
              const dom = update.view.dom.querySelector(`.cm-md-table[data-from="${from}"]`);
              if (dom) focusIn(dom, row, col);
            });
          }
        }
      }
    },
  );

  return [field, focusing];
}
