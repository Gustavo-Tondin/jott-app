import { describe, it, expect } from "vitest";
import {
  clampWidth,
  draggedWidth,
  MIN_SIDEBAR,
  MAX_SIDEBAR,
  PANEL,
} from "./sidebarWidth.js";

describe("sidebar width", () => {
  it("keeps a width inside the allowed range", () => {
    expect(clampWidth(240)).toBe(240);
    expect(clampWidth("240.4")).toBe(240);
  });

  it("never lets the panel collapse or take over the window", () => {
    expect(clampWidth(10)).toBe(MIN_SIDEBAR);
    expect(clampWidth(4000)).toBe(MAX_SIDEBAR);
    // Including a value hand-edited into the preferences file.
    expect(clampWidth(-1)).toBe(MIN_SIDEBAR);
  });

  it("answers null when there is no width to use", () => {
    // Null is what leaves the CSS token alone, so the stylesheet stays the
    // single source of the default.
    for (const answer of [null, undefined, "", "wide", NaN, Infinity]) {
      expect(clampWidth(answer)).toBe(null);
    }
  });

  it("adds the pointer's travel to where the drag started", () => {
    expect(draggedWidth(220, 40)).toBe(260);
    expect(draggedWidth(220, -400)).toBe(MIN_SIDEBAR);
  });

  it("the right panel has a floor of its own", () => {
    // A floor, but not the formatting panel's own width: it stood at 208 —
    // exactly one row of six heading glyphs — and the panel read as stuck
    // there (user report, 2026-08-19). What the floor protects is the
    // inspector's fields, not a row that wraps on its own.
    expect(clampWidth(120, PANEL)).toBe(PANEL.min);
    expect(clampWidth(2000, PANEL)).toBe(PANEL.max);
    // Its handle is on the side the width grows away from: the same drag to
    // the left makes it WIDER, which the shell says by flipping the travel.
    expect(draggedWidth(240, 60, PANEL)).toBe(300);
  });
});
