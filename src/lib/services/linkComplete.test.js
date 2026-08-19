// What `[[` offers, as a rule rather than as a popup.
//
// The popup itself is CodeMirror's, and so are the arrow keys and Enter
// (`completionKeymap`); what this app decides is WHEN the list appears, which
// list it is, and what picking one writes. That is what is tested here — the
// completion source, driven with plain answers instead of a bridge.

import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { autocompletion, completionStatus, currentCompletions } from "@codemirror/autocomplete";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), convertFileSrc: (p) => p }));

const { referenceCompletions } = await import("./linkComplete.js");

/// The little CodeMirror hands a completion source. `matchBefore` is all it
/// uses, and it is a regex against the text to the left of the cursor.
function context(line) {
  return {
    matchBefore(pattern) {
      const anchored = new RegExp(`(?:${pattern.source})$`, pattern.flags.replace("g", ""));
      const found = line.match(anchored);
      return found ? { from: line.length - found[0].length, to: line.length, text: found[0] } : null;
    },
  };
}

const library = [
  { path: "assets/foto.jpg", name: "foto.jpg", image: true },
  { path: "assets/contrato.pdf", name: "contrato.pdf", image: false },
];
const notes = [
  { title: "Guardiões do império", space: "Notes", path: "Inbox/g.md", folder: "jott.notes" },
];

const source = (extra = {}) =>
  referenceCompletions({ files: () => library, notes: () => notes, ...extra });

describe("when the list appears at all", () => {
  it("only inside an open reference", async () => {
    expect(await source()(context("texto solto"))).toBeNull();
    expect(await source()(context("já fechei [[/foto.jpg]]"))).toBeNull();
    expect(await source()(context("olha [[fo"))).not.toBeNull();
  });

  it("starts where the brackets start, so picking replaces them", async () => {
    const { from } = await source()(context("olha [[fo"));
    expect(from).toBe(5);
  });
});

describe("the two namespaces", () => {
  it("offers the whole library the moment the slash is typed", async () => {
    const { options } = await source()(context("[[/"));
    expect(options.map((o) => o.label)).toEqual(["/foto.jpg", "/contrato.pdf"]);
    // What the app can DRAW is the difference between a picture and a chip.
    expect(options[0].detail).toBe("image");
    expect(options[1].detail).toBe("file");
  });

  it("narrows the library as more is typed, ignoring case", async () => {
    const { options } = await source()(context("[[/FOT"));
    expect(options.map((o) => o.apply)).toEqual(["[[/foto.jpg]]"]);
  });

  it("asks the notebook's search for notes, and writes the title", async () => {
    const asked = vi.fn(() => notes);
    const { options } = await source({ notes: asked })(context("[[guard"));

    expect(asked).toHaveBeenCalledWith("guard");
    expect(options[0].apply).toBe("[[Guardiões do império]]");
    expect(options[0].detail).toBe("Notes");
  });

  it("says nothing to an empty query, without asking", async () => {
    // The core's search answers nothing to an empty query on purpose; asking
    // anyway would be a round trip for a guaranteed empty answer. The
    // library is the opposite case — it is a flat folder small enough to show
    // whole, which is why `[[/` above lists everything.
    const asked = vi.fn(() => notes);
    const { options } = await source({ notes: asked })(context("[["));

    expect(options).toEqual([]);
    expect(asked).not.toHaveBeenCalled();
  });
});

describe("the panel actually opening", () => {
  // These exist because the tests above cannot fail the way this feature
  // first did. Driven through a REAL CodeMirror, and typed the way a person
  // types: the source answered perfectly while the panel stayed shut, because
  // CodeMirror was throwing every option away on its own.

  function typing(text, library = [{ path: "assets/foto.jpg", name: "foto.jpg", image: true }]) {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        extensions: [
          autocompletion({
            override: [referenceCompletions({ files: () => library, notes: () => notes })],
          }),
        ],
      }),
    });
    for (const character of text) {
      view.dispatch({
        changes: { from: view.state.doc.length, insert: character },
        selection: { anchor: view.state.doc.length + 1 },
        userEvent: "input.type",
      });
    }
    return view;
  }

  const settle = () => new Promise((r) => setTimeout(r, 200));

  it("opens on its own as the slash is typed", async () => {
    const view = typing("[[/");
    await settle();

    expect(completionStatus(view.state)).toBe("active");
    expect(currentCompletions(view.state).map((o) => o.label)).toEqual(["/foto.jpg"]);
  });

  it("keeps the brackets out of the filtering", async () => {
    // The bug, as a test: CodeMirror filters options by the text between
    // `from` and the cursor, and `from` has to be the first `[` because that
    // is what a picked option replaces. `[[fo` matches no file name on earth.
    const view = typing("[[/fo");
    await settle();

    expect(currentCompletions(view.state).map((o) => o.label)).toEqual(["/foto.jpg"]);
  });

  it("opens for notes too, once there is a letter to go on", async () => {
    const view = typing("[[guard");
    await settle();

    expect(completionStatus(view.state)).toBe("active");
    expect(currentCompletions(view.state).map((o) => o.label)).toEqual(["Guardiões do império"]);
  });

  it("stays shut outside a reference", async () => {
    const view = typing("uma nota qualquer");
    await settle();

    expect(completionStatus(view.state)).toBeNull();
  });
});
