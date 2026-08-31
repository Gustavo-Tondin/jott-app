import { describe, expect, it, vi } from "vitest";
import {
  COMPACT_MAX_HEIGHT,
  COMPACT_MAX_WIDTH,
  COMPACT_QUERY,
  watchCompact,
} from "./compact.js";

/// A MediaQueryList stand-in that can flip and notify, in both spellings.
function fakeMedia({ matches = false, legacy = false } = {}) {
  const listeners = new Set();
  const query = {
    matches,
    set(next) {
      query.matches = next;
      for (const listener of listeners) listener();
    },
  };
  if (legacy) {
    query.addListener = (fn) => listeners.add(fn);
    query.removeListener = (fn) => listeners.delete(fn);
  } else {
    query.addEventListener = (_, fn) => listeners.add(fn);
    query.removeEventListener = (_, fn) => listeners.delete(fn);
  }
  return query;
}

describe("the breakpoint", () => {
  it("is stated once, in px, and the query is built from it", () => {
    expect(COMPACT_QUERY).toBe(`(max-width: ${COMPACT_MAX_WIDTH}px)`);
    expect(COMPACT_MAX_WIDTH).toBe(767);
    expect(COMPACT_MAX_HEIGHT).toBe(540);
  });
});

// The phone on its side is 780×360 (the emulator's 1080×2340 at 480dpi),
// which is PAST the width breakpoint — so before this it was handed the
// desktop shell: a permanent sidebar and a docked panel beside a canvas 360px
// tall (user report on device, 2026-08-31).
describe("a screen too short for three columns", () => {
  const wide = { matches: false, addEventListener() {}, removeEventListener() {} };

  const on = (height) => {
    const seen = [];
    watchCompact((v) => seen.push(v), {
      matchMedia: () => wide,
      screen: height === undefined ? undefined : { height },
      addEventListener() {},
      removeEventListener() {},
    });
    return seen[0];
  };

  it("is compact even when the window is wide", () => {
    expect(on(360)).toBe(true); // phone, lying down
  });

  it("leaves a tablet and a laptop alone", () => {
    expect(on(768)).toBe(false); // tablet, lying down
    expect(on(1440)).toBe(false); // a monitor
  });

  // The lesson of shell/keyboard.js, in the one place it can be tested here:
  // the answer must come from the SCREEN, which no keyboard can shrink. An
  // engine that will not say how tall the screen is keeps the full shell.
  it("does not call an unknown screen short", () => {
    expect(on(undefined)).toBe(false);
    expect(on(0)).toBe(false);
  });
});

describe("watchCompact", () => {
  it("answers immediately, then on every change", () => {
    const query = fakeMedia({ matches: true });
    const seen = [];
    watchCompact((v) => seen.push(v), { matchMedia: () => query });
    expect(seen).toEqual([true]);
    query.set(false);
    query.set(true);
    expect(seen).toEqual([true, false, true]);
  });

  it("stops listening once unsubscribed", () => {
    const query = fakeMedia();
    const onChange = vi.fn();
    const stop = watchCompact(onChange, { matchMedia: () => query });
    stop();
    query.set(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("uses the pre-2019 spelling when that is all there is", () => {
    const query = fakeMedia({ legacy: true });
    const seen = [];
    const stop = watchCompact((v) => seen.push(v), { matchMedia: () => query });
    query.set(true);
    expect(seen).toEqual([false, true]);
    stop();
    query.set(false);
    expect(seen).toEqual([false, true]);
  });

  // The full shell works at any width, only cramped; the drawer at 1200px is
  // a broken app. So an environment that cannot answer gets the safe one.
  it("answers not-compact where matchMedia does not exist", () => {
    const onChange = vi.fn();
    const stop = watchCompact(onChange, {});
    expect(onChange).toHaveBeenCalledWith(false);
    expect(() => stop()).not.toThrow();
  });
});
