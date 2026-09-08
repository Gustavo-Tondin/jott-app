import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { bridge, callsTo, commandsCalled, resetBridge } from "../test/bridge.js";
import { confirmRequest, nameRequest, setConfirmPolicy } from "../services/dialog.js";
import { S } from "../services/strings.js";
import { makeNotebookWrites } from "./notebookWrites.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

/// Answers the next name or confirmation dialog once it is on screen.
async function name(reply) {
  await tick();
  get(nameRequest).resolve(reply);
  await tick();
}
async function confirm(ok) {
  await tick();
  get(confirmRequest).resolve({ ok });
  await tick();
}

function shell(view = { kind: "home" }) {
  const calls = {
    goTo: vi.fn(),
    openTab: vi.fn(),
    replaceTabView: vi.fn(),
    reload: vi.fn(),
    setError: vi.fn(),
  };
  // Not `then?.(await run())`: optional chaining skips the argument too.
  const change = async (run, then) => {
    const result = await run();
    then?.(result);
  };
  const writes = makeNotebookWrites({
    change,
    view: () => view,
    inbox: () => "jott.tasks/task-list.md",
    ...calls,
  });
  return { calls, writes };
}

beforeEach(() => {
  resetBridge();
  nameRequest.set(null);
  confirmRequest.set(null);
  setConfirmPolicy({ settings: {}, save: () => {} });
});

describe("a space and a group share one set of writes", () => {
  it("renaming asks with the container's own words and trims the answer", async () => {
    const { writes } = shell();
    const space = writes.renameSpaceTo("Design", "Design");
    await tick();
    expect(get(nameRequest).title).toBe(S.promptRenameSpace("Design"));
    await name(" Marca ");
    await space;
    expect(callsTo("rename_space")).toEqual([{ folder: "Design", name: "Marca" }]);

    const group = writes.renameGroupTo("Work", "Work");
    await tick();
    expect(get(nameRequest).title).toBe(S.renameGroup);
    await name("Jobs");
    await group;
    expect(callsTo("rename_group")).toEqual([{ folder: "Work", name: "Jobs" }]);
  });

  it("a cancelled rename writes nothing", async () => {
    const { writes } = shell();
    const renaming = writes.renameSpaceTo("Design", "Design");
    await name(null);
    await renaming;
    expect(commandsCalled()).toEqual([]);
  });

  it("appearance is written as given, with nothing standing in for null", async () => {
    const { writes } = shell();
    await writes.setSpaceAppearance("Design", "red", undefined);
    await writes.setGroupAppearanceAt("Work", undefined, "star");
    expect(callsTo("set_space_appearance")).toEqual([{ folder: "Design", color: "red", icon: null }]);
    expect(callsTo("set_group_appearance")).toEqual([{ folder: "Work", color: null, icon: "star" }]);
  });

  it("moving into a group, and back out with null", async () => {
    const { writes } = shell();
    await writes.moveSpaceTo("Design", "Work");
    await writes.moveGroupTo("Work", null);
    expect(callsTo("move_space")).toEqual([{ name: "Design", intoGroup: "Work" }]);
    expect(callsTo("move_group")).toEqual([{ name: "Work", intoGroup: null }]);
  });

  it("deleting asks first, and only the space being looked at sends the tab Home", async () => {
    const { calls, writes } = shell({ kind: "space", sp: "Design" });
    const refused = writes.deleteSpaceAt("Design", "Design");
    await confirm(false);
    await refused;
    expect(commandsCalled()).toEqual([]);

    const gone = writes.deleteSpaceAt("Design", "Design");
    await confirm(true);
    await gone;
    expect(callsTo("delete_space")).toEqual([{ folder: "Design" }]);
    expect(calls.goTo).toHaveBeenCalledWith({ kind: "home" });

    const other = writes.deleteGroupAt("Work", "Work");
    await confirm(true);
    await other;
    expect(callsTo("delete_group")).toEqual([{ folder: "Work" }]);
    expect(calls.goTo).toHaveBeenCalledTimes(1);
  });

  it("a deleted space that was not on screen moves nothing", async () => {
    const { calls, writes } = shell({ kind: "space", sp: "Other" });
    const gone = writes.deleteSpaceAt("Design", "Design");
    await confirm(true);
    await gone;
    expect(calls.goTo).not.toHaveBeenCalled();
  });
});

