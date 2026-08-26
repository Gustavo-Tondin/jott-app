// The keyboard, as the LAYOUT sees it.
//
// The interesting cases are the two WebViews the same APK meets: the one that
// leaves the page alone under the keyboard, and the one that shrinks it. The
// app must clear the keyboard exactly once in both, and — the regression this
// suite exists for — must still do so after the keyboard has been up and down
// a few times. The version before this one learned a "rest height" from
// whichever animation frame happened to report a zero inset, and once that
// number was the height WITH the keyboard up it cleared the keyboard TWICE,
// for the rest of the session (device video, 2026-08-21).

import { afterEach, describe, expect, it, vi } from "vitest";
import { installKeyboard, keyboardCover } from "./keyboard.js";

const root = document.documentElement;

/// A window that knows how tall the screen is and carries the `resize`
/// listener. Everything else the answer depends on is read off the root.
function fakeWindow(screen = 780) {
  const listeners = new Map();
  return {
    screen: { height: screen },
    visualViewport: {
      offsetTop: 0,
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
    },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
    fire: (name) => listeners.get(name)?.(),
  };
}

/// The page's initial containing block — what `height: 100%` resolves against,
/// and the one measurement this file compares the inset to. jsdom reports zero
/// for it, so the test states it the way a browser would.
function layout(px) {
  Object.defineProperty(root, "clientHeight", { value: px, configurable: true });
}

const ime = (px) => {
  root.style.setProperty("--android-ime", `${px}px`);
  document.dispatchEvent(new CustomEvent("android-insets"));
};

const keyboard = () => root.style.getPropertyValue("--app-keyboard");

afterEach(() => {
  root.style.removeProperty("--android-ime");
  root.style.removeProperty("--app-keyboard");
  delete root.clientHeight;
});

describe("what the keyboard covers", () => {
  it("is the whole inset where the page keeps its layout height", () => {
    expect(keyboardCover({ ime: 300, screen: 780, layout: 780 })).toBe(300);
  });

  // The WebView that shrinks the VISUAL viewport (Chrome M139) is this same
  // case: the ICB is untouched, so the page still ends where it always did and
  // still owes the whole inset.
  it("is nothing where the LAYOUT viewport gave up the same height", () => {
    expect(keyboardCover({ ime: 300, screen: 780, layout: 480 })).toBe(0);
  });

  it("is the difference where the layout gave up part of it", () => {
    expect(keyboardCover({ ime: 300, screen: 780, layout: 600 })).toBe(120);
  });

  it("is nothing with no keyboard up", () => {
    expect(keyboardCover({ ime: 0, screen: 780, layout: 780 })).toBe(0);
  });

  it("never asks the layout for height back", () => {
    expect(keyboardCover({ ime: 300, screen: 780, layout: 200 })).toBe(0);
  });

  it("is the whole inset when the screen height is unknown", () => {
    expect(keyboardCover({ ime: 300, layout: 780 })).toBe(300);
  });
});

describe("the token the layout reads", () => {
  it("carries the inset on a WebView that leaves the page alone", () => {
    const win = fakeWindow();
    layout(780);
    const stop = installKeyboard({ root, win });

    ime(300);

    expect(keyboard()).toBe("300px");
    stop();
  });

  it("carries nothing on a WebView that shrinks the page itself", () => {
    const win = fakeWindow();
    layout(780);
    const stop = installKeyboard({ root, win });

    // The inset lands first and the resize follows, which is the order a real
    // WebView reports them in — the token must settle on the second.
    ime(300);
    layout(480);
    win.fire("resize");

    expect(keyboard()).toBe("0px");
    stop();
  });

  it("goes back to nothing when the keyboard does", () => {
    const win = fakeWindow();
    layout(780);
    const stop = installKeyboard({ root, win });

    ime(300);
    ime(0);

    expect(keyboard()).toBe("0px");
    stop();
  });

  // THE REGRESSION. The animation reports the inset frame by frame, so it
  // passes through zero on the way up and lands on zero on the way down — and
  // on an M139 WebView the visual viewport is still short around both of those
  // zeros. Nothing may be learned from them: the second keyboard has to cost
  // exactly what the first one did.
  it("clears the keyboard once however many times it has been up", () => {
    const win = fakeWindow();
    layout(780);
    const stop = installKeyboard({ root, win });

    for (const frame of [0, 90, 220, 300, 300, 180, 40, 0]) ime(frame);
    ime(300);

    expect(keyboard()).toBe("300px");
    stop();
  });

  it("stops listening when uninstalled", () => {
    const win = fakeWindow();
    layout(780);
    installKeyboard({ root, win })();

    ime(300);

    expect(keyboard()).toBe("0px");
  });

  // THE OTHER HALF OF THE REGRESSION, measured on the Home screen (device,
  // 2026-08-21). `adjustResize` shrinks the WINDOW for the keyboard, so a
  // height read from it is already short and the subtraction comes out zero —
  // the keyboard cleared twice, again. The SCREEN is what cannot move: with
  // the ICB already short of it by the keyboard, there is nothing left to
  // clear.
  it("clears nothing once the window itself was resized for the keyboard", () => {
    const win = fakeWindow(923);
    layout(923);
    const stop = installKeyboard({ root, win });

    ime(371);
    layout(552);
    win.fire("resize");

    expect(keyboard()).toBe("0px");
    stop();
  });
});

// The WebView drags the page up to reveal a field it thinks is under the
// keyboard, using the keyboard's final height — before this app has had a
// frame to end above it. The room gets made and the drag stays behind: the
// composer at the top of the display with the document's background under it
// (device, 2026-08-21). Nothing in this app ever lives under the keys, so a
// pan is only ever that leftover.
describe("the page the WebView dragged", () => {
  /// The app's root, with the one method this asks of it. jsdom has no
  /// `scrollIntoView` at all, and on device it is the ONLY call that moves the
  /// visual viewport — `scrollTo`, `scrollBy` and `scrollingElement.scrollTop`
  /// were each measured leaving it exactly where it was.
  function appRoot() {
    const el = document.createElement("div");
    el.id = "app";
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);
    return el;
  }

  afterEach(() => document.getElementById("app")?.remove());

  it("is put back when the keyboard settles", () => {
    const app = appRoot();
    const win = fakeWindow(923);
    layout(923);
    const stop = installKeyboard({ root, win });

    win.visualViewport.offsetTop = 371;
    ime(371);

    expect(app.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    stop();
  });

  it("is left alone when it was never dragged", () => {
    const app = appRoot();
    const win = fakeWindow(923);
    layout(923);
    const stop = installKeyboard({ root, win });

    ime(371);

    expect(app.scrollIntoView).not.toHaveBeenCalled();
    stop();
  });

  // The same drag, made by the USER: with the keyboard up there is nothing
  // below where the app ends, so pulling the page up shows the document's
  // background and nothing else. `user-scalable=no` means no pinch-zoom, so
  // there is no pan this app owes anyone.
  it("is put back when the drag was the user's", () => {
    const app = appRoot();
    const win = fakeWindow(923);
    layout(923);
    const stop = installKeyboard({ root, win });

    win.visualViewport.offsetTop = 120;
    win.fire("scroll");

    expect(app.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    stop();
  });
});
