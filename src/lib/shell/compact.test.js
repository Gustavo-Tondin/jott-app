import { describe, expect, it, vi } from "vitest";
import { COMPACT_MAX_WIDTH, COMPACT_QUERY, watchCompact } from "./compact.js";

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
