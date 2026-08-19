// The zoom ladder — the same kind of guard sidebarWidth.js has: a number
// from anywhere resolves to a zoom the app is willing to use.

import { describe, expect, test } from "vitest";
import { ZOOM_STEPS, clampZoom, steppedZoom, zoomFontSize } from "./zoom.js";

describe("zoom", () => {
  test("a hand-edited value is clamped to the ladder's ends", () => {
    expect(clampZoom(0.1)).toBe(ZOOM_STEPS[0]);
    expect(clampZoom(9)).toBe(ZOOM_STEPS.at(-1));
    expect(clampZoom(1.25)).toBe(1.25);
  });

  test("stepping walks the ladder and stops at its ends", () => {
    expect(steppedZoom(1, 1)).toBe(1.1);
    expect(steppedZoom(1.1, -1)).toBe(1);
    expect(steppedZoom(ZOOM_STEPS.at(-1), 1)).toBe(ZOOM_STEPS.at(-1));
    expect(steppedZoom(ZOOM_STEPS[0], -1)).toBe(ZOOM_STEPS[0]);
  });

  test("a value off the ladder snaps to the first step at or above it", () => {
    // 0.95 is between 0.9 and 1 — stepping up from it lands ON the ladder,
    // not on 0.95 + something.
    expect(steppedZoom(0.95, 1)).toBe(1.1);
    expect(steppedZoom(0.95, -1)).toBe(0.9);
  });

  test("100% leaves the stylesheet's own base in charge", () => {
    expect(zoomFontSize(1)).toBe("");
    expect(zoomFontSize(1.25)).toBe("20px");
  });
});
