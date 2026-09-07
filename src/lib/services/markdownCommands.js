// Writing Markdown by keyboard — the other half of `markdown.js`.
//
// `markdown.js` decides how a document LOOKS; this decides how it is written.
// They are separate files because they are separate jobs: one reads the tree
// and names classes, this one edits text and never draws anything.
//
// Every function here is a CodeMirror command — `(view) => boolean`, true when
// it did something — so they drop straight into a keymap and into a button
// with no adapter between. What binds them to chords is `commands.js`, which
// is also what a tooltip reads: one command, one name, one key, whichever door
// the user comes through.

import { EditorSelection } from "@codemirror/state";
import { indentLess, indentMore, redo, undo } from "@codemirror/commands";
import { TABLE_COMMANDS } from "./tableEditing.js";

/// One level of indentation, as SPACES.
///
/// Four, not two (user call, 2026-08-24). Two was the least that nests a
/// `- ` bullet, but an ORDERED item needs at least the parent's marker width
/// — under `3. ` the content column is 3 — or CommonMark reads the "nested"
/// item as a sibling and the numbering never restarts, which is exactly the
/// screenshot that changed this. Four covers `99. `, and reads wider, which
/// was asked for in the same breath. A note stays legible in whatever editor
/// opens the file next — the files are the product (principle 4). Tabs are
/// avoided for the same reason: their width is the reader's setting, so a
/// nested list written with them lands differently everywhere.
export const INDENT = "    ";

// ---- inline marks ---------------------------------------------------------

/// The one transaction every command ends in: its `changes` and, when the
/// command moves the cursor, its `selection` — scrolled into view and tagged
/// `input.format`, so undo groups it apart from typing. The read-only guard
/// lives here and nowhere else: on a read-only view a command answers
/// `false`, which is what lets the key fall through to the next binding.
function edit(view, { changes, selection }) {
  if (view.state.readOnly) return false;
  view.dispatch(
    view.state.update({
      changes,
      ...(selection ? { selection } : {}),
      scrollIntoView: true,
      userEvent: "input.format",
    }),
  );
  return true;
}

/// Wrap the selection in `open`…`close`, or take them off when they are
/// already there — for a mark whose two halves are DIFFERENT text. Markdown
/// has exactly one of those (`<u>`); everything else goes through
/// `toggleRun` below, which knows that the same character repeated nests.
///
/// With nothing selected it works on the WORD under the cursor, because that
/// is what someone means by pressing the key mid-word; with no word either, it
/// leaves the marks and puts the cursor between them, ready to type.
function toggleWrap(open, close = open) {
  return (view) => {
    const changes = [];
    const ranges = [];

    for (const range of view.state.selection.ranges) {
      const span = range.empty ? wordAt(view.state, range.head) : range;
      const text = view.state.sliceDoc(span.from, span.to);
      const before = view.state.sliceDoc(Math.max(0, span.from - open.length), span.from);
      const after = view.state.sliceDoc(span.to, Math.min(view.state.doc.length, span.to + close.length));

      if (
        text.startsWith(open) &&
        text.endsWith(close) &&
        text.length >= open.length + close.length
      ) {
        // The marks are inside the selection.
        changes.push({
          from: span.from,
          to: span.to,
          insert: text.slice(open.length, text.length - close.length),
        });
        ranges.push(
          EditorSelection.range(span.from, span.to - open.length - close.length),
        );
      } else if (before === open && after === close) {
        // The marks are just outside it — the shape a second press leaves.
        changes.push({ from: span.from - open.length, to: span.from, insert: "" });
        changes.push({ from: span.to, to: span.to + close.length, insert: "" });
        ranges.push(EditorSelection.range(span.from - open.length, span.to - open.length));
      } else {
        changes.push({ from: span.from, insert: open });
        changes.push({ from: span.to, insert: close });
        ranges.push(
          range.empty && span.from === span.to
            ? EditorSelection.cursor(span.from + open.length)
            : EditorSelection.range(span.from + open.length, span.to + open.length),
        );
      }
    }

    return edit(view, {
      changes,
      selection: EditorSelection.create(ranges, view.state.selection.mainIndex),
    });
  };
}

/// How many `char` in a row sit immediately before / after a position.
function runBefore(doc, pos, char) {
  let n = 0;
  while (pos - n > 0 && doc.sliceString(pos - n - 1, pos - n) === char) n++;
  return n;
}

function runAfter(doc, pos, char) {
  let n = 0;
  while (pos + n < doc.length && doc.sliceString(pos + n, pos + n + 1) === char) n++;
  return n;
}

