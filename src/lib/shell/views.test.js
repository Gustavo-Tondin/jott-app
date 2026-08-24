// The four questions the shell asks about a view. They used to be functions
// inside App.svelte, reachable only by mounting the whole app.

import { describe, expect, test } from "vitest";
import { landing, reachable, spaceOfView, titleOf, viewFromId } from "./views.js";
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
      { kind: "list", list: "Design/Tasks/task-list.md" },
      { kind: "space", sp: "Design/Tasks" },
    ];
    for (const view of views) {
      expect(viewFromId(viewId(view))).toEqual(view);
    }
  });

  test("a legacy day/week id opens the Tasks screen, not the Completed", () => {
    // Today and This Week stopped being views of their own when they became
    // sub-tabs of the Tasks screen. A session remembered on one of the old
    // ids used to come back as {kind: "period"}, which no screen branch
    // handled — the {:else} fell to the Completed view.
    expect(viewFromId("day")).toEqual({ kind: "tasks" });
    expect(viewFromId("week")).toEqual({ kind: "tasks" });
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

  test("a hidden fixed space takes its own screens, and only its own", () => {
    // Fixed spaces (2026-08-24): the layout is what tells the fixed space's
    // files from a user space's, which stay reachable regardless.
    const layout = { tasksFolder: "jott.tasks", notesFolder: "jott.notes" };
    expect(reachable({ kind: "tasks" }, off("tasksSpace"), layout)).toBe(false);
    expect(reachable({ kind: "completed" }, off("tasksSpace"), layout)).toBe(false);
    expect(
      reachable({ kind: "list", list: "jott.tasks/task-list.md" }, off("tasksSpace"), layout),
    ).toBe(false);
    expect(
      reachable({ kind: "list", list: "Design/Tasks/task-list.md" }, off("tasksSpace"), layout),
    ).toBe(true);
    expect(reachable({ kind: "notes" }, off("notesSpace"), layout)).toBe(false);
    expect(
      reachable({ kind: "note", folder: "jott.notes", path: "a.md" }, off("notesSpace"), layout),
    ).toBe(false);
    expect(
      reachable({ kind: "note", folder: "Design/Notes", path: "a.md" }, off("notesSpace"), layout),
    ).toBe(true);
    expect(reachable({ kind: "home" }, off("homeSpace"))).toBe(false);
  });

  test("Settings is always somewhere to be", () => {
    expect(reachable({ kind: "settings" }, () => false)).toBe(true);
  });
});

describe("landing", () => {
  const off = (...keys) => (key) => !keys.includes(key);

  test("Home, unless Home is hidden — then the first fixed screen standing", () => {
    expect(landing()).toEqual({ kind: "home" });
    expect(landing(off("homeSpace"))).toEqual({ kind: "tasks" });
    expect(landing(off("homeSpace", "tasksSpace"))).toEqual({ kind: "notes" });
    // Every door closed: the app still opens somewhere.
    expect(landing(() => false)).toEqual({ kind: "home" });
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
