// A list of tasks: the rows, the keyboard on them, and the date each one shows.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { bridge, invoke } from "../test/bridge.js";
import { noop, resetScreens, task } from "../test/screens.js";
import ListView from "../screens/ListView.svelte";

beforeEach(resetScreens);

describe("the task list's keyboard (2026-08-18)", () => {
  // Before this, a task card could not be reached by keyboard at all: the
  // whole list was click-only. These guard the two rules that are easy to
  // lose — focus moves without dragging the inspector along with it, and a
  // press inside a field is typing, never a command.

  const twoTasks = () => [task("a1", "Comprar leite"), task("a2", "Regar plantas")];

  const listProps = (over = {}) => ({
    list: "jott.tasks/Compras.md",
    readOnly: false,
    onChanged: noop,
    onError: noop,
    reloadKey: 0,
    ...over,
  });

  test("gives exactly one card the Tab stop, and the arrows move it", async () => {
    bridge({ list_tasks: twoTasks() });
    const { container } = render(ListView, { props: listProps() });
    await screen.findByText("Comprar leite");

    const cards = () => [...container.querySelectorAll(".task-row")];
    expect(cards().map((c) => c.getAttribute("tabindex"))).toEqual(["0", "-1"]);

    await fireEvent.keyDown(container.querySelector(".theme-task-list"), {
      key: "ArrowDown",
    });
    await waitFor(() =>
      expect(cards().map((c) => c.getAttribute("tabindex"))).toEqual(["-1", "0"]),
    );
  });

  test("moving the focus does NOT open the inspector — Enter does", async () => {
    bridge({ list_tasks: twoTasks() });
    const opened = [];
    const { container } = render(ListView, {
      props: listProps({ onSelect: (list, t) => opened.push(t.text) }),
    });
    await screen.findByText("Comprar leite");
    const list = container.querySelector(".theme-task-list");

    // Ten cards would mean ten reloads of the inspector; arrowing is looking.
    await fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(opened).toEqual([]);

    await fireEvent.keyDown(list, { key: "Enter" });
    expect(opened).toEqual(["Regar plantas"]);
  });

  test("Space completes the card the keyboard is on", async () => {
    bridge({ list_tasks: twoTasks(), ensure_task_id: "a1", complete_task: null });
    const { container } = render(ListView, { props: listProps() });
    await screen.findByText("Comprar leite");

    await fireEvent.keyDown(container.querySelector(".theme-task-list"), { key: " " });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("complete_task", {
        list: "jott.tasks/Compras.md",
        id: "a1",
      }),
    );
  });

  test("a press inside a field is typing, not a command", async () => {
    bridge({ list_tasks: twoTasks() });
    const { container } = render(ListView, { props: listProps() });
    await screen.findByText("Comprar leite");

    // A Space typed into the screen's own field is a space in a word. The
    // press bubbles up to the list, so only `typing()` keeps it from
    // completing a task instead.
    const field = await screen.findByPlaceholderText("New task…");
    await fireEvent.keyDown(field, { key: " ", bubbles: true });
    expect(
      invoke.mock.calls.some(([cmd]) => cmd === "complete_task"),
      "a space typed into a field completed a task",
    ).toBe(false);

    // The same press on the list itself does complete — otherwise this test
    // would pass with the keyboard switched off entirely. (These tasks carry
    // ids, so `ensureTaskId` resolves without a round trip and the first
    // call to reach the bridge is the completion itself.)
    await fireEvent.keyDown(container.querySelector(".theme-task-list"), { key: " " });
    await waitFor(() =>
      expect(invoke.mock.calls.some(([cmd]) => cmd === "complete_task")).toBe(true),
    );
  });

  test("a read-only notebook has no Delete key", async () => {
    bridge({ list_tasks: twoTasks() });
    const { container } = render(ListView, { props: listProps({ readOnly: true }) });
    await screen.findByText("Comprar leite");

    await fireEvent.keyDown(container.querySelector(".theme-task-list"), {
      key: "Delete",
    });
    expect(invoke).not.toHaveBeenCalledWith("delete_task", expect.anything());
  });
});

