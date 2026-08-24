// A Markdown table as a VALUE — the half of the feature that never sees the
// editor (2026-08-24).
//
// What lives here: reading a GFM pipe table out of its lines, writing one back
// aligned, and the structural edits the formatting panel offers (a column, a
// row, a move, a removal). What does NOT live here: any position in a
// document, any DOM, any CodeMirror. `tableEditing.js` maps this onto the
// open note, `tableWidget.js` draws it; both are testable only with an
// editor, this one with a string.
//
// **The file is the product (principle 4)**, which decides two things:
//
//   1. Reading is TOLERANT. A row with too few cells, too many, without the
//      outer pipes, with the delimiter written `|---|---|` and the cells
//      unpadded — all of it is a table (the reference note the user showed
//      had two of these shapes side by side). GitHub reads it; so does this.
//   2. Writing is STRICT. Every write comes out padded so the columns line up
//      in a monospaced font, outer pipes on, one space of air in each cell —
//      the shape a person reading the raw `.md` in any other editor can
//      follow with the eye. Alignment marks (`:---:`) a file already carries
//      are kept as they are: the app offers no control for them, and a
//      setting the user wrote by hand is not the app's to drop.
//
// A model is `{header: string[], align: (null|"left"|"center"|"right")[],
// rows: string[][]}`. Cell text is what a person SEES — a pipe inside a cell
// is `|` here and `\|` in the file; `escapeCell`/`unescapeCell` are the only
// two places that know the difference.

/// The smallest a column can be. Three, because that is the shortest
/// delimiter GFM accepts (`---`) — a narrower column would have to write a
/// delimiter wider than its cells, which reads as misaligned.
const MIN_WIDTH = 3;

/// A delimiter row: pipes, dashes, optional colons, nothing else.
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/// Whether `line` is a row of a table — has a pipe in it that is not escaped.
/// Loose on purpose: GFM asks for a delimiter row under the header, and the
/// caller (the syntax tree, or `previewBlocks`) checks that; this is the
/// shape of a single row.
export function isTableRow(line) {
  return /(^|[^\\])\|/.test(line);
}

/// Whether `line` is the row of dashes under a header.
export function isDelimiterRow(line) {
  return DELIMITER.test(line) && line.includes("-");
}

/// The cells of one row, as the person sees them: outer pipes dropped, each
/// cell trimmed, `\|` read back as a pipe.
///
/// A pipe inside a code span still splits — that IS the GFM rule (the spec
/// says the only escape is the backslash), and a reader that split
/// differently from GitHub would draw one table here and another there.
export function splitRow(line) {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells = [];
  let cell = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\" && text[i + 1] === "|") {
      cell += "\\|";
      i += 1;
    } else if (ch === "|") {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells.map((c) => unescapeCell(c.trim()));
}

