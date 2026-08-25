import { afterEach, describe, expect, test } from "vitest";
import { applyUserTheme, userThemeApplied } from "./userTheme.js";

afterEach(() => applyUserTheme(null));

describe("applyUserTheme", () => {
  test("puts the stylesheet at the end of the head, unlayered", () => {
    applyUserTheme("[data-region='canvas'] { --theme-bg: pink; }");

    const style = document.getElementById("jott-user-theme");
    expect(style?.tagName).toBe("STYLE");
    expect(style.textContent).toContain("pink");
    // Last, because that is what makes it win over the app's own themes:
    // both are unlayered, so the later one takes it.
    expect(document.head.lastElementChild).toBe(style);
  });

  test("reuses the same element instead of stacking one per change", () => {
    applyUserTheme(":root { --a: 1; }");
    const first = document.getElementById("jott-user-theme");
    applyUserTheme(":root { --a: 2; }");

    expect(document.querySelectorAll("#jott-user-theme")).toHaveLength(1);
    // The same node: replacing it would make the browser re-parse every
    // stylesheet after it, on every keystroke of someone writing a theme.
    expect(document.getElementById("jott-user-theme")).toBe(first);
    expect(userThemeApplied()).toBe(":root { --a: 2; }");
  });

  test("writing the same text again changes nothing", () => {
    applyUserTheme(":root { --a: 1; }");
    const style = document.getElementById("jott-user-theme");
    const node = style.firstChild;

    applyUserTheme(":root { --a: 1; }");

    // The watcher can report one save several times; the effect that reads it
    // must be free to run as often as it likes.
    expect(style.firstChild).toBe(node);
  });

  test("null takes the stylesheet out entirely", () => {
    applyUserTheme(":root { --a: 1; }");
    applyUserTheme(null);

    expect(document.getElementById("jott-user-theme")).toBe(null);
    expect(userThemeApplied()).toBe(null);
    // And asking twice is not an error: switching between two of the app's
    // own themes lands here on every change.
    expect(() => applyUserTheme(null)).not.toThrow();
  });
});
