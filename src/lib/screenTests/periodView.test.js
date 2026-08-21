// Today and This week — the two period screens, and the sun that puts a task in today.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { bridge, invoke } from "../test/bridge.js";
import { noop, resetScreens, task } from "../test/screens.js";

// The note editor's engine is stubbed by a textarea — `lib/test/screens.js`
// says why. `vi.mock` is hoisted per file, so it cannot live there.
vi.mock("../components/Editor.svelte", async () => await import("../components/EditorStub.svelte"));

const { default: PeriodView } = await import("../screens/PeriodView.svelte");
const { default: App } = await import("../../App.svelte");

beforeEach(resetScreens);

describe("PeriodView", () => {
  const props = {
    period: "day",
    clock: { today: "2026-07-20", weekStart: "2026-07-20" },
    lists: [
      { path: "jott.tasks/task-list.md", name: "Inbox" },
      { path: "jott.tasks/completed.md", name: "Completed" },
    ],
    inbox: "jott.tasks/task-list.md",
    readOnly: false,
    onChanged: noop,
    onError: noop,
    reloadKey: 0,
  };

  test("the pill asks the shell to open the suggestions panel", async () => {
    // Suggestions moved out of a popover and into the right panel (user call,
    // 2026-08-06): the screen only asks, because the panel outlives it — you
    // can switch from Today to Week with the list still open.
    const asked = [];
    bridge({
      period_tasks: [{ path: "jott.tasks/Compras.md", task: task("a1", "Puxada") }],
    });

    render(PeriodView, { props: { ...props, onSuggest: (p) => asked.push(p) } });

    expect(await screen.findByText("Puxada")).toBeTruthy();
    await userEvent.click(screen.getByText("Suggestions"));
    expect(asked).toEqual(["day"]);
    // The screen itself never fetches them any more.
    expect(invoke.mock.calls.some(([cmd]) => cmd === "grouped_suggestions")).toBe(false);
  });

  test("the composing bar writes to a real list and pulls it into the period", async () => {
    // A period only ever holds references, so a task typed here is written to
    // a list (the Inbox by default) and then pulled in — one path for every
    // caller, `services/taskCompose.js`.
    bridge({
      period_tasks: [],
      grouped_suggestions: [],
      create_task: 3,
      ensure_task_id: "novo",
      pull_into_period: true,
    });

    render(PeriodView, { props });

    await userEvent.type(
      await screen.findByPlaceholderText("Create a task…"),
      "Responder e-mail{Enter}",
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_task", {
        list: "jott.tasks/task-list.md",
        text: "Responder e-mail",
      }),
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pull_into_period", {
        period: "day",
        list: "jott.tasks/task-list.md",
        id: "novo",
      }),
    );
  });

  test("a due date typed into the bar is written with the task", async () => {
    bridge({
      period_tasks: [],
      grouped_suggestions: [],
      create_task: 0,
      ensure_task_id: "novo",
      set_task_fields: null,
      pull_into_period: true,
    });

    render(PeriodView, { props });

    await userEvent.type(await screen.findByPlaceholderText("Create a task…"), "Pagar");
    // The quick fields only appear once there is something to attach them to.
    await userEvent.click(screen.getByLabelText("Due date"));
    await userEvent.click(await screen.findByText("15"));
    await userEvent.click(screen.getByLabelText("Add"));

    await waitFor(() => {
      const call = invoke.mock.calls.find(([cmd]) => cmd === "set_task_fields");
      expect(call?.[1].fields.due).toMatch(/-15$/);
    });
  });

  test("completing an id-less task from the day screen also works", async () => {
    // Same bug as in ListView: a respawned repetition can be sitting in Today.
    bridge({
      period_tasks: [{ path: "jott.tasks/Compras.md", task: task(null, "Regar plantas") }],
      grouped_suggestions: [],
      ensure_task_id: "new1",
      list_tasks: [task(null, "Regar plantas")],
      complete_task: {},
    });

    render(PeriodView, { props });
    await userEvent.click(await screen.findByLabelText("complete"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("complete_task", {
        list: "jott.tasks/Compras.md",
        id: "new1",
      }),
    );
  });

  // Through the SWIPE, which is the only way out of a period since the per-card
  // × was dropped (2026-08-20). The rule it guards is the one that matters: a
  // period holds references, so leaving one deletes nothing.
  test("removing a pulled task only touches the period", async () => {
    bridge({
      period_tasks: [{ path: "jott.tasks/Compras.md", task: task("a1", "Puxada") }],
      grouped_suggestions: [],
      ensure_task_id: "a1",
      remove_from_period: true,
    });

    const { container } = render(PeriodView, { props });
    await screen.findByText("Puxada");
    const row = container.querySelector(".task-row");

    await fireEvent.pointerDown(row, { button: 0, pointerId: 1, clientX: 100, clientY: 20 });
    await fireEvent.pointerMove(row, { pointerId: 1, clientX: 200, clientY: 22 });
    expect(row.getAttribute("data-swipe")).toBe("right");
    await fireEvent.pointerUp(row, { pointerId: 1, clientX: 200, clientY: 22 });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("remove_from_period", {
        period: "day",
        list: "jott.tasks/Compras.md",
        id: "a1",
      }),
    );
    expect(invoke.mock.calls.some(([cmd]) => cmd === "complete_task")).toBe(false);
    expect(invoke.mock.calls.some(([cmd]) => cmd === "delete_task")).toBe(false);
  });

  test("the week screen asks for week data", async () => {
    // `grouped_suggestions`, not `period_suggestions`: mocking the command the
    // screen stopped calling in phase 6 left `suggestions` null and threw
    // while rendering, which vitest reported as an unhandled error instead of
    // a failing test.
    bridge({ period_tasks: [], grouped_suggestions: [] });

    render(PeriodView, { props: { ...props, period: "week" } });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("period_tasks", { period: "week" }),
    );
  });
});

