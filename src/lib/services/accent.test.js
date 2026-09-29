import { describe, test, expect } from "vitest";
import {
  ACCENTS,
  DEFAULT_ACCENT,
  accentColor,
  accentInk,
  slotOf,
  accentSolid,
  accentTint,
  accentStyle,
} from "./accent.js";

describe("the seven colours of a place", () => {
  test("a stored NAME becomes a var, never a fixed colour", () => {
    // This is the whole reason the app stores a name: the mark is one value
    // the modes may retheme, and the INK beside it still has a light half and
    // a dark half for the region to choose between. A hex could not.
    expect(accentColor("orange")).toBe("var(--app-5)");
    expect(accentTint("orange")).toBe("var(--app-5-tint)");
    for (const name of ACCENTS) {
      expect(slotOf(name)).toBe(name);
      expect(accentColor(name)).toBe(`var(--app-${name})`);
    }
  });

  test("a notebook written before the slots were numbered keeps its colours", () => {
    // The slots became numbers in 0.54. Every notebook on disk before that says
    // `"color": "orange"`, and there is no migration pre-v1 — so the names are
    // read forever, mapped to the slot the factory theme paints that way. The
    // day this stops working is the day a rename empties someone's sidebar.
    const wasCalled = { blue: "1", purple: "2", pink: "3", red: "4", orange: "5", yellow: "6", green: "7" };
    for (const [old, slot] of Object.entries(wasCalled)) {
      expect(slotOf(old), `${old} still reads`).toBe(slot);
      expect(accentColor(old)).toBe(`var(--app-${slot})`);
      expect(accentInk(old)).toBe(`var(--app-${slot}-ink)`);
      expect(accentTint(old)).toBe(`var(--app-${slot}-tint)`);
      expect(slotOf(old)).toBe(slot);
    }
    // And the app WRITES slots — the old name is an input, never an output.
    expect(ACCENTS).not.toContain("orange");
  });

  test("nothing chosen is null, so CSS falls back to the brand", () => {
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
    expect(slotOf("#ff0000")).toBeNull();
    // A name from a newer build is not one of ours either, and is not dropped.
    expect(accentColor("teal")).toBe("teal");
  });

  test("accentStyle writes the pair a coloured section needs", () => {
    // The INK, not the mark: every reader of this pair draws a word or a
    // hairline, and the mark is one colour on both grounds — 2.2:1 on the
    // canvas, which no stroke and no word may sit at.
    expect(accentStyle("blue")).toBe(
      "--accent-color: var(--app-1-ink); --accent-tint-color: var(--app-1-tint)",
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


  test("a place picks among seven, in slot order", () => {
    expect(ACCENTS).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(ACCENTS).toContain(DEFAULT_ACCENT);
  });

  test("a retired colour reads as no colour, and is never a raw value", () => {
    // `neutral` was the eighth until the brand got a family of its own. A file
    // that still says so must not reach CSS as the word `neutral`.
    expect(slotOf("neutral")).toBeNull();
    expect(ACCENTS).not.toContain("neutral");
    expect(accentColor("neutral")).toBeNull();
    expect(accentInk("neutral")).toBeNull();
    expect(accentSolid("neutral")).toBeNull();
    expect(accentStyle("neutral")).toBeUndefined();
  });

  test("the solid fill is the step that carries text, and it is theme-blind", () => {
    // The same step its sibling `accentFill` wears: what makes this one carry
    // a name and two counts is the ink over it, `--app-on-solid`, which is the
    // dark ground and clears 4.5:1 on all seven. `architecture.test.js` reads
    // that ink off the sheet rather than assuming which one it is.
    expect(accentSolid("blue")).toBe("var(--app-1-solid)");
    for (const name of ACCENTS) {
      expect(accentSolid(name)).toBe(`var(--app-${name}-solid)`);
    }
    // A raw colour written by hand is itself, as everywhere in this module.
    expect(accentSolid("#ff0000")).toBe("#ff0000");
    for (const empty of [null, undefined, ""]) {
      expect(accentSolid(empty)).toBeNull();
    }
  });
});
