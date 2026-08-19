// The file reference `[[/foto.jpg]]`, and what the editor makes of it.
//
// Two halves, tested apart: what the SYNTAX is (pure string work, no editor)
// and what a document DECORATES to (a real CodeMirror state, no DOM). The
// widgets themselves — the picture, the chip, the click that opens a file —
// are exercised in `components/editorFiles.test.js`, where there is a view.

import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), convertFileSrc: (p) => p }));

const { embedMarkdown, embedDecorationsFor, noteMarkdown, referencesIn } =
  await import("./embeds.js");

describe("the text a file gets in a note", () => {
  it("is the name in double brackets, behind a slash", () => {
    expect(embedMarkdown("assets/foto.jpg")).toBe("[[/foto.jpg]]");
    // The library is flat, so the leaf IS the address — a caller that hands
    // over a bare name gets the same answer.
    expect(embedMarkdown("foto.jpg")).toBe("[[/foto.jpg]]");
    expect(embedMarkdown("")).toBe("");
  });

  it("writes a note link as its title, trimmed", () => {
    expect(noteMarkdown("  Guardiões do império  ")).toBe("[[Guardiões do império]]");
    expect(noteMarkdown("   ")).toBe("");
  });
});

describe("finding the references in a line", () => {
  const names = (text) =>
    referencesIn(text)
      .filter((r) => r.kind === "file")
      .map((r) => r.name);

  it("reads every one, wherever it sits", () => {
    expect(names("antes [[/a.png]] meio [[/b.pdf]] depois")).toEqual(["a.png", "b.pdf"]);
  });

  it("says which are pictures", () => {
    const [picture, file] = referencesIn("[[/a.PNG]] [[/b.pdf]]");
    expect(picture.image).toBe(true);
    expect(file.image).toBe(false);
    expect(file.address).toBe("assets/b.pdf");
  });

  it("counts offsets from where the line starts in the document", () => {
    const [one] = referencesIn("ab [[/a.png]]", 100);
    expect(one.from).toBe(103);
    expect(one.to).toBe(113);
  });

  it("tells a note apart from a file by the slash", () => {
    expect(referencesIn("[[Ideias]] e [[/a.png]]").map((r) => r.kind)).toEqual([
      "note",
      "file",
    ]);
    expect(referencesIn("[[Ideias]]")[0].title).toBe("Ideias");
    // A slash INSIDE the name is not an address of the flat library, and is
    // left as the text the user wrote.
    expect(names("[[/sub/a.png]]")).toEqual([]);
  });
});

describe("what a document draws", () => {
  const doc = "Uma nota\n[[/foto.jpg]]\nfim";
  const drawn = (at) => {
    const state = EditorState.create({ doc, selection: { anchor: at } });
    const set = embedDecorationsFor(state, [{ from: 0, to: state.doc.length }]);
    const ranges = [];
    set.between(0, state.doc.length, (from, to) => ranges.push([from, to]));
    return ranges;
  };

  it("replaces the reference when the cursor is elsewhere", () => {
    expect(drawn(0)).toEqual([[9, 22]]);
  });

  it("shows the text on the line being edited, and keeps the picture below it", () => {
    // The rule every other piece of syntax follows — the line you are on
    // shows what you typed (`services/markdown.js`) — with one addition a
    // photo earns: it stays, as a block after the line. Clicking a picture
    // used to make it disappear and leave an address behind (user report,
    // 2026-08-19).
    const at = doc.indexOf("[[/foto.jpg]]") + 2;
    const still = drawn(at);
    expect(still).toEqual([[22, 22]]);
    // Nothing was replaced: the reference itself is readable text again.
    expect(still.every(([from, to]) => from === to)).toBe(true);
  });

  it("keeps nothing below a line whose file is not a picture", () => {
    const state = EditorState.create({ doc: "[[/contrato.pdf]]", selection: { anchor: 3 } });
    const set = embedDecorationsFor(state, [{ from: 0, to: state.doc.length }]);
    const ranges = [];
    set.between(0, state.doc.length, (from, to) => ranges.push([from, to]));
    expect(ranges).toEqual([]);
  });
});
