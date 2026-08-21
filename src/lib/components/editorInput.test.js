// What the phone's keyboard is allowed to do inside a note (2026-08-20).
//
// CodeMirror's own defaults are `spellcheck="false" autocorrect="off"
// autocapitalize="off"` — right for a code editor, wrong for a notebook, and
// invisible from anywhere but the rendered content element. That is why this
// mounts the real component rather than reading the extension: the question
// is what ends up on the DOM node the keyboard talks to, after every facet
// has had its say.

import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import Editor from "./Editor.svelte";

const content = (container) => container.querySelector(".cm-content");

describe("the keyboard's own help", () => {
  it("is on in a note", () => {
    const { container } = render(Editor, { props: { value: "" } });

    expect(content(container).getAttribute("autocapitalize")).toBe("sentences");
    expect(content(container).getAttribute("autocorrect")).toBe("on");
    expect(content(container).getAttribute("spellcheck")).toBe("true");
  });

  // A title and a task's text are sentences too, and they are typed on the
  // same keyboard as the note is.
  it("is on in a plain field as well", () => {
    const { container } = render(Editor, { props: { value: "", plain: true } });

    expect(content(container).getAttribute("autocapitalize")).toBe("sentences");
    expect(content(container).getAttribute("autocorrect")).toBe("on");
    expect(content(container).getAttribute("spellcheck")).toBe("true");
  });
});
