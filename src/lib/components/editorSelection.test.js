// What the editor says about its own selection (2026-08-21).
//
// The real engine, not a fake: the selection is CodeMirror's state, and
// nothing outside it — `document.getSelection()` included — sees the same
// thing. The floating formatting bar can be asked to show only while there IS
// a selection, and that whole feature rests on this one report being right.
//
// The edges are what it reports, not every transaction: the listener fires on
// every arrow key, and a shell re-rendered on each of them would be the bug
// this shape prevents.

import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { EditorView } from "@codemirror/view";

import Editor from "./Editor.svelte";

/// The EditorView behind the rendered component. It is what a selection has
/// to be made ON — a `select()` on the DOM is invisible to CodeMirror's state,
/// and the component keeps its view to itself.
const viewOf = (container) => EditorView.findFromDOM(container);

describe("the editor's selection", () => {
  it("says so when something is selected, and when it stops being", () => {
    const said = [];
    const { container } = render(Editor, {
      props: { value: "Uma nota curta.", onSelection: (has) => said.push(has) },
    });
    const view = viewOf(container);

    view.dispatch({ selection: { anchor: 0, head: 3 } });
    expect(said).toEqual([true]);

    // Collapsed again: the bar's cue to go away.
    view.dispatch({ selection: { anchor: 3, head: 3 } });
    expect(said).toEqual([true, false]);
  });

  it("reports the EDGES only — a cursor walking a line says nothing", () => {
    const said = [];
    const { container } = render(Editor, {
      props: { value: "Uma nota curta.", onSelection: (has) => said.push(has) },
    });
    const view = viewOf(container);

    for (const at of [1, 2, 3, 4]) view.dispatch({ selection: { anchor: at, head: at } });
    expect(said).toEqual([]);

    view.dispatch({ selection: { anchor: 0, head: 4 } });
    view.dispatch({ selection: { anchor: 0, head: 6 } });
    // Growing a selection is still "there is one" — said once.
    expect(said).toEqual([true]);
  });

  it("notices a selection that a change wiped out without moving the cursor", () => {
    // Deleting the selected text collapses the selection by MAPPING it
    // through the change — `selectionSet` is false, because nothing set a
    // selection; the old one simply has nothing left to cover. That is why
    // the listener asks about `docChanged` too and not about `selectionSet`
    // alone: on that transaction the bar has to go away, and nothing else
    // would say so.
    const said = [];
    const { container } = render(Editor, {
      props: { value: "Uma nota curta.", onSelection: (has) => said.push(has) },
    });
    const view = viewOf(container);

    view.dispatch({ selection: { anchor: 0, head: 3 } });
    expect(said).toEqual([true]);

    view.dispatch({ changes: { from: 0, to: 3, insert: "" } });
    expect(said).toEqual([true, false]);
  });

  it("is optional — an editor nobody asked draws the same", () => {
    const { container } = render(Editor, { props: { value: "Nada." } });
    const view = viewOf(container);
    expect(view).toBeTruthy();
    expect(() => view.dispatch({ selection: { anchor: 0, head: 2 } })).not.toThrow();
  });
});
