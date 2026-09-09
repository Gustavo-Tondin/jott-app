// The instrument itself: off is free and silent, on says what it measured.

import { describe, expect, it, vi } from "vitest";
import { EDITOR_SLOW_MS, FRAME_GAP_MS, flagged, makePerf } from "./perf.js";

/// A clock the test advances, a log it reads, and a frame scheduler it drives.
function bench() {
  let t = 1000;
  const lines = [];
  const frames = [];
  const perf = makePerf({
    now: () => t,
    log: (line) => lines.push(line),
    frame: (fn) => frames.push(fn),
  });
  const advance = (ms) => (t += ms);
  const nextFrame = () => frames.shift()?.();
  return { perf, lines, advance, nextFrame, frames };
}

describe("perf", () => {
  it("is off until asked, and off costs nothing to the call sites", async () => {
    const { perf, lines, advance } = bench();
    expect(perf.on).toBe(false);
    const started = perf.start();
    expect(started).toBe(0);
    advance(500);
    perf.invoke("notebook_snapshot", started);
    perf.editor(started, true);
    expect(await perf.boot(() => false)).toBe(false);
    expect(perf.on).toBe(false);
    expect(lines).toEqual([]);
  });

  it("switches on from the bridge's answer, and says so once", async () => {
    const { perf, lines } = bench();
    expect(await perf.boot(async () => true)).toBe(true);
    expect(perf.on).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[perf\] on/);
  });

  it("switches on from the page's address without asking the bridge", async () => {
    const ask = vi.fn(async () => false);
    const perf = makePerf({ now: () => 0, log: () => {}, frame: undefined, flag: () => true });
    expect(await perf.boot(ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it("reads the flag as `?perf=1`, and nothing else", () => {
    expect(flagged("?perf=1")).toBe(true);
    expect(flagged("?kind=picker&perf=1")).toBe(true);
    expect(flagged("?perf=0")).toBe(false);
    expect(flagged("?perf")).toBe(false);
    expect(flagged("")).toBe(false);
  });

  it("a bridge that fails to answer is 'not asked'", async () => {
    const { perf } = bench();
    expect(await perf.boot(() => Promise.reject(new Error("no bridge")))).toBe(false);
  });

  it("reports every bridge call by name and duration", async () => {
    const { perf, lines, advance } = bench();
    await perf.boot(() => true);
    const started = perf.start();
    advance(12.34);
    perf.invoke("set_task_fields", started);
    expect(lines.at(-1)).toBe("[perf] invoke set_task_fields 12.3ms");
  });

  it("reports an editor update only over the threshold, and says what moved", async () => {
    const { perf, lines, advance } = bench();
    await perf.boot(() => true);
    const quiet = lines.length;

    let started = perf.start();
    advance(EDITOR_SLOW_MS);
    perf.editor(started, true);
    expect(lines).toHaveLength(quiet);

    started = perf.start();
    advance(EDITOR_SLOW_MS + 1);
    perf.editor(started, true);
    expect(lines.at(-1)).toBe(`[perf] editor doc ${(EDITOR_SLOW_MS + 1).toFixed(1)}ms`);

    started = perf.start();
    advance(20);
    perf.editor(started, false);
    expect(lines.at(-1)).toBe("[perf] editor view 20.0ms");
  });

  it("watches the frames once on, and reports only a gap", async () => {
    const { perf, lines, advance, nextFrame, frames } = bench();
    await perf.boot(() => true);
    expect(frames).toHaveLength(1);

    advance(16);
    nextFrame();
    advance(FRAME_GAP_MS);
    nextFrame();
    expect(lines.filter((l) => l.includes("frame-gap"))).toEqual([]);

    advance(FRAME_GAP_MS + 8);
    nextFrame();
    expect(lines.at(-1)).toBe(`[perf] frame-gap ${(FRAME_GAP_MS + 8).toFixed(1)}ms`);
    // The watch keeps itself scheduled.
    expect(frames).toHaveLength(1);
  });

  it("does not watch the frames where there is no scheduler", async () => {
    const lines = [];
    const perf = makePerf({ now: () => 0, log: (l) => lines.push(l), frame: undefined });
    await expect(perf.boot(() => true)).resolves.toBe(true);
  });
});
