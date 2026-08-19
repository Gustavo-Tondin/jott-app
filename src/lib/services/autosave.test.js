// The auto-save engine's rules, tested without a component around them —
// they are exactly the rules a copy of the engine used to lose.

import { describe, expect, test, vi } from "vitest";
import { autosave } from "./autosave.js";

const engine = (write, delay = 50) => {
  const errors = [];
  const saver = autosave({ delay, write, onError: (e) => errors.push(e) });
  return { saver, errors };
};

describe("autosave", () => {
  test("debounces: only the last edit within the delay is written", async () => {
    vi.useFakeTimers();
    const writes = [];
    const { saver } = engine(async (_t, value) => writes.push(value));
    saver.open({ doc: 1 }, "a");

    saver.edit("ab", "ab");
    saver.edit("abc", "abc");
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    expect(writes).toEqual(["abc"]);
    expect(saver.dirty("abc")).toBe(false);
  });

  test("flush sends what is waiting without the timer", async () => {
    vi.useFakeTimers();
    const writes = [];
    const { saver } = engine(async (_t, value) => writes.push(value));
    saver.open({ doc: 1 }, "a");

    saver.edit("ab", "ab");
    await saver.flush();
    vi.useRealTimers();

    expect(writes).toEqual(["ab"]);
  });

  test("a write lands on the document it was typed into, not the one open now", async () => {
    // Opening another document flushes first — the engine reads the target
    // synchronously, before `open` replaces it.
    const writes = [];
    const first = { doc: 1 };
    const { saver } = engine(async (target, value) => writes.push([target, value]));
    saver.open(first, "a");

    saver.edit("ab", "ab");
    saver.open({ doc: 2 }, "x");
    await Promise.resolve();

    expect(writes).toEqual([[first, "ab"]]);
  });

  test("a failed write is retried by the next edit, never counted as saved", async () => {
    const { saver, errors } = engine(async () => {
      throw new Error("disk full");
    });
    saver.open({ doc: 1 }, "a");

    saver.edit("ab", "ab");
    await saver.flush();

    expect(errors).toHaveLength(1);
    // The baseline did not advance: the same snapshot still reads as dirty.
    expect(saver.dirty("ab")).toBe(true);
  });

  test("marking a write done cannot swallow what was typed meanwhile", async () => {
    // The snapshot rides with the value it was taken from: after the slow
    // write of "ab" lands, "abc" — typed while it was in flight — must still
    // read as unsaved.
    let release;
    // A delay far beyond the test, so the second edit is still pending when
    // the first write lands — the moment under test.
    const { saver } = engine(() => new Promise((r) => (release = r)), 10_000);
    saver.open({ doc: 1 }, "a");

    saver.edit("ab", "ab");
    const inFlight = saver.flush();
    saver.edit("abc", "abc");
    release();
    await inFlight;

    expect(saver.dirty("abc")).toBe(true);
  });
});
