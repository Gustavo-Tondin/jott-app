import { describe, expect, test } from "vitest";
import { arrange, pinnedFirst, landsPinned, planReorder } from "./widgetOrder.js";

// The accessors a tasks widget uses; notes swap in title/created.
const accessors = {
  nameOf: (t) => t.text,
  createdOf: (t) => t.created,
  completedOf: (t) => t.completed,
  keyOf: (t) => t.id,
};

const tasks = [
  { id: "c3", text: "banana", created: "2026-08-03", completed: "2026-08-04" },
  { id: "a1", text: "Amora", created: "2026-08-01" },
  { id: "b2", text: "caju", completed: "2026-08-02" },
];

describe("arrange", () => {
  test("the file order is the default, and unknown sorts fall back to it", () => {
    for (const sort of [null, undefined, "hologram"]) {
      expect(arrange(tasks, sort, [], accessors).map((t) => t.id)).toEqual([
        "c3",
        "a1",
        "b2",
      ]);
    }
  });

  test("by name is alphabetical and case-insensitive", () => {
    expect(arrange(tasks, "name", [], accessors).map((t) => t.text)).toEqual([
      "Amora",
      "banana",
      "caju",
    ]);
  });

  test("by creation date puts the unstamped (hand-written) last", () => {
    expect(arrange(tasks, "created", [], accessors).map((t) => t.id)).toEqual([
      "a1",
      "c3",
      "b2",
    ]);
  });

  test("by completion date is newest-first, missing last", () => {
    expect(arrange(tasks, "completed", [], accessors).map((t) => t.id)).toEqual([
      "c3",
      "b2",
      "a1",
    ]);
  });

  test("custom follows the dragged order and appends what it does not know", () => {
    // "zz" in the order but not in the list is simply skipped; "a1" absent
    // from the order keeps its file position after the ranked ones.
    expect(
      arrange(tasks, "custom", ["b2", "zz", "c3"], accessors).map((t) => t.id),
    ).toEqual(["b2", "c3", "a1"]);
  });

  test("custom with no saved order is the file order", () => {
    expect(arrange(tasks, "custom", [], accessors).map((t) => t.id)).toEqual([
      "c3",
      "a1",
      "b2",
    ]);
  });

  test("never mutates the input", () => {
    const before = [...tasks];
    arrange(tasks, "name", [], accessors);
    expect(tasks).toEqual(before);
  });
});

describe("pinnedFirst", () => {
  test("floats the pinned items to the top, keeping the order inside each half", () => {
    const items = [
      { id: "a" },
      { id: "b", pinned: true },
      { id: "c" },
      { id: "d", pinned: true },
    ];
    expect(pinnedFirst(items).map((i) => i.id)).toEqual(["b", "d", "a", "c"]);
  });

  test("leaves an all-pinned or none-pinned list alone, and never mutates", () => {
    const none = [{ id: "a" }, { id: "b" }];
    expect(pinnedFirst(none).map((i) => i.id)).toEqual(["a", "b"]);
    const all = [{ id: "a", pinned: true }, { id: "b", pinned: true }];
    expect(pinnedFirst(all).map((i) => i.id)).toEqual(["a", "b"]);
    expect(none).toEqual([{ id: "a" }, { id: "b" }]);
  });
});

describe("landsPinned", () => {
  // Dragging across the divider is the other way to pin and unpin.
  test("an unpinned item has to land strictly inside the block", () => {
    expect(landsPinned(0, 2, false)).toBe(true);
    expect(landsPinned(1, 2, false)).toBe(true);
    // Index 2 is the first slot below the divider.
    expect(landsPinned(2, 2, false)).toBe(false);
  });

  test("a pinned item keeps a slot of its own, and unpins below it", () => {
    // One other pinned card: dropping second still lands in the block.
    expect(landsPinned(1, 1, true)).toBe(true);
    expect(landsPinned(2, 1, true)).toBe(false);
    // The only pinned card stays pinned at the top, unpins anywhere below.
    expect(landsPinned(0, 0, true)).toBe(true);
    expect(landsPinned(1, 0, true)).toBe(false);
  });

  test("with nothing pinned, no drag can pin by itself", () => {
    expect(landsPinned(0, 0, false)).toBe(false);
  });
});

describe("planReorder", () => {
  const items = [
    { id: "p1", pinned: true },
    { id: "p2", pinned: true },
    { id: "a" },
    { id: "b" },
  ];

  test("moves the item and leaves the input untouched", () => {
    const { next, moved } = planReorder(items, 3, 0);
    expect(next.map((i) => i.id)).toEqual(["b", "p1", "p2", "a"]);
    expect(moved.id).toBe("b");
    expect(items.map((i) => i.id)).toEqual(["p1", "p2", "a", "b"]);
  });

  test("dropping above the divider pins, and reports the change", () => {
    const { pinned, pinChanged } = planReorder(items, 2, 0);
    expect(pinned).toBe(true);
    expect(pinChanged).toBe(true);
  });

  test("dropping below it unpins a pinned card", () => {
    const { pinned, pinChanged } = planReorder(items, 0, 3);
    expect(pinned).toBe(false);
    expect(pinChanged).toBe(true);
  });

  test("a move inside the same half changes no pin", () => {
    expect(planReorder(items, 2, 3).pinChanged).toBe(false);
    expect(planReorder(items, 0, 1).pinChanged).toBe(false);
  });

  test("a list with no pinning at all only rearranges (the notes board)", () => {
    const notes = [{ path: "a" }, { path: "b" }, { path: "c" }];
    const { next, pinChanged } = planReorder(notes, 0, 2, () => false);
    expect(next.map((n) => n.path)).toEqual(["b", "c", "a"]);
    expect(pinChanged).toBe(false);
  });
});
