// The system bars' icons, as the PAGE decides them.
//
// The one that matters is the mismatch this exists for: the phone in dark mode
// and the app in light, where Android drew white icons on the app's white bar
// and the clock disappeared. The page weighs its own ground and says.

import { afterEach, describe, expect, it, vi } from "vitest";
import { isDarkColor, tellSystemBars } from "./systemBars.js";

afterEach(() => {
  delete window.JottAndroid;
  document.body.replaceChildren();
});

/// A document whose probe computes to the colour named for its region, since
/// jsdom resolves no `var()` of its own.
function ground(colors) {
  return {
    body: document.body,
    createElement: (tag) => document.createElement(tag),
    defaultView: {
      getComputedStyle: (el) => ({
        backgroundColor: colors[el.getAttribute("data-region")] ?? "rgb(251, 251, 251)",
      }),
    },
  };
}

describe("isDarkColor", () => {
  it("weighs the app's two grounds", () => {
    expect(isDarkColor("rgb(251, 251, 251)")).toBe(false);
    expect(isDarkColor("rgb(30, 30, 30)")).toBe(true);
  });

  it("answers nothing rather than guessing", () => {
    // Neither a colour this can weigh nor a ground one can see through says
    // anything about what the icons will sit on.
    expect(isDarkColor("color(srgb 1 1 1)")).toBe(null);
    expect(isDarkColor("")).toBe(null);
    expect(isDarkColor(undefined)).toBe(null);
    expect(isDarkColor("rgba(0, 0, 0, 0)")).toBe(null);
  });
});

describe("tellSystemBars", () => {
  it("weighs each bar's own ground, and leaves no probe behind", () => {
    // The app's own mode is exactly this: dark chrome at the top of the
    // screen, light canvas at the bottom, and the two bars disagree.
    const systemBars = vi.fn();
    window.JottAndroid = { systemBars };
    expect(
      tellSystemBars("chrome", "canvas", {
        doc: ground({ chrome: "rgb(30, 30, 30)", canvas: "rgb(251, 251, 251)" }),
      }),
    ).toEqual({ top: true, bottom: false });
    expect(systemBars).toHaveBeenCalledWith(true, false);
    expect(document.body.children.length).toBe(0);
  });

  it("says nothing where there is no bridge, and nothing it cannot weigh", () => {
    const grounds = ground({ chrome: "rgb(30, 30, 30)", canvas: "rgb(251, 251, 251)" });
    expect(tellSystemBars("chrome", "canvas", { doc: grounds, win: {} })).toBe(null);

    const systemBars = vi.fn();
    window.JottAndroid = { systemBars };
    expect(
      tellSystemBars("chrome", "canvas", {
        doc: ground({ chrome: "rgb(30, 30, 30)", canvas: "rgba(0, 0, 0, 0)" }),
      }),
    ).toBe(null);
    expect(systemBars).not.toHaveBeenCalled();
  });

  it("survives a bridge that throws", () => {
    window.JottAndroid = {
      systemBars: () => {
        throw new Error("gone");
      },
    };
    expect(
      tellSystemBars("chrome", "canvas", { doc: ground({ chrome: "rgb(251, 251, 251)" }) }),
    ).toBe(null);
  });
});
