import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { markdownPreview } from "./markdown.js";

describe("probe", () => {
  it("dumps the dom", () => {
    const doc = "- a\n- b\n\n1. a\n2. b\n\n- [ ] a\n";
    const view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [markdown({ base: markdownLanguage }), markdownPreview],
      }),
      parent: document.body,
    });
    writeFileSync("/tmp/claude-1000/probe.html", view.contentDOM.innerHTML.replace(/></g, ">\n<"));
    view.destroy();
  });
});
