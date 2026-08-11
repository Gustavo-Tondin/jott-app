import { describe, it, expect } from "vitest";
import { workspaceColors } from "./workspaceColors.js";

describe("workspaceColors", () => {
  const workspaces = [
    { folderName: "Space 1", color: "#ff0000" },
    { folderName: "Space 2", color: null },
    { folderName: "Space 3", color: "#00ff00" },
  ];

  it("keeps a loose workspace's own colour", () => {
    expect(workspaceColors(workspaces, [])["Space 1"]).toBe("#ff0000");
    expect(workspaceColors(workspaces, [])["Space 2"]).toBe(null);
  });

  it("makes a grouped workspace follow the group, not its old colour", () => {
    const groups = [{ folder: "Work", color: "#0000ff", workspaces: ["Space 1"] }];
    const colors = workspaceColors(workspaces, groups);
    expect(colors["Space 1"]).toBe("#0000ff");
    expect(colors["Space 3"]).toBe("#00ff00");
  });

  it("drops the member's colour when the group has none", () => {
    // Otherwise joining a colourless group would leave the tab dot and the
    // title on the colour the workspace had while loose.
    const groups = [{ folder: "Work", workspaces: ["Space 1"] }];
    expect(workspaceColors(workspaces, groups)["Space 1"]).toBe(null);
  });
});
