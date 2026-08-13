// What the sidebar's column means: where a group sits, what a drag rewrites,
// and what dropping one thing on another asks for.

import { describe, expect, test } from "vitest";
import {
  sidebarEntries,
  namesOf,
  reorderedAt,
  dropMeaning,
} from "./sidebarOrder.js";

// A workspace is addressed by its root-relative PATH (2026-08-13): two groups
// may each hold a `Tasks/`, and by leaf name they were the same entry — the
// sidebar highlighted both at once (user report). The helper takes the path
// and reads the name off its last segment, exactly as the app does.
const ws = (path) => ({ path, name: path.split("/").pop() });
const group = (folder, workspaces, parent = null) => ({
  folder,
  name: folder,
  parent,
  workspaces,
});

// Study holds B, which the core hands back second — so the group sits second.
const WORKSPACES = ["A", "B", "C"].map(ws);
const GROUPS = [group("Study", ["B"])];

describe("sidebarEntries", () => {
  test("a group sits where its members sit", () => {
    const keys = sidebarEntries(WORKSPACES, GROUPS).map((e) => e.key);
    expect(keys).toEqual(["ws:A", "group:Study", "ws:C"]);
  });

  test("a grouped workspace is not also drawn loose", () => {
    const entries = sidebarEntries(WORKSPACES, GROUPS);
    expect(entries.filter((e) => e.kind === "workspace").map((e) => e.ws.path))
      .toEqual(["A", "C"]);
  });

  test("a group holding several sits at the FIRST of them", () => {
    const keys = sidebarEntries(WORKSPACES, [group("Study", ["C", "A"])]).map((e) => e.key);
    expect(keys).toEqual(["group:Study", "ws:B"]);
  });

  test("members follow the dragged order, not the alphabet", () => {
    // The order the user dragged is the one the core hands back, in
    // `workspaces`. Sorting members by name on top of it was exactly the bug
    // of 2026-08-11 — the drag inside a group did nothing.
    const dragged = ["C", "A", "B"].map(ws);
    const entries = sidebarEntries(dragged, [group("Study", ["C", "A"])]);
    expect(entries[0].children.map((c) => c.ws.path)).toEqual(["C", "A"]);
  });

  test("an empty group waits at the end rather than jumping to the top", () => {
    // It has no member to borrow a place from; Infinity is honest about that.
    const keys = sidebarEntries(WORKSPACES, [group("Empty", [])]).map((e) => e.key);
    expect(keys).toEqual(["ws:A", "ws:B", "ws:C", "group:Empty"]);
  });

  test("two empty groups keep the order they arrived in", () => {
    // Both rank Infinity, and Infinity - Infinity is NaN: a comparator that
    // returns NaN sorts by luck.
    const keys = sidebarEntries([], [group("One", []), group("Two", [])]).map((e) => e.key);
    expect(keys).toEqual(["group:One", "group:Two"]);
  });

  test("a group inside a group is a child of it, not a sibling", () => {
    const entries = sidebarEntries(
      ["A"].map(ws),
      [group("Design", []), group("Clients", ["A"], "Design")],
    );
    expect(entries.map((e) => e.key)).toEqual(["group:Design"]);
    expect(entries[0].children.map((e) => e.key)).toEqual(["group:Clients"]);
    expect(entries[0].children[0].children.map((e) => e.key)).toEqual(["ws:A"]);
    // And the outer group borrows its place from the member two levels down.
    expect(entries[0].rank).toBe(0);
  });
});

describe("reorderedAt", () => {
  test("a dragged group carries everything under it, contiguously", () => {
    const entries = sidebarEntries(["A", "B", "C", "D"].map(ws), [
      group("Study", ["B", "C"]),
    ]);
    expect(entries.map((e) => e.key)).toEqual(["ws:A", "group:Study", "ws:D"]);

    // Group to the front: its two names lead the order, still side by side.
    expect(reorderedAt(entries, null, 1, 0)).toEqual(["B", "C", "A", "D"]);
  });

  test("a dragged workspace just changes places", () => {
    const entries = sidebarEntries(WORKSPACES, []);
    expect(reorderedAt(entries, null, 0, 2)).toEqual(["B", "C", "A"]);
  });

  test("a member moves among its siblings, and the rest is untouched", () => {
    const entries = sidebarEntries(["A", "B", "C", "D"].map(ws), [
      group("Study", ["B", "C"]),
    ]);
    expect(reorderedAt(entries, "group:Study", 1, 0)).toEqual(["A", "C", "B", "D"]);
  });

  test("a drag deep in the tree rewrites only its own run", () => {
    const entries = sidebarEntries(
      ["A", "B", "C"].map(ws),
      [group("Design", [], null), group("Clients", ["B", "C"], "Design")],
    );
    // A is loose and first; Design holds Clients, which holds B and C.
    expect(reorderedAt(entries, "group:Clients", 1, 0)).toEqual(["A", "C", "B"]);
  });
});

describe("dropMeaning", () => {
  const entries = sidebarEntries(WORKSPACES, GROUPS); // [A, Study(B), C]

  test("a workspace onto a group joins it", () => {
    expect(dropMeaning(entries, 0, 1)).toEqual({
      kind: "intoGroup",
      group: GROUPS[0],
      workspace: WORKSPACES[0],
    });
  });

  test("a workspace onto a workspace asks for a group of the two", () => {
    const meaning = dropMeaning(entries, 2, 0);
    expect(meaning.kind).toBe("groupWith");
    // The one that stayed put is the host — it is what the suggested name
    // comes from, and the one being carried joins it.
    expect(meaning.host.path).toBe("A");
    expect(meaning.workspace.path).toBe("C");
  });

  test("a group onto a group joins it — groups nest now", () => {
    const tree = sidebarEntries(["A", "B"].map(ws), [
      group("One", ["A"]),
      group("Two", ["B"]),
    ]);
    expect(dropMeaning(tree, 1, 0)).toEqual({
      kind: "groupIntoGroup",
      group: tree[0].group,
      moving: tree[1].group,
    });
  });

  test("a group onto a loose workspace still means nothing", () => {
    expect(dropMeaning(entries, 1, 0)).toBeNull();
    expect(dropMeaning(entries, 1, 2)).toBeNull();
  });

  test("dropping something on itself, or on nothing, means nothing", () => {
    expect(dropMeaning(entries, 0, 0)).toBeNull();
    expect(dropMeaning(entries, 0, 9)).toBeNull();
  });
});

describe("namesOf", () => {
  test("a group speaks for everything under it; a workspace for itself", () => {
    const entries = sidebarEntries(WORKSPACES, GROUPS);
    expect(namesOf(entries[1])).toEqual(["B"]);
    expect(namesOf(entries[0])).toEqual(["A"]);

    const nested = sidebarEntries(
      ["A", "B"].map(ws),
      [group("Design", ["A"]), group("Clients", ["B"], "Design")],
    );
    expect(namesOf(nested[0])).toEqual(["A", "B"]);
  });
});
