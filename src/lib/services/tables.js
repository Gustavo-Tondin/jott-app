// A Markdown table as a VALUE: parse a GFM pipe table, write it back aligned,
// and the structural edits — no document position, no DOM, no CodeMirror.
// Reading is TOLERANT (no outer pipes, short/long rows, unpadded delimiter);
// writing is STRICT (padded, outer pipes on), alignment marks kept as found.
// Cell text is what a person SEES: only `escapeCell`/`unescapeCell` know `\|`.

/// The smallest a column can be. Three, because that is the shortest
/// delimiter GFM accepts (`---`) — a narrower column would have to write a
/// delimiter wider than its cells, which reads as misaligned.
const MIN_WIDTH = 3;

/// On-screen column widths, as PERCENTAGES of the table — the one measure
/// that survives a phone and a desktop being different sizes. They live in a
/// comment line of their own right above the table, because a table without
/// one is a plain GFM table and has to stay one.
const COLUMNS_LINE = /^\s*<!--\s*cols:\s*([^>]*?)\s*-->\s*$/i;

/// The narrowest a column may be dragged to, in percent. Capped by the even
/// share, so a table of thirty columns can still hold a floor at all.
const MIN_PERCENT = 4;

const floorFor = (count) => Math.min(MIN_PERCENT, 100 / count);

/// Whether `line` is the widths comment — ours to read, rewrite or drop, so
/// the shape alone decides, not whether the numbers in it make sense.
export function isColumnsLine(line) {
  return COLUMNS_LINE.test(String(line ?? ""));
}

/// The numbers out of a widths comment, unvalidated (`normalizeWidths` is
/// what judges them), or null when `line` is not one.
function readColumnsLine(line) {
  const match = COLUMNS_LINE.exec(String(line ?? ""));
  if (!match) return null;
  return match[1].split(",").map((part) => Number(part.replace("%", "").trim()));
}

