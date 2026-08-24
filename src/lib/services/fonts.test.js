import { describe, expect, test } from "vitest";
import { fontOptions, fontValue, fontVars, isSafeFamily } from "./fonts.js";

describe("fontValue", () => {
  test("a chosen family goes in front of the stack the sheet declares", () => {
    // The inline property REPLACES the declaration, so what the app carries
    // has to be written into the value or an uninstalled font falls to the
    // browser's default instead of Inter.
    expect(fontValue("interface", "Fira Sans")).toBe('"Fira Sans", "Inter", system-ui, sans-serif');
    expect(fontValue("mono", "Fira Code")).toContain('"Fira Code", "DM Mono"');
  });

  test("the note's fallback is the interface's face, whatever that resolved to", () => {
    expect(fontValue("note", "Charter")).toBe('"Charter", var(--theme-font-sans)');
  });

  test("nothing chosen is null, which is what REMOVES the property", () => {
    for (const empty of ["", "   ", null, undefined]) {
      expect(fontValue("interface", empty)).toBeNull();
    }
  });

  test("a generic family is not quoted — quoting it would name a font nobody has", () => {
    expect(fontValue("interface", "serif")).toBe("serif, \"Inter\", system-ui, sans-serif");
  });

  test("a name that could break out of the value is refused, not escaped", () => {
    expect(fontValue("interface", 'Evil"; color: red')).toBeNull();
    expect(fontValue("mono", "Evil}")).toBeNull();
    expect(isSafeFamily("DM Mono")).toBe(true);
    expect(isSafeFamily("Ébano")).toBe(true);
    expect(isSafeFamily("a".repeat(65))).toBe(false);
  });

  test("an unknown role has no property to write", () => {
    expect(fontValue("banner", "Inter")).toBeNull();
  });
});

describe("fontVars", () => {
  test("all three at once, and an unanswered one is null", () => {
    expect(fontVars({ interfaceFont: "Fira Sans", monoFont: "" })).toEqual({
      "--theme-font-sans": '"Fira Sans", "Inter", system-ui, sans-serif',
      "--theme-font-note": null,
      "--theme-font-mono": null,
    });
    expect(fontVars()).toEqual({
      "--theme-font-sans": null,
      "--theme-font-note": null,
      "--theme-font-mono": null,
    });
  });
});

describe("fontOptions", () => {
  test("the app's own answer first, with the empty value every Display key uses", () => {
    const rows = fontOptions("mono", [], { default: "Default (DM Mono)" });
    expect(rows[0]).toEqual({ value: "", label: "Default (DM Mono)", group: null });
  });

  test("the generics are offered, and the machine's list under them", () => {
    const rows = fontOptions("interface", ["Fira Sans", "Noto Serif"], { installed: "Installed" });
    const values = rows.map((r) => r.value);
    expect(values).toContain("system-ui");
    expect(values.slice(-2)).toEqual(["Fira Sans", "Noto Serif"]);
  });

  test("what the app carries and the generics are never listed twice", () => {
    const rows = fontOptions("mono", ["DM Mono", "monospace", "Fira Code"]);
    expect(rows.filter((r) => r.value === "DM Mono")).toHaveLength(0);
    expect(rows.filter((r) => r.value === "monospace")).toHaveLength(1);
    expect(rows.filter((r) => r.value === "Fira Code")).toHaveLength(1);
  });

  test("an unsafe name from the bridge never reaches the list", () => {
    const rows = fontOptions("interface", ['Evil"; x', "Fira Sans"]);
    expect(rows.map((r) => r.value)).not.toContain('Evil"; x');
  });
});
