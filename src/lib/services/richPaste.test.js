// The paste itself, through a real CodeMirror. What a unit test of the
// converter cannot catch is the half that decides WHETHER to convert — and the
// two transactions, which are the whole reason Ctrl+Z still works.

import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo } from "@codemirror/commands";
import { blockMiddlePaste } from "./middlePaste.js";
import { richPaste } from "./richPaste.js";

function editor(doc = "") {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      // The order Editor.svelte builds them in: the middle button's cancel
      // answers first.
      extensions: [history(), blockMiddlePaste, richPaste],
    }),
  });
  return { view, done: () => (view.destroy(), parent.remove()) };
}

/// A paste carrying whatever the source app put on the clipboard. `types` is
/// what `looksLikeFiles` reads.
function paste(view, { html = "", text = "", types } = {}) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  event.clipboardData = {
    types: types ?? [...(text ? ["text/plain"] : []), ...(html ? ["text/html"] : [])],
    getData: (kind) => (kind === "text/html" ? html : text),
  };
  view.contentDOM.dispatchEvent(event);
  return event;
}

describe("pasting from another app", () => {
  it("keeps the style the plain half had thrown away", () => {
    const { view, done } = editor();
    paste(view, { html: "<p>uma <b>nota</b></p>", text: "uma nota" });
    expect(view.state.doc.toString()).toBe("uma **nota**");
    done();
  });

  it("replaces what was selected, and leaves the cursor after it", () => {
    const { view, done } = editor("antes DEPOIS");
    view.dispatch({ selection: { anchor: 6, head: 12 } });
    paste(view, { html: "<p><i>x</i></p>", text: "x" });
    expect(view.state.doc.toString()).toBe("antes *x*");
    expect(view.state.selection.main.head).toBe(9);
    done();
  });

  it("one Ctrl+Z gives back exactly the plain paste, a second undoes it", () => {
    // The point of the two transactions: nobody is trapped by the conversion.
    const { view, done } = editor("");
    paste(view, { html: "<p>uma <b>nota</b></p>", text: "uma nota" });
    undo(view);
    expect(view.state.doc.toString()).toBe("uma nota");
    undo(view);
    expect(view.state.doc.toString()).toBe("");
    done();
  });

  // CodeMirror cancels every paste it answers, so what proves the module stood
  // down is the DOCUMENT: the plain half arrived, untouched.
  it("stands down when the clipboard has no HTML", () => {
    const { view, done } = editor();
    paste(view, { text: "texto puro" });
    expect(view.state.doc.toString()).toBe("texto puro");
    done();
  });

  it("stands down when the HTML says nothing the plain half did not", () => {
    // Every web page writes `text/html`; only a DIFFERENCE is worth a paste of
    // our own, or the editor would lose CodeMirror's own handling for nothing.
    const { view, done } = editor();
    paste(view, { html: "<p>texto comum</p>", text: "texto comum" });
    expect(view.state.doc.toString()).toBe("texto comum");
    done();
  });

  it("stands down for a file, which is the notebook's business", () => {
    const { view, done } = editor();
    paste(view, { html: "<p><b>x</b></p>", text: "x", types: ["Files", "text/html", "text/plain"] });
    expect(view.state.doc.toString()).toBe("x");
    done();
  });

  it("stands down in a read-only note", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: "",
        extensions: [history(), richPaste, EditorState.readOnly.of(true)],
      }),
    });
    paste(view, { html: "<p><b>x</b></p>", text: "x" });
    expect(view.state.doc.toString()).toBe("");
    view.destroy();
    parent.remove();
  });

  it("still yields the paste that is really a middle click", () => {
    const { view, done } = editor();
    view.contentDOM.dispatchEvent(new MouseEvent("mousedown", { button: 1, bubbles: true, cancelable: true }));
    paste(view, { html: "<p><b>x</b></p>", text: "x" });
    expect(view.state.doc.toString()).toBe("");
    done();
  });
});
