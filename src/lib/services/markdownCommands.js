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

/// One level of indentation, as SPACES.
///
/// Two, not four: it is the least that makes a nested list render right in
/// CommonMark (a `- ` puts its content at column 2), and a note stays legible
/// in whatever editor opens the file next — the files are the product
/// (principle 4). Tabs are avoided for the same reason: their width is the
/// reader's setting, so a nested list written with them lands differently
/// everywhere.
export const INDENT = "  ";

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
/// already there. `close` defaults to `open`, which is every markdown mark;
/// the two differ only for the one mark markdown does not have (`<u>`).
///
/// With nothing selected it works on the WORD under the cursor, because that
/// is what someone means by pressing Ctrl+B mid-word; with no word either, it
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

export const toggleBold = toggleWrap("**");
export const toggleItalic = toggleWrap("*");
export const toggleStrike = toggleWrap("~~");
export const toggleInlineCode = toggleWrap("`");
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
  // in the editor already.
  "md.indent": indentMore,
  "md.outdent": indentLess,
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
  ...Object.fromEntries(
    Array.from({ length: 6 }, (_, i) => [`md.h${i + 1}`, setHeading(i + 1)]),
  ),
};
