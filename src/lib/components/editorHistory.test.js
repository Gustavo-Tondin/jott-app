// Undo in the editor covers what the person did, never what was loaded:
// Ctrl+Z on a note just opened emptied it, and the save wrote the empty
// note to disk. The real engine, because the history is its state.

import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { EditorView } from "@codemirror/view";
import { undo } from "@codemirror/commands";

import Editor from "./Editor.svelte";

const viewOf = (container) => EditorView.findFromDOM(container);

describe("the editor's undo history", () => {
  it("a document arriving from outside is not an undo step", async () => {
    const { container, rerender } = render(Editor, { props: { value: "" } });
    await rerender({ value: "# Groceries\n\n- Oat milk" });
    const view = viewOf(container);
    expect(undo(view)).toBe(false);
    expect(view.state.doc.toString()).toBe("# Groceries\n\n- Oat milk");
  });

  it("typing is undone, and a reload under it keeps both", async () => {
    const { container, rerender } = render(Editor, { props: { value: "one" } });
    const view = viewOf(container);
    view.dispatch({ changes: { from: 3, insert: " two" }, userEvent: "input.type" });
    // Another device appended a line: the reload stays when typing is undone.
    await rerender({ value: "one two\nthree" });
    undo(view);
    expect(view.state.doc.toString()).toBe("one\nthree");
    expect(undo(view)).toBe(false);
  });

  it("forgetHistory leaves nothing of the last note to undo", async () => {
    const { container, component, rerender } = render(Editor, { props: { value: "first" } });
    const view = viewOf(container);
    view.dispatch({ changes: { from: 5, insert: "!" }, userEvent: "input.type" });
    component.forgetHistory();
    await rerender({ value: "second note" });
    expect(undo(view)).toBe(false);
    expect(view.state.doc.toString()).toBe("second note");
  });
});
