import { describe, expect, test } from "vitest";
import {
  NAMED,
  firstReminderOn,
  nextSummaryAt,
  summaryAt,
  summaryNotice,
} from "./daySummary.js";
import { S } from "./strings.js";

const rows = (...texts) => texts.map((text) => ({ task: { text, done: false } }));

describe("when it lands next", () => {
  test("the next summary is today's while its hour is ahead, else tomorrow's", () => {
    expect(nextSummaryAt({ now: new Date(2026, 8, 8, 7, 30), time: "08:00" })).toEqual(new Date(2026, 8, 8, 8, 0));
    // Past the hour, the day the alarm is about is tomorrow — the day the
    // phone's summary has to list.
    expect(nextSummaryAt({ now: new Date(2026, 8, 8, 10, 0), time: "08:00" })).toEqual(new Date(2026, 8, 9, 8, 0));
  });

  test("tomorrow's once today's was announced", () => {
    const now = new Date(2026, 8, 8, 7, 30);
    expect(nextSummaryAt({ now, time: "08:00", shownOn: "2026-09-08" })).toEqual(new Date(2026, 8, 9, 8, 0));
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

  test("the summary names the first reminder of the day", () => {
    const said = summaryNotice(rows("Aluguel"), S, { firstReminder: "18:30" });
    expect(said.body).toBe("• Aluguel\nFirst reminder at 18:30");
    expect(summaryNotice(rows("Aluguel"), S, { planned: true }).title).toBe(
      "You have 1 task planned for today",
    );
  });

  test("the first reminder is the first on the summary's day still ahead of it", () => {
    const list = [
      { at: "2026-09-08T07:00" },
      { at: "2026-09-09T07:00" },
      { at: "2026-09-09T12:30" },
    ];
    expect(firstReminderOn(list, new Date(2026, 8, 9, 8, 0))).toBe("12:30");
    expect(firstReminderOn(list, new Date(2026, 8, 10, 8, 0))).toBe(null);
  });

  test("an empty day is worth no notification", () => {
    expect(summaryNotice([], S)).toBe(null);
    expect(summaryNotice(null, S)).toBe(null);
  });
});
