import { describe, test, expect } from "vitest";
import {
  ACCENTS,
  DEFAULT_ACCENT,
  isAccent,
  accentColor,
  accentInk,
  accentRung,
  accentSolid,
  accentTint,
  accentStyle,
  accentLine,
  badgeStyle,
} from "./accent.js";

describe("the eight colours", () => {
  test("a stored NAME becomes a var, never a fixed colour", () => {
    // This is the whole reason the app stores a name: the mark is one value
    // the modes may retheme, and the INK beside it still has a light half and
    // a dark half for the region to choose between. A hex could not.
    expect(accentColor("orange")).toBe("var(--app-orange)");
    expect(accentTint("orange")).toBe("var(--app-orange-tint)");
    for (const name of ACCENTS) {
      expect(isAccent(name)).toBe(true);
      expect(accentColor(name)).toBe(`var(--app-${name})`);
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
    // The INK, not the mark: every reader of this pair draws a word or a
    // hairline, and the mark is one colour on both grounds — 2.2:1 on the
    // canvas, which no stroke and no word may sit at.
    expect(accentStyle("blue", { color: "--group-color", tint: "--group-tint" })).toBe(
      "--group-color: var(--app-blue-ink); --group-tint: var(--app-blue-tint)",
    );
  });

  test("the mark is one colour, the ink still answers the ground", () => {
    // The split that ended the yellow reading gold on the sidebar and olive on
    // the page: a dot, a pill and a banner take `accentColor` and never move;
    // a letter, a rule and a focus ring take `accentInk`, which the region
    // still resolves from its own end of the ramp.
    for (const name of ACCENTS) {
      expect(accentColor(name)).toBe(`var(--app-${name})`);
      expect(accentInk(name)).toBe(`var(--app-${name}-ink)`);
    }
    // A raw colour has one value and no ramp, so both answer it.
    expect(accentInk("#ff0000")).toBe("#ff0000");
    for (const empty of [null, undefined, ""]) expect(accentInk(empty)).toBeNull();
  });


  test("the app ships accented with one of the eight", () => {
    expect(ACCENTS).toContain(DEFAULT_ACCENT);
    expect(ACCENTS).toHaveLength(8);
  });

  test("white and black are ONE colour, one entry on one ramp", () => {
    // Not two entries (2026-08-17): white over black and black over white are
    // the two ends of one ramp, exactly like a light blue and a dark blue.
    // Two fixed entries could not both be visible — the app's two regions ARE
    // white and black, so a fixed neutral vanishes in one of them. As a MARK
    // it is now the ramp's middle, which is visible against both.
    expect(isAccent("neutral")).toBe(true);
    expect(ACCENTS).not.toContain("white");
    expect(ACCENTS).not.toContain("black");
    expect(accentColor("neutral")).toBe("var(--app-neutral)");
  });

  test("six rungs of emphasis, one per heading level", () => {
    // Six and not three (user call, 2026-08-17): with three, the colour
    // changed every OTHER level, which reads as an accident rather than a
    // hierarchy. Rung 1 is the strongest, 6 the faintest.
    for (let rung = 1; rung <= 6; rung++) {
      expect(accentRung("blue", rung)).toBe(`var(--app-blue-${rung})`);
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
    // The same step its sibling `accentFill` wears: what makes this one carry
    // a name and two counts is the ink over it, `--app-on-solid`, which is the
    // dark ground and clears 7:1 on all eight. `architecture.test.js` reads
    // that ink off the sheet rather than assuming which one it is.
    expect(accentSolid("blue")).toBe("var(--app-blue-solid)");
    for (const name of ACCENTS) {
      expect(accentSolid(name)).toBe(`var(--app-${name}-solid)`);
    }
    // A raw colour written by hand is itself, as everywhere in this module.
    expect(accentSolid("#ff0000")).toBe("#ff0000");
    for (const empty of [null, undefined, ""]) {
      expect(accentSolid(empty)).toBeNull();
    }
  });

  test("badgeStyle: rung 2 for the text, the line for the outline; nothing for no colour", () => {
    expect(badgeStyle("blue")).toBe("--badge-color: var(--app-blue-2); --badge-line: var(--app-blue-line)");
    expect(badgeStyle("#123456")).toBe(
      "--badge-color: color-mix(in srgb, #123456 90%, transparent); --badge-line: color-mix(in srgb, #123456 45%, transparent)",
    );
    expect(badgeStyle(null)).toBeUndefined();
    expect(accentLine("")).toBeNull();
  });
});
