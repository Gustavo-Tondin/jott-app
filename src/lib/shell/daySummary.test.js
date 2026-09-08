import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { scheduleDaySummary } from "./daySummary.js";
import { MAX_WAIT } from "../services/daySummary.js";

describe("scheduleDaySummary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 8, 7, 30));
  });
  afterEach(() => vi.useRealTimers());

  test("announces at the hour, once, then waits for tomorrow's", async () => {
    let shownOn = null;
    const days = [];
    scheduleDaySummary({
      time: () => "08:00",
      shownOn: () => shownOn,
      announce: async (now) => {
        days.push(now.getDate());
        shownOn = "2026-09-08";
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(days).toEqual([]);

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(days).toEqual([8]);

    // The rest of the day is quiet: the mark says today is done.
    await vi.advanceTimersByTimeAsync(10 * 60 * 60 * 1000);
    expect(days).toEqual([8]);
  });

  test("a launch after the hour announces the day it opens on", async () => {
    vi.setSystemTime(new Date(2026, 8, 8, 22, 0));
    const days = [];
    scheduleDaySummary({
      time: () => "08:00",
      shownOn: () => null,
      announce: async (now) => days.push(now.getDate()),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(days).toEqual([8]);
  });

  test("a failed announcement is reported and the next one is still armed", async () => {
    const onError = vi.fn();
    scheduleDaySummary({
      time: () => "08:00",
      shownOn: () => null,
      announce: async () => {
        throw new Error("no notification permission");
      },
      onError,
    });
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(onError).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });

  test("stop cancels the wake-up, and no hour means the long wait", async () => {
    const announce = vi.fn();
    const loop = scheduleDaySummary({ time: () => "", shownOn: () => null, announce });
    await vi.advanceTimersByTimeAsync(0);
    expect(announce).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(MAX_WAIT - 1);
    loop.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
