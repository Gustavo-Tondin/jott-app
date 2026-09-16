// The two search chords, as the REAL editor hears them: Ctrl+F is the note's
// own find panel, and Ctrl+Space is not the autocomplete's — it has to reach
// the shell, where it opens the notebook-wide search.

import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { EditorView, runScopeHandlers } from "@codemirror/view";

import Editor from "./Editor.svelte";

const viewOf = (container) => EditorView.findFromDOM(container);
const press = (key, init = {}) => new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });

describe("the search chords inside a note", () => {
  it("leaves Ctrl+Space to the shell", () => {
    const { container } = render(Editor, { props: { value: "Uma nota [[" } });
    const view = viewOf(container);
    expect(runScopeHandlers(view, press(" ", { ctrlKey: true, code: "Space" }), "editor")).toBe(false);
  });

  it("answers Ctrl+F with the note's own find panel", () => {
    const { container } = render(Editor, { props: { value: "Uma nota" } });
    const view = viewOf(container);
    expect(runScopeHandlers(view, press("f", { ctrlKey: true, code: "KeyF" }), "editor")).toBe(true);
  });
});
