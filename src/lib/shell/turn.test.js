import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MAX_WAIT, MIN_WAIT, scheduleTurns, waitUntilTurn } from "./turn.js";

const clock = (daily, weekly = "2026-07-27T00:00:00Z") => ({
  nextDailyTurn: daily,
  nextWeeklyTurn: weekly,
});

describe("waitUntilTurn", () => {
  const now = new Date("2026-07-21T23:00:00Z").getTime();

  test("waits for the earlier of the two turns", () => {
    expect(waitUntilTurn(clock("2026-07-22T00:00:00Z"), now)).toBe(60 * 60 * 1000);
    expect(waitUntilTurn(clock("2026-07-23T00:00:00Z", "2026-07-21T23:30:00Z"), now)).toBe(
      30 * 60 * 1000,
    );
  });

  test("a turn already past still waits a beat", () => {
    expect(waitUntilTurn(clock("2026-07-21T00:00:00Z"), now)).toBe(MIN_WAIT);
  });

  test("a turn far away is capped, so a sleeping machine catches up", () => {
    expect(waitUntilTurn(clock("2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z"), now)).toBe(
      MAX_WAIT,
    );
  });
});

describe("scheduleTurns", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T23:59:30Z"));
  });
  afterEach(() => vi.useRealTimers());

  test("ticks at the turn, then re-arms from the clock the tick left", async () => {
    let current = clock("2026-07-22T00:00:00Z");
    const tick = vi.fn(async () => {
      current = clock("2026-07-23T00:00:00Z");
    });
    const stop = scheduleTurns({ clock: () => current, tick });

    expect(tick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(tick).toHaveBeenCalledTimes(1);
    // The next wake-up is the capped hour, not the whole day.
    await vi.advanceTimersByTimeAsync(MAX_WAIT - 1);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
  });

  test("a failing tick reaches onError and the next wait is still armed", async () => {
    const errors = [];
    const tick = vi.fn(() => Promise.reject(new Error("offline")));
    const stop = scheduleTurns({
      clock: () => clock("2026-07-22T00:00:00Z"),
      tick,
      onError: (e) => errors.push(e.message),
    });
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(errors).toEqual(["offline"]);
    await vi.advanceTimersByTimeAsync(MIN_WAIT);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
  });

  test("stop cancels the pending wake-up, and the one a tick would arm", async () => {
    const tick = vi.fn(async () => {});
    const stop = scheduleTurns({ clock: () => clock("2026-07-22T00:00:00Z"), tick });
    stop();
    await vi.advanceTimersByTimeAsync(MAX_WAIT * 2);
    expect(tick).not.toHaveBeenCalled();
  });

  test("with no clock yet there is nothing to schedule", () => {
    const stop = scheduleTurns({ clock: () => null, tick: vi.fn() });
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });
});