describe("ListView", () => {
  test("shows the tasks of the list it was given", async () => {
    bridge({ list_tasks: [task("a1", "Comprar leite")] });

    render(ListView, {
      props: { list: "jott.tasks/Compras.md", readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    expect(await screen.findByText("Comprar leite")).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith("list_tasks", { list: "jott.tasks/Compras.md" });
  });

  test("does not highlight when nothing is selected", async () => {
    bridge({ list_tasks: [task(null, "Regar plantas")] });

    const { container } = render(ListView, {
      props: {
        list: "jott.tasks/Compras.md",
        readOnly: false,
        onChanged: noop,
        onError: noop,
        reloadKey: 0,
        selectedId: null,
        selectedTask: null,
      },
    });

    await screen.findByText("Regar plantas");
    expect(container.querySelector(".task-row--selected")).toBeNull();
  });

  test("adding a task calls create_task and reloads", async () => {
    bridge({ list_tasks: [], create_task: "novo" });

    render(ListView, {
      props: { list: "jott.tasks/Inbox.md", readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    await userEvent.type(await screen.findByPlaceholderText("New task…"), "Ligar pro dentista");
    await userEvent.click(screen.getByText("Add"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_task", {
        list: "jott.tasks/Inbox.md",
        text: "Ligar pro dentista",
      }),
    );
    // Reloaded after acting, so the new task actually shows up.
    expect(invoke.mock.calls.filter(([cmd]) => cmd === "list_tasks").length).toBeGreaterThan(1);
  });

  test("a repeat's fresh occurrence never inherits the ticked checkbox", async () => {
    // Completing an id-less task swaps it for the next occurrence at the same
    // position; the positional {#each} key reuses the DOM node, whose checkbox
    // the click had already ticked (real-use bug, 2026-08-05). The row must
    // re-assert `checked` from the task it now shows.
    let completed = false;
    bridge({
      list_tasks: () =>
        completed
          ? [task(null, "repeat", { due: "2026-08-08", repeat: { every: 1, unit: "day" } })]
          : [task(null, "repeat", { due: "2026-08-07", repeat: { every: 1, unit: "day" } })],
      ensure_task_id: "a1",
      complete_task: () => {
        completed = true;
        return {};
      },
    });

    render(ListView, {
      props: { list: "jott.tasks/Inbox.md", readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    const box = await screen.findByLabelText("complete");
    await userEvent.click(box);

    await screen.findByText("08/08/2026");
    const fresh = screen.getByLabelText("complete");
    await waitFor(() => expect(fresh.checked).toBe(false));
  });

  test("swiping a card left sends it to the trash", async () => {
    // The gesture belongs to any list, not only the ones a widget draws
    // (2026-08-06). Left is delete; it goes to the notebook's own trash, so
    // there is nothing to confirm.
    bridge({
      list_tasks: [task("a1", "Comprar leite")],
      ensure_task_id: "a1",
      delete_task: null,
    });

    const { container } = render(ListView, {
      props: { list: "jott.tasks/Compras.md", readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });
    await screen.findByText("Comprar leite");
    const row = container.querySelector(".task-row");

    // The square only exists while the card is travelling.
    expect(row.querySelector(".swipe__action--delete")).not.toBeNull();
    await fireEvent.pointerDown(row, { button: 0, pointerId: 1, clientX: 300, clientY: 20 });
    await fireEvent.pointerMove(row, { pointerId: 1, clientX: 200, clientY: 22 });
    expect(row.getAttribute("data-swipe")).toBe("left");
    await fireEvent.pointerUp(row, { pointerId: 1, clientX: 200, clientY: 22 });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_task", {
        list: "jott.tasks/Compras.md",
        id: "a1",
      }),
    );
    // And it settles back: the card is not left hanging off to one side.
    expect(row.getAttribute("data-swipe")).toBeNull();
  });

  test("checking a task completes it", async () => {
    bridge({ list_tasks: [task("a1", "Comprar leite")], complete_task: {} });

    render(ListView, {
      props: { list: "jott.tasks/Compras.md", readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    await userEvent.click(await screen.findByLabelText("complete"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("complete_task", { list: "jott.tasks/Compras.md", id: "a1" }),
    );
  });

  test("pulling sends the task to today", async () => {
    // No "→ Week" since 2026-09-04: the week became any day ahead on the
    // Home's calendar, and a list offers only the one day it can name.
    bridge({ list_tasks: [task("a1", "Comprar leite")], pull_into_day: true });

    render(ListView, {
      props: { list: "jott.tasks/Compras.md", readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    expect(screen.queryByText("→ Week")).toBeNull();
    await userEvent.click(await screen.findByText("→ Today"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pull_into_day", {
        day: null,
        list: "jott.tasks/Compras.md",
        id: "a1",
      }),
    );
  });

  test("duplicated ids still render every line", async () => {
    // The core de-duplicates ids on read, but not on a read-only notebook —
    // and a duplicate key makes Svelte abort the whole list, which showed up
    // as an empty Inbox while the same task still appeared under Today.
    bridge({
      list_tasks: [task("abc123", "Comprar leite"), task("abc123", "Comprar leite")],
    });

    render(ListView, {
      props: { list: "jott.tasks/Inbox.md", readOnly: true, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    await waitFor(() =>
      expect(screen.getAllByText("Comprar leite").length).toBe(2),
    );
  });

  test("completing a task with no id gives it one first", async () => {
    // How this showed up: completing a repeating task writes the next
    // occurrence as a *fresh* line, with no id — it has never been referenced.
    // Ticking that one sent id: null over the bridge and the command refused
    // it ("invalid type: null, expected a string").
    bridge({
      list_tasks: [task(null, "Regar plantas", { repeat: { every: 1, unit: "day" } })],
      ensure_task_id: "new1",
      complete_task: {},
    });

    render(ListView, {
      props: { list: "jott.tasks/Compras.md", readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    await userEvent.click(await screen.findByLabelText("complete"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("complete_task", {
        list: "jott.tasks/Compras.md",
        id: "new1",
      }),
    );
  });

  test("pulling a task with no id gives it one first", async () => {
    // Written by hand in another editor: there is nothing to reference in the
    // day state until the core hands out an id.
    bridge({
      list_tasks: [task(null, "Escrita à mão")],
      ensure_task_id: "new1",
      pull_into_day: true,
    });

    render(ListView, {
      props: { list: "jott.tasks/Compras.md", readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    await userEvent.click(await screen.findByText("→ Today"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pull_into_day", {
        day: null,
        list: "jott.tasks/Compras.md",
        id: "new1",
      }),
    );
  });

  test("clicking a task opens it instead of renaming it", async () => {
    bridge({ list_tasks: [task("a1", "Comprar leite")] });
    const opened = [];

    render(ListView, {
      props: {
        list: "jott.tasks/Compras.md",
        readOnly: false,
        onChanged: noop,
        onError: noop,
        reloadKey: 0,
        onSelect: (list, t) => opened.push([list, t.id]),
      },
    });

    await userEvent.click(await screen.findByText("Comprar leite"));

    expect(opened).toEqual([["jott.tasks/Compras.md", "a1"]]);
  });

  test("a read-only notebook offers no way to add tasks", async () => {
    bridge({ list_tasks: [task("a1", "Comprar leite")] });

    render(ListView, {
      props: { list: "jott.tasks/Compras.md", readOnly: true, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    await screen.findByText("Comprar leite");
    expect(screen.queryByPlaceholderText("New task…")).toBeNull();
  });

  test("a failing command is reported instead of swallowed", async () => {
    const errors = [];
    bridge({
      list_tasks: [],
      create_task: () => Promise.reject({ kind: "io", message: "disco cheio" }),
    });

    render(ListView, {
      props: {
        list: "jott.tasks/Compras.md",
        readOnly: false,
        onChanged: noop,
        onError: (e) => errors.push(e),
        reloadKey: 0,
      },
    });

    await userEvent.type(await screen.findByPlaceholderText("New task…"), "qualquer");
    await userEvent.click(screen.getByText("Add"));

    await waitFor(() => expect(errors.length).toBeGreaterThan(0));
    expect(errors[0].kind).toBe("io");
  });
});

describe("date display", () => {
  test("a task's date follows the notebook's format", async () => {
    // The file always stores ISO; only the drawing changes.
    bridge({ list_tasks: [task("a1", "Pagar", { due: "2026-07-05" })] });

    render(ListView, {
      props: {
        list: "jott.tasks/Inbox.md",
        readOnly: false,
        onChanged: noop,
        onError: noop,
        reloadKey: 0,
        dateFormat: "yyyy/mm/dd",
      },
    });

    expect(await screen.findByText("2026/07/05")).toBeTruthy();
    expect(screen.queryByText("07/05/2026")).toBeNull();
  });

  test("the default shape is the documented one", async () => {
    bridge({ list_tasks: [task("a1", "Pagar", { due: "2026-07-05" })] });

    render(ListView, {
      props: {
        list: "jott.tasks/Inbox.md",
        readOnly: false,
        onChanged: noop,
        onError: noop,
        reloadKey: 0,
      },
    });

    // Month first, and every shape uses `/` (user call, 2026-08-06).
    expect(await screen.findByText("07/05/2026")).toBeTruthy();
  });
});
