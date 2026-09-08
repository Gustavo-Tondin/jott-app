import { describe, it, expect } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EDITOR_COMMANDS, INDENT, markOf, newlineInMarkup } from "./markdownCommands.js";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

// Reached through the table, the way the panel and the shortcuts reach them.
const {
  "md.paragraph": clearHeading,
  "md.link": insertLink,
  "md.reference": insertReference,
  "md.rule": insertRule,
  "md.bold": toggleBold,
  "md.bullet": toggleBullet,
  "md.code": toggleInlineCode,
  "md.italic": toggleItalic,
  "md.ordered": toggleOrdered,
  "md.quote": toggleQuote,
  "md.strike": toggleStrike,
  "md.task": toggleTaskList,
  "md.underline": toggleUnderline,
} = EDITOR_COMMANDS;
const setHeading = (level) => EDITOR_COMMANDS[`md.h${level}`];

// A view is only ever `{state, dispatch}` to a command, so the commands can be
// driven with no DOM at all — which is the reason they are written as plain
// CodeMirror commands rather than as methods on the component.
function editor(doc, from = 0, to = from) {
  const view = {
    state: EditorState.create({
      doc,
      selection: EditorSelection.single(from, to),
    }),
    dispatch(tr) {
      view.state = tr.state;
    },
  };
  return view;
}

const run = (command, doc, from, to) => {
  const view = editor(doc, from, to);
  command(view);
  return view.state.doc.toString();
};

describe("inline marks", () => {
  it("wraps a selection and unwraps it again", () => {
    expect(run(toggleBold, "leite", 0, 5)).toBe("**leite**");
    expect(run(toggleBold, "**leite**", 2, 7)).toBe("leite");
    // The marks just OUTSIDE the selection — the shape the first press leaves.
    expect(run(toggleItalic, "*leite*", 1, 6)).toBe("leite");
  });

  it("bold and italic stack instead of fighting", () => {
    // The report (2026-09-07): pressing italic on a bold word deleted one
    // asterisk from each end, so the word came back plain-ish instead of
    // bold-italic. Three asterisks is both marks at once, and taking either
    // one off has to leave the other standing.
    expect(run(toggleItalic, "**leite**", 2, 7)).toBe("***leite***");
    expect(run(toggleBold, "*leite*", 1, 6)).toBe("***leite***");
    expect(run(toggleItalic, "***leite***", 3, 8)).toBe("**leite**");
    expect(run(toggleBold, "***leite***", 3, 8)).toBe("*leite*");
    // Selecting the marks along with the word asks the same question.
    expect(run(toggleItalic, "**leite**", 0, 9)).toBe("***leite***");
    expect(run(toggleBold, "**leite**", 0, 9)).toBe("leite");
    // And the cursor mid-word means that word, marks and all.
    expect(run(toggleItalic, "**leite**", 4)).toBe("***leite***");
  });

  it("takes the word under the cursor when nothing is selected", () => {
    // Ctrl+B mid-word means that word, which is what everyone expects.
    expect(run(toggleBold, "comprar leite hoje", 10)).toBe("comprar **leite** hoje");
  });

  it("leaves the marks ready to type into when there is no word either", () => {
    const view = editor("", 0);
    toggleBold(view);
    expect(view.state.doc.toString()).toBe("****");
    expect(view.state.selection.main.head).toBe(2);
  });

  it("does the other three marks", () => {
    expect(run(toggleItalic, "leite", 0, 5)).toBe("*leite*");
    expect(run(toggleStrike, "leite", 0, 5)).toBe("~~leite~~");
    expect(run(toggleInlineCode, "leite", 0, 5)).toBe("`leite`");
  });

  it("puts a link around the selection, cursor in the address", () => {
    const view = editor("Jott", 0, 4);
    insertLink(view);
    expect(view.state.doc.toString()).toBe("[Jott]()");
    // Between the parentheses: the address is what is left to type.
    expect(view.state.selection.main.head).toBe(7);
  });

  it("puts the cursor in the TEXT when there is nothing to link yet", () => {
    const view = editor("", 0);
    insertLink(view);
    expect(view.state.doc.toString()).toBe("[]()");
    expect(view.state.selection.main.head).toBe(1);
  });
});

