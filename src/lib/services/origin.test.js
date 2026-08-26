import { describe, expect, test } from "vitest";
import { originOf } from "./origin.js";

const lists = [
  { path: "jott.tasks/task-list.md", name: "task-list", space: "Tasks" },
  { path: "jott.tasks/completed.md", name: "completed", space: "Tasks" },
  { path: "Design/Tasks/task-list.md", name: "task-list", space: "Design/Tasks" },
  { path: "Mercado/task-list.md", name: "task-list", space: "Mercado" },
  { path: "Mercado/Extra.md", name: "Extra", space: "Mercado" },
];
const spaces = [
  { path: "jott.notes", name: "Notes", kind: "notes" },
  { path: "Ideias", name: "Ideias", kind: "notes" },
];
const colors = { "Design/Tasks": "blue", Mercado: "orange", Ideias: "green" };
const ctx = { lists, spaces, colors };

describe("originOf", () => {
  test("a card from the fixed space reads Tasks, in no colour of its own", () => {
    expect(originOf({ list: "jott.tasks/task-list.md" }, ctx)).toEqual({
      label: "Tasks",
      color: null,
    });
  });

  test("a card from a grouped space wears the group's readable address and colour", () => {
    expect(originOf({ list: "Design/Tasks/task-list.md" }, ctx)).toEqual({
      label: "Design/Tasks",
      color: "blue",
    });
  });

  test("a hand-made list beside the Inbox keeps its stem, like the picker", () => {
    expect(originOf({ list: "Mercado/Extra.md" }, ctx)).toEqual({
      label: "Mercado/Extra",
      color: "orange",
    });
  });

  test("a completed task, which carries only its address, is named by its sibling list", () => {
    expect(originOf({ path: "Mercado/completed.md" }, ctx)).toEqual({
      label: "Mercado",
      color: "orange",
    });
  });

  test("a note hit is placed by its folder, named by the space", () => {
    expect(originOf({ kind: "note", path: "Ideias/Plano.md", folder: "Ideias" }, ctx)).toEqual({
      label: "Ideias",
      color: "green",
    });
  });

  test("the core's own name wins over the lookup", () => {
    expect(originOf({ path: "Design/Tasks/task-list.md", space: "Work" }, ctx).label).toBe("Work");
  });

  test("inside its own space there is nothing to say", () => {
    expect(originOf({ list: "Mercado/task-list.md" }, { ...ctx, here: "Mercado" })).toBeNull();
  });

  test("an address nothing answers for gets no badge — never a folder name", () => {
    expect(originOf({ path: "Loose/task-list.md" }, ctx)).toBeNull();
    expect(originOf(null, ctx)).toBeNull();
  });
});
