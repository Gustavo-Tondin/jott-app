import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { keepOnScreen } from "./keepOnScreen.js";

// A popover and the control that opened it, with the layout jsdom does not do.
// Every number here is a real screen: 360×780, the wireframes' phone.
function popover({ anchorTop, anchorHeight = 36, panelHeight = 200, keyboard = 0 }) {
  document.body.innerHTML = `
    <div data-region="canvas">
      <div class="bar">
        <div class="popup">
          <ul class="theme-popover"></ul>
        </div>
      </div>
    </div>`;
  document.documentElement.style.setProperty("--app-keyboard", `${keyboard}px`);
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
  // The box the anchor sits in — a padded bar, so its edges are 8px outside
  // the button's on both sides. Only the `clears` tests look at it.
  const bar = document.querySelector(".bar");
  bar.getBoundingClientRect = () => ({
    top: anchorTop - 8,
    bottom: anchorTop + anchorHeight + 8,
    left: 32,
    right: 320,
    width: 288,
    height: anchorHeight + 16,
  });
  return { anchor, panel, bar };
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
  document.documentElement.style.removeProperty("--app-keyboard");
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
    // `--app-keyboard`, published by the activity.
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
    // browser announces this; the activity writing `--app-keyboard` on the
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
    document.documentElement.style.setProperty("--app-keyboard", "320px");
    await Promise.resolve();

    // Above the anchor's NEW place, and clear of the keyboard.
    expect(panel.style.top).toBe("176px");
  });

  it("clears the box it was told to, not just its anchor", () => {
    // THE ONE THE USER HIT (2026-08-19): the format bar's folded groups hang
    // off a button that ends 8px before the padded bar does, so a panel that
    // cleared only the button opened 4px UNDER the bar's own edge.
    const { panel } = popover({ anchorTop: 100 });
    action = keepOnScreen(panel, { clears: ".bar" });
    // The bar ends at 100 + 36 + 8, and then the 4px gap.
    expect(panel.style.top).toBe("148px");
  });

  it("clears that same box when it has to open upwards", () => {
    // The phone's strip: the bar is pinned at the bottom, so the panel opens
    // above it — and it has to clear the bar's TOP edge for the same reason.
    const { panel } = popover({ anchorTop: 700 });
    action = keepOnScreen(panel, { clears: ".bar" });
    // The bar starts at 700 - 8, less the 4px gap and 200 of panel.
    expect(panel.style.top).toBe("488px");
  });

  // ---- the rail (2026-08-21) ----
  //
  // The floating bar can hug the left or the right edge, and there it is a
  // COLUMN. Above and below a column of seven buttons there is no room at
  // all, so its folded groups open in the other axis — and `clears` has to
  // work in that axis too, or the panel opens 4px INSIDE the bar it belongs
  // to. Same defect as the one measured on the top edge, turned a quarter.
  it("opens beside the whole bar, not beside the button inside it", () => {
    const { panel } = popover({ anchorTop: 300 });
    // A desktop window: the rail is a desktop shape, and the phone's 360px
    // would clamp the panel before the placement could be read.
    window.innerWidth = 1280;
    action = keepOnScreen(panel, { clears: ".bar", side: "inline" });
    // The bar's right edge is 320, and then the 4px gap. Cleared only to the
    // button, this would have been 88 + 4 = 92 — well inside the bar.
    expect(panel.style.left).toBe("324px");
    // Lined up with the BUTTON in the other axis, which is what says which
    // opener the panel belongs to.
    expect(panel.style.top).toBe("300px");
  });

  it("flips to the bar's other side when there is no room on that one", () => {
    // The rail against the RIGHT edge of the canvas: opening outwards would
    // put the panel off screen, so it opens back over the document.
    const { panel, bar, anchor } = popover({ anchorTop: 300 });
    window.innerWidth = 1280;
    // The bar hugging the window's right edge, and the button inside it.
    bar.getBoundingClientRect = () => ({
      top: 292,
      bottom: 344,
      left: 1216,
      right: 1272,
      width: 56,
      height: 52,
    });
    anchor.getBoundingClientRect = () => ({
      top: 300,
      bottom: 336,
      left: 1224,
      right: 1264,
      width: 40,
      height: 36,
    });
    action = keepOnScreen(panel, { clears: ".bar", side: "inline" });
    // 1216 (the bar's left) - 4 of gap - 240 of panel — back over the
    // document rather than off the screen.
    expect(panel.style.left).toBe("972px");
  });

  it("leaves nothing of the panel's own placement in force", () => {
    // A portaled panel is positioned by `top`/`left` alone. A stylesheet rule
    // the panel still carries — `.format-bar__panel` opens upwards with
    // `inset-block-end` — would leave the box over-constrained, and the
    // browser answers that by solving for the HEIGHT: 40px of buttons became a
    // 12px band of padding with the glyphs hanging out of it (measured in
    // WebKitGTK, the app's own engine, 2026-08-19).
    const { panel } = popover({ anchorTop: 100 });
    action = keepOnScreen(panel);
    expect(panel.style.insetBlockEnd).toBe("auto");
    expect(panel.style.insetBlockStart).toBe("auto");
    expect(panel.style.insetInlineStart).toBe("auto");
    expect(panel.style.insetInlineEnd).toBe("auto");
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
