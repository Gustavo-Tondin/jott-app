import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { scheduleReminders } from "./reminders.js";
import { MAX_WAIT } from "../services/reminders.js";

const at = (id, when) => ({ list: "L", id, position: 0, text: id, at: when, auto: false });

describe("scheduleReminders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 22, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  test("rings what is due, remembers up to now, then waits for the next", async () => {
    let until = "2026-07-22T09:00";
    const rung = [];
    const list = [at("a", "2026-07-22T09:30"), at("b", "2026-07-22T10:30")];
    const s = scheduleReminders({
      list: () => list,
      until: () => until,
      ring: async (due, now) => {
        rung.push(...due.map((r) => r.id));
        until = now;
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(rung).toEqual(["a"]);

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(rung).toEqual(["a", "b"]);
    s.stop();
  });

  test("an edit re-arms: a reminder added for sooner rings on time", async () => {
    let list = [at("far", "2026-07-22T18:00")];
    const rung = [];
    const s = scheduleReminders({
      list: () => list,
      until: () => "2026-07-22T09:00",
      ring: async (due) => rung.push(...due.map((r) => r.id)),
    });
    await vi.advanceTimersByTimeAsync(0);
    list = [at("soon", "2026-07-22T10:05"), ...list];
    s.rearm();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(rung).toEqual(["soon"]);
    s.stop();
  });

  test("with nothing ahead it still wakes hourly, and stop ends it", async () => {
    let asked = 0;
    const s = scheduleReminders({
      list: () => (asked++, []),
      until: () => null,
      ring: async () => {},
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(MAX_WAIT);
    expect(asked).toBe(2);
    s.stop();
    await vi.advanceTimersByTimeAsync(MAX_WAIT * 2);
    expect(asked).toBe(2);
  });

  test("a ring that throws is reported and the loop goes on", async () => {
    const errors = [];
    const s = scheduleReminders({
      list: () => [at("a", "2026-07-22T09:30")],
      until: () => "2026-07-22T09:00",
      ring: async () => {
        throw new Error("no bell");
      },
      onError: (e) => errors.push(e.message),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toEqual(["no bell"]);
    s.stop();
  });
});
