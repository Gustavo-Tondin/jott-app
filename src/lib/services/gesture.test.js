// What a drag and a paste are carrying — the shapes measured inside the
// running app, as tests.
//
// Every case here is one the real webview produced (2026-08-19); none is
// invented. The transfers are stubs, but they are stubs of what was logged.

import { describe, expect, it, vi } from "vitest";

const invoke = vi.fn(() => Promise.resolve([]));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a) => invoke(...a), convertFileSrc: (p) => p }));

const { localPathsIn, looksLikeFiles, pathOfFileUrl, readGesture, remoteImageIn } =
  await import("./gesture.js");

/// The `<a>` WebKit hands a dragged file over in — with the address as its
/// TEXT, while `text/uri-list` sits there empty beside it.
const draggedFile = (path) =>
  `<a style="color: rgb(0, 0, 0)">file://${path}</a>`;

describe("whether a gesture is worth taking over", () => {
  it("takes bytes and addresses", () => {
    expect(looksLikeFiles({ types: ["Files"] })).toBe(true);
    expect(looksLikeFiles({ types: ["text/uri-list", "text/html"] })).toBe(true);
  });

  it("takes a picture copied from a page, and leaves copied TEXT alone", () => {
    // The measured discriminator: a copied image offers markup and nothing
    // else, while copied text always brings `text/plain` along. Without it,
    // pasting a paragraph off a web page would be claimed and swallowed.
    expect(looksLikeFiles({ types: ["text/html"] })).toBe(true);
    expect(looksLikeFiles({ types: ["text/html", "text/plain"] })).toBe(false);
    expect(looksLikeFiles({ types: ["text/plain"] })).toBe(false);
    expect(looksLikeFiles(null)).toBe(false);
  });
});

describe("reading one", () => {
  it("prefers the bytes when there are bytes", async () => {
    const file = new File([""], "foto.png");
    const brought = await readGesture({ types: ["Files"], files: [file] });
    expect(brought.files).toEqual([file]);
    expect(brought.paths).toEqual([]);
  });

  it("reads a dragged file out of the html flavour", async () => {
    const brought = await readGesture({
      types: ["text/uri-list", "text/html"],
      files: [],
      getData: () => "",
      items: [
        { kind: "string", type: "text/uri-list", getAsString: (cb) => cb("") },
        {
          kind: "string",
          type: "text/html",
          getAsString: (cb) => cb(draggedFile("/home/gus/f%C3%A9rias%202026.jpg")),
        },
      ],
    });
    expect(brought.paths).toEqual(["/home/gus/férias 2026.jpg"]);
  });

  it("asks the system when a paste says nothing at all", async () => {
    invoke.mockImplementation(() => Promise.resolve(["file:///home/gus/nota.pdf"]));
    const transfer = { types: ["text/uri-list"], files: [], getData: () => "", items: [] };

    expect((await readGesture(transfer, { clipboard: true })).paths).toEqual([
      "/home/gus/nota.pdf",
    ]);
    // A drop has no such thing to ask, and does not.
    expect((await readGesture(transfer)).paths).toEqual([]);
  });

  it("finds a picture that is only on the web", async () => {
    const brought = await readGesture({
      types: ["text/html"],
      files: [],
      getData: () => "",
      items: [
        {
          kind: "string",
          type: "text/html",
          getAsString: (cb) => cb('<img src="https://cdnb.artstation.com/daoz-51.jpg?17" style="">'),
        },
      ],
    });
    expect(brought.remote).toBe("https://cdnb.artstation.com/daoz-51.jpg?17");
    expect(brought.paths).toEqual([]);
  });

  it("keeps what the gesture said it had, for when it turns out to have none", async () => {
    const brought = await readGesture({ types: ["Files"], files: [], getData: () => "", items: [] });
    expect(brought).toMatchObject({ files: [], paths: [], remote: "", types: ["Files"] });
  });

  it("does not hang on an item that never answers", async () => {
    const brought = await readGesture({
      types: ["text/uri-list"],
      files: [],
      getData: () => "",
      items: [{ kind: "string", type: "text/uri-list", getAsString: () => {} }],
    });
    expect(brought.paths).toEqual([]);
  });
});

describe("the pieces", () => {
  it("reads a local address, percent-decoded, and refuses anything else", () => {
    expect(pathOfFileUrl("file:///tmp/a%20b.png")).toBe("/tmp/a b.png");
    expect(pathOfFileUrl("https://exemplo.com/foto.jpg")).toBe("");
    expect(pathOfFileUrl("foto.jpg")).toBe("");
  });

  it("finds every local file in a blob, once each", () => {
    const blob = `file:///tmp/a.png\n#comment\n${draggedFile("/tmp/a.png")}\nfile:///tmp/b.pdf`;
    expect(localPathsIn(blob)).toEqual(["/tmp/a.png", "/tmp/b.pdf"]);
  });

  it("only calls an <img> a picture", () => {
    // Any https address found loose in markup would turn a copied paragraph
    // into an offer to download whatever it happened to link to.
    expect(remoteImageIn('<a href="https://exemplo.com/pagina">texto</a>')).toBe("");
    expect(remoteImageIn('<img src="http://exemplo.com/a.png">')).toBe("");
    expect(remoteImageIn('<img alt="x" src="https://exemplo.com/a.png">')).toBe(
      "https://exemplo.com/a.png",
    );
  });
});
