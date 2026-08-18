// The live-preview rule, tested without a DOM.
//
// What is hidden is a decision about the document and the cursor — not about
// layout — so it can be driven from a bare EditorState.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, test } from "vitest";
import { blockDecorationsFor, decorationsFor, markdownPreview } from "./markdown.js";

/// A state with the cursor at `at`, and the ranges the preview would hide.
function hidden(doc, at = 0) {
  const state = EditorState.create({
    doc,
    selection: { anchor: at },
    extensions: [markdown({ base: markdownLanguage })],
  });

  const set = decorationsFor(state, [{ from: 0, to: doc.length }]);
  const ranges = [];
  const cursor = set.iter();
  while (cursor.value) {
    ranges.push(doc.slice(cursor.from, cursor.to));
    cursor.next();
  }
  return ranges;
}

/// Position of the start of line `n` (1-based).
const lineStart = (doc, n) =>
  doc.split("\n").slice(0, n - 1).join("\n").length + (n > 1 ? 1 : 0);

describe("live preview", () => {
  test("hides the syntax of the lines the cursor is not on", () => {
    const doc = "# Título\ntexto normal\n";
    // Cursor on line 2: line 1 reads as a formatted heading.
    expect(hidden(doc, lineStart(doc, 2))).toEqual(["# "]);
  });

  test("shows the syntax of the line the cursor is on", () => {
    // This is the whole promise of the phase: you see `# ` while writing it.
    const doc = "# Título\ntexto normal\n";
    expect(hidden(doc, 0)).toEqual([]);
  });

  test("hides emphasis, code and quote marks", () => {
    const doc = "a **forte** e *solto* e `code`\n> citação\n";
    // Cursor parked on the last (empty) line, so both lines are formatted.
    const marks = hidden(doc, doc.length);
    expect(marks).toContain("**");
    expect(marks).toContain("*");
    expect(marks).toContain("`");
    expect(marks).toContain("> ");
  });

  test("draws the bullet of a list instead of removing it", () => {
    // A bullet IS the formatted form, so it is the one mark that gets replaced
    // by something to LOOK at (a •) rather than by nothing.
    const doc = "- um item\n";
    expect(hidden(doc, doc.length)).toEqual(["-"]);
  });

  test("a checkbox replaces the marker, and the text stays untouched", () => {
    const doc = "- [ ] comprar leite\n";
    // The marker is decorated (replaced by a widget), never removed from the
    // document: the file keeps every character the user typed. The bullet in
    // front of it is drawn the same way, which is why it is here too.
    expect(hidden(doc, doc.length)).toEqual(["-", "[ ]"]);
  });

  test("hides the address of a link, keeps the address that IS the link", () => {
    // `[texto](endereço)` reads as `texto`; `<endereço>` has nothing else to
    // read, so hiding it would leave an empty line where a link was.
    const doc = "veja [texto](http://x.dev) e <http://y.dev>\n";
    const marks = hidden(doc, doc.length);
    expect(marks).toContain("http://x.dev");
    expect(marks).not.toContain("http://y.dev");
  });

  test("a selection spanning lines leaves all of them raw", () => {
    const doc = "# Um\n# Dois\n";
    const state = EditorState.create({
      doc,
      selection: { anchor: 0, head: doc.length },
      extensions: [markdown({ base: markdownLanguage })],
    });
    const set = decorationsFor(state, [{ from: 0, to: doc.length }]);
    expect(set.size).toBe(0);
  });

  test("plain text has nothing to hide", () => {
    const doc = "apenas texto\n";
    expect(hidden(doc, doc.length)).toEqual([]);
  });
});

/// The classes each line wears, by line number.
function dressed(doc, selection = { anchor: 0 }) {
  const state = EditorState.create({
    doc,
    selection,
    extensions: [markdown({ base: markdownLanguage })],
  });

  const set = blockDecorationsFor(state, [{ from: 0, to: doc.length }]);
  const lines = new Map();
  const cursor = set.iter();
  while (cursor.value) {
    lines.set(
      state.doc.lineAt(cursor.from).number,
      cursor.value.spec.class.split(" "),
    );
    cursor.next();
  }
  return lines;
}

