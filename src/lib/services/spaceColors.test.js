import { describe, it, expect } from "vitest";
import { groupColors, rainbowFrom, spaceColors } from "./spaceColors.js";

describe("spaceColors", () => {
  const spaces = [
    { path: "Space 1", color: "#ff0000" },
    { path: "Space 2", color: null },
    { path: "Space 3", color: "#00ff00" },
  ];

  it("keeps a loose space's own colour", () => {
    expect(spaceColors(spaces, [])["Space 1"]).toBe("#ff0000");
    expect(spaceColors(spaces, [])["Space 2"]).toBe(null);
  });

  it("makes a grouped space follow the group, not its old colour", () => {
    const groups = [{ folder: "Work", color: "#0000ff", spaces: ["Space 1"] }];
    const colors = spaceColors(spaces, groups);
    expect(colors["Space 1"]).toBe("#0000ff");
    expect(colors["Space 3"]).toBe("#00ff00");
  });

  it("wears the rainbow from the accent on, ignoring what was chosen", () => {
    // Blue Topaz: the fixed spaces wear the accent, the column below goes
    // around the seven from the hue after it, one per top-level entry in
    // sidebar order — a hand-picked red is overruled, a grouped space
    // follows its group's band, and the eighth entry wraps around.
    const many = Array.from({ length: 9 }, (_, i) => ({ path: `S${i}`, color: null }));
    many[1].color = "red";
    const fixed = { path: "jott.tasks", fixed: true, color: null };
    const groups = [{ folder: "Work", spaces: ["S3"] }];
    const opts = { auto: true, accent: "blue" };
    const colors = spaceColors([fixed, ...many], groups, opts);
    expect(colors["jott.tasks"]).toBe("blue");
    expect(colors.S0).toBe("purple");
    expect(colors.S1).toBe("pink");
    expect(colors.S2).toBe("red");
    expect(groupColors([fixed, ...many], groups, opts).Work).toBe("orange");
    expect(colors.S3).toBe("orange");
    expect(colors.S4).toBe("yellow");
    expect(colors.S5).toBe("green");
    expect(colors.S6).toBe("neutral", "neutral closes every lap");
    expect(colors.S7).toBe("blue");
    // Off, nothing is dealt — what was set is what there is.
    expect(spaceColors(many, groups).S1).toBe("red");
    expect(groupColors(many, groups).Work).toBe(null);
  });

  it("starts the rainbow from the app's own accent when none of the seven is chosen", () => {
    expect(rainbowFrom("neutral")[0]).toBe("blue");
    expect(rainbowFrom(null)[0]).toBe("blue");
    expect(rainbowFrom("green")).toEqual([
      "green", "blue", "purple", "pink", "red", "orange", "yellow", "neutral",
    ]);
  });

  it("drops the member's colour when the group has none", () => {
    // Otherwise joining a colourless group would leave the tab dot and the
    // title on the colour the space had while loose.
    const groups = [{ folder: "Work", spaces: ["Space 1"] }];
    expect(spaceColors(spaces, groups)["Space 1"]).toBe(null);
  });
});
