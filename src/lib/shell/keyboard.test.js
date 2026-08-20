// The keyboard, as the LAYOUT sees it.
//
// The interesting cases are the two WebViews the same APK meets: the one that
// leaves the page alone under the keyboard, and the one that shrinks it. The
// app must clear the keyboard exactly once in both.

import { afterEach, describe, expect, it, vi } from "vitest";
import { installKeyboard, keyboardCover } from "./keyboard.js";

const root = document.documentElement;

/// A window whose sizes the test moves by hand, with a visual viewport that
/// starts out agreeing with it — the way a WebView that says nothing behaves.
function fakeWindow(inner = 780, width = 360) {
  const listeners = new Map();
  const viewport = new Map();
  return {
    innerHeight: inner,
    innerWidth: width,
    visualViewport: {
      height: inner,
      offsetTop: 0,
      addEventListener: (name, fn) => viewport.set(name, fn),
      removeEventListener: (name) => viewport.delete(name),
    },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
    fire: (name) => (listeners.get(name) || viewport.get(name))?.(),
  };
}

const ime = (px) => {
  root.style.setProperty("--android-ime", `${px}px`);
  document.dispatchEvent(new CustomEvent("android-insets"));
};

const keyboard = () => root.style.getPropertyValue("--theme-keyboard");

afterEach(() => {
  root.style.removeProperty("--android-ime");
  root.style.removeProperty("--theme-keyboard");
});

describe("what the keyboard covers", () => {
  it("is the whole inset where the page does not resize", () => {
    expect(keyboardCover({ ime: 300, rest: 780, inner: 780 })).toBe(300);
  });

  it("is nothing where the page already gave up the same height", () => {
    expect(keyboardCover({ ime: 300, rest: 780, inner: 480 })).toBe(0);
  });

  it("is the difference where the page gave up part of it", () => {
    expect(keyboardCover({ ime: 300, rest: 780, inner: 600 })).toBe(120);
  });

  // The WebView that shrinks the VISUAL viewport (Chrome M139): the page keeps
  // its height, so the whole inset is still the distance a fixed box owes —
  // it just arrives as the gap between the two viewports instead of from
  // Android.
  it("is the gap to the visual viewport when that is what shrank", () => {
    expect(
      keyboardCover({ ime: 300, rest: 780, inner: 780, viewportHeight: 480 }),
    ).toBe(300);
  });

  // And the bug this all exists for: that shorter viewport can be PANNED over
  // the page, and a fixed box does not move with it.
  it("shrinks by however far the page has been panned", () => {
    expect(
      keyboardCover({
        ime: 300,
        rest: 780,
        inner: 780,
        viewportTop: 100,
        viewportHeight: 480,
      }),
    ).toBe(200);
  });

  it("is nothing where the LAYOUT viewport is the one that shrank", () => {
    expect(
      keyboardCover({ ime: 300, rest: 780, inner: 480, viewportHeight: 480 }),
    ).toBe(0);
  });

  it("is nothing with no keyboard up", () => {
    expect(keyboardCover({ ime: 0, rest: 780, inner: 780 })).toBe(0);
  });

  it("never asks the layout for height back", () => {
    expect(keyboardCover({ ime: 300, rest: 780, inner: 200 })).toBe(0);
  });
});

describe("the token the layout reads", () => {
  it("carries the inset on a WebView that leaves the page alone", () => {
    const win = fakeWindow();
    const stop = installKeyboard({ root, win });

    ime(300);

    expect(keyboard()).toBe("300px");
    stop();
  });

  it("carries nothing on a WebView that shrinks the page itself", () => {
    const win = fakeWindow();
    const stop = installKeyboard({ root, win });

    // The inset lands first and the resize follows, which is the order a real
    // WebView reports them in — the token must settle on the second.
    ime(300);
    win.innerHeight = 480;
    win.fire("resize");

    expect(keyboard()).toBe("0px");
    stop();
  });

  it("goes back to nothing when the keyboard does", () => {
    const win = fakeWindow();
    const stop = installKeyboard({ root, win });

    ime(300);
    ime(0);

    expect(keyboard()).toBe("0px");
    stop();
  });

  it("follows the page being panned under a shrunken viewport", () => {
    const win = fakeWindow();
    const stop = installKeyboard({ root, win });

    ime(300);
    win.visualViewport.height = 480;
    win.fire("resize");
    win.visualViewport.offsetTop = 100;
    win.fire("scroll");

    expect(keyboard()).toBe("200px");
    stop();
  });

  it("stops listening when uninstalled", () => {
    const win = fakeWindow();
    installKeyboard({ root, win })();

    ime(300);

    expect(keyboard()).toBe("0px");
  });

  it("takes a fresh rest height when the keyboard is down", () => {
    const win = fakeWindow();
    const stop = installKeyboard({ root, win });

    // The window itself got shorter — a split screen, a bar that appeared.
    win.innerHeight = 700;
    win.fire("resize");
    ime(300);

    expect(keyboard()).toBe("300px");
    stop();
  });
});
