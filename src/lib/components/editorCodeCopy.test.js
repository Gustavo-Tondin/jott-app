// The Copy button of a code block, through the real editor: the button is a
// CodeMirror widget, and a widget that never installs fails in a way no stub
// can show. What it copies is asked of the document at the click.

import { render } from "@testing-library/svelte";
import { fireEvent } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { resetBridge } from "../test/bridge.js";

import Editor from "./Editor.svelte";
import { codeOf } from "../services/codeCopy.js";

describe("what Copy hands over", () => {
  const copied = (doc) => {
    const state = EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage })],
    });
    let found = null;
    ensureSyntaxTree(state, doc.length, 5000).iterate({
      enter: (node) => {
        if (node.name === "FencedCode" && !found) found = node.node;
      },
    });
    return codeOf(state, found);
  };

  it("is the code without the fences or the info string", () => {
    expect(copied("```sh\ncd x\n\nls -la\n```\n")).toBe("cd x\n\nls -la");
  });

  it("leaves out the indent a list puts before every line", () => {
    expect(copied("1. item\n   ```\n   cd x\n   ls\n   ```\n")).toBe("cd x\nls");
  });

  it("is nothing for an empty block", () => {
    expect(copied("```\n```\n")).toBe("");
  });
});

describe("the Copy button in a note", () => {
  const NOTE = "Antes\n\n```\ncd x\nls\n```\n\n```\nsegundo\n```\n";
  let writeText;

  beforeEach(() => {
    resetBridge();
    writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("draws one per fenced block, on the fence's line", () => {
    const { container } = render(Editor, { props: { value: NOTE } });
    const buttons = container.querySelectorAll(".cm-code-copy");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].closest(".cm-line").classList.contains("cm-md-open")).toBe(true);
    expect(buttons[0].getAttribute("aria-label")).toBe("Copy code");
  });

  it("copies ITS block, says so, and goes back to rest", async () => {
    vi.useFakeTimers();
    const { container } = render(Editor, { props: { value: NOTE } });
    const [, second] = container.querySelectorAll(".cm-code-copy");

    await fireEvent.click(second);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("segundo"));
    await vi.waitFor(() => expect(second.classList.contains("cm-code-copy--done")).toBe(true));
    expect(second.getAttribute("aria-label")).toBe("Copied");

    vi.advanceTimersByTime(2000);
    expect(second.classList.contains("cm-code-copy--done")).toBe(false);
    expect(second.getAttribute("aria-label")).toBe("Copy code");
  });

  it("does not move the caret into the fence when pressed", async () => {
    const { container } = render(Editor, { props: { value: NOTE } });
    const [first] = container.querySelectorAll(".cm-code-copy");
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    first.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
  });

  it("stays quiet when the clipboard refuses", async () => {
    writeText.mockImplementation(() => Promise.reject(new Error("denied")));
    const { container } = render(Editor, { props: { value: NOTE } });
    const [first] = container.querySelectorAll(".cm-code-copy");
    await fireEvent.click(first);
    await Promise.resolve();
    expect(first.classList.contains("cm-code-copy--done")).toBe(false);
  });
});
