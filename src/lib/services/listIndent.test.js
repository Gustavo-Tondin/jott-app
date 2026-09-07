import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { indentDecorationsFor, indentOf, listIndent } from "./listIndent.js";
import { INDENT } from "./markdownCommands.js";

const I = INDENT;

describe("what the start of a line is made of", () => {
  it("counts whole levels and one marker column", () => {
    expect(indentOf("- a")).toEqual({ levels: 0, markerFrom: 0, markerTo: 2, marker: 1 });
    expect(indentOf(`${I}- a`)).toEqual({ levels: 1, markerFrom: 4, markerTo: 6, marker: 1 });
    expect(indentOf(`${I}${I}12. a`)).toEqual({ levels: 2, markerFrom: 8, markerTo: 12, marker: 1 });
  });

  it("a task box is a second marker column", () => {
    // The checkbox stands where the bullet would, and is wider than one.
    expect(indentOf("- [ ] a").marker).toBe(2);
    expect(indentOf("- [x] a").markerTo).toBe(6);
  });

  it("an indented line without a marker still hangs from its level", () => {
    expect(indentOf(`${I}continuação`)).toEqual({ levels: 1, markerFrom: 4, markerTo: 4, marker: 0 });
  });

  it("a tab is one level", () => {
    expect(indentOf("\t- a").levels).toBe(1);
  });

  it("two stray spaces are not a level, and plain text is nothing", () => {
    expect(indentOf("  texto")).toBe(null);
    expect(indentOf("texto")).toBe(null);
    expect(indentOf("   ")).toBe(null);
  });
});

/// The decorations for `doc`, as `[from, to, class, style]`.
function drawn(doc) {
  const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
  const set = indentDecorationsFor(state, [{ from: 0, to: doc.length }]);
  const out = [];
  const cursor = set.iter();
  while (cursor.value) {
    out.push([cursor.from, cursor.to, cursor.value.spec.class, cursor.value.spec.attributes?.style]);
    cursor.next();
  }
  return out;
}

describe("the decorations", () => {
  it("wraps each level and the marker, and writes the two counts on the line", () => {
    // Under a parent: four spaces with no list above them is a code block.
    const doc = `- a\n${I}- item`;
    expect(drawn(doc).slice(2)).toEqual([
      [4, 4, "cm-md-indented", "--cm-level:1;--cm-marker:1"],
      [4, 8, "cm-md-indent", undefined],
      [8, 10, "cm-md-marker", undefined],
    ]);
  });

  it("a top-level item has the marker column and no level", () => {
    expect(drawn("- item")).toEqual([
      [0, 0, "cm-md-indented", "--cm-level:0;--cm-marker:1"],
      [0, 2, "cm-md-marker", undefined],
    ]);
  });

  it("leaves code alone — indentation is content there", () => {
    // Four spaces outside a list is an indented code block to CommonMark.
    expect(drawn(`${I}code`)).toEqual([]);
    expect(drawn(`\`\`\`\n${I}- not a list\n\`\`\``)).toEqual([]);
  });

  it("leaves a quote alone — the quote's own bar rules its lines", () => {
    expect(drawn("> - quoted item")).toEqual([]);
  });

  it("a paragraph continued under an item hangs at its level", () => {
    const doc = `- item\n${I}mais`;
    expect(drawn(doc).map((d) => d[3]).filter(Boolean)).toEqual([
      "--cm-level:0;--cm-marker:1",
      "--cm-level:1;--cm-marker:0",
    ]);
  });
});

describe("in a real editor", () => {
  it("paints the spans and the line class, and the caret still walks the spaces", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: `- a\n${I}- b`,
        extensions: [markdown({ base: markdownLanguage }), listIndent],
      }),
    });
    const lines = [...view.dom.querySelectorAll(".cm-line")];
    expect(lines.every((l) => l.classList.contains("cm-md-indented"))).toBe(true);
    expect(lines[1].style.getPropertyValue("--cm-level")).toBe("1");
    expect(lines[1].querySelectorAll(".cm-md-indent").length).toBe(1);
    expect(lines[1].querySelector(".cm-md-marker").textContent).toBe("- ");
    // Not atomic: a cursor put inside the indentation stays there.
    view.dispatch({ selection: { anchor: 6 } });
    expect(view.state.selection.main.head).toBe(6);
    view.destroy();
    parent.remove();
  });
});
