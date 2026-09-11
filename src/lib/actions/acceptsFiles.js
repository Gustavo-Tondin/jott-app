// `use:acceptsFiles` — a place that takes a file the user drags or pastes.
// Capture phase (CodeMirror would paste the address as text first);
// `preventDefault` BEFORE awaiting (a `DataTransfer` is disconnected once its
// event finishes dispatching, `services/gesture.js`); `dragover` must say yes
// or no `drop` ever arrives.

import { looksLikeFiles, readGesture, saysNothing } from "../services/gesture.js";

/// @param options `{ onFiles, disabled, paste, over }`
///   - `onFiles({files, paths, remote, types})` — what the gesture brought.
///   - `disabled` — a read-only notebook takes nothing.
///   - `paste` — `"node"` listens on the element (which must hold the focus);
///     `"document"` for a screen with nothing to type in; `"none"`: drops only.
///   - `over(active)` — a file entering and leaving, for a screen that shows it.
export function acceptsFiles(node, options = {}) {
  let current = options;

  const take = (transfer, clipboard) => {
    if (current.disabled || !current.onFiles) return false;
    // A paste the webview says nothing about is taken to ask the system, but
    // only reported if the system held something — an empty clipboard is silent.
    const blind = clipboard && saysNothing(transfer);
    if (!blind && !transfer?.files?.length && !looksLikeFiles(transfer)) return false;
    readGesture(transfer, { clipboard }).then((brought) => {
      if (!blind || brought.files.length || brought.paths.length) current.onFiles(brought);
    });
    return true;
  };

  const onPaste = (event) => {
    if (take(event.clipboardData, true)) event.preventDefault();
  };
  const onDrop = (event) => {
    current.over?.(false);
    if (take(event.dataTransfer, false)) event.preventDefault();
  };
  const onDragOver = (event) => {
    if (current.disabled || !looksLikeFiles(event.dataTransfer)) return;
    event.preventDefault();
    current.over?.(true);
  };
  const onDragLeave = (event) => {
    // Only when the pointer left the element itself, not when it crossed from
    // one child to the next.
    if (!event.relatedTarget || !node.contains(event.relatedTarget)) current.over?.(false);
  };

  const pasteOn = () => (current.paste === "document" ? document : node);
  let listeningTo = null;

  function listen() {
    if (current.paste === "none") return;
    listeningTo = pasteOn();
    listeningTo.addEventListener("paste", onPaste, true);
  }
  function unlisten() {
    listeningTo?.removeEventListener("paste", onPaste, true);
    listeningTo = null;
  }

  node.addEventListener("dragover", onDragOver, true);
  node.addEventListener("drop", onDrop, true);
  node.addEventListener("dragleave", onDragLeave);
  listen();

  return {
    update(next) {
      const moved = next.paste !== current.paste;
      current = next;
      if (moved) {
        unlisten();
        listen();
      }
    },
    destroy() {
      node.removeEventListener("dragover", onDragOver, true);
      node.removeEventListener("drop", onDrop, true);
      node.removeEventListener("dragleave", onDragLeave);
      unlisten();
    },
  };
}
