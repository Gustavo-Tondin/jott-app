import { describe, expect, it } from "vitest";
import { minimalReplacement } from "./textDiff.js";

/// Applies the replacement the way CodeMirror would.
const apply = (text, { from, to, insert }) => text.slice(0, from) + insert + text.slice(to);

describe("minimalReplacement", () => {
  it("swaps only the middle that differs", () => {
    const change = minimalReplacement("one\ntwo\nthree\n", "one\ndois\nthree\n");
    expect(change).toEqual({ from: 4, to: 7, insert: "dois" });
  });

  it("is an insertion when a line was added at the end", () => {
    const change = minimalReplacement("a\nb\n", "a\nb\nc\n");
    expect(change).toEqual({ from: 4, to: 4, insert: "c\n" });
  });

  it("is a deletion when the middle went away", () => {
    expect(minimalReplacement("abcXYZdef", "abcdef")).toEqual({ from: 3, to: 6, insert: "" });
  });

  it("is empty for equal texts, and whole for texts with nothing in common", () => {
    expect(minimalReplacement("same", "same")).toEqual({ from: 4, to: 4, insert: "" });
    expect(minimalReplacement("abc", "xyz")).toEqual({ from: 0, to: 3, insert: "xyz" });
  });

  it("does not let the prefix and the suffix overlap on a repeated run", () => {
    // "aaa" -> "aa": the prefix would take all of the shorter text.
    for (const [from, to] of [["aaa", "aa"], ["aa", "aaa"], ["abab", "ab"], ["", "x"], ["x", ""]]) {
      expect(apply(from, minimalReplacement(from, to))).toBe(to);
    }
  });
});
