import { describe, expect, test } from "vitest";
import { clamp } from "./num.js";

describe("clamp", () => {
  test("holds a value between the two bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  test("a value on a bound is that bound", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});
