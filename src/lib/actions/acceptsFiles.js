// `use:acceptsFiles` — a place that takes a file the user drags or pastes.
//
// Two screens want this (the note's editor and the Images library) and both
// want it in the same shape, including the parts that are easy to get wrong
// and impossible to notice:
//
//   - **Capture, not bubble.** CodeMirror handles a paste itself; by the time
//     the event bubbled back out, the address would already be pasted as text.
//   - **`preventDefault` before awaiting.** The reading is asynchronous and a
//     `DataTransfer` is disconnected the moment its event finishes dispatching
//     (`services/gesture.js`). Claiming the gesture has to happen first.
//   - **`dragover` has to say yes** or no `drop` ever arrives.
//
// The one thing the two callers differ on is WHERE a paste is listened for,
// and each has a reason. See `paste` below.

import { looksLikeFiles, readGesture } from "../services/gesture.js";

/// @param options `{ onFiles, disabled, paste, over }`
///   - `onFiles({files, paths, remote, types})` — what the gesture brought.
///   - `disabled` — a read-only notebook takes nothing.
///   - `paste` — `"node"` listens on the element, which works wherever the
///     element also holds the focus (a note's editor). `"document"` is for a
///     screen with nothing to type in, where a paste is delivered to `<body>`
///     and would never reach the element at all. `"none"` takes drops only.
///   - `over(active)` — called as a file enters and leaves, for a screen that
///     wants to show it will take one.
export function acceptsFiles(node, options = {}) {
  let current = options;

  const take = (transfer, clipboard) => {
    if (current.disabled || !current.onFiles) return false;
    if (!transfer?.files?.length && !looksLikeFiles(transfer)) return false;
    readGesture(transfer, { clipboard }).then(current.onFiles);
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
