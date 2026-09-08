// The two Display choices about the floating formatting bar.
//
// The rule worth guarding is the fallback: the core stores these BY NAME and
// never judges them (core/src/config.rs), so an empty string and a name from
// a newer build both reach the interface — and neither may leave a note with
// no controls on it.

import { describe, it, expect } from "vitest";
import {
  FORMAT_BAR_MODES,
  FORMAT_BAR_SIDES,
  DEFAULT_FORMAT_BAR,
  DEFAULT_FORMAT_BAR_SIDE,
  formatBarMode,
  formatBarSide,
} from "./formatBar.js";

describe("formatBar", () => {
  it("falls back to the app's own for nothing, and for a name it does not know", () => {
    expect(formatBarMode("")).toBe(DEFAULT_FORMAT_BAR);
    expect(formatBarMode(undefined)).toBe(DEFAULT_FORMAT_BAR);
    // Written by a build that knows a mode this one does not: the file keeps
    // it, and this screen draws the bar it can draw.
    expect(formatBarMode("hover")).toBe(DEFAULT_FORMAT_BAR);

    expect(formatBarSide("")).toBe(DEFAULT_FORMAT_BAR_SIDE);
    expect(formatBarSide("floating")).toBe(DEFAULT_FORMAT_BAR_SIDE);
  });

  it("takes every key it offers", () => {
    for (const mode of FORMAT_BAR_MODES) expect(formatBarMode(mode.key)).toBe(mode.key);
    for (const side of FORMAT_BAR_SIDES) expect(formatBarSide(side.key)).toBe(side.key);
  });

  it("ships docked in the side panel, floating along the top — where it has always been", () => {
    // The default is not a taste: it is the shape the app had before the
    // setting existed, so nobody's note moves on upgrade.
    expect(DEFAULT_FORMAT_BAR).toBe("panel");
    expect(DEFAULT_FORMAT_BAR_SIDE).toBe("top");
  });

  it("offers the panel only where there is one", () => {
    expect(FORMAT_BAR_MODES.map((m) => m.key)).toEqual(["floating", "panel", "off"]);
    expect(FORMAT_BAR_MODES.find((m) => m.key === "panel").desktopOnly).toBe(true);
  });

  it("offers four SIDES and not eight corners — the bar is centred on its edge", () => {
    expect(FORMAT_BAR_SIDES.map((s) => s.key)).toEqual(["top", "left", "right", "bottom"]);
  });

  it("names every option, so nothing draws as an empty button", () => {
    for (const option of [...FORMAT_BAR_MODES, ...FORMAT_BAR_SIDES]) {
      expect(option.label()).toBeTruthy();
    }
  });
});
