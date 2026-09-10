// A capital letter on a fresh list item, on Android. The keyboard decides
// from the text the EditContext shows it: a paragraph start or a sentence
// end capitalizes, and "- " is neither, so every new bullet started
// lowercase. While the caret sits right after a bullet, task or quote
// marker, the context shows that marker as spaces — same length, so every
// offset the keyboard sends back still lands on the document.
import { EditorView, ViewPlugin } from "@codemirror/view";

/// What the keyboard cannot read as a start: `- `, `- [ ] `, `> ` and their
/// nestings. `1. ` ends like a sentence, so it capitalizes already.
const MARKER = /^[ \t]*(?:>[ \t]?)*(?:[-*+][ \t]+(?:\[[ xX]\][ \t]+)?)?$/;

/// The columns `[from, to)` of `text` to show as spaces with the caret at
/// `column`, or null when the caret is not right after such a marker.
export function markerBeforeCaret(text, column) {
  const before = text.slice(0, column);
  const from = before.search(/\S/);
  if (from < 0 || !MARKER.test(before)) return null;
  return { from, to: column };
}

/// Writes `text` over the document range `[from, to)` of the context, whose
/// window starts at `base`. False when the range is outside the window.
function write(context, base, from, to, text) {
  const start = from - base;
  const end = to - base;
  if (start < 0 || end > context.text.length) return false;
  context.updateText(start, end, text);
  return true;
}

const masker = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view;
      /// The masked document range, or null.
      this.mask = null;
      this.context = null;
      this.hook();
    }

    /// The keyboard is told the caret moved by `updateSelection`, and reads
    /// the text right then — so the mask goes in BEFORE CodeMirror's call,
    /// not after its update (a text change alone tells the keyboard nothing).
    hook() {
      const context = this.view.contentDOM.editContext;
      if (!context || context === this.context) return;
      this.context = context;
      const original = context.updateSelection;
      context.updateSelection = (start, end) => {
        this.sync(end, false);
        return original.call(context, start, end);
      };
    }

    // Runs before CodeMirror writes the update into the context: only keeps
    // the mask's range in step with the document.
    update(update) {
      if (this.mask && update.docChanged) {
        const { changes } = update;
        this.mask = { from: changes.mapPos(this.mask.from, 1), to: changes.mapPos(this.mask.to, -1) };
      }
      this.hook();
    }

    /// Masks the marker the caret follows and unmasks the one it left.
    /// `head` is the caret in the context's terms; `force` rewrites a mask
    /// CodeMirror may have written over.
    sync(head, force) {
      const context = this.context;
      // Mid-composition the context belongs to the keyboard (CodeMirror keeps
      // its own hands off it too); the mask settles once the word is done.
      if (!context || this.view.compositionStarted) return;
      const { state } = this.view;
      const { main } = state.selection;
      const line = state.doc.lineAt(main.head);
      const marker = main.empty ? markerBeforeCaret(line.text, main.head - line.from) : null;
      const next = marker && { from: line.from + marker.from, to: line.from + marker.to };
      const old = this.mask;
      if (!force && old && next && old.from === next.from && old.to === next.to) return;

      // Where the context's window starts in the document.
      const base = main.head - head;
      if (old && old.to > old.from) write(context, base, old.from, old.to, state.sliceDoc(old.from, old.to));
      this.mask = null;
      if (!next) return;
      const shown = state.sliceDoc(next.from, next.to).replace(/[^\t]/g, " ");
      if (write(context, base, next.from, next.to, shown)) this.mask = next;
    }
  },
);

/// The extension. Without an EditContext (desktop, jsdom) it does nothing.
/// The listener covers an update that moved no caret but rewrote the text
/// under a mask — CodeMirror calls `updateSelection` only when it moved.
export const capitalizeAfterMarkers = [
  masker,
  EditorView.updateListener.of((update) => {
    const plugin = update.view.plugin(masker);
    if (plugin?.context && update.docChanged) plugin.sync(plugin.context.selectionEnd, true);
  }),
];
