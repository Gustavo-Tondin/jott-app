import { describe, expect, test } from "vitest";
import {
  addDays,
  dayKind,
  dayOfMonth,
  greetingFor,
  monthOf,
  summaryOf,
  weekOf,
  weekdayLetter,
  weekdayName,
  weekdayShort,
} from "./calendar.js";

describe("the calendar strip's arithmetic", () => {
  test("a week holds seven days from the configured first one", () => {
    // 2026-09-03 is a Thursday.
    expect(weekOf("2026-09-03", "sunday")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
    expect(weekOf("2026-09-03", "monday")[0]).toBe("2026-08-31");
    expect(weekOf("2026-09-03", "monday")[6]).toBe("2026-09-06");
    // A Sunday on a Monday-first week is the LAST day, not the first.
    expect(weekOf("2026-09-06", "monday")[0]).toBe("2026-08-31");
    expect(weekOf("2026-09-06", "sunday")[0]).toBe("2026-09-06");
  });

  test("days shift across month and year ends", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-09-03", 7)).toBe("2026-09-10");
    expect(addDays("nope", 1)).toBe("nope");
  });

  test("names come from the strings, by the calendar", () => {
    expect(weekdayShort("2026-09-03")).toBe("Th");
    expect(weekdayLetter("2026-09-03")).toBe("T");
    expect(weekdayName("2026-09-03")).toBe("Thursday");
    expect(monthOf("2026-09-03")).toBe("September");
    expect(dayOfMonth("2026-09-03")).toBe("3");
    expect(weekdayShort("")).toBe("");
    expect(weekOf("")).toEqual([]);
  });

  test("a day is past, today or ahead against the notebook's today", () => {
    expect(dayKind("2026-09-03", "2026-09-03")).toBe("today");
    expect(dayKind(null, "2026-09-03")).toBe("today");
    expect(dayKind("2026-09-02", "2026-09-03")).toBe("past");
    expect(dayKind("2026-09-04", "2026-09-03")).toBe("ahead");
  });

  test("the greeting follows the hour", () => {
    expect(greetingFor(0)).toBe("Good morning");
    expect(greetingFor(11)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(17)).toBe("Good afternoon");
    expect(greetingFor(18)).toBe("Good evening");
    expect(greetingFor(23)).toBe("Good evening");
  });

  test("the summary reads differently for each kind of day", () => {
    expect(summaryOf({ kind: "today", done: 2, total: 5 })).toBe("2 of 5 tasks completed.");
    expect(summaryOf({ kind: "today", done: 1, total: 1 })).toBe("1 of 1 task completed.");
    expect(summaryOf({ kind: "today" })).toBe("0 of 0 tasks completed.");
    expect(summaryOf({ kind: "ahead", total: 3 })).toBe("3 tasks planned.");
    expect(summaryOf({ kind: "ahead", total: 1 })).toBe("1 task planned.");
    expect(summaryOf({ kind: "past", done: 4, created: 2, notes: 3 })).toBe(
      "4 tasks completed, 2 tasks created, 3 notes created.",
    );
    expect(summaryOf({ kind: "past", done: 1, created: 1, notes: 1 })).toBe(
      "1 task completed, 1 task created, 1 note created.",
    );
    expect(summaryOf({ kind: "past" })).toBe("0 tasks completed, 0 tasks created, 0 notes created.");
  });
});
