import { describe, it, expect } from "vitest";
import { buttonLayout, DEFAULT_BUTTONS } from "./windowButtons.js";

describe("window button layout", () => {
  it("keeps what the desktop asked for", () => {
    expect(buttonLayout({ left: ["close"], right: ["minimize"] })).toEqual({
      left: ["close"],
      right: ["minimize"],
    });
  });

  it("falls back when the bridge answers with nothing", () => {
    // The bar is the only way to close a frameless window: no answer must
    // still leave the user a way out.
    for (const answer of [null, undefined, "", 0, [], "minimize:close"]) {
      expect(buttonLayout(answer)).toEqual(DEFAULT_BUTTONS);
    }
  });

  it("falls back when a layout names no button at all", () => {
    expect(buttonLayout({ left: [], right: [] })).toEqual(DEFAULT_BUTTONS);
  });

  it("skips a name this build cannot draw", () => {
    expect(buttonLayout({ left: ["spacer", "close"], right: ["appmenu"] })).toEqual({
      left: ["close"],
      right: [],
    });
  });

  it("takes a side that is not a list as an empty side", () => {
    expect(buttonLayout({ left: "close", right: ["close"] })).toEqual({
      left: [],
      right: ["close"],
    });
  });

  it("never hands out the shared default for callers to mutate", () => {
    const layout = buttonLayout(null);
    layout.right.push("nonsense");
    expect(DEFAULT_BUTTONS.right).toEqual(["minimize", "maximize", "close"]);
  });
});
