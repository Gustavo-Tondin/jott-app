// How many open tasks a place holds.

import { describe, expect, test } from "vitest";
import { openIn } from "./counts.js";

describe("openIn", () => {
  const counts = {
    "jott.tasks/Inbox.md": 3,
    "jott.tasks/Compras.md": 2,
    "Design/Tasks/Inbox.md": 5,
    // The trap this function exists for: a space whose path STARTS with
    // another's. A prefix match would fold this into the one above.
    "Design/Tasks Old/Inbox.md": 9,
  };

  test("adds up the lists that sit directly in the folder", () => {
    expect(openIn(counts, "jott.tasks")).toBe(5);
    expect(openIn(counts, "Design/Tasks")).toBe(5);
    expect(openIn(counts, "Design/Tasks Old")).toBe(9);
  });

  test("a place with no lists is zero, not a crash", () => {
    expect(openIn(counts, "Notas")).toBe(0);
    expect(openIn(counts, "")).toBe(0);
    expect(openIn(counts, null)).toBe(0);
  });

  test("counters switched off answer empty, and everything is zero", () => {
    // `commands::counts_of` returns `{}` rather than nothing at all, so no
    // caller has to know the preference exists.
    expect(openIn({}, "jott.tasks")).toBe(0);
    expect(openIn(undefined, "jott.tasks")).toBe(0);
  });
});
