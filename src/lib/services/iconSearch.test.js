// The ranking of the icon picker's search (2026-09-07): the name outranks the
// tags, the start of a name outranks its middle, and every word typed has to
// land somewhere. Pure, over a hand-made list — the library itself is not
// read here.

import { describe, expect, test } from "vitest";

import { leadFirst, loadIconLibrary, searchIcons, termsOf } from "./iconSearch.js";

// The library is 1512 files transformed on first read; under the full
// suite's parallel workers that can pass vitest's five seconds.
const LIBRARY_TIMEOUT = 30_000;

const ENTRIES = [
  { name: "library", tags: ["book", "shelf"] },
  { name: "notebook", tags: ["journal"] },
  { name: "bookmark", tags: ["save"] },
  { name: "book", tags: ["read"] },
  { name: "coffee", tags: ["mug", "drink"] },
  { name: "list-checks", tags: ["todo"] },
  { name: "arrow-up", tags: ["direction"] },
];

describe("termsOf", () => {
  test("splits on spaces and hyphens and lowers the case", () => {
    expect(termsOf("List-Checks  todo")).toEqual(["list", "checks", "todo"]);
    expect(termsOf("   ")).toEqual([]);
    expect(termsOf(null)).toEqual([]);
  });
});

describe("searchIcons", () => {
  test("an empty query is the list as given", () => {
    expect(searchIcons(ENTRIES, "")).toBe(ENTRIES);
    expect(searchIcons(ENTRIES, "  ")).toBe(ENTRIES);
  });

  test("the exact name first, then the name's start, then its middle, then a tag", () => {
    const names = searchIcons(ENTRIES, "book").map((e) => e.name);
    expect(names).toEqual(["book", "bookmark", "notebook", "library"]);
  });

  test("a word of a hyphenated name counts as a start", () => {
    const names = searchIcons(ENTRIES, "check").map((e) => e.name);
    expect(names).toEqual(["list-checks"]);
  });

  test("a tag finds what no name would", () => {
    expect(searchIcons(ENTRIES, "mug").map((e) => e.name)).toEqual(["coffee"]);
  });

  test("every word typed has to match, on the name or the tags", () => {
    expect(searchIcons(ENTRIES, "list todo").map((e) => e.name)).toEqual(["list-checks"]);
    expect(searchIcons(ENTRIES, "list mug")).toEqual([]);
  });

  test("hyphen and space ask the same thing", () => {
    expect(searchIcons(ENTRIES, "arrow-up")).toEqual(searchIcons(ENTRIES, "arrow up"));
    expect(searchIcons(ENTRIES, "arrow up").map((e) => e.name)).toEqual(["arrow-up"]);
  });

  test("nothing matching is an empty list, not a throw", () => {
    expect(searchIcons(ENTRIES, "zzz")).toEqual([]);
  });
});

describe("leadFirst", () => {
  test("moves the named entries to the front, in the order named", () => {
    const names = leadFirst(ENTRIES, ["coffee", "book", "nope"]).map((e) => e.name);
    expect(names.slice(0, 2)).toEqual(["coffee", "book"]);
    expect(names).toHaveLength(ENTRIES.length);
    expect(new Set(names).size).toBe(ENTRIES.length);
  });
});

describe("loadIconLibrary", () => {
  test("reads the whole vendored set once, with a tag list per name", async () => {
    const lib = await loadIconLibrary();
    // The same promise every time: one read per window.
    expect(loadIconLibrary()).toBe(loadIconLibrary());
    expect(Object.keys(lib.SVGS).length).toBeGreaterThan(1500);
    expect(lib.SVGS.acorn).toContain("<svg");
    expect(lib.SVGS.acorn).toContain('fill="currentColor"');
    expect(lib.ENTRIES.length).toBe(Object.keys(lib.SVGS).length);
    const coffee = lib.ENTRIES.find((e) => e.name === "coffee");
    expect(coffee.tags.length).toBeGreaterThan(0);
    // Alphabetical, and every entry has its file.
    const names = lib.ENTRIES.map((e) => e.name);
    expect(names).toEqual([...names].sort());
    expect(names.every((n) => lib.SVGS[n])).toBe(true);
  }, LIBRARY_TIMEOUT);
});
