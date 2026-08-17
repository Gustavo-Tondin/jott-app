// The two rules the field vocabulary carries — both were written twice before
// this module existed, which is exactly how two copies of a rule drift.

import { describe, expect, test } from "vitest";
import { PRIORITIES, REPEAT_UNITS, cleanTagName, repeatText } from "./taskFields.js";

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
    expect(REPEAT_UNITS.map((u) => u.value)).toEqual(["", "day", "week", "month"]);
  });
});