/// A mark written as ONE CHARACTER REPEATED — `*`, `**`, `~~`, `` ` ``. All of
/// Markdown's inline marks but the underline, and the reason they cannot be
/// toggled by matching text (user report, 2026-09-07: "itálico e bold na mesma
/// frase estão conflitando nos atalhos"):
///
///   `**word**` with `word` selected, Ctrl+I — the old rule saw `*` on each
///   side of the selection, read "the italic is already on", and deleted one
///   asterisk from each end. Pressing italic UNBOLDED the word.
///
/// So the question is not "is my mark the text next to the selection" but HOW
/// MANY of that character stand around it, counting the ones caught inside the
/// selection as being around it. `***word***` is bold and italic at once; one
/// asterisk each side is italic, two is bold, three is both. Which is what
/// makes the arithmetic below the whole rule:
///
///   * a one-character mark is on when the run is ODD (1 or 3), and taking it
///     off removes one of each side — `***x***` → `**x**`, the bold intact;
///   * a two-character mark is on when the run is at least two, and taking it
///     off removes two — `***x***` → `*x*`, the italic intact.
function toggleRun(char, width) {
  return (view) => {
    const state = view.state;
    const changes = [];
    const ranges = [];

    for (const range of state.selection.ranges) {
      const span = range.empty ? wordAt(state, range.head) : range;
      // Marks caught INSIDE the selection count as marks AROUND it: selecting
      // `**bold**` whole and pressing Ctrl+B means the word, not the
      // asterisks — and it is the same answer as selecting just the word.
      let from = span.from;
      let to = span.to;
      while (
        from < to &&
        state.sliceDoc(from, from + 1) === char &&
        state.sliceDoc(to - 1, to) === char
      ) {
        from++;
        to--;
      }

      const around = Math.min(runBefore(state.doc, from, char), runAfter(state.doc, to, char));
      const on = width === 1 ? around % 2 === 1 : around >= width;
      const mark = char.repeat(width);

      if (on) {
        changes.push({ from: from - width, to: from, insert: "" });
        changes.push({ from: to, to: to + width, insert: "" });
        ranges.push(
          from === to
            ? EditorSelection.cursor(from - width)
            : EditorSelection.range(from - width, to - width),
        );
      } else {
        changes.push({ from, insert: mark });
        changes.push({ from: to, insert: mark });
        ranges.push(
          from === to
            ? EditorSelection.cursor(from + width)
            : EditorSelection.range(from + width, to + width),
        );
      }
    }

    return edit(view, {
      changes,
      selection: EditorSelection.create(ranges, state.selection.mainIndex),
    });
  };
}

/// The word around `pos`. Word characters only — punctuation ends it, so
/// bolding inside `foo, bar` takes one of them and not both.
function wordAt(state, pos) {
  const line = state.doc.lineAt(pos);
  const text = line.text;
  let from = pos - line.from;
  let to = from;
  const isWord = (ch) => ch && /[\p{L}\p{N}_]/u.test(ch);
  while (from > 0 && isWord(text[from - 1])) from--;
  while (to < text.length && isWord(text[to])) to++;
  return { from: line.from + from, to: line.from + to };
}

export const toggleBold = toggleRun("*", 2);
export const toggleItalic = toggleRun("*", 1);
export const toggleStrike = toggleRun("~", 2);
export const toggleInlineCode = toggleRun("`", 1);
/// Underline, which **Markdown does not have** — so it is written as the HTML
/// it is (user call, 2026-08-19, weighing the two candidates):
///
///   * `<u>text</u>` is valid CommonMark (inline HTML) and renders as an
///     underline in Obsidian, in VS Code and on GitHub. The cost is a tag
///     visible in the raw text.
///   * `__text__` would read cleaner and would be a LIE: in CommonMark that is
///     bold, so the file would say something else everywhere but here — and it
///     would collide with the B button two glyphs away.
///
/// The panel draws the button because the wireframe does; the file stays
/// portable, which is principle 4.
export const toggleUnderline = toggleWrap("<u>", "</u>");

/// A link around the selection: `[text](url)`, cursor left in the url, where
/// the next thing to type is. With nothing selected the cursor goes to the
/// TEXT instead — there is nothing to link yet.
export function insertLink(view) {
  const range = view.state.selection.main;
  const text = view.state.sliceDoc(range.from, range.to);
  return edit(view, {
    changes: { from: range.from, to: range.to, insert: `[${text}]()` },
    selection: EditorSelection.cursor(text ? range.from + text.length + 3 : range.from + 1),
  });
}

