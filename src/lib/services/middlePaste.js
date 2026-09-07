// The middle button, kept out of the note (user report, 2026-09-07: "Botão do
// meio tá colando texto no editor, não deveria").
//
// On X11 — and on Wayland through the toolkit that remembers X11 — the middle
// button pastes the PRIMARY selection: whatever was last highlighted anywhere
// on the desktop. WebKitGTK honours it inside an editable element, so a middle
// click on a note dropped the last thing selected in another window into the
// text, at the point of the click. It is the platform's gesture, not the app's,
// and in this app the middle button already means something else (a card or a
// row opens in a new tab) — so inside the editor it means nothing.
//
// Two lines of defence, because the two engines that run this app do it
// differently: the toolkit pastes on the press, so the press is cancelled; a
// browser that instead raises a `paste` event right after a middle press has
// that event cancelled too. A paste that arrives any other way — Ctrl+V, the
// menu, a finger on Android — is untouched: only a paste within a beat of a
// middle press is taken to be the platform's.

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
