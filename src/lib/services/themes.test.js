import { describe, expect, test } from "vitest";
import { DEFAULT_MODE, MODES, isMode, modeAttribute, paletteAttribute } from "./themes.js";

describe("modeAttribute", () => {
  test("the app's own mode is no attribute at all", () => {
    expect(DEFAULT_MODE).toBe("jott");
    expect(modeAttribute("")).toBeNull();
    expect(modeAttribute(null)).toBeNull();
    expect(modeAttribute("jott")).toBeNull();
  });

  test("the other two are themselves", () => {
    expect(modeAttribute("dark")).toBe("dark");
    expect(modeAttribute("light")).toBe("light");
  });

  test("a name that is not a mode reads as the default, never as a blank window", () => {
    // `default` was the jott mode's name until 2026-08-26; the core reads it
    // as jott before it gets here, and anything else unknown is the same.
    expect(modeAttribute("default")).toBeNull();
    expect(modeAttribute("solarized")).toBeNull();
    expect(MODES.map((m) => m.key)).toEqual(["jott", "light", "dark"]);
    expect(isMode("light")).toBe(true);
    expect(isMode("")).toBe(false);
  });
});

describe("paletteAttribute", () => {
  test("a notebook theme is named only once its stylesheet is in the document", () => {
    expect(paletteAttribute("solarized", null)).toBeNull();
    expect(paletteAttribute("solarized", "solarized")).toBe("solarized");
    // A stale `worn` — the theme just switched and the old sheet is still in
    // — must not name the NEW one before its CSS has landed.
    expect(paletteAttribute("nebula", "solarized")).toBeNull();
    expect(paletteAttribute("", null)).toBeNull();
  });
});
