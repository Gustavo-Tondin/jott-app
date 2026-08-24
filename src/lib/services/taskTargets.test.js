// Where a quick task can land (2026-08-24) — the tasks mirror of
// noteTargets.test.js, down to what survives the fixed space being hidden.

import { describe, expect, test } from "vitest";
import { quickTaskTarget, taskTargets } from "./taskTargets.js";

const SETUP = {
  inbox: "jott.tasks/task-list.md",
  completed: "jott.tasks/completed.md",
  lists: [
    { path: "jott.tasks/task-list.md", name: "Inbox" },
    { path: "jott.tasks/completed.md", name: "Completed" },
    { path: "jott.tasks/compras.md", name: "compras" },
  ],
  spaces: [
    { path: "jott.tasks", name: "Tasks", kind: "tasks", fixed: true },
    { path: "Design/Tasks", name: "Tarefas Design", kind: "tasks" },
    { path: "Design Notes", name: "Design Notes", kind: "notes" },
  ],
};

describe("taskTargets", () => {
  test("offers the Inbox, the fixed space's lists, then the user's task spaces", () => {
    const targets = taskTargets(SETUP);
    expect(targets.map((t) => t.label)).toEqual(["Inbox", "compras", "Tarefas Design"]);
    // "" is the Inbox — the value a notebook that never chose still means.
    expect(targets.map((t) => t.value)).toEqual(["", "compras", "Design/Tasks"]);
    // What the capture writes to: a LIST path, the user space's main list.
    expect(targets[2].list).toBe("Design/Tasks/task-list.md");
  });

  test("with the fixed space hidden, only the user's task spaces remain", () => {
    const targets = taskTargets({ ...SETUP, fixedShown: false });
    expect(targets.map((t) => t.value)).toEqual(["Design/Tasks"]);
  });

  test("…unless the Home is showing that space: then the Inbox stays a door", () => {
    const targets = taskTargets({ ...SETUP, fixedShown: false, inboxOnHome: true });
    expect(targets.map((t) => t.value)).toEqual(["", "Design/Tasks"]);
  });

  test("a note space is never a place for a task", () => {
    expect(taskTargets(SETUP).some((t) => t.value === "Design Notes")).toBe(false);
  });
});

describe("quickTaskTarget", () => {
  test("answers the stored choice, and falls back to the first offered", () => {
    const targets = taskTargets(SETUP);
    expect(quickTaskTarget("Design/Tasks", targets)?.list).toBe("Design/Tasks/task-list.md");
    expect(quickTaskTarget("sumiu", targets)?.label).toBe("Inbox");
    expect(quickTaskTarget("", [])).toBeNull();
  });
});
