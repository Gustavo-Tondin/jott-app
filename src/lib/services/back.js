// "Go back" — the one gesture, wherever it comes from.
//
// Three things ask for it and they used to ask for nothing: the back arrow in
// the title bar (which was the only one wired), Android's back gesture, and
// the fourth button of a mouse. The first two were reported broken on the same
// day (2026-08-20): on the phone the system gesture CLOSED THE APP from
// anywhere at all, and on the desktop the mouse's back button did nothing.
//
// WHY A STACK AND NOT A CHAIN OF `if`s IN THE SHELL — what "back" means
// depends on what is open, and most of what can be open is not the shell's to
// know: a modal is a component that mounts itself, and the shell holds no
// state saying one is there. So each thing that can be BACKED OUT OF registers
// while it is mounted, and the most recent one is asked first. That is also
// what makes the order right by construction — a dialog opened over the drawer
// registered after it, so it is the one that closes.
//
// A handler answers `true` when it took the press. The first `true` wins and
// nothing below it is asked. When nobody takes it, `back()` answers `false`
// and the caller decides what that means: on Android the press becomes the
// system's again and the app closes, which is what the platform expects.

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

/// Wires the two callers the page cannot reach on its own, and answers the
/// unsubscribe. Installed ONCE, by the shell.
///
///   - `window.__jottBack` is what MainActivity asks before letting Android's
///     back gesture close the app. It has to be a plain function on `window`:
///     the Activity reaches it through `evaluateJavascript`, which sees no
///     modules and no Svelte.
///   - the mouse's back and forward buttons, which no engine turns into
///     anything by itself in a Tauri window — there is no history to navigate,
///     so nothing happens unless the app makes it happen.
///
/// `mouseup` rather than `auxclick` or `mousedown`: `auxclick` does not fire
/// for these buttons in every engine, and acting on the press would fire twice
/// with the `mouseup` handler in place. The `mousedown` is still cancelled, so
/// nothing else can claim it.
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