describe("line marks", () => {
  it("makes a bullet, and takes it away again", () => {
    expect(run(toggleBullet, "leite", 0)).toBe("- leite");
    expect(run(toggleBullet, "- leite", 0)).toBe("leite");
  });

  it("replaces one mark with another instead of stacking them", () => {
    expect(run(toggleQuote, "- leite", 0)).toBe("> leite");
    expect(run(toggleBullet, "> leite", 0)).toBe("- leite");
    expect(run(toggleTaskList, "- leite", 0)).toBe("- [ ] leite");
  });

  it("numbers a numbered list from one", () => {
    expect(run(toggleOrdered, "a\nb\nc", 0, 5)).toBe("1. a\n2. b\n3. c");
  });

  it("works on every line a selection touches", () => {
    expect(run(toggleBullet, "a\nb", 0, 3)).toBe("- a\n- b");
  });

  it("makes a mixed selection all the same, rather than toggling it off", () => {
    // Half bulleted, half not: the press means "make these a list".
    expect(run(toggleBullet, "- a\nb", 0, 5)).toBe("- a\n- b");
  });

  it("keeps the indentation a line already had", () => {
    expect(run(toggleBullet, `${INDENT}leite`, 0)).toBe(`${INDENT}- leite`);
  });

  it("sets a heading level, and the same level again clears it", () => {
    expect(run(setHeading(2), "Título", 0)).toBe("## Título");
    expect(run(setHeading(2), "## Título", 0)).toBe("Título");
    // A different level replaces rather than stacks.
    expect(run(setHeading(3), "## Título", 0)).toBe("### Título");
  });

  it("clears a heading of any level, and touches nothing else", () => {
    expect(run(clearHeading, "#### Título", 0)).toBe("Título");
    // The bug this replaced: Ctrl+Alt+0 on a list item ate the bullet.
    expect(run(clearHeading, "- leite", 0)).toBe("- leite");
    expect(run(clearHeading, "> citação", 0)).toBe("> citação");
  });

  it("reads what a line already is", () => {
    expect(markOf("## Título").kind).toBe("heading");
    expect(markOf("- [ ] fazer").kind).toBe("task");
    expect(markOf("- item").kind).toBe("bullet");
    expect(markOf("3. item").kind).toBe("ordered");
    expect(markOf("> dito").kind).toBe("quote");
    expect(markOf("texto").kind).toBe("plain");
  });

  it("puts a rule on its own line", () => {
    expect(run(insertRule, "texto", 0)).toBe("texto\n\n---\n");
    expect(run(insertRule, "", 0)).toBe("---\n");
  });

  // ---- the two marks markdown does not have a symbol for (2026-08-19) ----

  it("underlines with the HTML markdown lacks, and takes it off again", () => {
    // `<u>` and not `__`: in CommonMark `__x__` is BOLD, so the file would say
    // something else in every other editor (user call).
    expect(run(toggleUnderline, "leite", 2)).toBe("<u>leite</u>");
    expect(run(toggleUnderline, "<u>leite</u>", 3, 8)).toBe("leite");
    expect(run(toggleUnderline, "<u>leite</u>", 0, 12)).toBe("leite");
  });

  it("writes a note reference the autocomplete can finish", () => {
    // The cursor lands BETWEEN the brackets, which is what makes `[[` open the
    // suggestions on the very next keystroke (services/linkComplete.js).
    const view = editor("", 0);
    insertReference(view);
    expect(view.state.doc.toString()).toBe("[[]]");
    expect(view.state.selection.main.head).toBe(2);

    // A selection becomes the title being linked to.
    expect(run(insertReference, "Receita", 0, 7)).toBe("[[Receita]]");
  });
});

describe("read-only", () => {
  it("refuses every edit, so a read-only notebook stays read-only", () => {
    const view = {
      state: EditorState.create({ doc: "leite", extensions: [EditorState.readOnly.of(true)] }),
      dispatch() {
        throw new Error("dispatched into a read-only document");
      },
    };
    for (const command of [
      toggleBold,
      toggleUnderline,
      toggleBullet,
      insertLink,
      insertReference,
      insertRule,
      clearHeading,
    ])
      expect(command(view)).toBe(false);
  });
});

// Enter in a list. The command only answers inside Markdown, so these states
// carry the language — the tree is what tells it which list the cursor is in.
describe("Enter in a list", () => {
  function markdownEditor(doc, at = doc.length) {
    const view = {
      state: EditorState.create({
        doc,
        selection: EditorSelection.single(at),
        extensions: [markdown({ base: markdownLanguage })],
      }),
      dispatch(tr) {
        view.state = tr.state;
      },
    };
    return view;
  }
  const enter = (doc, at) => {
    const view = markdownEditor(doc, at);
    const handled = newlineInMarkup(view);
    return { handled, doc: view.state.doc.toString(), cursor: view.state.selection.main.head };
  };

  it("carries the marker on", () => {
    expect(enter("- a")).toEqual({ handled: true, doc: "- a\n- ", cursor: 6 });
    expect(enter("1. a")).toEqual({ handled: true, doc: "1. a\n2. ", cursor: 8 });
  });

  // The case the report came from: the second item is empty, and CodeMirror's
  // own Enter put a blank line ABOVE it to make the list loose.
  it("on an empty second item ends the list — no blank line above it", () => {
    expect(enter("- a\n- ")).toEqual({ handled: true, doc: "- a\n", cursor: 4 });
    expect(enter("- a\n- b\n- ")).toEqual({ handled: true, doc: "- a\n- b\n", cursor: 8 });
  });

  // …and a list that IS loose (written by hand, or by the build before this
  // one) is continued tight: no blank line before the next marker.
  it("continues a loose list without a blank line", () => {
    expect(enter("- a\n\n- b")).toEqual({ handled: true, doc: "- a\n\n- b\n- ", cursor: 11 });
    expect(enter("1. a\n\n2. b")).toEqual({ handled: true, doc: "1. a\n\n2. b\n3. ", cursor: 14 });
    expect(enter("- a\n\n- b\n  - c")).toEqual({
      handled: true,
      doc: "- a\n\n- b\n  - c\n  - ",
      cursor: 19,
    });
  });

  it("stays out of plain text, so the default Enter answers there", () => {
    expect(enter("just a line").handled).toBe(false);
  });
});
