// What a note DRAWS, through the real editor (2026-08-19).
//
// The screen tests swap CodeMirror for a textarea, which is right for what
// they are about and wrong for this: the pictures, the chips and the note
// links are CodeMirror decorations, and a decoration that never installs
// fails in exactly the way a stub cannot show. So this file mounts the
// component. It caught two such failures already — a block widget silently
// dropped because it came from a `ViewPlugin`, and a completion list thrown
// away by CodeMirror's own filter.
//
// The GESTURES that bring files in are not here: they are handled on the
// note's wrapper, not inside the editor, because that is where a dropped file
// actually lands (`NoteEditor.svelte`).

import { render } from "@testing-library/svelte";
import { fireEvent } from "@testing-library/dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(() => Promise.resolve(null));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args) => invoke(...args),
  // The asset protocol has no jsdom; the path is what matters here.
  convertFileSrc: (path) => `asset://localhost/${encodeURIComponent(path)}`,
}));

const { default: Editor } = await import("./Editor.svelte");
const { forgetIcons } = await import("../services/fileIcons.js");

const picture = () => new File(["png!"], "foto.png", { type: "image/png" });
const content = (container) => container.querySelector(".cm-content");

describe("a file of the notebook, drawn in the note", () => {
  const NOTEBOOK = "/home/gus/Caderno";

  beforeEach(() => {
    forgetIcons();
    invoke.mockImplementation(() => Promise.resolve(null));
  });

  it("draws a picture where its reference is", async () => {
    const { container } = render(Editor, {
      props: { value: "Antes\n[[/foto.jpg]]\nDepois", root: NOTEBOOK },
    });

    const img = container.querySelector(".cm-embed--image img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toContain(encodeURIComponent("/home/gus/Caderno/assets/foto.jpg"));
    // The name without its extension: the only description the app has.
    expect(img.getAttribute("alt")).toBe("foto");
    // And the raw text is gone from the line.
    expect(container.querySelector(".cm-content").textContent).not.toContain("[[/foto.jpg]]");
  });

  it("gives anything else a chip with its name, and opens it when clicked", async () => {
    const opened = vi.fn();
    const { container } = render(Editor, {
      props: { value: "Antes\n[[/contrato.pdf]]\nDepois", root: NOTEBOOK, onOpenFile: opened },
    });

    const chip = container.querySelector(".cm-embed--file");
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain("contrato.pdf");
    // No picture: a PDF is not something this app draws.
    expect(container.querySelector(".cm-embed--image")).toBeNull();

    await fireEvent.mouseDown(chip);
    expect(opened).toHaveBeenCalledWith("assets/contrato.pdf");
  });

  it("wears the system's icon for the type when the system has one", async () => {
    invoke.mockImplementation((cmd, args) =>
      Promise.resolve(cmd === "file_icon" && args.name === "file.pdf" ? "data:image/png;base64,AAA" : null),
    );
    const { container } = render(Editor, {
      props: { value: "\n[[/contrato.pdf]]\n", root: NOTEBOOK },
    });

    // The answer crosses the bridge, so the chip is drawn first and dressed
    // after — which is exactly why a missing icon costs nothing.
    await vi.waitFor(() => {
      const icon = container.querySelector(".cm-embed__glyph--system img");
      expect(icon?.getAttribute("src")).toBe("data:image/png;base64,AAA");
    });
    // Asked by TYPE, never by file: one question per extension.
    expect(invoke).toHaveBeenCalledWith("file_icon", { name: "file.pdf" });
  });

  it("keeps the extension when the system has no icon", async () => {
    const { container } = render(Editor, {
      props: { value: "\n[[/planilha.xlsx]]\n", root: NOTEBOOK },
    });

    const glyph = container.querySelector(".cm-embed__glyph");
    expect(glyph.dataset.ext).toBe("XLSX");
    expect(container.querySelector(".cm-embed__glyph--system")).toBeNull();
  });

  it("shows the reference as text on the line being written — and keeps the photo", async () => {
    // Cursor inside the reference: the syntax comes back, as everywhere else
    // in this editor. What does NOT go away is the picture (user call,
    // 2026-08-19): clicking a photo used to make it vanish and leave an
    // address behind, which reads as having broken something.
    const { container } = render(Editor, {
      props: { value: "[[/foto.jpg]]", root: NOTEBOOK },
    });

    expect(container.querySelector(".cm-content").textContent).toContain("[[/foto.jpg]]");
    expect(container.querySelector(".cm-embed--image img")).toBeTruthy();
  });

  it("opens a photo whose link is already showing when it is clicked again", async () => {
    const zoomed = vi.fn();
    const { container } = render(Editor, {
      props: { value: "[[/foto.jpg]]", root: NOTEBOOK, onZoomImage: zoomed },
    });

    await fireEvent.mouseDown(container.querySelector(".cm-embed--opened"));
    expect(zoomed).toHaveBeenCalledWith("assets/foto.jpg");
  });

  it("a photo whose link is hidden is not the one that zooms", async () => {
    // The first click is what reveals the link; only then does a click mean
    // "show me this properly".
    const zoomed = vi.fn();
    const { container } = render(Editor, {
      props: { value: "Antes\n[[/foto.jpg]]\nDepois", root: NOTEBOOK, onZoomImage: zoomed },
    });

    expect(container.querySelector(".cm-embed--opened")).toBeNull();
    await fireEvent.mouseDown(container.querySelector(".cm-embed--image"));
    expect(zoomed).not.toHaveBeenCalled();
  });
});

describe("a link to another note", () => {
  it("shows the title and drops the brackets", async () => {
    const { container } = render(Editor, {
      props: { value: "Antes\n[[Guardiões do império]]\nDepois" },
    });

    const link = container.querySelector(".cm-link-note");
    expect(link?.textContent).toBe("Guardiões do império");
    expect(container.querySelector(".cm-content").textContent).not.toContain("[[");
  });

  it("asks the shell to open it by title", async () => {
    const opened = vi.fn();
    const { container } = render(Editor, {
      props: { value: "Antes\n[[Ideias]]\nDepois", onOpenNote: opened },
    });

    await fireEvent.mouseDown(container.querySelector(".cm-link-note"));
    expect(opened).toHaveBeenCalledWith("Ideias");
  });

  it("is not a file, and a file is not a link", async () => {
    // The slash is the whole difference, and it decides which of the two
    // things gets drawn.
    const { container } = render(Editor, {
      props: { value: "\n[[/foto.jpg]] [[Ideias]]\n", root: "/n" },
    });

    expect(container.querySelectorAll(".cm-embed--image")).toHaveLength(1);
    expect(container.querySelectorAll(".cm-link-note")).toHaveLength(1);
  });
});

describe("when the library changes under the note", () => {
  it("draws the picture again, and asks for it again", async () => {
    // A file deleted from the Images screen went on drawing in the open note:
    // nothing had asked the decorations to rebuild, and the webview had the
    // bytes (user report, 2026-08-19).
    const { container, rerender } = render(Editor, {
      props: { value: "Antes\n[[/foto.jpg]]\nDepois", root: "/n", version: 1 },
    });
    const before = container.querySelector(".cm-embed--image img").getAttribute("src");

    await rerender({ value: "Antes\n[[/foto.jpg]]\nDepois", root: "/n", version: 2 });

    const after = container.querySelector(".cm-embed--image img").getAttribute("src");
    expect(after).not.toBe(before);
    // Still the same file — only the question is new.
    expect(after).toContain(encodeURIComponent("/n/assets/foto.jpg"));
  });
});

