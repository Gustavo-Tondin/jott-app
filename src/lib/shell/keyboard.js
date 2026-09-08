// What the on-screen keyboard covers of the PAGE, kept in `--app-keyboard`.
// Measured against the ICB (`documentElement.clientHeight`) and the screen —
// never `innerHeight`/`visualViewport`, which the M139 WebView shrinks while
// the page keeps its height — and nothing is remembered between frames.
// See docs/platform-gotchas.md#android

/// What the keyboard covers of the LAYOUT viewport, in CSS px: `ime` is
/// Android's inset of the window, `screen` the display height (the one the
/// keyboard cannot move), `layout` the page's ICB. Whatever the layout already
/// gave up comes off the inset; never negative (a split screen owes nothing).
export function keyboardCover({ ime, screen, layout }) {
  if (!(ime > 0)) return 0;
  const shrunk = Math.max(0, (screen || 0) - (layout || 0));
  return Math.max(0, ime - shrunk);
}

/// Undoes the pan the WebView leaves behind after focusing a field near the
/// bottom. `scrollIntoView` is the only thing that moves the visual viewport
/// (its offset is read-only; `scrollTo` does nothing). Safe only because
/// nothing here reads the visual viewport back. See docs/platform-gotchas.md#android
function unpan(win) {
  if (!(win.visualViewport?.offsetTop > 0)) return;
  document.getElementById("app")?.scrollIntoView({ block: "start" });
}

/// Reads a `px` custom property off `el`, as a number. Anything unparseable —
/// unset, empty, a unit this does not speak — is zero, which is the answer
/// that leaves the layout as it is rather than moving it somewhere invented.
function pxOf(el, name) {
  const raw = getComputedStyle(el).getPropertyValue(name);
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

/// The room a `position: fixed` panel has: the layout viewport less the
/// keyboard. For CodeMirror's tooltips, whose own `windowSpace` reads
/// `clientHeight` and cannot see the keyboard. Subtract from the ICB, never
/// from `innerHeight` (already short on M139: the keyboard would count twice).
export function pageSpace({ root = document.documentElement } = {}) {
  return {
    top: 0,
    left: 0,
    right: root.clientWidth,
    bottom: Math.max(0, root.clientHeight - pxOf(root, "--app-keyboard")),
  };
}

/// Keeps `--app-keyboard` equal to what the keyboard covers; returns the
/// uninstall. Listens to `android-insets` (every frame of the animation) and
/// `resize` — never to the visual viewport's resize; its scroll only feeds [unpan].
export function installKeyboard({ root = document.documentElement, win = window } = {}) {
  const update = () => {
    const cover = keyboardCover({
      ime: pxOf(root, "--android-ime"),
      screen: win.screen?.height,
      layout: root.clientHeight,
    });
    root.style.setProperty("--app-keyboard", `${cover}px`);
    unpan(win);
  };

  const straighten = () => unpan(win);

  update();
  document.addEventListener("android-insets", update);
  win.addEventListener("resize", update);
  win.visualViewport?.addEventListener("scroll", straighten);
  return () => {
    document.removeEventListener("android-insets", update);
    win.removeEventListener("resize", update);
    win.visualViewport?.removeEventListener("scroll", straighten);
  };
}