/// Percentages the app is willing to draw and write: `count` of them, all
/// finite and positive, none under the floor, summing to 100 at one decimal.
/// Anything else is null — "this table has no widths", which is the default
/// and not an error.
export function normalizeWidths(widths, count) {
  if (!Array.isArray(widths) || widths.length !== count || count === 0) return null;
  const numbers = widths.map(Number);
  if (numbers.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  const total = numbers.reduce((sum, n) => sum + n, 0);
  const floor = floorFor(count);
  const scaled = numbers.map((n) => (n / total) * 100);
  // Every column under the floor is lifted to it, and the room comes from
  // those above it, in proportion to how far above they are. One pass is
  // enough: the shortfall can never exceed the surplus when the floor is the
  // even share at worst.
  const short = scaled.reduce((sum, n) => sum + Math.max(0, floor - n), 0);
  const spare = scaled.reduce((sum, n) => sum + Math.max(0, n - floor), 0);
  const take = short > 0 && spare > 0 ? Math.min(1, short / spare) : 0;
  const lifted = scaled.map((n) => (n < floor ? floor : n - (n - floor) * take));
  const rounded = lifted.map((n) => Math.round(n * 10) / 10);
  // Rounding drifts; the widest column absorbs it, where a tenth is invisible.
  const drift = Math.round((100 - rounded.reduce((sum, n) => sum + n, 0)) * 10) / 10;
  if (drift !== 0) {
    let widest = 0;
    for (let i = 1; i < rounded.length; i += 1) if (rounded[i] > rounded[widest]) widest = i;
    rounded[widest] = Math.round((rounded[widest] + drift) * 10) / 10;
  }
  return rounded;
}

/// The widths comment, or `null` for a table that has none. A whole number
/// writes as one — `24`, not `24.0`.
function renderColumnsLine(widths) {
  if (!widths) return null;
  const numbers = widths.map((n) => String(Math.round(n * 10) / 10));
  return `<!--cols: ${numbers.join(",")}-->`;
}

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
/// cell trimmed, `\|` read back as a pipe. A pipe inside a code span still
/// splits — that IS the GFM rule, and GitHub splits the same way.
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
function unescapeCell(text) {
  return text.replace(/\\\|/g, "|");
}

/// `|` → `\|`, and a newline to a space: a GFM cell is one line, and the only
/// way to keep a pasted paragraph from becoming three broken rows.
export function escapeCell(text) {
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

/// Reads a table out of its lines: header, delimiter (skipped when present —
/// a table without one is still read, and written back WITH one), body.
/// The width is the header's: extra cells are dropped, short rows filled,
/// as GFM does — which makes every write rectangular.
export function parseTable(lines) {
  const list = Array.isArray(lines) ? lines : String(lines ?? "").split("\n");
  const kept = list.filter((line) => line.trim() !== "");
  if (kept.length === 0) return { header: [""], align: [null], rows: [], widths: null };
  // The widths comment, when it leads. Read before anything else and taken
  // out of the way: to everything below, a table is still header + body.
  let asked = null;
  if (isColumnsLine(kept[0])) {
    asked = readColumnsLine(kept.shift());
    if (kept.length === 0) return { header: [""], align: [null], rows: [], widths: null };
  }
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
  return { header, align, rows, widths: normalizeWidths(asked, width) };
}

/// `cells` cut or padded to `width`.
function fit(cells, width) {
  const out = cells.slice(0, width);
  while (out.length < width) out.push("");
  return out;
}

/// How wide `text` is, in characters a monospaced font draws one column each.
/// Code points, not UTF-16 units — an emoji is one glyph, not two.
function widthOf(text) {
  return [...escapeCell(text)].length;
}

/// The width each column needs: its widest cell, never under `MIN_WIDTH`.
function columnWidths({ header, rows }) {
  return header.map((_, col) =>
    Math.max(MIN_WIDTH, widthOf(header[col] ?? ""), ...rows.map((row) => widthOf(row[col] ?? ""))),
  );
}

/// The table written back, aligned, under its widths comment when it has
/// one. Every line begins and ends with a pipe, every cell is padded to its
/// column and wrapped in one space — `| a   | b |`.
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
  const lead = renderColumnsLine(normalizeWidths(model.widths, model.header.length));
  return [
    ...(lead ? [lead] : []),
    line(model.header),
    `| ${delimiter.join(" | ")} |`,
    ...model.rows.map(line),
  ].join("\n");
}

/// A fresh table: `columns` headed "Column 1", "Column 2"…, and `rows` empty
/// body rows. The shape the Insert button writes (2 × 2 including the header).
export function emptyTable({ columns = 2, rows = 1, label = (n) => `Column ${n}` } = {}) {
  const header = Array.from({ length: columns }, (_, i) => label(i + 1));
  return {
    header,
    align: header.map(() => null),
    rows: Array.from({ length: rows }, () => header.map(() => "")),
    widths: null,
  };
}

// ---- structural edits -----------------------------------------------------
// Each returns a NEW model and leaves the given one alone. `at` is a column or
// a body-row index; the header is row -1 to the widget, and no edit here
// moves or removes it — a GFM table without one is not a table.

const clone = (model) => ({
  header: [...model.header],
  align: [...(model.align ?? model.header.map(() => null))],
  rows: model.rows.map((row) => [...row]),
  widths: model.widths ? [...model.widths] : null,
});

/// A new empty column after column `at` (or at the end when `at` is omitted).
/// On a table with widths, it arrives at the even share and the others give
/// up room in proportion — nobody is singled out to pay for it.
export function addColumn(model, at = model.header.length - 1) {
  const next = clone(model);
  const index = Math.min(next.header.length, Math.max(0, at + 1));
  next.header.splice(index, 0, "");
  next.align.splice(index, 0, null);
  for (const row of next.rows) row.splice(index, 0, "");
  if (next.widths) {
    next.widths.splice(index, 0, 100 / model.header.length);
    next.widths = normalizeWidths(next.widths, next.header.length);
  }
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
  if (next.widths) {
    next.widths.splice(at, 1);
    next.widths = normalizeWidths(next.widths, next.header.length);
  }
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
  if (next.widths) shift(next.widths);
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

// ---- on-screen widths -----------------------------------------------------

/// The model wearing `widths` (percentages, one per column). Anything the
/// normaliser refuses clears them instead — a table always has a shape it
/// can be drawn in.
export function setWidths(model, widths) {
  const next = clone(model);
  next.widths = normalizeWidths(widths, next.header.length);
  return next;
}

/// The model back to columns the browser sizes. The comment goes with it:
/// "no widths" is spelled by the line not being there.
export function clearWidths(model) {
  const next = clone(model);
  next.widths = null;
  return next;
}

/// Column `index` dragged to `percent` of the table, against its right-hand
/// neighbour: the two trade room and everything else stays put, which is
/// what keeps the total at 100 without a second pass. `from` is where the
/// widths were when the drag began — measured off the screen for a table
/// that had none, so the first drag does not start by jumping.
export function resizeColumn(model, index, percent, from = model.widths) {
  const count = model.header.length;
  const base = normalizeWidths(from, count);
  if (!base || index < 0 || index >= count - 1) return model;
  const floor = floorFor(count);
  const pair = base[index] + base[index + 1];
  const left = Math.min(Math.max(percent, floor), pair - floor);
  const next = [...base];
  next[index] = left;
  next[index + 1] = pair - left;
  return setWidths(model, next);
}