describe("the sun that says a task is in today", () => {
  test("a list card is marked, and the inspector's sun lights and toggles", async () => {
    // The card's sun is a marker, like the date beside it; the inspector's is
    // the switch (user call, 2026-08-06).
    const notebook = {
      path: "/n",
      name: "n",
      readOnly: false,
      lists: [
        { path: "jott.tasks/task-list.md", name: "Inbox" },
        { path: "jott.tasks/completed.md", name: "Completed" },
      ],
      layout: {
        inbox: "jott.tasks/task-list.md",
        completed: "jott.tasks/completed.md",
        tasksFolder: "jott.tasks",
        completedName: "completed",
        notesFolder: "jott.notes",
        notesInbox: "",
        dateDisplayFormat: "mm/dd/yyyy",
        closeInspectorOnClickAway: false,
        quickNoteFolder: "Inbox",
      },
    };
    bridge({
      last_notebook: "/n",
      open_notebook: notebook,
      notebook_snapshot: {
        info: notebook,
        clock: {
          today: "2026-07-21",
          weekStart: "2026-07-20",
          nextDailyTurn: "2026-07-22T00:00:00Z",
          nextWeeklyTurn: "2026-07-27T00:00:00Z",
        },
        counts: {},
        conflicts: [],
        spaces: [],
        groups: [],
        tags: [],
        // "Comprar leite" is in today; "Pagar boleto" is not.
        day: [{ path: "jott.tasks/task-list.md", id: "a1" }],
      },
      screen_to_restore: "list:jott.tasks/task-list.md",
      note_folders: [],
      list_tasks: [task("a1", "Comprar leite"), task("b2", "Pagar boleto")],
      remove_from_period: true,
      set_task_fields: null,
    });
    const { container } = render(App);

    const marked = (text) =>
      screen.getByText(text).closest(".task-row").querySelector(".task-row__meta");
    await screen.findByText("Comprar leite");
    await waitFor(() => expect(marked("Comprar leite")).not.toBeNull());
    expect(marked("Pagar boleto")).toBeNull();
    expect(container).toBeTruthy();

    // The inspector's sun is lit for the one in today, and pressing it takes
    // the task back out.
    await userEvent.click(screen.getByText("Comprar leite"));
    const sun = await screen.findByRole("button", { name: "Take out of My Day" });
    await userEvent.click(sun);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("remove_from_period", {
        period: "day",
        list: "jott.tasks/task-list.md",
        id: "a1",
      }),
    );
  });
});
