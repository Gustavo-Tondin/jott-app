import { describe, expect, test } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { capitalizeAfterMarkers, markerBeforeCaret } from "./imeCaps.js";

describe("markerBeforeCaret", () => {
  test("a bullet, a task and a quote, with the caret right after them", () => {
    expect(markerBeforeCaret("- ", 2)).toEqual({ from: 0, to: 2 });
    expect(markerBeforeCaret("- [ ] ", 6)).toEqual({ from: 0, to: 6 });
    expect(markerBeforeCaret("- [x] ", 6)).toEqual({ from: 0, to: 6 });
    expect(markerBeforeCaret("> ", 2)).toEqual({ from: 0, to: 2 });
    expect(markerBeforeCaret("> - ", 4)).toEqual({ from: 0, to: 4 });
    // Nested: the indentation is already blank to the keyboard.
    expect(markerBeforeCaret("    * ", 6)).toEqual({ from: 4, to: 6 });
  });

  test("nothing where the keyboard already capitalizes, or where it should not", () => {
    expect(markerBeforeCaret("1. ", 3)).toBeNull();
    expect(markerBeforeCaret("", 0)).toBeNull();
    expect(markerBeforeCaret("   ", 3)).toBeNull();
    // A dash that is not a marker yet, and an item with text in it.
    expect(markerBeforeCaret("-", 1)).toBeNull();
    expect(markerBeforeCaret("- leite", 7)).toBeNull();
    expect(markerBeforeCaret("- leite", 2)).toEqual({ from: 0, to: 2 });
  });
});

/// A stand-in for the EditContext CodeMirror drives on Android. `seen` is
/// the text each `updateSelection` found — what the keyboard reads when
/// told the caret moved.
function fakeContext(text) {
  return {
    text,
    selectionStart: 0,
    selectionEnd: 0,
    seen: [],
    updateText(start, end, insert) {
      this.text = this.text.slice(0, start) + insert + this.text.slice(end);
    },
    updateSelection(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
      this.seen.push(this.text);
    },
  };
}

/// CodeMirror's own half, in its order: after every plugin's `update`, the
/// changed text, then the caret — only when it moved.
function editor(doc, head) {
  const context = fakeContext(doc);
  const codemirror = ViewPlugin.define(() => ({
    update(update) {
      update.changes.iterChanges((fromA, toA, _fromB, _toB, insert) => {
        context.updateText(fromA, toA, insert.toString());
      });
      const at = update.state.selection.main.head;
      if (context.selectionEnd !== at) context.updateSelection(at, at);
    },
  }));
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: head },
      extensions: [capitalizeAfterMarkers, codemirror],
    }),
    parent: document.body,
  });
  view.contentDOM.editContext = context;
  context.selectionStart = context.selectionEnd = head;
  return { view, context };
}

describe("capitalizeAfterMarkers", () => {
  test("the keyboard reads a new item's marker as spaces, when it is told", () => {
    const { view, context } = editor("- leite", 7);
    view.dispatch({ changes: { from: 7, insert: "\n- " }, selection: { anchor: 10 } });
    expect(context.seen.at(-1)).toBe("- leite\n  ");
    // The document itself is never touched.
    expect(view.state.doc.toString()).toBe("- leite\n- ");

    view.dispatch({ changes: { from: 10, insert: "Pão" }, selection: { anchor: 13 } });
    expect(context.text).toBe("- leite\n- Pão");
    view.destroy();
  });

  test("moving the caret away puts the marker back", () => {
    const { view, context } = editor("- leite\n- ", 3);
    view.dispatch({ selection: { anchor: 10 } });
    expect(context.text).toBe("- leite\n  ");
    view.dispatch({ selection: { anchor: 3 } });
    expect(context.text).toBe("- leite\n- ");
    view.destroy();
  });

  test("without an EditContext nothing happens", () => {
    const view = new EditorView({
      state: EditorState.create({ doc: "- ", extensions: [capitalizeAfterMarkers] }),
      parent: document.body,
    });
    expect(() => view.dispatch({ selection: { anchor: 2 } })).not.toThrow();
    view.destroy();
  });
});
