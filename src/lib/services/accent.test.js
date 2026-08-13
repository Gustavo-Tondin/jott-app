import { describe, test, expect } from "vitest";
import {
  ACCENTS,
  DEFAULT_ACCENT,
  isAccent,
  accentColor,
  accentTint,
  accentStyle,
  tagColors,
} from "./accent.js";

describe("the seven complementary colours", () => {
  test("a stored NAME becomes a ground-aware var, never a fixed colour", () => {
    // This is the whole reason the app stores a name: each of the seven has a
    // light half and a dark half, and the region a colour lands in is what
    // chooses between them (styles/grounds.css). A hex could not.
    expect(accentColor("orange")).toBe("var(--accent-orange)");
    expect(accentTint("orange")).toBe("var(--accent-orange-tint)");
    for (const name of ACCENTS) {
      expect(isAccent(name)).toBe(true);
      expect(accentColor(name)).toBe(`var(--accent-${name})`);
    }
  });

  test("nothing chosen is null, so CSS falls back to the theme accent", () => {
    for (const empty of [null, undefined, ""]) {
      expect(accentColor(empty)).toBeNull();
      expect(accentTint(empty)).toBeNull();
      expect(accentStyle(empty)).toBe("");
    }
  });

  test("a raw colour is passed through untouched", () => {
    // Tolerance, not migration: a notebook written before the palette (or by
    // hand) may hold a hex, and a colour the user chose is theirs. It simply
    // cannot follow the ground, so its tint is mixed from the colour itself.
    expect(accentColor("#ff0000")).toBe("#ff0000");
    expect(accentTint("#ff0000")).toBe("color-mix(in srgb, #ff0000 18%, transparent)");
    expect(isAccent("#ff0000")).toBe(false);
    // A name from a newer build is not one of ours either, and is not dropped.
    expect(accentColor("teal")).toBe("teal");
  });

  test("accentStyle writes the pair a coloured section needs", () => {
    expect(accentStyle("blue", { color: "--group-color", tint: "--group-tint" })).toBe(
      "--group-color: var(--accent-blue); --group-tint: var(--accent-blue-tint)",
    );
  });

  test("the tag map resolves every colour and leaves the colourless out", () => {
    // Left out rather than mapped to the brand: absent is what makes the pill
    // fall back in CSS, and writing the fallback in would freeze it.
    expect(
      tagColors([
        { name: "design", color: "orange" },
        { name: "urgent", color: null },
        { name: "old", color: "#123456" },
      ]),
    ).toEqual({ design: "var(--accent-orange)", old: "#123456" });
    expect(tagColors()).toEqual({});
  });

  test("the app ships accented with one of the seven", () => {
    expect(ACCENTS).toContain(DEFAULT_ACCENT);
    expect(ACCENTS).toHaveLength(7);
  });
});
