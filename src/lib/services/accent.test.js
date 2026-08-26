import { describe, test, expect } from "vitest";
import {
  ACCENTS,
  DEFAULT_ACCENT,
  isAccent,
  accentColor,
  accentRung,
  accentSolid,
  accentTint,
  accentStyle,
  accentLine,
  badgeStyle,
  tagColors,
} from "./accent.js";

describe("the eight colours", () => {
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
      expect(accentStyle(empty)).toBeUndefined();
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

  test("the app ships accented with one of the eight", () => {
    expect(ACCENTS).toContain(DEFAULT_ACCENT);
    expect(ACCENTS).toHaveLength(8);
  });

  test("white and black are ONE colour, and it follows the ground", () => {
    // Not two entries (2026-08-17): white over black and black over white are
    // the two ends of one ramp, exactly like a light blue and a dark blue.
    // Two fixed entries could not both be visible — the app's two regions ARE
    // white and black, so a fixed neutral vanishes in one of them.
    expect(isAccent("neutral")).toBe(true);
    expect(ACCENTS).not.toContain("white");
    expect(ACCENTS).not.toContain("black");
    expect(accentColor("neutral")).toBe("var(--accent-neutral)");
  });

  test("six rungs of emphasis, one per heading level", () => {
    // Six and not three (user call, 2026-08-17): with three, the colour
    // changed every OTHER level, which reads as an accident rather than a
    // hierarchy. Rung 1 is the strongest, 6 the faintest.
    for (let rung = 1; rung <= 6; rung++) {
      expect(accentRung("blue", rung)).toBe(`var(--accent-blue-${rung})`);
    }
  });

  test("a raw colour has no ladder, so it fades instead of stepping", () => {
    // A lone hex cannot climb a ramp it does not have: the top rung is the
    // colour itself, and the rest fade toward whatever ground it sits on.
    expect(accentRung("#ff0000", 1)).toBe("#ff0000");
    expect(accentRung("#ff0000", 6)).toBe(
      "color-mix(in srgb, #ff0000 48%, transparent)",
    );
    for (const empty of [null, undefined, ""]) {
      expect(accentRung(empty, 3)).toBeNull();
    }
  });

  test("the solid fill is the step that carries text, and it is theme-blind", () => {
    // Its sibling `accentFill` is step 300 — a surface with nothing on it (a
    // note's banner). A notebook card has a name and two counts written across
    // it, and 300 is the step that reads AS text on a dark ground, not the
    // step that carries text. 500 is; the palette pins it to 4.5:1 against the
    // light ground, and `architecture.test.js` measures white on it.
    expect(accentSolid("blue")).toBe("var(--accent-blue-solid)");
    for (const name of ACCENTS) {
      expect(accentSolid(name)).toBe(`var(--accent-${name}-solid)`);
    }
    // A raw colour written by hand is itself, as everywhere in this module.
    expect(accentSolid("#ff0000")).toBe("#ff0000");
    for (const empty of [null, undefined, ""]) {
      expect(accentSolid(empty)).toBeNull();
    }
  });

  test("badgeStyle: rung 2 for the text, the line for the outline; nothing for no colour", () => {
    expect(badgeStyle("blue")).toBe("--badge-color: var(--accent-blue-2); --badge-line: var(--accent-blue-line)");
    expect(badgeStyle("#123456")).toBe(
      "--badge-color: color-mix(in srgb, #123456 90%, transparent); --badge-line: color-mix(in srgb, #123456 45%, transparent)",
    );
    expect(badgeStyle(null)).toBeUndefined();
    expect(accentLine("")).toBeNull();
  });
});