/// A reference to another note: `[[title]]`, with the cursor between the
/// brackets so the autocomplete opens on the next keystroke
/// (services/linkComplete.js). A selection becomes the title.
///
/// The same brackets carry a FILE, with a leading slash (`[[/foto.jpg]]`) —
/// which is why this writes the note form and the paperclip beside it writes
/// the other: the two are one syntax with two namespaces (services/embeds.js),
/// and the button says which one you meant.
export function insertReference(view) {
  const range = view.state.selection.main;
  const text = view.state.sliceDoc(range.from, range.to);
  return edit(view, {
    changes: { from: range.from, to: range.to, insert: `[[${text}]]` },
    selection: EditorSelection.cursor(range.from + 2 + text.length),
  });
}

/// A horizontal rule on its own line.
export function insertRule(view) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const insert = line.text.trim() ? "\n\n---\n" : "---\n";
  return edit(view, {
    changes: { from: line.to, insert },
    selection: EditorSelection.cursor(line.to + insert.length),
  });
}

// ---- line marks -----------------------------------------------------------

/// The lines a selection touches — the unit every line command works on, so
/// selecting three lines and pressing Ctrl+Shift+8 makes three bullets and not
/// one.
function linesOf(state, range) {
  const out = [];
  let pos = range.from;
  while (pos <= range.to) {
    const line = state.doc.lineAt(pos);
    out.push(line);
    if (line.to >= state.doc.length) break;
    pos = line.to + 1;
    if (pos > range.to) break;
  }
  return out;
}

/// What Markdown mark a line already carries, and where its content starts.
const MARKS = [
  { kind: "heading", re: /^(\s*)(#{1,6})\s+/ },
  { kind: "task", re: /^(\s*)([-*+])\s+\[[ xX]\]\s+/ },
  { kind: "bullet", re: /^(\s*)([-*+])\s+/ },
  { kind: "ordered", re: /^(\s*)(\d+)([.)])\s+/ },
  { kind: "quote", re: /^(\s*)(>)\s?/ },
];

export function markOf(text) {
  for (const { kind, re } of MARKS) {
    const m = re.exec(text);
    if (m) return { kind, indent: m[1], length: m[0].length, match: m };
  }
  // `length` counts the indentation too, so `text.slice(length)` is the
  // CONTENT in every case. Without that, marking an indented line wrote its
  // indentation in twice.
  const indent = /^\s*/.exec(text)[0];
  return { kind: "plain", indent, length: indent.length, match: null };
}

/// Replaces whatever mark the touched lines carry with the one `make` builds,
/// or strips it when every line already has that mark — the toggle every one
/// of these commands is.
function setLineMark(kind, make) {
  return (view) => {
    const changes = [];

    for (const range of view.state.selection.ranges) {
      const lines = linesOf(view.state, range);
      const marks = lines.map((line) => markOf(line.text));
      // Off only when EVERY line is already this: with a mixed selection the
      // press means "make them all this", which is the more useful answer.
      const off = marks.every((mark) => kind(mark));

      lines.forEach((line, i) => {
        const mark = marks[i];
        const body = line.text.slice(mark.length);
        // An empty line gets the mark anyway (that is how a list is started
        // from nothing), but is never stripped into nonsense.
        const next = off ? `${mark.indent}${body}` : `${mark.indent}${make(body, i)}${body}`;
        if (next !== line.text)
          changes.push({ from: line.from, to: line.to, insert: next });
      });
    }

    if (changes.length === 0) return false;
    return edit(view, { changes });
  };
}

export const toggleBullet = setLineMark(
  (mark) => mark.kind === "bullet",
  () => "- ",
);
export const toggleOrdered = setLineMark(
  (mark) => mark.kind === "ordered",
  (_body, i) => `${i + 1}. `,
);
export const toggleQuote = setLineMark(
  (mark) => mark.kind === "quote",
  () => "> ",
);
export const toggleTaskList = setLineMark(
  (mark) => mark.kind === "task",
  () => "- [ ] ",
);

/// `# ` through `###### `, and pressing the level a line already is turns it
/// back into a paragraph — the same toggle the list commands are.
export function setHeading(level) {
  return setLineMark(
    (mark) => mark.kind === "heading" && mark.match[2].length === level,
    () => `${"#".repeat(level)} `,
  );
}

/// Strips a heading, whatever its level — `Mod+Alt+0`, the way back that
/// pressing a level does not give when the line is a different one.
///
/// Its own command rather than another `setLineMark`: that helper strips
/// WHATEVER mark it finds when a line does not match, and this must leave a
/// bullet or a quote exactly where it is. It only ever removes a `#`.
export function clearHeading(view) {
  const changes = [];
  for (const range of view.state.selection.ranges) {
    for (const line of linesOf(view.state, range)) {
      const mark = markOf(line.text);
      if (mark.kind !== "heading") continue;
      changes.push({
        from: line.from,
        to: line.to,
        insert: mark.indent + line.text.slice(mark.length),
      });
    }
  }
  if (changes.length === 0) return false;
  return edit(view, { changes });
}

// ---- ordered lists keep counting right ------------------------------------

/// Any list marker holds the BLOCK together for the walk below; only the
/// ordered ones are rewritten.
const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s/;
const ORDERED_LINE = /^(\s*)(\d+)([.)])\s/;

