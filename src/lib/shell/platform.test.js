import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLATFORM,
  isMobile,
  osAttribute,
  platformAttribute,
} from "./platform.js";

describe("platformAttribute", () => {
  it("passes through the two names this build dresses", () => {
    expect(platformAttribute("android")).toBe("android");
    expect(platformAttribute("desktop")).toBe("desktop");
  });

  // The failure this normalisation exists to prevent: `data-platform="android"`
  // hides the window buttons, and on a frameless window those are the only way
  // to close it. Every unknown answer therefore has to land on desktop.
  it("falls back to desktop for anything it cannot dress", () => {
    for (const answer of [undefined, null, "", "ios", "Android", 7, {}]) {
      expect(platformAttribute(answer)).toBe(DEFAULT_PLATFORM);
    }
    expect(DEFAULT_PLATFORM).toBe("desktop");
  });
});

describe("osAttribute", () => {
  it("names the system, for the corner the app has to draw itself", () => {
    for (const os of ["linux", "windows", "macos", "android"]) {
      expect(osAttribute(os)).toBe(os);
    }
  });

  // Nothing rather than a guess: no attribute means the CSS default stands,
  // which is the corner this app is clicked on. A build older than this
  // vocabulary answers "desktop", and that is exactly the case this covers.
  it("says nothing about a system it has no corner for", () => {
    for (const answer of ["desktop", undefined, null, "", "ios", "Linux", 7, {}]) {
      expect(osAttribute(answer)).toBe("");
    }
  });

  // The two questions are asked of the SAME answer, and neither may spoil the
  // other: a Windows build still has to keep its window buttons.
  it("leaves the affordance question alone", () => {
    expect(platformAttribute("windows")).toBe(DEFAULT_PLATFORM);
    expect(platformAttribute("linux")).toBe(DEFAULT_PLATFORM);
    expect(isMobile("macos")).toBe(false);
  });
});

describe("isMobile", () => {
  it("is true only where the OS owns the window frame", () => {
    expect(isMobile("android")).toBe(true);
    expect(isMobile("desktop")).toBe(false);
  });

  // Same guarantee as above, stated from the side the components ask from: a
  // bridge that never answered must not convince the app it is on a phone.
  it("is false when the bridge said nothing", () => {
    expect(isMobile(undefined)).toBe(false);
    expect(isMobile(null)).toBe(false);
    expect(isMobile("")).toBe(false);
  });
});
