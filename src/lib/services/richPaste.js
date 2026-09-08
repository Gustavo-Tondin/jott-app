// Pasting from another app. CodeMirror takes `text/plain`, which is the half
// the source already stripped of every mark; the style is in `text/html`.
//
// TWO transactions on purpose — the plain paste, then the conversion, split in
// the history — so one Ctrl+Z gives back exactly what pasting without this
// would have given, and a second undoes the paste itself.

import { isolateHistory } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { looksLikeFiles } from "./gesture.js";
import { htmlToMarkdown } from "./htmlToMarkdown.js";

export const richPaste = EditorView.domEventHandlers({
  paste(event, view) {
    if (view.state.readOnly) return false;
    const clipboard = event.clipboardData;
    // A file goes to the notebook, not into the text (`actions/acceptsFiles.js`).
    if (!clipboard || looksLikeFiles(clipboard)) return false;
    const html = clipboard.getData("text/html");
    if (!html) return false;
    const plain = clipboard.getData("text/plain");
    const markdown = htmlToMarkdown(html);
    // Nothing was marked up: the plain half already says all of it.
    if (!markdown || markdown === plain) return false;

    event.preventDefault();
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: plain },
      selection: { anchor: from + plain.length },
      userEvent: "input.paste",
    });
    view.dispatch({
      changes: { from, to: from + plain.length, insert: markdown },
      selection: { anchor: from + markdown.length },
      userEvent: "input.paste",
      annotations: isolateHistory.of("before"),
    });
    return true;
  },
});
