import { describe, expect, test } from "vitest";
import { boundedWait, MAX_WAIT, MIN_WAIT } from "./wait.js";

describe("boundedWait", () => {
  test("a moment past still waits a beat, and no wait passes an hour", () => {
    expect(boundedWait(-5000)).toBe(MIN_WAIT);
    expect(boundedWait(90 * 1000)).toBe(90 * 1000);
    expect(boundedWait(3 * MAX_WAIT)).toBe(MAX_WAIT);
  });
});
