import { describe, expect, test } from "vitest";
import { setRootData, setRootVar } from "./rootStyle.js";

describe("setRootVar", () => {
  test("writes the property, and removes it for null", () => {
    const root = document.createElement("div");
    setRootVar("--drawer-at", "120px", root);
    expect(root.style.getPropertyValue("--drawer-at")).toBe("120px");
    setRootVar("--drawer-at", null, root);
    expect(root.style.getPropertyValue("--drawer-at")).toBe("");
  });

  test("defaults to the document's root", () => {
    setRootVar("--shell-probe", "1");
    expect(document.documentElement.style.getPropertyValue("--shell-probe")).toBe("1");
    setRootVar("--shell-probe", null);
    expect(document.documentElement.style.getPropertyValue("--shell-probe")).toBe("");
  });
});

describe("setRootData", () => {
  test("writes each data attribute, removing the null ones", () => {
    const root = document.createElement("div");
    setRootData({ theme: "dark", accent: "blue", noteSize: null }, root);
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.getAttribute("data-accent")).toBe("blue");
    expect(root.hasAttribute("data-note-size")).toBe(false);

    // An attribute written earlier goes away when its value becomes null —
    // the default is an ABSENT attribute, never an empty one.
    setRootData({ accent: null, noteSize: "large" }, root);
    expect(root.hasAttribute("data-accent")).toBe(false);
    expect(root.getAttribute("data-note-size")).toBe("large");
    // What was not named is left alone.
    expect(root.getAttribute("data-theme")).toBe("dark");
  });
});
