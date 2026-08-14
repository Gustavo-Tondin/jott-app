import { describe, it, expect } from "vitest";
import { shortcutFor } from "./shortcuts.js";

const press = (key, mods = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  ...mods,
});

describe("keyboard shortcuts", () => {
  it("captures a task and a note from anywhere", () => {
    expect(shortcutFor(press("t", { ctrlKey: true }))).toBe("newTask");
    expect(shortcutFor(press("n", { ctrlKey: true }))).toBe("newNote");
  });

  it("takes the platform modifier, upper or lower case", () => {
    expect(shortcutFor(press("T", { metaKey: true }))).toBe("newTask");
    expect(shortcutFor(press("N", { ctrlKey: true }))).toBe("newNote");
  });

  it("keeps the bare keys it already answered", () => {
    expect(shortcutFor(press("F11"))).toBe("fullscreen");
    expect(shortcutFor(press("Escape"))).toBe("dismiss");
  });

  it("does not steal a plain letter — that is someone typing", () => {
    expect(shortcutFor(press("t"))).toBe(null);
    expect(shortcutFor(press("n"))).toBe(null);
  });

  it("stays out of combinations it does not own", () => {
    expect(shortcutFor(press("t", { ctrlKey: true, shiftKey: true }))).toBe(null);
    expect(shortcutFor(press("t", { ctrlKey: true, altKey: true }))).toBe(null);
    expect(shortcutFor(press("t", { ctrlKey: true, metaKey: true }))).toBe(null);
    expect(shortcutFor(press("k", { ctrlKey: true }))).toBe(null);
  });

  it("yields to whatever answered nearer the keyboard", () => {
    // The editor, a dialog or the date picker already handled it: acting again
    // would fire the same gesture twice.
    expect(shortcutFor(press("t", { ctrlKey: true, defaultPrevented: true }))).toBe(null);
    expect(shortcutFor(press("Escape", { defaultPrevented: true }))).toBe(null);
  });

  it("answers nothing for a non-event", () => {
    expect(shortcutFor(null)).toBe(null);
    expect(shortcutFor(undefined)).toBe(null);
  });
});
