// The clipboard's HTML read as Markdown. The cases that matter are the ones
// real apps actually put on the clipboard, which is rarely the clean HTML a
// hand-written test would use: Google writes `<span style="font-weight:700">`
// and wraps the lot in a `<b>` that is not bold.

import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "./htmlToMarkdown.js";

describe("marks", () => {
  it("reads the tags", () => {
    expect(htmlToMarkdown("<p>um <strong>forte</strong> e um <em>fraco</em></p>")).toBe(
      "um **forte** e um *fraco*",
    );
  });

  it("reads an inline style, which is how Keep and Docs write a mark", () => {
    const html = `<p><span style="font-weight:700">forte</span> e <span style="font-style:italic">fraco</span></p>`;
    expect(htmlToMarkdown(html)).toBe("**forte** e *fraco*");
  });

  it("does not believe the <b> Docs wraps a whole copy in", () => {
    const html = `<b style="font-weight:normal" id="docs-internal-guid-1"><p>texto comum</p></b>`;
    expect(htmlToMarkdown(html)).toBe("texto comum");
  });

  it("writes an underline the way the app writes one, and a strike as GFM", () => {
    const html = `<p><span style="text-decoration:underline">sob</span> <s>fora</s></p>`;
    expect(htmlToMarkdown(html)).toBe("<u>sob</u> ~~fora~~");
  });

  it("keeps the padding outside the mark — Markdown opens no mark on a space", () => {
    expect(htmlToMarkdown("<p>a<strong> b </strong>c</p>")).toBe("a **b** c");
  });

  it("nests, outside in", () => {
    expect(htmlToMarkdown("<p><strong><em>os dois</em></strong></p>")).toBe("***os dois***");
  });
});

describe("blocks", () => {
  it("reads a heading at its level", () => {
    expect(htmlToMarkdown("<h1>Um</h1><h3>Tres</h3>")).toBe("# Um\n\n### Tres");
  });

  it("separates paragraphs with a blank line and joins a wrapped one", () => {
    expect(htmlToMarkdown("<p>uma\n   linha so</p><p>outra</p>")).toBe("uma linha so\n\noutra");
  });

  it("a <br> is a line, not a paragraph", () => {
    expect(htmlToMarkdown("<p>uma<br>outra</p>")).toBe("uma\noutra");
  });

  it("quotes every line of a quote", () => {
    expect(htmlToMarkdown("<blockquote><p>a</p><p>b</p></blockquote>")).toBe("> a\n>\n> b");
  });

  it("fences a <pre>, with the language its class names", () => {
    const html = `<pre class="language-js"><code>const a = 1;\n</code></pre>`;
    expect(htmlToMarkdown(html)).toBe("```js\nconst a = 1;\n```");
  });

  it("opens a longer fence when the code has backticks of its own", () => {
    expect(htmlToMarkdown("<pre>a ``` b</pre>")).toBe("````\na ``` b\n````");
  });

  it("reads a rule", () => {
    expect(htmlToMarkdown("<p>a</p><hr><p>b</p>")).toBe("a\n\n---\n\nb");
  });
});

describe("lists", () => {
  it("bullets, numbers and the number a list starts on", () => {
    expect(htmlToMarkdown("<ul><li>a</li><li>b</li></ul>")).toBe("- a\n- b");
    expect(htmlToMarkdown(`<ol start="3"><li>a</li><li>b</li></ol>`)).toBe("3. a\n4. b");
  });

  it("indents a nested list by the same INDENT a typed one uses", () => {
    const html = "<ul><li>pai<ul><li>filho</li></ul></li></ul>";
    expect(htmlToMarkdown(html)).toBe("- pai\n    - filho");
  });

  it("reads a checkbox, checked and not", () => {
    const html = `<ul><li><input type="checkbox" checked>feito</li><li><input type="checkbox">falta</li></ul>`;
    expect(htmlToMarkdown(html)).toBe("- [x] feito\n- [ ] falta");
  });

  it("reads the box Keep DRAWS into the text of a plain list", () => {
    expect(htmlToMarkdown("<ul><li>☑ feito</li><li>☐ falta</li></ul>")).toBe(
      "- [x] feito\n- [ ] falta",
    );
  });

  it("keeps a mark inside an item", () => {
    expect(htmlToMarkdown("<ul><li>com <b>forte</b></li></ul>")).toBe("- com **forte**");
  });
});

describe("what carries an address", () => {
  it("a link, and no underline on it", () => {
    const html = `<p><a href="https://jott.app" style="text-decoration:underline">Jott</a></p>`;
    expect(htmlToMarkdown(html)).toBe("[Jott](https://jott.app)");
  });

  it("a link with no href is its text", () => {
    expect(htmlToMarkdown("<p><a>Jott</a></p>")).toBe("Jott");
  });

  it("an image", () => {
    expect(htmlToMarkdown(`<p><img src="assets/foto.jpg" alt="A foto"></p>`)).toBe(
      "![A foto](assets/foto.jpg)",
    );
  });

  it("inline code", () => {
    expect(htmlToMarkdown("<p>roda <code>npm test</code></p>")).toBe("roda `npm test`");
  });
});

describe("tables", () => {
  it("come out aligned, as the editor writes them", () => {
    const html = "<table><tr><th>a</th><th>bb</th></tr><tr><td>1</td><td>2</td></tr></table>";
    expect(htmlToMarkdown(html)).toBe("| a   | bb  |\n| --- | --- |\n| 1   | 2   |");
  });

  it("fill a short row rather than write a ragged table", () => {
    const html = "<table><tr><td>a</td><td>b</td></tr><tr><td>1</td></tr></table>";
    expect(htmlToMarkdown(html)).toBe("| a   | b   |\n| --- | --- |\n| 1   |     |");
  });
});

describe("what it refuses to do", () => {
  it("escapes nothing — text that was already Markdown arrives as written", () => {
    expect(htmlToMarkdown("<p>use **asteriscos** e _sublinhados_</p>")).toBe(
      "use **asteriscos** e _sublinhados_",
    );
  });

  it("drops the page's own machinery", () => {
    const html = "<style>p{color:red}</style><script>alert(1)</script><p>texto</p>";
    expect(htmlToMarkdown(html)).toBe("texto");
  });

  it("carries no HTML through, only what the app writes", () => {
    expect(htmlToMarkdown(`<p>com <mark>destaque</mark> e <sup>2</sup></p>`)).toBe(
      "com destaque e 2",
    );
  });

  it("answers empty for HTML with no text in it", () => {
    expect(htmlToMarkdown("<div><span> </span></div>")).toBe("");
    expect(htmlToMarkdown("")).toBe("");
  });

  it("reads a page of nested divs as the blocks inside them", () => {
    expect(htmlToMarkdown("<div><div><p>a</p></div><div><p>b</p></div></div>")).toBe("a\n\nb");
  });
});
