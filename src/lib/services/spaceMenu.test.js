import { describe, expect, test } from "vitest";
import { spaceMenu } from "./spaceMenu.js";

const labels = (items) => items.map((i) => i.label);

describe("spaceMenu", () => {
  test("offers the type's own entries first, then sort", () => {
    const items = spaceMenu({ lead: [{ label: "Select tasks…", run() {} }] });
    expect(labels(items)).toEqual(["Select tasks…", "Sort"]);
  });

  test("what the caller gave nothing for is left out, not shown dead", () => {
    // A period source (the Home's day, the Tasks screen) has no
    // `.space.json`: no arrangement to set. Offering it would be a
    // promise the screen cannot keep (2026-08-06).
    const items = spaceMenu({ lead: [{ label: "Select tasks…", run() {} }], sorts: [] });
    expect(labels(items)).toEqual(["Select tasks…"]);
  });

  test("only the sortings the type understands, with the active one ticked", () => {
    const items = spaceMenu({ sorts: [null, "name", "custom"], sort: "name" });
    expect(labels(items[0].items)).toEqual([
      "  File order",
      "✓ Sort by name",
      "  Custom order (dragged)",
    ]);
  });

  test("custom order is dead until something was dragged", () => {
    const off = spaceMenu({ sort: null, hasOrder: false }).at(-1).items;
    expect(off.at(-1).disabled).toBe(true);
    const on = spaceMenu({ sort: null, hasOrder: true }).at(-1).items;
    expect(on.at(-1).disabled).toBe(false);
  });

  test("choosing a sorting reports the value the config takes", () => {
    const chosen = [];
    const items = spaceMenu({ onSetSort: (s) => chosen.push(s) });
    for (const item of items[0].items) item.run();
    expect(chosen).toEqual([null, "name", "created", "custom"]);
  });
});
