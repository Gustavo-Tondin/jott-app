import { describe, expect, test } from "vitest";
import { DEFAULT_THEME, isAppTheme, themeAttribute } from "./themes.js";

describe("themeAttribute", () => {
  test("an empty setting is the theme the app ships as", () => {
    expect(themeAttribute("")).toBe(DEFAULT_THEME);
    expect(themeAttribute(null)).toBe(DEFAULT_THEME);
  });

  test("one of the app's own is itself", () => {
    expect(themeAttribute("dark")).toBe("dark");
    expect(themeAttribute("light", null)).toBe("light");
  });

  test("a notebook's theme is worn only once its stylesheet is in", () => {
    // The setting says solarized and nothing has been loaded yet: naming it
    // now would leave the window with no colour roles assigned at all, so the
    // attribute holds on the default until the CSS lands.
    expect(themeAttribute("solarized", null)).toBe(DEFAULT_THEME);
    expect(themeAttribute("solarized", "solarized")).toBe("solarized");
  });

  test("a name from another build falls back rather than painting nothing", () => {
    // The notebook KEEPS the name — a theme deleted by a sync should come back
    // when it does — so this is decided every time it is read.
    expect(themeAttribute("nebula", "solarized")).toBe(DEFAULT_THEME);
  });
});

describe("isAppTheme", () => {
  test("tells the bundle's three from anything else", () => {
    expect(isAppTheme("default")).toBe(true);
    expect(isAppTheme("light")).toBe(true);
    expect(isAppTheme("dark")).toBe(true);
    expect(isAppTheme("solarized")).toBe(false);
    expect(isAppTheme("")).toBe(false);
  });
});
