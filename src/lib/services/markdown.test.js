// The live-preview rule, tested without a DOM.
//
// What is hidden is a decision about the document and the cursor — not about
// layout — so it can be driven from a bare EditorState.

import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, test } from "vitest";
import { decorationsFor } from "./markdown.js";

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

  test("keeps the bullet of a list", () => {
    // A bullet IS the formatted form — hiding it would remove meaning
    // rather than reveal it.
    const doc = "- um item\n";
    expect(hidden(doc, doc.length)).toEqual([]);
  });

  test("a checkbox replaces the marker, and the text stays untouched", () => {
    const doc = "- [ ] comprar leite\n";
    // The marker is decorated (replaced by a widget), never removed from the
    // document: the file keeps every character the user typed.
    expect(hidden(doc, doc.length)).toEqual(["[ ]"]);
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
