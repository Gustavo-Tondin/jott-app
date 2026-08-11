// Reading a list's address.

import { describe, expect, test } from "vitest";
import { listName, taskWidgetPaths } from "./paths.js";

describe("taskWidgetPaths", () => {
  const lists = [
    { path: "Tasks/Tasks.md", name: "Tasks" },
    { path: "Tasks/Completed.md", name: "Completed" },
    { path: "Tasks/Deeper/Nope.md", name: "Nope" },
  ];

  test("the workspace's one list, and the Completed beside it", () => {
    expect(taskWidgetPaths({ folder: "Tasks" }, lists)).toEqual({
      list: "Tasks/Tasks.md",
      completed: "Tasks/Completed.md",
    });
  });

  test("a folder that is missing answers with nothing", () => {
    expect(taskWidgetPaths({ folder: null }, lists).list).toBeNull();
  });
});
