import { describe, expect, test } from "vitest";
import { spaceMenu } from "./spaceMenu.js";

const labels = (items) => items.map((i) => i.label);

describe("spaceMenu", () => {
  test("offers the type's own entries first, then sort", () => {
    const items = spaceMenu({ lead: [{ label: "Select tasks…", run() {} }] });
    expect(labels(items)).toEqual(["Select tasks…", "Sort"]);
  });

  test("what the caller gave nothing for is left out, not shown dead", () => {
    // A day (the Home) has no
    // `.space.json`: no arrangement to set. Offering it would be a
    // promise the screen cannot keep (2026-08-06).
    const items = spaceMenu({ lead: [{ label: "Select tasks…", run() {} }], sorts: [] });
    expect(labels(items)).toEqual(["Select tasks…"]);
  });

  test("only the sortings the type understands, with the active one ticked", () => {
    const items = spaceMenu({ sorts: [null, "name", "custom"], sort: "name" });
    expect(labels(items[0].items)).toEqual([
      "File order",
      "Sort by name",
      "Custom order (dragged)",
    ]);
    // The mark travels as data (`checked`), drawn by MenuItems — a label
    // prefix was one of four hand-rolled spellings of "chosen".
    expect(items[0].items.map((i) => i.checked)).toEqual([false, true, false]);
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

  test("a direction row leads the sortings, and turns the sort that is on", () => {
    const chosen = [];
    const menu = (sort, direction) =>
      spaceMenu({
        sorts: ["custom", "name", "created", "due"],
        sort,
        direction,
        hasOrder: true,
        onSetSort: (...args) => chosen.push(args),
      }).at(-1).items;

    const [row, ...sortings] = menu("name", "down");
    expect(row.segments.map((s) => s.icon)).toEqual(["arrow-down", "arrow-up"]);
    expect(row.segments.map((s) => s.checked)).toEqual([true, false]);
    expect(row.segments.map((s) => s.label)).toEqual(["A to Z", "Z to A"]);
    expect(labels(sortings)).toEqual([
      "Custom order (dragged)",
      "Sort by name",
      "Sort by creation date",
      "Sort by due date",
    ]);
    row.segments[1].run();
    // A sorting keeps the direction the space has: it reports none.
    sortings[3].run();
    expect(chosen).toEqual([["name", "up"], ["due"]]);

    // Custom has no direction: the row is dead, and still says which way.
    const [dead] = menu("custom", "up");
    expect(dead.segments.every((s) => s.disabled)).toBe(true);
    expect(dead.segments.map((s) => s.checked)).toEqual([false, true]);
  });

  test("no direction given, no row: a notepad and a day go without", () => {
    const items = spaceMenu({ sort: "name" }).at(-1).items;
    expect(items.some((item) => item.segments)).toBe(false);
  });
});
