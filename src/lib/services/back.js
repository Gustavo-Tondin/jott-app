// "Go back" — one gesture: the title-bar arrow, Android's back gesture, a
// mouse's fourth button. A stack rather than `if`s in the shell: whatever
// can be backed out of registers while mounted and the newest is asked
// first, so a dialog over a drawer closes before it. A handler answers
// `true` when it took the press; a `false` from `back()` is the platform's.

/// Registered handlers, oldest first. Asked from the end.
const handlers = [];

/// Registers `fn` for as long as the caller lives. Returns the unsubscribe —
/// call it on destroy, or a component that has gone still answers for the app.
export function onBack(fn) {
  handlers.push(fn);
  return () => {
    const at = handlers.indexOf(fn);
    if (at >= 0) handlers.splice(at, 1);
  };
}

/// Runs the topmost handler that takes the press. `true` when one did.
export function back() {
  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    // A handler that throws must not swallow the press for everyone below it:
    // the app closing because a menu failed to close is the worse outcome.
    try {
      if (handlers[i]()) return true;
    } catch {
      /* asked the next one */
    }
  }
  return false;
}

/// The mouse buttons that mean back and forward. They are not `button` values
/// anyone remembers, and they are the same in every engine the app runs on.
const MOUSE_BACK = 3;
const MOUSE_FORWARD = 4;

/// Wires what the page cannot reach on its own; installed ONCE, by the shell.
/// `window.__jottBack` must be a plain function on `window` — MainActivity
/// reaches it through `evaluateJavascript`, which sees no modules. `mouseup`
/// for the mouse buttons: `auxclick` does not fire for them in every engine.
export function installBack({ onForward } = {}) {
  if (typeof window === "undefined") return () => {};

  window.__jottBack = back;

  const down = (event) => {
    if (event.button === MOUSE_BACK || event.button === MOUSE_FORWARD) {
      event.preventDefault();
    }
  };
  const up = (event) => {
    if (event.button === MOUSE_BACK) {
      event.preventDefault();
      back();
    } else if (event.button === MOUSE_FORWARD) {
      event.preventDefault();
      onForward?.();
    }
  };

  window.addEventListener("mousedown", down);
  window.addEventListener("mouseup", up);
  return () => {
    window.removeEventListener("mousedown", down);
    window.removeEventListener("mouseup", up);
    if (window.__jottBack === back) delete window.__jottBack;
  };
}
