import { describe, it, expect } from "vitest";
import {
  chordOf,
  normalize,
  isBindable,
  toCodeMirror,
  formatChord,
} from "./keys.js";

const press = (key, mods = {}) => ({
  key,
  code: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("chords", () => {
  it("names a press the one way, whatever order the fingers landed", () => {
    expect(chordOf(press("f", { ctrlKey: true, shiftKey: true }))).toBe("Mod+Shift+F");
    expect(normalize("Shift+Ctrl+f")).toBe("Mod+Shift+F");
    expect(normalize("ctrl+shift+F")).toBe("Mod+Shift+F");
  });

  it("folds Ctrl and Cmd into one name, so a binding travels between machines", () => {
    expect(chordOf(press("b", { ctrlKey: true }))).toBe("Mod+B");
    expect(chordOf(press("b", { metaKey: true }))).toBe("Mod+B");
  });

  it("is not a chord while only modifiers are down", () => {
    expect(chordOf(press("Control", { ctrlKey: true }))).toBe(null);
    expect(chordOf(press("Shift", { shiftKey: true }))).toBe(null);
  });

  it("keeps the DIGIT of a number key, not what the layout printed on it", () => {
    // Ctrl+Shift+7 reports "&" on many layouts. The physical key is the 7.
    const shifted = { ...press("&", { ctrlKey: true, shiftKey: true }), code: "Digit7" };
    expect(chordOf(shifted)).toBe("Mod+Shift+7");
  });

  it("refuses to bind what would swallow typing", () => {
    expect(isBindable("A")).toBe(false);
    expect(isBindable("Shift+A")).toBe(false);
    expect(isBindable("Space")).toBe(false);
    expect(isBindable("Mod+A")).toBe(true);
    expect(isBindable("Alt+ArrowUp")).toBe(true);
    expect(isBindable("F2")).toBe(true);
  });

  it("speaks CodeMirror's dialect without changing meaning", () => {
    expect(toCodeMirror("Mod+B")).toBe("Mod-b");
    expect(toCodeMirror("Mod+Alt+1")).toBe("Mod-Alt-1");
    expect(toCodeMirror("Mod+Shift+X")).toBe("Mod-Shift-x");
    expect(toCodeMirror("Shift+Enter")).toBe("Shift-Enter");
  });

  it("draws the platform's own spelling, and only on screen", () => {
    expect(formatChord("Mod+Shift+F", false)).toBe("Ctrl+Shift+F");
    expect(formatChord("Mod+Shift+F", true)).toBe("⌘⇧F");
    expect(formatChord("Mod+Alt+ArrowLeft", false)).toBe("Ctrl+Alt+←");
  });
});
