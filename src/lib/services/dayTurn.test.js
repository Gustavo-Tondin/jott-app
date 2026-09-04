import { describe, expect, test } from "vitest";
import { offsetOf, turnMeaning, turnTimeOf } from "./dayTurn.js";

describe("the turn of the day, as a clock time", () => {
  test("an offset reads as the hour it lands on", () => {
    expect(turnTimeOf("00:00")).toBe("00:00");
    expect(turnTimeOf("-02:00")).toBe("22:00");
    expect(turnTimeOf("-03:00")).toBe("21:00");
    expect(turnTimeOf("+02:00")).toBe("02:00");
    expect(turnTimeOf("02:30")).toBe("02:30");
    // Set by hand past noon: shown as the hour it names, and flagged.
    expect(turnTimeOf("21:00")).toBe("21:00");
    expect(turnTimeOf("banana")).toBe("00:00");
  });

  test("a time becomes the offset the file keeps, evening or night", () => {
    expect(offsetOf("22:00")).toBe("-02:00");
    expect(offsetOf("21:00")).toBe("-03:00");
    expect(offsetOf("12:00")).toBe("-12:00");
    expect(offsetOf("02:00")).toBe("+02:00");
    expect(offsetOf("11:59")).toBe("+11:59");
    expect(offsetOf("00:00")).toBe("00:00");
    expect(offsetOf("25:00")).toBe("00:00");
  });

  test("the two translate back and forth", () => {
    for (const time of ["00:00", "02:00", "11:59", "12:00", "21:00", "23:59"]) {
      expect(turnTimeOf(offsetOf(time))).toBe(time);
    }
  });

  test("the meaning names which of the three a person is in", () => {
    expect(turnMeaning("00:00")).toBe("midnight");
    expect(turnMeaning("-03:00")).toBe("evening");
    expect(turnMeaning("+02:00")).toBe("night");
    // The hand-set offset that made the app say yesterday until the evening.
    expect(turnMeaning("21:00")).toBe("late");
    expect(turnMeaning("")).toBe("midnight");
  });
});
