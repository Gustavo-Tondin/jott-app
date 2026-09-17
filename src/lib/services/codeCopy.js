// The Copy button of a fenced code block: a widget at the end of the opening
// fence's line, which editor.css pins to the box's corner. Built with its
// answers (glyphs, the clipboard) rather than importing them, so it is
// testable without a window. Nothing here changes the file.

import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType } from "@codemirror/view";
import { S } from "./strings.js";

/// How long the button says "done" before it offers to copy again.
const DONE_MS = 1500;

/// What Copy hands over for the `FencedCode` node: the code without the
/// fences, the info string, or the prefix a list or a quote puts before every
/// line — the parser already leaves that out of `CodeText`.
export function codeOf(state, node) {
  return node
    .getChildren("CodeText")
    .map((text) => state.doc.sliceString(text.from, text.to))
    .join("");
}

/// The `FencedCode` node around `pos`, or null.
function fenceAt(state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (node.name === "FencedCode") return node;
  }
  return null;
}

/// button → the timer that puts it back to rest. Per BUTTON: the widget is
/// one instance drawn many times.
const timers = new WeakMap();

class CopyWidget extends WidgetType {
  constructor(options) {
    super();
    this.options = options;
  }

  /// One button is every button: the click asks the document where it is, so
  /// no position is kept here to go stale.
  eq() {
    return true;
  }

  toDOM(view) {
    const { icon, doneIcon, copy } = this.options;
    const [label, doneLabel] = [S.copyCode, S.codeCopied];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-code-copy theme-btn theme-btn--icon";
    button.tabIndex = -1;
    const rest = () => {
      button.innerHTML = icon;
      button.setAttribute("aria-label", label);
      button.title = label;
      button.classList.remove("cm-code-copy--done");
    };
    rest();

    // Prevented so the press neither moves the caret into the fence (which
    // would show its raw marks) nor takes the focus off the note.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const node = fenceAt(view.state, view.posAtDOM(button));
      if (!node) return;
      try {
        await copy(codeOf(view.state, node));
      } catch {
        return;
      }
      button.innerHTML = doneIcon;
      button.setAttribute("aria-label", doneLabel);
      button.title = doneLabel;
      button.classList.add("cm-code-copy--done");
      clearTimeout(timers.get(button));
      timers.set(button, setTimeout(rest, DONE_MS));
    });
    return button;
  }

  destroy(dom) {
    clearTimeout(timers.get(dom));
  }

  /// The editor stays out of it: the button answers its own events.
  ignoreEvent() {
    return true;
  }
}

/// The decorations for `ranges` of `state`: one widget per fenced block, at
/// the end of its first line. Takes a state, not a view: testable without a DOM.
export function copyDecorationsFor(state, ranges, widget) {
  const builder = new RangeSetBuilder();
  let last = -1;
  for (const { from, to } of ranges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== "FencedCode") return;
        const at = state.doc.lineAt(node.from).to;
        // Two visible ranges can both reach one block.
        if (at <= last) return;
        last = at;
        builder.add(at, at, Decoration.widget({ widget, side: 1 }));
      },
    });
  }
  return builder.finish();
}

/// The extension. `icon` / `doneIcon` are SVG text; `copy(text)` is the
/// clipboard (a promise), the window's own unless a test hands another.
export function codeCopy({ icon, doneIcon, copy = (text) => navigator.clipboard.writeText(text) }) {
  const widget = new CopyWidget({ icon, doneIcon, copy });
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = copyDecorationsFor(view.state, view.visibleRanges, widget);
      }

      update(update) {
        // The tree too: a long note is parsed in pieces, after it is shown.
        const parsed = syntaxTree(update.startState) !== syntaxTree(update.state);
        if (update.docChanged || update.viewportChanged || parsed) {
          this.decorations = copyDecorationsFor(
            update.view.state,
            update.view.visibleRanges,
            widget,
          );
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