/// What a delimiter cell says about its column.
function alignOf(cell) {
  const text = cell.trim();
  const left = text.startsWith(":");
  const right = text.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

/// `\|` → `|`. The file's spelling of a pipe that is content, not structure.
export function unescapeCell(text) {
  return text.replace(/\\\|/g, "|");
}

/// `|` → `\|`, and a newline to a space: a GFM cell is one line, and the only
/// way to keep a pasted paragraph from becoming three broken rows.
export function escapeCell(text) {
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

/// Reads a table out of its lines. The first line is the header, the second
/// the delimiter (skipped when present — a table pasted without one is still
/// read, so the app can write it back WITH one), the rest the body.
///
/// The width of the table is the header's: GFM drops the extra cells of a
/// long row and fills a short one, and so does this — which is also what
/// makes every write come out rectangular.
export function parseTable(lines) {
  const list = Array.isArray(lines) ? lines : String(lines ?? "").split("\n");
  const kept = list.filter((line) => line.trim() !== "");
  if (kept.length === 0) return { header: [""], align: [null], rows: [] };
  const header = splitRow(kept[0]);
  const width = header.length;
  let body = kept.slice(1);
  let align = header.map(() => null);
  if (body.length > 0 && isDelimiterRow(body[0])) {
    const marks = splitRow(body[0]);
    align = header.map((_, i) => (marks[i] === undefined ? null : alignOf(marks[i])));
    body = body.slice(1);
  }
  const rows = body.map((line) => fit(splitRow(line), width));
  return { header, align, rows };
}

/// `cells` cut or padded to `width`.
function fit(cells, width) {
  const out = cells.slice(0, width);
  while (out.length < width) out.push("");
  return out;
}

/// How wide `text` is, in characters a monospaced font draws one column each.
/// Code points, not UTF-16 units — an emoji is one glyph, not two.
export function widthOf(text) {
  return [...escapeCell(text)].length;
}

/// The width each column needs: its widest cell, never under `MIN_WIDTH`.
export function columnWidths({ header, rows }) {
  return header.map((_, col) =>
    Math.max(MIN_WIDTH, widthOf(header[col] ?? ""), ...rows.map((row) => widthOf(row[col] ?? ""))),
  );
}

/// The table written back, aligned. Every line begins and ends with a pipe,
/// every cell is padded to its column and wrapped in one space — `| a   | b |`.
export function renderTable(model) {
  const widths = columnWidths(model);
  const pad = (text, width) => {
    const escaped = escapeCell(text);
    return escaped + " ".repeat(Math.max(0, width - [...escaped].length));
  };
  const line = (cells) => `| ${cells.map((cell, i) => pad(cell ?? "", widths[i])).join(" | ")} |`;
  const delimiter = model.header.map((_, i) => {
    const align = model.align?.[i] ?? null;
    const width = widths[i];
    if (align === "center") return `:${"-".repeat(width - 2)}:`;
    if (align === "right") return `${"-".repeat(width - 1)}:`;
    if (align === "left") return `:${"-".repeat(width - 1)}`;
    return "-".repeat(width);
  });
  return [line(model.header), `| ${delimiter.join(" | ")} |`, ...model.rows.map(line)].join("\n");
}

/// A fresh table: `columns` headed "Column 1", "Column 2"…, and `rows` empty
/// body rows. The shape the Insert button writes (2 × 2 including the header,
/// user call 2026-08-24).
export function emptyTable({ columns = 2, rows = 1, label = (n) => `Column ${n}` } = {}) {
  const header = Array.from({ length: columns }, (_, i) => label(i + 1));
  return {
    header,
    align: header.map(() => null),
    rows: Array.from({ length: rows }, () => header.map(() => "")),
  };
}

// ---- structural edits -----------------------------------------------------
//
// Each returns a NEW model and leaves the one it was given alone; the caller
// decides whether anything is written. `at` is a column or a body-row index
// (the header is not a body row: it is row -1 to the widget, and no edit
// here moves or removes it — a GFM table without one is not a table).

const clone = (model) => ({
  header: [...model.header],
  align: [...(model.align ?? model.header.map(() => null))],
  rows: model.rows.map((row) => [...row]),
});

/// A new empty column after column `at` (or at the end when `at` is omitted).
export function addColumn(model, at = model.header.length - 1) {
  const next = clone(model);
  const index = Math.min(next.header.length, Math.max(0, at + 1));
  next.header.splice(index, 0, "");
  next.align.splice(index, 0, null);
  for (const row of next.rows) row.splice(index, 0, "");
  return next;
}

/// A new empty body row after body row `at` (or at the end when omitted;
/// `-1` puts it first, right under the header).
export function addRow(model, at = model.rows.length - 1) {
  const next = clone(model);
  const index = Math.min(next.rows.length, Math.max(0, at + 1));
  next.rows.splice(index, 0, next.header.map(() => ""));
  return next;
}

/// Column `at` gone. The last column stays: a table of no columns is not a
/// thing the file could hold — that is what "delete table" is for.
export function deleteColumn(model, at) {
  if (model.header.length <= 1 || at < 0 || at >= model.header.length) return model;
  const next = clone(model);
  next.header.splice(at, 1);
  next.align.splice(at, 1);
  for (const row of next.rows) row.splice(at, 1);
  return next;
}

/// Body row `at` gone. The header cannot be asked for (it is not a body row).
export function deleteRow(model, at) {
  if (at < 0 || at >= model.rows.length) return model;
  const next = clone(model);
  next.rows.splice(at, 1);
  return next;
}

/// Column `from` moved so that it lands at index `to` (its index AFTER the
/// move) — the drag handle's contract.
export function moveColumn(model, from, to) {
  const width = model.header.length;
  if (from === to || from < 0 || from >= width || to < 0 || to >= width) return model;
  const next = clone(model);
  const shift = (list) => {
    const [cell] = list.splice(from, 1);
    list.splice(to, 0, cell);
  };
  shift(next.header);
  shift(next.align);
  for (const row of next.rows) shift(row);
  return next;
}

/// Body row `from` moved to index `to` (its index after the move).
export function moveRow(model, from, to) {
  const count = model.rows.length;
  if (from === to || from < 0 || from >= count || to < 0 || to >= count) return model;
  const next = clone(model);
  const [row] = next.rows.splice(from, 1);
  next.rows.splice(to, 0, row);
  return next;
}

/// The model with one cell replaced. `row` is -1 for the header.
export function setCell(model, row, col, text) {
  const next = clone(model);
  if (row < 0) next.header[col] = text;
  else if (next.rows[row]) next.rows[row][col] = text;
  return next;
}

/// The text of one cell, `""` when there is none. `row` is -1 for the header.
export function cellOf(model, row, col) {
  return (row < 0 ? model.header[col] : model.rows[row]?.[col]) ?? "";
}
