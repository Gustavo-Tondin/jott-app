import { beforeEach, describe, expect, it, vi } from "vitest";

const imported = [];
vi.mock("./api.js", () => ({
  api: {
    importAsset: (name, data) => {
      imported.push([name, data]);
      return Promise.resolve(`assets/${name}`);
    },
  },
}));

// The URL builder is the one thing here that touches Tauri; everything else is
// string work, which is why it is string work in the first place.
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path) => `asset://localhost/${encodeURIComponent(path)}`,
}));

const { assetFile, assetUrl, importFiles, isAssetAddress, isImage, libraryName, readAsBase64 } =
  await import("./assets.js");

describe("what counts as an image", () => {
  it("reads the extension, whatever its case", () => {
    expect(isImage("foto.PNG")).toBe(true);
    expect(isImage("a.webp")).toBe(true);
    expect(isImage("nota.md")).toBe(false);
    expect(isImage("semponto")).toBe(false);
    expect(isImage(null)).toBe(false);
  });
});

describe("an address of the library", () => {
  it("is one file directly inside assets/", () => {
    expect(isAssetAddress("assets/foto.png")).toBe(true);
    expect(isAssetAddress("assets/sub/foto.png")).toBe(false);
    expect(isAssetAddress("assets/")).toBe(false);
    expect(isAssetAddress("foto.png")).toBe(false);
    expect(isAssetAddress("../foto.png")).toBe(false);
    // A note may point at a picture of the user's own, anywhere on disk. That
    // is their link, and the app does not resolve it.
    expect(isAssetAddress("/home/gus/foto.png")).toBe(false);
    expect(isAssetAddress("https://exemplo.com/foto.png")).toBe(false);
  });

  it("is refused when it is not an image the app can draw", () => {
    expect(isAssetAddress("assets/notas.md")).toBe(false);
  });
});

describe("the file an address names", () => {
  it("is joined with the separator the root already uses", () => {
    expect(assetFile("/home/gus/Caderno", "assets/foto.png")).toBe(
      "/home/gus/Caderno/assets/foto.png",
    );
    // A Windows notebook: gluing a slash on would make a path with two kinds
    // of separator in it.
    expect(assetFile("C:\\Users\\gus\\Caderno", "assets/foto.png")).toBe(
      "C:\\Users\\gus\\Caderno\\assets\\foto.png",
    );
  });

  it("does not double the separator when the root ends in one", () => {
    expect(assetFile("/home/gus/Caderno/", "assets/foto.png")).toBe(
      "/home/gus/Caderno/assets/foto.png",
    );
  });

  it("is empty when there is nothing to resolve", () => {
    // Empty rather than a broken URL: it goes straight into `src`, and an
    // empty `src` draws nothing instead of asking for `asset://undefined`.
    expect(assetFile(null, "assets/foto.png")).toBe("");
    expect(assetFile("/home/gus/Caderno", "../../etc/passwd")).toBe("");
    expect(assetUrl("/home/gus/Caderno", "yellow")).toBe("");
  });

  it("becomes the URL an img loads", () => {
    expect(assetUrl("/home/gus/Caderno", "assets/foto.png")).toContain("asset://localhost/");
  });
});


describe("importing what the user picked", () => {
  beforeEach(() => (imported.length = 0));

  it("reads a file as base64, without the data-URL head", async () => {
    // The bytes cross the IPC as text (Tauri's raw request body does not exist
    // on Android), and the core decodes exactly this.
    const file = new File([new Uint8Array([0x66, 0x6f, 0x6f])], "foto.png", {
      type: "image/png",
    });
    expect(await readAsBase64(file)).toBe("Zm9v");
  });

  it("writes each picture in turn and answers with the addresses", async () => {
    const file = (name) => new File([new Uint8Array([0x66])], name);
    const added = await importFiles([file("a.png"), file("b.jpg")]);

    expect(added).toEqual(["assets/a.png", "assets/b.jpg"]);
    expect(imported.map(([name]) => name)).toEqual(["a.png", "b.jpg"]);
  });

  it("takes any file, not only pictures", async () => {
    // A task attaches a PDF as readily as a photo (2026-08-18). What only an
    // image can be is DRAWN, which is a different question and a different
    // function.
    const added = await importFiles([
      new File([new Uint8Array([1])], "nota-fiscal.pdf"),
      new File([new Uint8Array([1])], "foto.png"),
    ]);
    expect(added).toEqual(["assets/nota-fiscal.pdf", "assets/foto.png"]);
  });
});

describe("naming a file the user brought in", () => {
  it("keeps the name it came with", () => {
    expect(libraryName(new File([""], "foto de férias.png"))).toBe("foto de férias.png");
  });

  it("invents one from the type when it has none", () => {
    // A screenshot pasted from the clipboard is bytes and a MIME type; the
    // library is a folder of real files, so it needs a real name.
    expect(libraryName(new File([""], "", { type: "image/png" }))).toBe("pasted.png");
    expect(libraryName(new File([""], "", { type: "image/jpeg" }))).toBe("pasted.jpeg");
    // `+xml` says how an SVG is written, not what it is.
    expect(libraryName(new File([""], "", { type: "image/svg+xml" }))).toBe("pasted.svg");
  });

  it("would rather have no extension than claim the wrong one", () => {
    expect(libraryName(new File([""], "", { type: "application/octet-stream" }))).toBe("pasted");
    expect(libraryName(null)).toBe("pasted");
  });
});
