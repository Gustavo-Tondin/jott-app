import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { gutterLineClass } from "@codemirror/view";
import { foldLineClasses, foldLineClassesFor, headingLevelOf } from "./foldLines.js";

/// The classes the gutter would put on each line of `doc`, by line number.
function classesOf(doc) {
  const state = EditorState.create({ doc, extensions: [foldLineClasses] });
  const [set] = state.facet(gutterLineClass);
  const found = new Map();
  const cursor = set.iter();
  while (cursor.value) {
    found.set(state.doc.lineAt(cursor.from).number, cursor.value.elementClass);
    cursor.next();
  }
  return found;
}

describe("what a foldable line is", () => {
  it("reads the level off the hashes", () => {
    expect(headingLevelOf("# Title")).toBe(1);
    expect(headingLevelOf("###### Six")).toBe(6);
    // Up to three spaces of indent is still a heading; the fourth makes code.
    expect(headingLevelOf("   ## Indented")).toBe(2);
    expect(headingLevelOf("    ## Code")).toBe(0);
  });

  it("is not a heading without the space after the hashes", () => {
    // `#tag` is a tag, and the app writes plenty of them.
    expect(headingLevelOf("#tag")).toBe(0);
    expect(headingLevelOf("####### Seven")).toBe(0);
  });

  it("an empty heading is still a heading", () => {
    expect(headingLevelOf("#")).toBe(1);
    expect(headingLevelOf("## ")).toBe(2);
  });

  it("everything else is the note's own text", () => {
    // What the DEFAULT covers, and the reason it is the default: a bullet,
    // a nested bullet, a quote and a paragraph all read at one size.
    expect(headingLevelOf("- item")).toBe(0);
    expect(headingLevelOf("    - nested")).toBe(0);
    expect(headingLevelOf("> quote")).toBe(0);
    expect(headingLevelOf("plain")).toBe(0);
  });
});

describe("the classes the gutter is given", () => {
  it("marks the headings and leaves the rest alone", () => {
    const found = classesOf("# One\n\n- item\n  - nested\n\n### Three\n");
    expect(found.get(1)).toBe("cm-fold-line--h1");
    expect(found.get(6)).toBe("cm-fold-line--h3");
    // The lines the default answers for carry no marker at all.
    expect(found.has(3)).toBe(false);
    expect(found.has(4)).toBe(false);
  });

  it("gives one marker per level, so the gutter can compare them", () => {
    // Two h2s must hand the gutter the SAME marker: it redraws an element
    // whose marker changed identity.
    const state = EditorState.create({ doc: "## a\n\n## b\n" });
    const set = foldLineClassesFor(state);
    const cursor = set.iter();
    const first = cursor.value;
    cursor.next();
    expect(cursor.value).toBe(first);
  });

  it("an empty document asks for nothing", () => {
    expect(foldLineClassesFor(EditorState.create({ doc: "" })).size).toBe(0);
  });
});
