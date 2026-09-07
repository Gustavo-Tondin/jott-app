import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { blockMiddlePaste } from "./middlePaste.js";

function editor(doc = "texto") {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc, extensions: [blockMiddlePaste] }),
  });
  return view;
}

const press = (view, button) => {
  const event = new MouseEvent("mousedown", { button, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(event);
  return event;
};

const paste = (view, text) => {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  event.clipboardData = { getData: () => text };
  view.contentDOM.dispatchEvent(event);
  return event;
};

describe("the middle button inside a note", () => {
  it("is cancelled on the press, which is where the toolkit pastes", () => {
    const view = editor();
    expect(press(view, 1).defaultPrevented).toBe(true);
    view.destroy();
  });

  it("and a paste right after a middle press is that press", () => {
    const view = editor();
    press(view, 1);
    expect(paste(view, "primário").defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe("texto");
    view.destroy();
  });

  it("but a paste on its own is a paste", () => {
    // CodeMirror answers it (and cancels the default itself), so the proof is
    // the document, not the event.
    const view = editor();
    paste(view, "colado");
    expect(view.state.doc.toString()).toBe("coladotexto");
    view.destroy();
  });

  it("and a left press before a paste is not a middle press", () => {
    const view = editor();
    press(view, 0);
    paste(view, "colado");
    // (The press itself moved the selection — jsdom has no coordinates — so
    // only the arrival of the text is asserted.)
    expect(view.state.doc.toString()).toContain("colado");
    view.destroy();
  });
});
