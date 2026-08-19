// Pairs that close themselves, driven through a real CodeMirror.
//
// These go through the actual `inputHandler` facet, in the actual order the
// editor installs it, because the ORDER is the thing most likely to break: our
// handler and CodeMirror's `closeBrackets` both answer `*`, they answer it
// differently, and whichever the facet reaches first wins. A unit test of the
// rule function alone would pass with the two swapped — and the note would
// come out with `**|` instead of bold.
//
// The measured "before" for the headline cases, with CodeMirror's handler
// left in charge: `**` gave `**|`, and `*` at the end of `**text|**` gave
// `**text*|***`.

import { afterEach, describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { autocompletion } from "@codemirror/autocomplete";
import { autoClose, plainAutoClose } from "./autoClose.js";
import { markdownPreview } from "./markdown.js";
import { referenceCompletions } from "./linkComplete.js";

/// Every editor a test opened, torn down after it.
///
/// Not housekeeping: an undestroyed view keeps a `requestAnimationFrame`
/// measuring pass alive, and jsdom cannot measure text — so each survivor
/// reports an unhandled error after the suite has already gone green. This
/// suite is held to the zero the front-end suite has had since v0.6.0.
const opened = [];

afterEach(() => {
  while (opened.length) {
    const view = opened.pop();
    const parent = view.dom.parentElement;
    view.destroy();
    parent?.remove();
  }
});

/// The editor, with the extensions in the order Editor.svelte builds them.
function editor(doc = "", at = doc.length) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: at },
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage }),
        markdownPreview,
        autocompletion(),
        autoClose,
      ],
    }),
  });
  opened.push(view);
  return view;
}

/// Types characters the way the DOM observer does — through the same facet,
/// with the same fallback CodeMirror uses when nobody claims the keystroke.
function type(view, text) {
  for (const ch of text) {
    const { from, to } = view.state.selection.main;
    const fallback = () =>
      view.state.update({
        changes: { from, to, insert: ch },
        selection: { anchor: from + ch.length },
        userEvent: "input.type",
      });
    const handled = view.state
      .facet(EditorView.inputHandler)
      .some((handler) => handler(view, from, to, ch, fallback));
    if (!handled) view.dispatch(fallback());
  }
  return shown(view);
}

/// The document with the caret drawn in, which is what these tests are about.
function shown(view) {
  const doc = view.state.doc.toString();
  const { head } = view.state.selection.main;
  return `${doc.slice(0, head)}|${doc.slice(head)}`;
}

function press(view, key) {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
  return shown(view);
}

describe("markdown marks close themselves", () => {
  it("one asterisk opens a pair and parks the caret inside it", () => {
    expect(type(editor(), "*")).toBe("*|*");
  });

  it("two asterisks are BOLD, not a step over the first pair", () => {
    // The case the whole module exists for. CodeMirror's own handler answers
    // `**|` here: it sees its own closer ahead and walks past it, which is
    // right for a string and wrong for Markdown.
    expect(type(editor(), "**")).toBe("**|**");
  });

  it("text typed inside the bold pair stays inside it", () => {
    expect(type(editor(), "**bold")).toBe("**bold|**");
  });

  it("three asterisks are bold-italic, and it stops there", () => {
    expect(type(editor(), "***")).toBe("***|***");
    // A fourth would be nesting Markdown gives no meaning to, so the caret
    // steps out instead of opening yet another pair.
    expect(type(editor("***|***".replace("|", ""), 3), "*")).toBe("****|**");
  });

  it("typing the mark at the end of the text steps OUT of the pair", () => {
    // The measured "before" was `**text*|***` — a third mark written into a
    // finished pair.
    const view = editor("**text**", 6);
    expect(type(view, "*")).toBe("**text*|*");
    expect(type(view, "*")).toBe("**text**|");
  });

  it("strikethrough and inline code pair the same way", () => {
    expect(type(editor(), "~~")).toBe("~~|~~");
    expect(type(editor(), "`")).toBe("`|`");
  });

  it("a selection is wrapped rather than replaced", () => {
    const view = editor("bold");
    view.dispatch({ selection: { anchor: 0, head: 4 } });
    type(view, "*");
    expect(view.state.doc.toString()).toBe("*bold*");
    // The text stays selected, so a second press makes it bold.
    expect([view.state.selection.main.from, view.state.selection.main.to]).toEqual([1, 5]);
  });

  it("a mark pressed against a word does not close", () => {
    // `*bar` written into `foobar` would put a closer in the middle of a word.
    expect(type(editor("foobar", 3), "*")).toBe("foo*|bar");
  });

  it("underscore never closes after a word, because snake_case is not italic", () => {
    // CommonMark gives no meaning to `foo_bar_`, so a pair here would render
    // as nothing — and `_` is typed far more often to name things.
    expect(type(editor("foo"), "_")).toBe("foo_|");
    expect(type(editor(), "_")).toBe("_|_");
  });

  it("Backspace between a fresh pair takes both marks", () => {
    const view = editor();
    type(view, "*");
    expect(press(view, "Backspace")).toBe("|");
  });
});