describe("making a space or a group", () => {
  it("a space is born as a list or a notepad, inside a group, and opens in a tab", async () => {
    const { calls, writes } = shell();
    bridge({ create_space_in: "Work/Notas" });
    const making = writes.createSpace("notes", "Work");
    await tick();
    expect(get(nameRequest).title).toBe(S.promptNewNotepad);
    await name(" Notas ");
    await making;
    expect(callsTo("create_space_in")).toEqual([{ name: "Notas", kind: "notes", group: "Work" }]);
    expect(calls.openTab).toHaveBeenCalledWith({ kind: "space", sp: "Work/Notas" });
  });

  it("a blank name makes nothing", async () => {
    const { writes } = shell();
    const making = writes.createSpace();
    await tick();
    expect(get(nameRequest).title).toBe(S.promptNewList);
    await name("   ");
    await making;
    expect(commandsCalled()).toEqual([]);
  });

  it("a group is made where it was asked for", async () => {
    const { writes } = shell();
    const making = writes.createGroup("Work");
    await name("Sub");
    await making;
    expect(callsTo("create_group")).toEqual([{ name: "Sub", group: "Work" }]);
  });
});

describe("a space's arrangement", () => {
  it("writes to the space the getter names now, and nothing when there is none", async () => {
    const { writes } = shell();
    let at = null;
    const arrangement = writes.arrangementOf(() => at);
    expect(arrangement.setSort("title")).toBeNull();
    at = "Design";
    await arrangement.setSort("title");
    await arrangement.setOrder(["a", "b"]);
    await arrangement.setNoteLayout("grid");
    expect(callsTo("set_space_sort")).toEqual([{ space: "Design", sort: "title" }]);
    expect(callsTo("set_space_order")).toEqual([{ space: "Design", order: ["a", "b"] }]);
    expect(callsTo("set_space_note_layout")).toEqual([{ space: "Design", layout: "grid" }]);
  });
});

describe("the open list", () => {
  it("renaming keeps the folder and moves the tab to the new file", async () => {
    const { calls, writes } = shell({ kind: "list", list: "jott.tasks/Compras.md" });
    const renaming = writes.renameCurrentList();
    await tick();
    expect(get(nameRequest).value).toBe("Compras");
    await name(" Mercado ");
    await renaming;
    expect(callsTo("rename_list")).toEqual([{ from: "jott.tasks/Compras.md", to: "Mercado" }]);
    expect(calls.replaceTabView).toHaveBeenCalledWith(
      { kind: "list", list: "jott.tasks/Compras.md" },
      { kind: "list", list: "jott.tasks/Mercado.md" },
    );
    expect(calls.reload).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the tab is not a list", async () => {
    const { writes } = shell({ kind: "home" });
    await writes.renameCurrentList();
    await writes.deleteCurrentList();
    expect(get(nameRequest)).toBeNull();
    expect(get(confirmRequest)).toBeNull();
  });

  it("deleting goes to the Inbox and says how many tasks were rescued", async () => {
    const { calls, writes } = shell({ kind: "list", list: "jott.tasks/Compras.md" });
    bridge({ delete_list: 3 });
    const deleting = writes.deleteCurrentList();
    await confirm(true);
    await deleting;
    expect(callsTo("delete_list")).toEqual([{ name: "jott.tasks/Compras.md" }]);
    expect(calls.goTo).toHaveBeenCalledWith({ kind: "list", list: "jott.tasks/task-list.md" });
    expect(calls.setError).toHaveBeenCalledWith(S.tasksRescued(3, "Compras"));
  });

  it("an empty list deleted rescues nothing and says nothing", async () => {
    const { calls, writes } = shell({ kind: "list", list: "jott.tasks/Compras.md" });
    bridge({ delete_list: 0 });
    const deleting = writes.deleteCurrentList();
    await confirm(true);
    await deleting;
    expect(calls.setError).not.toHaveBeenCalled();
  });
});
