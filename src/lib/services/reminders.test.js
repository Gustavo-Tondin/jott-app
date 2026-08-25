import { describe, expect, test } from "vitest";
import {
  dueNow,
  formatAt,
  joinAt,
  nextAfter,
  normalizeAt,
  parseAt,
  presets,
  splitAt,
  toAt,
  waitUntil,
  MAX_WAIT,
  MIN_WAIT,
} from "./reminders.js";

const at = (list, id, when) => ({ list, id, position: 0, text: id, at: when, auto: false });

describe("the moment's shape", () => {
  test("round-trips the file's form and drops the bridge's seconds", () => {
    expect(toAt(parseAt("2026-07-25T09:05"))).toBe("2026-07-25T09:05");
    expect(normalizeAt("2026-07-25T09:05:00")).toBe("2026-07-25T09:05");
    expect(normalizeAt("")).toBe("");
    expect(splitAt("2026-07-25T09:05")).toEqual({ date: "2026-07-25", time: "09:05" });
    expect(joinAt("2026-07-25", "09:05")).toBe("2026-07-25T09:05");
    expect(joinAt("2026-07-25", "")).toBe("");
  });

  test("reads like the notebook's dates, then the time", () => {
    expect(formatAt("2026-07-25T09:05", "dd/mm/yyyy")).toBe("25/07/2026 09:05");
    expect(formatAt("")).toBe("");
  });
});

describe("presets", () => {
  const now = new Date(2026, 6, 22, 10, 20); // a Wednesday

  test("later today is three hours on, on the hour", () => {
    const list = presets({ now, time: "09:00" });
    expect(list.find((p) => p.id === "laterToday").at).toBe("2026-07-22T13:00");
  });

  test("later today is not offered when it would be tomorrow", () => {
    const late = new Date(2026, 6, 22, 22, 30);
    expect(presets({ now: late }).map((p) => p.id)).not.toContain("laterToday");
  });

  test("tomorrow and next week land on the reminder time", () => {
    const list = presets({ now, time: "07:30" });
    expect(list.find((p) => p.id === "tomorrow").at).toBe("2026-07-23T07:30");
    expect(list.find((p) => p.id === "nextWeek").at).toBe("2026-07-27T07:30");
  });

  test("next week from a Monday is the Monday after", () => {
    const monday = new Date(2026, 6, 27, 9, 0);
    expect(presets({ now: monday }).find((p) => p.id === "nextWeek").at).toBe("2026-08-03T09:00");
  });

  test("on the due date only for a dated task still ahead", () => {
    expect(presets({ now, due: "2026-08-01" }).find((p) => p.id === "onDue").at).toBe(
      "2026-08-01T09:00",
    );
    expect(presets({ now, due: "" }).map((p) => p.id)).not.toContain("onDue");
    expect(presets({ now, due: "2026-07-01" }).map((p) => p.id)).not.toContain("onDue");
  });
});

describe("what is due", () => {
  const list = [
    at("L", "a", "2026-07-22T08:00"),
    at("L", "b", "2026-07-22T10:00"),
    at("L", "c", "2026-07-22T10:20"),
    at("L", "d", "2026-07-22T11:00"),
  ];
  const now = new Date(2026, 6, 22, 10, 20);

  test("nothing from the past rings on a machine that never rang", () => {
    expect(dueNow(list, { now, until: null })).toEqual([]);
  });

  test("everything between the last ring and now rings once", () => {
    const due = dueNow(list, { now, until: "2026-07-22T08:00" });
    expect(due.map((r) => r.id)).toEqual(["b", "c"]);
  });

  test("the next one is the first still ahead", () => {
    expect(nextAfter(list, now).id).toBe("d");
    expect(nextAfter(list, new Date(2026, 6, 22, 12, 0))).toBeNull();
  });

  test("the wait is bounded on both sides", () => {
    expect(waitUntil("2026-07-22T10:21", now)).toBe(60 * 1000);
    expect(waitUntil("2026-07-22T10:00", now)).toBe(MIN_WAIT);
    expect(waitUntil("2026-08-22T10:00", now)).toBe(MAX_WAIT);
  });
});
