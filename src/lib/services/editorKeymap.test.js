// The editor's keymap, driven through a real CodeMirror instance.
//
// These exist because the unit tests of `markdownCommands.js` cannot catch the
// thing most likely to break here: the ORDER of the keymaps. `defaultKeymap`
// binds Enter to a plain newline, so a markdown Enter placed after it never
// runs — and nothing about that failure looks like a keyboard problem when it
// happens, it looks like lists mysteriously not continuing.

import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
  insertNewline,
} from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import * as md from "./markdownCommands.js";
import { bindings, commandsIn } from "./commands.js";
import { toCodeMirror } from "./keys.js";

// The extensions, in the same order Editor.svelte builds them. The command
// TABLE is imported rather than copied (`md.EDITOR_COMMANDS`) — a copy here
// would be exactly the drift this whole change exists to remove.
function editor(doc, at = doc.length) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const bound = bindings();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: at },
      extensions: [
        history(),
        indentUnit.of(md.INDENT),
        keymap.of([
          { key: "Tab", run: indentMore, shift: indentLess },
          { key: "Shift-Enter", run: insertNewline },
        ]),
        keymap.of(
          Object.entries(md.EDITOR_COMMANDS)
            .filter(([id]) => bound.get(id))
            .map(([id, run]) => ({ key: toCodeMirror(bound.get(id)), run, preventDefault: true })),
        ),
        keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage }),
      ],
    }),
  });
  return { view, done: () => (view.destroy(), parent.remove()) };
}

/// Presses a chord the way a keyboard does, through CodeMirror's own handler.
function press(view, key, mods = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  });
  view.contentDOM.dispatchEvent(event);
  return event;
}

const text = (view) => view.state.doc.toString();

describe("indentation and line breaks (the four rules of 2026-08-18)", () => {
  it("Tab indents the LINE, from wherever the cursor is in it", () => {
    // Cursor in the middle of the word, not at the start: the old behaviour
    // would have put a tab character right there.
    const { view, done } = editor("- comprar leite", 8);
    press(view, "Tab");
    expect(text(view)).toBe(`${md.INDENT}- comprar leite`);
    done();
  });

  it("Shift+Tab takes one level off", () => {
    const { view, done } = editor(`${md.INDENT}${md.INDENT}- leite`, 10);
    press(view, "Tab", { shiftKey: true });
    expect(text(view)).toBe(`${md.INDENT}- leite`);
    done();
  });

  // The two Enter tests below passed BEFORE this change too: `markdown()`
  // binds Enter at high precedence on its own. They are kept because that is
  // easy to lose — anyone adding a keymap above it, or passing
  // `addKeymap: false`, breaks both behaviours at once and nothing else here
  // would notice.
  it("Enter keeps the indentation of the line before it", () => {
    const { view, done } = editor(`${md.INDENT}texto`);
    press(view, "Enter");
    expect(text(view)).toBe(`${md.INDENT}texto\n${md.INDENT}`);
    done();
  });

  it("Enter carries the list marker on", () => {
    const { view, done } = editor("- leite");
    press(view, "Enter");
    expect(text(view)).toBe("- leite\n- ");
    done();
  });

  it("Enter carries a checkbox on as an UNCHECKED one", () => {
    const { view, done } = editor("- [x] feito");
    press(view, "Enter");
    expect(text(view)).toBe("- [x] feito\n- [ ] ");
    done();
  });

  it("Shift+Enter is the way out: a new line with no indent and no marker", () => {
    const { view, done } = editor(`${md.INDENT}- leite`);
    press(view, "Enter", { shiftKey: true });
    expect(text(view)).toBe(`${md.INDENT}- leite\n`);
    done();
  });
});

describe("formatting chords", () => {
  it("Ctrl+B bolds the word under the cursor", () => {
    const { view, done } = editor("comprar leite", 10);
    press(view, "b", { ctrlKey: true });
    expect(text(view)).toBe("comprar **leite**");
    done();
  });

  it("Ctrl+K makes a link — it is not the app's search inside a note", () => {
    const { view, done } = editor("Jott", 4);
    view.dispatch({ selection: { anchor: 0, head: 4 } });
    const event = press(view, "k", { ctrlKey: true });
    expect(text(view)).toBe("[Jott]()");
    // The shell stands down for anything already answered, and this is how
    // it is told (services/shortcuts.js).
    expect(event.defaultPrevented).toBe(true);
    done();
  });

  it("Ctrl+Alt+2 makes a heading, and Ctrl+Alt+0 takes it away", () => {
    const { view, done } = editor("Título", 0);
    press(view, "2", { ctrlKey: true, altKey: true });
    expect(text(view)).toBe("## Título");
    press(view, "0", { ctrlKey: true, altKey: true });
    expect(text(view)).toBe("Título");
    done();
  });

  it("Ctrl+L makes a checkbox out of a line", () => {
    const { view, done } = editor("comprar leite", 0);
    press(view, "l", { ctrlKey: true });
    expect(text(view)).toBe("- [ ] comprar leite");
    done();
  });

  it("leaves Ctrl+Z alone — undo still belongs to the editor", () => {
    const { view, done } = editor("leite", 5);
    press(view, "b", { ctrlKey: true });
    expect(text(view)).toBe("**leite**");
    press(view, "z", { ctrlKey: true });
    expect(text(view)).toBe("leite");
    done();
  });
});

describe("the component and the registry stay in step", () => {
  it("has an editor command for every `editor` id the registry declares", () => {
    // `note.replace` is the documented exception: it opens a panel, so it is
    // added in the component, which owns the view.
    const runnable = new Set([...Object.keys(md.EDITOR_COMMANDS), "note.replace"]);
    for (const command of commandsIn("editor"))
      expect(runnable.has(command.id), `${command.id} has a chord but nothing to run`).toBe(
        true,
      );
  });

  it("declares no editor command the registry has never heard of", () => {
    const known = new Set(commandsIn("editor").map((c) => c.id));
    for (const id of Object.keys(md.EDITOR_COMMANDS))
      expect(known.has(id), `${id} runs but no chord can ask for it`).toBe(true);
  });
});
