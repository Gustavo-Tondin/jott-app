// The middle button pastes the PRIMARY selection (X11, and Wayland through
// GTK), and WebKitGTK honours it inside an editable element; in the editor it
// means nothing. Two defences, one per engine: the press is cancelled (the
// toolkit pastes on the press), and a `paste` within MIDDLE_PASTE_WINDOW of a
// middle press is cancelled too. See docs/platform-gotchas.md#webview-e-gestos

import { EditorView } from "@codemirror/view";

/// How long after a middle press a `paste` is still that press, in ms.
export const MIDDLE_PASTE_WINDOW = 500;

const lastMiddlePress = new WeakMap();

// A DOM handler is `(event, view)` — the other way round from an input
// handler — and the view is the WeakMap's key for the last press.
export const blockMiddlePaste = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 1) return false;
    lastMiddlePress.set(view, Date.now());
    event.preventDefault();
    return true;
  },
  auxclick(event) {
    if (event.button !== 1) return false;
    event.preventDefault();
    return true;
  },
  paste(event, view) {
    const pressed = lastMiddlePress.get(view);
    if (pressed === undefined || Date.now() - pressed > MIDDLE_PASTE_WINDOW) return false;
    event.preventDefault();
    return true;
  },
});