describe("the shape of a block", () => {
  test("the line the cursor is on is the editing zone", () => {
    const doc = "primeira\nsegunda\n";
    const lines = dressed(doc, { anchor: lineStart(doc, 2) });
    expect(lines.get(2)).toEqual(["cm-md-editing"]);
    expect(lines.has(1)).toBe(false);
  });

  test("a selection makes every line it touches the editing zone", () => {
    // The block case: the band follows what is selected, which is the whole
    // reason this is not the library's `highlightActiveLine` (it gives up the
    // moment the selection stops being a bare cursor).
    const doc = "um\ndois\ntrês\nquatro\n";
    const lines = dressed(doc, {
      anchor: lineStart(doc, 2),
      head: lineStart(doc, 3) + 2,
    });
    expect(lines.get(2)).toEqual(["cm-md-editing"]);
    expect(lines.get(3)).toEqual(["cm-md-editing"]);
    expect(lines.has(1)).toBe(false);
    expect(lines.has(4)).toBe(false);
  });

  test("the band lands exactly on the lines that keep their syntax", () => {
    // The two rules are one rule seen twice: the band is what explains why
    // those lines look different from the rest of the note.
    const doc = "# Título\n**forte**\n";
    const at = lineStart(doc, 2);
    expect(hidden(doc, at)).toEqual(["# "]); // line 2 kept its `**`
    expect([...dressed(doc, { anchor: at }).keys()]).toEqual([1, 2]);
    expect(dressed(doc, { anchor: at }).get(2)).toContain("cm-md-editing");
  });

  test("a quote is a box with two ends", () => {
    const doc = "> primeira\n> segunda\n\nfora\n";
    const lines = dressed(doc, { anchor: doc.length });
    expect(lines.get(1)).toContain("cm-md-quote");
    expect(lines.get(1)).toContain("cm-md-open");
    expect(lines.get(2)).toContain("cm-md-quote");
    expect(lines.get(2)).toContain("cm-md-close");
    expect(lines.get(2)).not.toContain("cm-md-open");
    expect(lines.has(4)).toBe(false);
  });

  test("a fenced code block is a box, fences included", () => {
    const doc = "```\ncodigo\n```\n";
    const lines = dressed(doc, { anchor: doc.length });
    expect(lines.get(1)).toContain("cm-md-open");
    expect(lines.get(2)).toEqual(["cm-md-code"]);
    expect(lines.get(3)).toContain("cm-md-close");
  });

  test("a heading line is marked, so it can be given air", () => {
    const doc = "## Título\ntexto\n";
    const lines = dressed(doc, { anchor: doc.length });
    expect(lines.get(1)).toEqual(["cm-md-heading"]);
  });

  test("a rule line is a rule", () => {
    const doc = "antes\n\n---\n\ndepois\n";
    const lines = dressed(doc, { anchor: 0 });
    expect(lines.get(3)).toEqual(["cm-md-rule"]);
  });

  test("only a checked item reads as done", () => {
    const doc = "- [x] feito\n- [ ] por fazer\n";
    const lines = dressed(doc, { anchor: doc.length });
    expect(lines.get(1)).toEqual(["cm-md-done"]);
    expect(lines.has(2)).toBe(false);
  });

  test("a line can wear the band and its block at the same time", () => {
    const doc = "> citação\n";
    const lines = dressed(doc, { anchor: 2 });
    expect(lines.get(1)).toContain("cm-md-editing");
    expect(lines.get(1)).toContain("cm-md-quote");
  });
});

describe("what the editor actually paints", () => {
  // The one question the rules above cannot answer: `markdownLook` hands out
  // class NAMES, and whether a name ever reaches the DOM is CodeMirror's
  // business — which tag a node carries, and whether two rules land on the
  // same element. So this pair renders a note that uses every feature and
  // compares what came out with what the stylesheet dresses. A class in only
  // one of the two lists is dead either way: a rule nobody wears, or a piece
  // of Markdown nobody styled.
  const sample = [
    "# um",
    "## dois",
    "### três",
    "#### quatro",
    "##### cinco",
    "###### seis",
    "",
    "texto **forte**, *solto*, ~~riscado~~, `code` e [link](http://x.dev)",
    "",
    "- item",
    "- [x] feito",
    "",
    "> citação",
    "",
    "```",
    "codigo",
    "```",
    "",
    "---",
    "",
  ].join("\n");

  /// Every `cm-md-*` class the editor puts in the DOM for `sample`, with the
  /// cursor on each line in turn — half the look only exists on the line
  /// being edited, and the other half only exists off it.
  function painted() {
    const shown = new Set();
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    for (let line = 1; line <= sample.split("\n").length; line++) {
      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc: sample,
          selection: { anchor: lineStart(sample, line) },
          extensions: [markdown({ base: markdownLanguage }), markdownPreview],
        }),
      });
      const html = view.dom.querySelector(".cm-content").innerHTML;
      view.destroy();
      for (const m of html.matchAll(/cm-md-[a-z0-9-]+/g)) shown.add(m[0]);
    }
    parent.remove();
    return shown;
  }

  /// Every `cm-md-*` class the stylesheet has a rule for.
  function dressedByCss() {
    // Not `new URL(…, import.meta.url)`: Vite rewrites that shape into an
    // asset URL, which `readFileSync` cannot open.
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(
      join(here, "..", "..", "styles", "components", "editor.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    return new Set([...css.matchAll(/\.(cm-md-[a-z0-9-]+)/g)].map((m) => m[1]));
  }

  test("every class the stylesheet dresses is one the editor paints", () => {
    const shown = painted();
    expect([...dressedByCss()].filter((c) => !shown.has(c)).sort()).toEqual([]);
  });

  test("every class the editor paints is dressed by the stylesheet", () => {
    const styled = dressedByCss();
    expect([...painted()].filter((c) => !styled.has(c)).sort()).toEqual([]);
  });
});
