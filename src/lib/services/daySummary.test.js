import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  MAX_WAIT,
  NAMED,
  summaryAt,
  summaryDue,
  summaryNotice,
  waitUntilSummary,
} from "./daySummary.js";
import { S } from "./strings.js";

const rows = (...texts) => texts.map((text) => ({ task: { text, done: false } }));

describe("when the summary is due", () => {
  const now = new Date(2026, 8, 8, 9, 0); // 2026-09-08, 09:00

  test("after the hour, once a day", () => {
    expect(summaryDue({ now, time: "08:00", shownOn: null })).toBe(true);
    expect(summaryDue({ now, time: "08:00", shownOn: "2026-09-08" })).toBe(false);
    // Yesterday's mark says nothing about today.
    expect(summaryDue({ now, time: "08:00", shownOn: "2026-09-07" })).toBe(true);
  });

  test("never before the hour", () => {
    expect(summaryDue({ now, time: "10:00", shownOn: null })).toBe(false);
  });

  test("a launch after the hour still gets today's", () => {
    // The summary is about a DAY: unlike a reminder it cannot be "missed" by
    // an hour, so opening the app at 23:00 still announces today.
    expect(summaryDue({ now: new Date(2026, 8, 8, 23, 0), time: "08:00", shownOn: null })).toBe(
      true,
    );
  });
});

describe("when it wakes up next", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("today's hour while it is still ahead, and never longer than the cap", () => {
    const now = new Date(2026, 8, 8, 7, 30);
    expect(waitUntilSummary({ now, time: "08:00", shownOn: null })).toBe(30 * 60 * 1000);
    // Tomorrow is more than an hour away: the cap keeps a clock jump or a
    // long sleep from swallowing the day.
    expect(waitUntilSummary({ now, time: "08:00", shownOn: "2026-09-08" })).toBe(MAX_WAIT);
  });

  test("tomorrow's once today's was announced", () => {
    const now = new Date(2026, 8, 8, 23, 30);
    const wait = waitUntilSummary({ now, time: "08:00", shownOn: "2026-09-08" });
    expect(new Date(now.getTime() + wait).getDate()).toBe(9);
    expect(summaryAt("2026-09-09", "08:00").getHours()).toBe(8);
  });
});

describe("what it says", () => {
  test("the count, then the tasks by name", () => {
    const said = summaryNotice(rows("Pagar aluguel", "Ligar pro dentista"), S);
    expect(said.title).toBe("You have 2 tasks today");
    expect(said.body).toBe("• Pagar aluguel\n• Ligar pro dentista");
  });

  test("past a handful the count carries the rest", () => {
    const said = summaryNotice(rows(...Array.from({ length: NAMED + 2 }, (_, i) => `T${i}`)), S);
    expect(said.body.split("\n")).toHaveLength(NAMED + 1);
    expect(said.body).toContain("…and 2 more");
  });

  test("a completed task is not part of the day's load", () => {
    const day = [...rows("Aberta"), { task: { text: "Feita", done: true } }];
    expect(summaryNotice(day, S).title).toBe("You have 1 task today");
  });

  test("an empty day is worth no notification", () => {
    expect(summaryNotice([], S)).toBe(null);
    expect(summaryNotice(null, S)).toBe(null);
  });
});
