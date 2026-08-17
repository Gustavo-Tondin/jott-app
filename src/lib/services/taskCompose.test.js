// The one path a composed task takes to disk.
//
// Worth its own test because the ORDER of the bridge calls is the rule: the id
// is asked for only when something needs it, and a period is joined after the
// task exists. Getting either wrong is silent — the task still appears, just
// with a comment nobody asked for, or missing from the day it was typed into.

import { beforeEach, describe, expect, test, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args) => invoke(...args) }));

const { composeTask, emptyIntent } = await import(
  "./taskCompose.js"
);

const calls = () => invoke.mock.calls.map(([cmd]) => cmd);

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation((cmd) => {
    if (cmd === "create_task") return Promise.resolve(4);
    if (cmd === "ensure_task_id") return Promise.resolve("a1");
    return Promise.resolve(null);
  });
});

describe("composeTask", () => {
  test("a plain task is written without ever asking for an id", async () => {
    // The lazy id is the whole reason a checklist stays free of comments.
    const id = await composeTask({ ...emptyIntent("Tasks/Inbox/Inbox.md"), text: "Pão" });

    expect(id).toBeNull();
    expect(calls()).toEqual(["create_task"]);
    expect(invoke).toHaveBeenCalledWith("create_task", {
      list: "Tasks/Inbox/Inbox.md",
      text: "Pão",
    });
  });

  test("a due date makes it addressable, and lands in one set_task_fields", async () => {
    await composeTask({
      ...emptyIntent("Tasks/Inbox/Inbox.md"),
      text: "Pagar",
      due: "2026-08-15",
    });

    expect(calls()).toEqual(["create_task", "ensure_task_id", "set_task_fields"]);
    expect(invoke).toHaveBeenCalledWith("ensure_task_id", {
      list: "Tasks/Inbox/Inbox.md",
      position: 4,
    });
    expect(invoke).toHaveBeenCalledWith("set_task_fields", {
      list: "Tasks/Inbox/Inbox.md",
      id: "a1",
      fields: { due: "2026-08-15" },
    });
  });

  test("a period is joined after the task exists", async () => {
    const id = await composeTask(
      { ...emptyIntent("Tasks/Inbox/Inbox.md"), text: "Regar" },
      { period: "day" },
    );

    expect(id).toBe("a1");
    // Not before: pulling needs something to point at.
    expect(calls()).toEqual(["create_task", "ensure_task_id", "pull_into_period"]);
    expect(invoke).toHaveBeenCalledWith("pull_into_period", {
      period: "day",
      list: "Tasks/Inbox/Inbox.md",
      id: "a1",
    });
  });

  test("every field the composer collects travels in the same one call", async () => {
    // The four the row offers (user call, 2026-08-06). A half-applied edit is
    // worse than none — `set_task_fields` exists for exactly that.
    await composeTask({
      ...emptyIntent("Tasks/Inbox/Inbox.md"),
      text: "Pagar",
      due: "2026-08-15",
      priority: "1",
      repeatUnit: "week",
      repeatEvery: 2,
    });

    expect(calls()).toEqual(["create_task", "ensure_task_id", "set_task_fields"]);
    const [, args] = invoke.mock.calls.find(([cmd]) => cmd === "set_task_fields");
    expect(args.fields).toEqual({
      due: "2026-08-15",
      // A number, not the select's string: the core takes 1-3.
      priority: 1,
      repeat: "every-2-weeks",
    });
  });

  test("nothing is written without text or without a list", async () => {
    expect(await composeTask({ ...emptyIntent("Tasks/Inbox/Inbox.md"), text: "   " })).toBeNull();
    expect(await composeTask({ ...emptyIntent(null), text: "Pão" })).toBeNull();
    expect(calls()).toEqual([]);
  });
});
