// The two rules the field vocabulary carries — both were written twice before
// this module existed, which is exactly how two copies of a rule drift.

import { describe, expect, test } from "vitest";
import {
  PRIORITIES,
  REPEAT_MAX,
  REPEAT_UNITS,
  cleanTagName,
  repeatCounted,
  repeatCounts,
  repeatText,
} from "./taskFields.js";

describe("repeatText", () => {
  test("builds only what the core can parse", () => {
    // The core drops a `repeat:` it cannot read, so an invalid one must never
    // be expressible — which is why neither control lets one be typed.
    expect(repeatText({ repeatUnit: "", repeatEvery: 3 })).toBeNull();
    expect(repeatText({ repeatUnit: "week", repeatEvery: 1 })).toBe("every-week");
    expect(repeatText({ repeatUnit: "day", repeatEvery: 3 })).toBe("every-3-days");
    // Nonsense in the number falls back to 1 rather than writing "every-NaN".
    expect(repeatText({ repeatUnit: "month", repeatEvery: "" })).toBe("every-month");
    expect(repeatText({ repeatUnit: "month", repeatEvery: 0 })).toBe("every-month");
  });

  test("reads a composer intent and an inspector draft alike", () => {
    // The whole reason it lives here: the two are the same two fields.
    expect(repeatText({ repeatUnit: "day", repeatEvery: 2 })).toBe("every-2-days");
    expect(repeatText(null)).toBeNull();
  });
});

describe("cleanTagName", () => {
  test("a tag can never carry a space or a leading hash", () => {
    // A loose word on the metadata line stops it from being all-tokens, and
    // the whole line is re-read as a description — the fields go with it.
    expect(cleanTagName("  #Casa  ")).toBe("Casa");
    expect(cleanTagName("lista de compras")).toBe("lista-de-compras");
    expect(cleanTagName("##a  b")).toBe("a-b");
    expect(cleanTagName("")).toBe("");
    expect(cleanTagName(null)).toBe("");
  });
});

describe("the option tables", () => {
  test("priority values are what the file stores, loudest first at 1", () => {
    expect(PRIORITIES.map((p) => p.value)).toEqual(["", "3", "2", "1"]);
  });

  test("the empty repeat unit is 'it does not repeat'", () => {
    expect(REPEAT_UNITS[0].value).toBe("");
    expect(REPEAT_UNITS.map((u) => u.value)).toEqual(["", "free", "day", "week", "month"]);
  });

  test("only a periodic unit is counted", () => {
    // "every 3 freely" is not a thing: the counter and the word "every" go.
    expect(repeatCounted("week")).toBe(true);
    expect(repeatCounted("free")).toBe(false);
    expect(repeatCounted("")).toBe(false);
  });
});

describe("the value the file gets", () => {
  test("freely is written as itself, with no count", () => {
    expect(repeatText({ repeatUnit: "free", repeatEvery: 3 })).toBe("freely");
  });
});

describe("the counts the repeat selector offers", () => {
  test("counts from 1 to the ceiling", () => {
    const counts = repeatCounts(1);
    expect(counts[0]).toBe(1);
    expect(counts.at(-1)).toBe(REPEAT_MAX);
    expect(counts.length).toBe(REPEAT_MAX);
  });

  test("folds in a value the list does not have, in its place", () => {
    // A file may say `repeat:45d` — typed by hand, or written by a build that
    // offered more. A selector that cannot say 45 would show the field blank
    // and quietly save a different task the next time it was touched.
    const counts = repeatCounts(45);
    expect(counts.at(-1)).toBe(45);
    expect(counts.length).toBe(REPEAT_MAX + 1);
  });

  test("ignores a value that is not a count", () => {
    for (const odd of [0, -3, 1.5, "", null, "many"])
      expect(repeatCounts(odd).length).toBe(REPEAT_MAX);
  });
});
