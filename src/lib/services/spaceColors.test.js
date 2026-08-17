import { describe, it, expect } from "vitest";
import { spaceColors } from "./spaceColors.js";

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

  it("drops the member's colour when the group has none", () => {
    // Otherwise joining a colourless group would leave the tab dot and the
    // title on the colour the space had while loose.
    const groups = [{ folder: "Work", spaces: ["Space 1"] }];
    expect(spaceColors(spaces, groups)["Space 1"]).toBe(null);
  });
});
