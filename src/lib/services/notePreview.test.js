// The reader that turns a note's head into the blocks a card draws.
//
// Pure, so tested as such: what matters is that the STRUCTURE survives (a
// heading is a heading, a wrapped paragraph is one paragraph) and that nothing
// interactive or heavy comes out the other side.

import { describe, expect, it } from "vitest";
import { previewBlocks, spansOf } from "./notePreview.js";

/// The text of a block, whatever it is made of.
const textOf = (block) => (block.spans ?? []).map((span) => span.text).join("");

describe("blocks", () => {
  it("reads each shape as itself", () => {
    const blocks = previewBlocks(
      ["## Seção", "", "- um", "1. dois", "- [x] feito", "> citada", "---"].join("\n"),
    );
    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "bullet",
      "ordered",
      "task",
      "quote",
      "rule",
    ]);
    expect(blocks[0].level).toBe(2);
    expect(blocks[2].marker).toBe("1.");
    expect(blocks[3].done).toBe(true);
  });

  it("reads a table as one line: its header's cells (2026-08-24)", () => {
    const blocks = previewBlocks("| Elemento | Tipo |\n|---|---|\n| a | b |\n| c | d |\nfim");
    expect(blocks.map((b) => b.kind)).toEqual(["table", "paragraph"]);
    expect(blocks[0].spans.map((s) => s.text).join("")).toBe("Elemento  ·  Tipo");
  });

  it("joins the lines of one paragraph and parts them at the blank line", () => {
    // A paragraph the writer wrapped is a paragraph, not four: the card would
    // otherwise put a gap inside a sentence.
    const blocks = previewBlocks("uma frase\nque continua\n\noutra");
    expect(blocks.length).toBe(2);
    expect(textOf(blocks[0])).toBe("uma frase que continua");
    expect(textOf(blocks[1])).toBe("outra");
  });

  it("keeps a fenced block whole, marks and all", () => {
    const blocks = previewBlocks("```js\nconst a = **1**;\n```\ndepois");
    expect(blocks[0]).toEqual({ kind: "code", text: "const a = **1**;" });
    expect(textOf(blocks[1])).toBe("depois");
  });

  it("closes an unfinished fence at the end of the head", () => {
    // The core cuts the preview by line count, so a fence with no partner is
    // the ordinary case here and not a broken document.
    expect(previewBlocks("```\numa linha")).toEqual([{ kind: "code", text: "uma linha" }]);
  });
});

describe("inline", () => {
  it("names the runs and keeps their order", () => {
    expect(spansOf("um **dois** três")).toEqual([
      { text: "um " },
      { text: "dois", strong: true },
      { text: " três" },
    ]);
  });

  it("nests, and leaves code alone inside", () => {
    expect(spansOf("**a _b_**")).toEqual([
      { text: "a ", strong: true },
      { text: "b", strong: true, em: true },
    ]);
    expect(spansOf("***tudo***")).toEqual([{ text: "tudo", strong: true, em: true }]);
    // Backticks are half of why anyone writes backticks.
    expect(spansOf("`a * b`")).toEqual([{ text: "a * b", code: true }]);
  });

  it("reads the underline the app writes, not the one CommonMark would", () => {
    expect(spansOf("<u>sob</u>")).toEqual([{ text: "sob", underline: true }]);
    expect(spansOf("__forte__")).toEqual([{ text: "forte", strong: true }]);
  });
});

describe("what never reaches the card", () => {
  it("takes the address out of a link and keeps its words", () => {
    expect(textOf({ spans: spansOf("veja [o site](https://exemplo.com) hoje") })).toBe(
      "veja o site hoje",
    );
  });

  it("carries a note reference as its title and a file as its name", () => {
    expect(spansOf("veja [[Outra nota]]")).toEqual([{ text: "veja Outra nota" }]);
    expect(spansOf("baixe [[/contrato.pdf]]")).toEqual([{ text: "baixe contrato.pdf" }]);
  });

  it("drops a picture entirely — it is not loaded and it is not named", () => {
    // User call, 2026-08-20 ("não carregue a imagem"): the note has a banner
    // for a picture, and a card that named the file would read
    // "foto-2026-08-19.jpg" where the note shows a photograph.
    // …and the hole it leaves closes: the card read "veja a foto  ." before.
    expect(spansOf("antes [[/foto.jpg]] depois")).toEqual([{ text: "antes depois" }]);
    expect(spansOf("antes ![alt](assets/foto.png) depois")).toEqual([
      { text: "antes depois" },
    ]);
    expect(spansOf("![alt](assets/foto.png)")).toEqual([]);
    // …including the space before the full stop it was standing in front of.
    expect(spansOf("veja a foto [[/print.png]].")).toEqual([{ text: "veja a foto." }]);
    // And a line nothing was taken out of is left exactly as it was written.
    expect(spansOf("dois  espaços , e uma vírgula")).toEqual([
      { text: "dois  espaços , e uma vírgula" },
    ]);
  });

  it("has nothing to say about an empty head", () => {
    expect(previewBlocks("")).toEqual([]);
    expect(previewBlocks("   \n\n  ")).toEqual([]);
    // A line that was nothing but a picture leaves no gap behind it.
    expect(previewBlocks("![alt](assets/foto.png)")).toEqual([]);
  });
});
