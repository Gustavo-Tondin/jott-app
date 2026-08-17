// The four questions the shell asks about a view. They used to be functions
// inside App.svelte, reachable only by mounting the whole app.

import { describe, expect, test } from "vitest";
import { reachable, spaceOfView, titleOf, viewFromId } from "./views.js";
import { viewId } from "./tabs.js";

describe("viewFromId", () => {
  test("is the inverse of tabs.viewId", () => {
    // The two are a pair: `remember_screen` stores what viewId answered, and
    // this is what reopens it. A view that survived the round trip is one the
    // user finds where they left it.
    const views = [
      { kind: "home" },
      { kind: "tasks" },
      { kind: "notes" },
      { kind: "settings" },
      { kind: "completed" },
      { kind: "period", period: "day" },
      { kind: "period", period: "week" },
      { kind: "list", list: "Design/Tasks/task-list.md" },
      { kind: "space", sp: "Design/Tasks" },
    ];
    for (const view of views) {
      expect(viewFromId(viewId(view))).toEqual(view);
    }
  });

  test("an id this build does not know means nothing, not the Home", () => {
    // Answering "home" here would silently swallow a screen a newer build
    // wrote; null lets the shell leave the tab where it already is.
    expect(viewFromId("whatever:1")).toBeNull();
    expect(viewFromId("")).toBeNull();
    expect(viewFromId(null)).toBeNull();
  });
});

describe("reachable", () => {
  const off = (...keys) => (key) => !keys.includes(key);

  test("a screen goes away with the part of the app it belongs to", () => {
    expect(reachable({ kind: "list", list: "a.md" }, off("tasks"))).toBe(false);
    expect(reachable({ kind: "completed" }, off("tasks"))).toBe(false);
    expect(reachable({ kind: "note", folder: "n", path: "a.md" }, off("notes"))).toBe(
      false,
    );
    expect(reachable({ kind: "tags" }, off("taskTags"))).toBe(false);
  });

  test("Today and This Week answer to their own switches", () => {
    expect(reachable({ kind: "period", period: "day" }, off("myDay"))).toBe(false);
    expect(reachable({ kind: "period", period: "day" }, off("week"))).toBe(true);
    expect(reachable({ kind: "period", period: "week" }, off("week"))).toBe(false);
  });

  test("Home and Settings are always somewhere to be", () => {
    expect(reachable({ kind: "home" }, () => false)).toBe(true);
    expect(reachable({ kind: "settings" }, () => false)).toBe(true);
  });
});

describe("titleOf", () => {
  const spaces = [
    { path: "jott.tasks", name: "Tasks" },
    { path: "Design/Tasks", name: "Tasks" },
  ];

  test("a space is named by the notebook, never by its folder", () => {
    // `jott.tasks` is an identifier; "Tasks" is what the user reads.
    expect(titleOf({ kind: "space", sp: "jott.tasks" }, spaces)).toBe("Tasks");
  });

  test("a space the snapshot no longer carries falls back to its address", () => {
    expect(titleOf({ kind: "space", sp: "Gone" }, spaces)).toBe("Gone");
  });

  test("the main list of a space is read as Inbox", () => {
    expect(titleOf({ kind: "list", list: "Design/Tasks/task-list.md" })).toBe("Inbox");
    expect(titleOf({ kind: "list", list: "Design/Tasks/Compras.md" })).toBe("Compras");
  });
});

describe("spaceOfView", () => {
  const layout = { tasksFolder: "jott.tasks", notesFolder: "jott.notes" };

  test("a file lives in the folder above it, not in the first segment", () => {
    // The first segment is the GROUP, which owns no colour of its own.
    expect(spaceOfView({ kind: "list", list: "Design/Tasks/task-list.md" })).toBe(
      "Design/Tasks",
    );
  });

  test("the fixed screens are placed by the layout, and only by it", () => {
    expect(spaceOfView({ kind: "tasks" }, layout)).toBe("jott.tasks");
    expect(spaceOfView({ kind: "completed" }, layout)).toBe("jott.tasks");
    expect(spaceOfView({ kind: "notes" }, layout)).toBe("jott.notes");
    expect(spaceOfView({ kind: "tasks" })).toBeNull();
  });

  test("a screen inside no space answers with nothing", () => {
    expect(spaceOfView({ kind: "home" }, layout)).toBeNull();
    expect(spaceOfView({ kind: "trash" }, layout)).toBeNull();
    expect(spaceOfView(null, layout)).toBeNull();
  });
});