describe("brackets keep CodeMirror's behaviour", () => {
  it("opens and closes, and typing the closer steps over it", () => {
    const view = editor();
    expect(type(view, "(")).toBe("(|)");
    expect(type(view, ")")).toBe("()|");
  });

  it("two brackets write the reference the autocomplete listens for", () => {
    expect(type(editor(), "[[")).toBe("[[|]]");
  });

  it("a quote pressed against a word does not close", () => {
    expect(type(editor("ab", 1), '"')).toBe('a"|b');
  });

  it("Backspace between a fresh pair takes both", () => {
    const view = editor();
    type(view, "(");
    expect(press(view, "Backspace")).toBe("|");
  });
});

describe("bullet three: what CommonMark already decides", () => {
  it("marks touching the text are bold; marks left loose are literal", () => {
    // Nothing was built for this — it is the parser's own delimiter rule, and
    // the test is here so a future change to the language cannot quietly take
    // it away. The caret is parked on the last line so the first one renders.
    const view = editor("**bold** and ** loose ** end\n\n");
    const html = view.contentDOM.innerHTML;
    expect(html).toContain('class="cm-md-strong">bold<');
    expect(html).toContain("** loose ** end");
    expect(html).not.toContain("cm-md-strong\">loose");
  });
});

describe("the reference autocomplete and the brackets it now finds waiting", () => {
  it("picking an option eats the `]]` the auto-closing wrote", async () => {
    // Without this the note ended up holding `[[/foto.jpg]]]]`: the option
    // writes the whole reference, and the closing pair was already there.
    const view = editor();
    type(view, "[[/fo");
    expect(shown(view)).toBe("[[/fo|]]");

    const source = referenceCompletions({
      files: async () => [{ name: "foto.jpg", path: "assets/foto.jpg", image: true }],
      notes: async () => [],
    });
    const result = await source({
      state: view.state,
      pos: view.state.selection.main.head,
      matchBefore(re) {
        const line = view.state.doc.lineAt(view.state.selection.main.head);
        const text = line.text.slice(0, view.state.selection.main.head - line.from);
        const match = new RegExp(`(?:${re.source})$`).exec(text);
        return match && { from: line.from + match.index, to: view.state.selection.main.head, text: match[0] };
      },
    });

    const option = result.options[0];
    option.apply(view, option, result.from, view.state.selection.main.head);
    expect(shown(view)).toBe("[[/foto.jpg]]|");
  });
});

describe("the plain field's pairs (the task description)", () => {
  // `plainAutoClose`, with the extensions in the order the plain editor
  // installs them (`Editor.svelte` with `plain`). The split under test: the
  // brackets still close — `[` twice is what opens the reference
  // autocomplete — while the Markdown marks stay ordinary characters,
  // because nothing ever renders a description as Markdown.
  function plainEditor(doc = "", at = doc.length) {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: at },
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          autocompletion(),
          plainAutoClose,
        ],
      }),
    });
    opened.push(view);
    return view;
  }

  it("`[` twice leaves `[[|]]`, ready for a reference", () => {
    expect(type(plainEditor(), "[[")).toBe("[[|]]");
  });

  it("a Markdown mark is just a character here", () => {
    expect(type(plainEditor(), "*")).toBe("*|");
    expect(type(plainEditor(), "`")).toBe("`|");
    expect(type(plainEditor(), "~")).toBe("~|");
  });

  it("parentheses and quotes still pair, as in any field", () => {
    expect(type(plainEditor(), "(")).toBe("(|)");
    expect(type(plainEditor(), '"')).toBe('"|"');
  });
});
