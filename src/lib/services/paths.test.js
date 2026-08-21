// Reading a list's address, and how it is named on screen.

import { describe, expect, test } from "vitest";
import {
  extensionOf,
  folderOf,
  listName,
  listTitle,
  listLabel,
  splitLabel,
  taskSpacePaths,
} from "./paths.js";

describe("taskSpacePaths", () => {
  const lists = [
    { path: "Work/task-list.md", name: "task-list", space: "Work" },
    { path: "Work/completed.md", name: "completed", space: "Work" },
    { path: "Work/Deeper/Nope.md", name: "Nope", space: "Work/Deeper" },
  ];

  test("the space's one list, and the Completed beside it", () => {
    expect(taskSpacePaths({ folder: "Work" }, lists)).toEqual({
      list: "Work/task-list.md",
      completed: "Work/completed.md",
    });
  });

  test("a folder that is missing answers with nothing", () => {
    expect(taskSpacePaths({ folder: null }, lists).list).toBeNull();
  });
});

describe("listLabel", () => {
  // 2026-08-13: what a picker shows is WHERE the list lives, not what its file
  // is called. Every tasks space's list is `task-list.md`, so the stem says
  // nothing — and before the fixed names it said something WRONG, because a
  // renamed space left its old file name behind ("Tasks/Work").
  test("a loose space is named alone", () => {
    expect(listLabel({ space: "Mercado", name: "task-list" })).toBe("Mercado");
  });

  test("one inside a group carries the group, group first", () => {
    expect(listLabel({ space: "Design/Tasks", name: "task-list" })).toBe(
      "Design/Tasks",
    );
  });

  test("an extra hand-made list is the one case the stem is needed", () => {
    // A tasks space is ONE list by spec, but nothing stops someone from
    // dropping a second `.md` in the folder — and then the stem is the only
    // thing telling the two apart.
    expect(listLabel({ space: "Design/Tasks", name: "Compras" })).toBe(
      "Design/Tasks/Compras",
    );
  });

  test("with no space it falls back to the file stem", () => {
    expect(listLabel({ path: "somewhere/Avulsa.md" })).toBe("Avulsa");
  });

  test("splitLabel gives the two halves the menus draw in different greys", () => {
    expect(splitLabel({ space: "Design/Tasks", name: "task-list" })).toEqual({
      context: "Design",
      name: "Tasks",
    });
    expect(splitLabel({ space: "Mercado", name: "task-list" })).toEqual({
      context: "",
      name: "Mercado",
    });
  });
});

describe("folderOf", () => {
  test("the folder holding a file, however deep", () => {
    expect(folderOf("Design/Tasks/task-list.md")).toBe("Design/Tasks");
    expect(folderOf("jott.tasks/completed.md")).toBe("jott.tasks");
  });

  test("nothing above it is an empty address, not a slice of the name", () => {
    // The root case: a space at the top of the notebook has no holder, and
    // `slice(0, -1)` on a slash-less string would have answered with the name
    // minus its last letter.
    expect(folderOf("Mercado")).toBe("");
    expect(folderOf("")).toBe("");
    expect(folderOf(null)).toBe("");
  });
});

describe("listName / listTitle", () => {
  test("listName is the file stem, and only that", () => {
    expect(listName("jott.tasks/task-list.md")).toBe("task-list");
  });

  test("listTitle reads the main list as Inbox, never as its file name", () => {
    // `task-list` is structure — hyphenated, lowercase, identical in every
    // space. Wherever a list's own name is SHOWN (a card's list field, the
    // composer's chip, the inspector's footer) the thing is called Inbox.
    expect(listTitle("jott.tasks/task-list.md")).toBe("Inbox");
    expect(listTitle("Design/Tasks/task-list.md")).toBe("Inbox");
  });

  test("a hand-made second list keeps its own name", () => {
    // The only case where the stem carries information.
    expect(listTitle("Design/Tasks/Compras.md")).toBe("Compras");
  });
});

describe("extensionOf", () => {
  test("the extension, lowercased, of the leaf alone", () => {
    expect(extensionOf("assets/FOTO.PNG")).toBe("png");
    expect(extensionOf("nota.md")).toBe("md");
    expect(extensionOf("arquivo.tar.gz")).toBe("gz");
  });

  test("nothing to ask by: no extension, a dot in a folder, no name at all", () => {
    expect(extensionOf("Makefile")).toBe("");
    expect(extensionOf("pasta.v2/README")).toBe("");
    expect(extensionOf(null)).toBe("");
    expect(extensionOf(undefined)).toBe("");
  });
});
