import { describe, it, expect } from "vitest";
import { groupColors, spaceColors } from "./spaceColors.js";

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

  it("deals the seven hues in sidebar order to whoever chose none", () => {
    // A hand-picked colour wins and does not use up a hue; a grouped space
    // follows its group's dealt colour; the eighth entry wraps around.
    const many = Array.from({ length: 9 }, (_, i) => ({ path: `S${i}`, color: null }));
    many[1].color = "red";
    const groups = [{ folder: "Work", spaces: ["S3"] }];
    const colors = spaceColors(many, groups, { auto: true });
    expect(colors.S0).toBe("yellow");
    expect(colors.S1).toBe("red");
    expect(colors.S2).toBe("orange");
    expect(groupColors(many, groups, { auto: true }).Work).toBe("pink");
    expect(colors.S3).toBe("pink");
    expect(colors.S8).toBe("yellow");
    // Off, nothing is dealt — what was set is what there is.
    expect(spaceColors(many, groups).S0).toBe(null);
    expect(groupColors(many, groups).Work).toBe(null);
  });

  it("drops the member's colour when the group has none", () => {
    // Otherwise joining a colourless group would leave the tab dot and the
    // title on the colour the space had while loose.
    const groups = [{ folder: "Work", spaces: ["Space 1"] }];
    expect(spaceColors(spaces, groups)["Space 1"]).toBe(null);
  });
});
