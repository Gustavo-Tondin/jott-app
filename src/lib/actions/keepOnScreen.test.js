import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { keepOnScreen } from "./keepOnScreen.js";

// A popover and the control that opened it, with the layout jsdom does not do.
// Every number here is a real screen: 360×780, the wireframes' phone.
function popover({ anchorTop, anchorHeight = 36, panelHeight = 200, keyboard = 0 }) {
  document.body.innerHTML = `
    <div data-region="canvas">
      <div class="popup">
        <ul class="theme-popover"></ul>
      </div>
    </div>`;
  document.documentElement.style.setProperty("--theme-keyboard", `${keyboard}px`);
  window.innerWidth = 360;
  window.innerHeight = 780;

  const anchor = document.querySelector(".popup");
  const panel = document.querySelector(".theme-popover");
  anchor.getBoundingClientRect = () => ({
    top: anchorTop,
    bottom: anchorTop + anchorHeight,
    left: 40,
    right: 88,
    width: 48,
    height: anchorHeight,
  });
  panel.getBoundingClientRect = () => ({
    top: 0,
    bottom: panelHeight,
    left: 0,
    right: 240,
    width: 240,
    height: panelHeight,
  });
  return { anchor, panel };
}

let action;

beforeEach(() => {
  // Frames run inline: `place()` is called directly for the first paint, and
  // through `schedule()` for everything after — the re-placement below is one
  // of those, so the stub has to actually call back.
  globalThis.requestAnimationFrame = (fn) => (fn(), 0);
  globalThis.cancelAnimationFrame = () => {};
});

afterEach(() => {
  action?.destroy?.();
  action = null;
  document.documentElement.style.removeProperty("--theme-keyboard");
});

describe("where a popover lands", () => {
  it("opens under its anchor when there is room", () => {
    const { panel } = popover({ anchorTop: 100 });
    action = keepOnScreen(panel);
    // 100 + 36 + 4 of gap.
    expect(panel.style.top).toBe("140px");
  });

  it("opens ABOVE it when there is not", () => {
    // A control near the bottom of the screen: 200px of panel does not fit in
    // the 44px below it. Clamping would slide the panel up over the button
    // that opened it.
    const { panel } = popover({ anchorTop: 700 });
    action = keepOnScreen(panel);
    // 700 - 4 of gap - 200 of panel.
    expect(panel.style.top).toBe("496px");
  });

  it("counts the keyboard as taking the bottom of the screen", () => {
    // THE ONE THE USER HIT (2026-08-18): the composer sits just above the
    // keyboard, so there is plenty of window under it and no room at all. No
    // browser measurement says so inside an Android WebView — only
    // `--theme-keyboard`, published by the activity.
    const { panel } = popover({ anchorTop: 420, keyboard: 300 });
    action = keepOnScreen(panel);
    // Under the anchor would be 460, and 460 + 200 runs past 780 - 300.
    expect(panel.style.top).toBe("216px");
  });

  it("still clamps when neither side has room", () => {
    // A panel taller than the screen it is on: there is nothing better to do
    // than put it against the top margin.
    const { panel } = popover({ anchorTop: 700, panelHeight: 900 });
    action = keepOnScreen(panel);
    expect(panel.style.top).toBe("8px");
  });

  it("moves when the keyboard arrives after it was opened", async () => {
    // A panel with a field in it (the repeat popup) is opened first and the
    // keyboard comes up second — and the composer it hangs off is pinned above
    // that keyboard, so the anchor travels half the screen. Nothing in the
    // browser announces this; the activity writing `--theme-keyboard` on the
    // root is the only signal, so that is what the action watches.
    const { anchor, panel } = popover({ anchorTop: 700 });
    action = keepOnScreen(panel);
    expect(panel.style.top).toBe("496px");

    // The composer rides up with the keyboard, and the root gains the inset.
    anchor.getBoundingClientRect = () => ({
      top: 380,
      bottom: 416,
      left: 40,
      right: 88,
      width: 48,
      height: 36,
    });
    document.documentElement.style.setProperty("--theme-keyboard", "320px");
    await Promise.resolve();

    // Above the anchor's NEW place, and clear of the keyboard.
    expect(panel.style.top).toBe("176px");
  });

  it("takes the region of the thing that opened it across the portal", () => {
    // The panel is moved to <body>, out of every region, and colour roles are
    // inherited — without this it comes back painted in another region's ink.
    const { panel } = popover({ anchorTop: 100 });
    action = keepOnScreen(panel);
    expect(panel.dataset.region).toBe("canvas");
    expect(panel.parentElement).toBe(document.body);
  });
});