/// Rewrites the numbers of the contiguous list block around the cursor so
/// each depth counts its own run: an indented item starts a new count under
/// the item above it, and the line that comes back out continues the outer
/// list where it left off — `1. 2. 3.`, indent the fourth and it reads `1.`;
/// bring the next line back out and it reads `4.` (user call, 2026-08-24).
///
/// Depth is the indentation width, which is what this editor itself writes
/// (`INDENT`); only a number that is wrong is touched, so the file changes by
/// exactly what the eye sees change.
export function renumberLists(view) {
  const doc = view.state.doc;
  let at = doc.lineAt(view.state.selection.main.head).number;
  // The command may have left the cursor on a line that stopped being a list
  // line; the block above it is still the one to fix.
  if (!LIST_LINE.test(doc.line(at).text) && at > 1) at -= 1;
  if (!LIST_LINE.test(doc.line(at).text)) return false;
  let first = at;
  while (first > 1 && LIST_LINE.test(doc.line(first - 1).text)) first -= 1;
  let last = at;
  while (last < doc.lines && LIST_LINE.test(doc.line(last + 1).text)) last += 1;

  const changes = [];
  const stack = [];
  for (let n = first; n <= last; n++) {
    const line = doc.line(n);
    const m = ORDERED_LINE.exec(line.text);
    if (!m) continue;
    const width = m[1].length;
    while (stack.length && stack[stack.length - 1].width > width) stack.pop();
    const top = stack[stack.length - 1];
    let count;
    if (top && top.width === width) {
      top.count += 1;
      count = top.count;
    } else {
      stack.push({ width, count: 1 });
      count = 1;
    }
    if (String(count) !== m[2]) {
      changes.push({
        from: line.from + width,
        to: line.from + width + m[2].length,
        insert: String(count),
      });
    }
  }
  if (changes.length === 0) return false;
  return edit(view, { changes });
}

/// Indentation, plus the renumbering it makes necessary.
const indentAndCount = (cmd) => (view) => {
  if (!cmd(view)) return false;
  renumberLists(view);
  return true;
};

// ---- what the registry's editor ids run ----------------------------------

/// Command id → the editor command it runs.
///
/// Here rather than in the component because two places need it and a copy
/// would drift: the editor builds its keymap from it, and the formatting
/// panel's buttons press the very same functions. `note.replace` is the one
/// exception and stays in the component — it opens a panel, which needs the
/// view the component owns.
export const EDITOR_COMMANDS = {
  "md.bold": toggleBold,
  "md.underline": toggleUnderline,
  "md.reference": insertReference,
  // Indentation and history are CodeMirror's own, bound here as well as to
  // their keys so the panel's buttons press the very same function (the point
  // of this table). `indentMore`/`indentLess` are what Tab and Shift+Tab run
  // in the editor already — wrapped so an ordered list keeps counting right
  // across the depth change (`renumberLists`).
  "md.indent": indentAndCount(indentMore),
  "md.outdent": indentAndCount(indentLess),
  "edit.undo": undo,
  "edit.redo": redo,
  "md.italic": toggleItalic,
  "md.strike": toggleStrike,
  "md.code": toggleInlineCode,
  "md.link": insertLink,
  "md.bullet": toggleBullet,
  "md.ordered": toggleOrdered,
  "md.task": toggleTaskList,
  "md.quote": toggleQuote,
  "md.rule": insertRule,
  "md.paragraph": clearHeading,
  // Tables (2026-08-24): the same door, a different file — they need the
  // editor's state to know which cell is current, and that state lives in
  // `tableEditing.js` next to the commands that read it.
  ...TABLE_COMMANDS,
  ...Object.fromEntries(
    Array.from({ length: 6 }, (_, i) => [`md.h${i + 1}`, setHeading(i + 1)]),
  ),
};
