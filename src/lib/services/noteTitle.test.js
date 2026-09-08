import { describe, expect, test } from "vitest";
import { isUntitled } from "./noteTitle.js";

describe("isUntitled", () => {
  test("the name the app gives, numbered or not", () => {
    // `fsio::free_name` files the second one as "New note 2".
    expect(isUntitled("New note")).toBe(true);
    expect(isUntitled("New note 2")).toBe(true);
    expect(isUntitled("New note 17")).toBe(true);
  });

  test("a name of the user's own, however close", () => {
    expect(isUntitled("Ideia")).toBe(false);
    expect(isUntitled("New notebook")).toBe(false);
    expect(isUntitled("New note about the logo")).toBe(false);
    expect(isUntitled("Another new note")).toBe(false);
  });

  test("nothing at all reads as untitled", () => {
    expect(isUntitled("")).toBe(true);
    expect(isUntitled(null)).toBe(true);
    expect(isUntitled(undefined)).toBe(true);
  });
});
