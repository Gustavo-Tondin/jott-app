// The fixed Tasks screen and the suggestions panel it opens.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { bridge, invoke } from "../test/bridge.js";
import { noop, resetScreens, task } from "../test/screens.js";
import { originOf } from "../services/origin.js";

// The note editor's engine is stubbed by a textarea — `lib/test/screens.js`
// says why. `vi.mock` is hoisted per file, so it cannot live there.
vi.mock("../components/Editor.svelte", async () => await import("../components/EditorStub.svelte"));

const { default: App } = await import("../../App.svelte");
const { default: TasksView } = await import("../screens/TasksView.svelte");

beforeEach(resetScreens);

describe("TasksView", () => {
  // The screen IS the tasks widget (2026-08-06) over the notebook's own
  // Inbox; since 2026-09-04 it is that alone — the day is the Home's
  // calendar. What the screen changes is only where a new task comes from —
  // the pinned bar, not the blue button.
  const props = (extra = {}) => ({
    inbox: "jott.tasks/task-list.md",
    today: "2026-07-20",
    lists: [
      { path: "jott.tasks/task-list.md", name: "Inbox" },
      { path: "jott.tasks/completed.md", name: "Completed" },
    ],
    completedName: "completed",
    readOnly: false,
    reloadKey: 0,
    onChanged: noop,
    onError: noop,
    onSelect: noop,
    ...extra,
  });

  test("Index shows the Inbox widget's list and its Completed, with no New task button", async () => {
    bridge({
      list_tasks: (args) =>
        args.list === "jott.tasks/task-list.md"
          ? [task("a1", "Comprar leite")]
          : [task("b2", "Pagar boleto", { done: true })],
    });

    render(TasksView, { props: props() });

    expect(await screen.findByText("Comprar leite")).toBeTruthy();
    expect(await screen.findByText("Completed 1")).toBeTruthy();
    // Adding happens in the bar, so the header (and its button) is gone.
    expect(screen.queryByText("New task")).toBeNull();
    expect(screen.getByPlaceholderText("Create a task…")).toBeTruthy();
  });

  test("a dragged task saves the arrangement it landed in", async () => {
    // The same hole the fixed Notes board had, in the fixed Tasks screen: the
    // drag played out in full, called an `onSetOrder` nobody had passed, and
    // the order was dropped on release (user report, 2026-08-19 — found while
    // fixing the touch gesture, and it would have hidden the fix entirely).
    const saved = [];
    bridge({
      list_tasks: (args) =>
        args.list === "jott.tasks/task-list.md"
          ? [task("a1", "Comprar leite"), task("b2", "Pagar boleto")]
          : [],
    });

    const { container } = render(TasksView, {
      props: props({ onSetOrder: (order) => saved.push(order) }),
    });
    await screen.findByText("Comprar leite");

    const rows = [...container.querySelectorAll(".task-row")];
    expect(rows.length).toBe(2);
    rows.forEach((row, i) => {
      row.getBoundingClientRect = () => ({
        left: 0, right: 300, width: 300,
        top: i * 60, bottom: i * 60 + 60, height: 60, x: 0, y: i * 60,
        toJSON() {},
      });
    });

    // A mouse: immediate, the way it always was (touch waits — reorder.js).
    fireEvent.pointerDown(rows[0], { button: 0, pointerId: 1, pointerType: "mouse", clientX: 10, clientY: 10 });
    fireEvent.pointerMove(rows[0], { pointerId: 1, pointerType: "mouse", clientX: 10, clientY: 100 });
    fireEvent.pointerUp(rows[0], { pointerId: 1, pointerType: "mouse", clientX: 10, clientY: 100 });

    await waitFor(() => expect(saved).toEqual([["b2", "a1"]]));
  });

  test("the bar writes into the list the chip points at", async () => {
    bridge({ list_tasks: [], create_task: 0 });

    render(TasksView, { props: props() });
    await userEvent.type(
      await screen.findByPlaceholderText("Create a task…"),
      "Ligar pro dentista{Enter}",
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_task", {
        list: "jott.tasks/task-list.md",
        text: "Ligar pro dentista",
      }),
    );
  });

  test("asked for every list, the screen reads the whole notebook, arranged by space", async () => {
    // `tasksShowAll` (Settings › Tasks, 2026-09-04): one flat list of every
    // open task, each card wearing its space's colour as the origin bar, and
    // no Completed fold — the Completed screen is where finished work is.
    const lists = [
      { path: "jott.tasks/task-list.md", name: "task-list", space: "Tasks" },
      { path: "Obra/task-list.md", name: "task-list", space: "Obra" },
    ];
    bridge({
      all_tasks: [
        { path: "jott.tasks/task-list.md", task: task("a1", "Da Inbox") },
        { path: "Obra/task-list.md", task: task("b2", "Da obra") },
      ],
      list_tasks: [task("z9", "Nunca lida", { done: true })],
    });

    render(TasksView, {
      props: props({
        showAll: true,
        lists,
        origin: (item) => originOf(item, { lists, colors: { Obra: "orange" } }),
      }),
    });

    expect(await screen.findByText("Da Inbox")).toBeTruthy();
    expect(screen.getByText("Da obra")).toBeTruthy();
    expect(invoke).not.toHaveBeenCalledWith("list_tasks", expect.anything());
    expect(screen.queryByText(/Completed/)).toBeNull();
    const bars = [...document.querySelectorAll(".task-row .theme-origin")].map((b) =>
      b.getAttribute("style"),
    );
    expect(bars).toContain("--dot: var(--app-5);");
  });

  // A press that rests on a card enters selection mode WITH that card picked
  // (it came in unmarked once: the entry under the finger and the one in the
  // host's list were two objects for one task, 2026-08-21).
  test("holding a card selects it and raises the bulk bar", async () => {
    bridge({
      list_tasks: [task("a1", "Fix website"), task("a2", "Send invoice")],
      day_tasks: [],
      grouped_suggestions: [],
    });
    const { container } = render(TasksView, { props: props({ compact: true }) });
    const card = await screen.findByText("Fix website");
    const down = new Event("pointerdown", { bubbles: true });
    Object.assign(down, { button: 0, pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 40, clientY: 40 });
    card.dispatchEvent(down);
    await new Promise((r) => setTimeout(r, 450));
    await waitFor(() =>
      expect(card.closest(".task-row").classList.contains("task-row--selected")).toBe(true),
    );
    expect(container.querySelector(".bulkbar__count").textContent).toBe("1 selected");
  });

});

describe("the suggestions panel", () => {
  // Suggestions live in the RIGHT PANEL since 2026-08-06 — the same panel the
  // inspector uses, because a list you read through and act on repeatedly
  // should not be a card floating over the tasks you compare it against.
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

  const onHome = (extra = {}) =>
    bridge({
      last_notebook: "/n",
      open_notebook: notebook,
      notebook_snapshot: {
        info: notebook,
        clock: {
          today: "2026-07-21",
          weekStartsOn: "monday",
          nextDailyTurn: "2026-07-22T00:00:00Z",
        },
        counts: {},
        conflicts: [],
        spaces: [],
      },
      screen_to_restore: "home",
      note_folders: [],
      notes_created_today: [],
      list_tasks: [],
      day_sort: null,
      ...extra,
    });

  const suggestions = [
    { path: "jott.tasks/Compras.md", space: "Tasks", task: task("b2", "Vencida", { due: "2026-07-05" }), group: "urgent" },
    { path: "jott.tasks/Compras.md", space: "Tasks", task: task("c3", "Tranquila"), group: "lists" },
  ];

  test("the pill fills the right panel, grouped, and a row pulls", async () => {
    onHome({
      day_tasks: [{ path: "jott.tasks/Compras.md", task: task("a1", "Arrumar site") }],
      grouped_suggestions: suggestions,
      pull_into_day: true,
    });
    render(App);

    await screen.findByText("Arrumar site");
    // Nothing is fetched until the panel is asked for.
    expect(invoke.mock.calls.some(([cmd]) => cmd === "grouped_suggestions")).toBe(false);

    await userEvent.click(screen.getByText("Suggestions"));

    expect(await screen.findByText("Suggestions for today")).toBeTruthy();
    expect(screen.getByText("Urgent")).toBeTruthy();
    // "From the lists" is gone: each list has its own heading now, space
    // in front (user call, 2026-08-06) — and since 2026-08-26 the heading is
    // the origin badge: the readable address in the space's colour.
    expect(screen.queryByText("From the lists")).toBeNull();
    const pane = document.querySelector(".suggestions-pane");
    expect(within(pane).getByText("Tasks/Compras")).toBeTruthy();
    // Dates in the panel read like every other date in the app.
    expect(screen.getByText("07/05/2026")).toBeTruthy();

    // Every heading folds its section away.
    await userEvent.click(screen.getByText("Urgent"));
    await waitFor(() => expect(screen.queryByText("Vencida")).toBeNull());
    await userEvent.click(screen.getByText("Urgent"));
    expect(await screen.findByText("Vencida")).toBeTruthy();

    await userEvent.click(screen.getByText("Vencida"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pull_into_day", {
        day: null,
        list: "jott.tasks/Compras.md",
        id: "b2",
      }),
    );
    // Pulling keeps the panel open — pulling several in a row is the gesture.
    expect(screen.queryByText("Suggestions for today")).not.toBeNull();
  });

  test("the row taken lifts out of the list before the task is written", async () => {
    // The other end of the arrival on the card: the suggestion leaves the
    // panel upwards, and only then is the day written (suggestions.css owns
    // how long). Nothing playing writes at once, which is every other test here.
    onHome({ day_tasks: [], grouped_suggestions: suggestions, pull_into_day: true });
    render(App);

    await userEvent.click(await screen.findByText("Suggestions"));
    const taken = (await screen.findByText("Vencida")).closest("li");
    // An engine that reports the lift playing, and lets the test end it.
    let end;
    const finished = new Promise((resolve) => (end = resolve));
    taken.getAnimations = () => [{ animationName: "suggestions-pane-lift", finished }];

    await userEvent.click(screen.getByText("Vencida"));
    await waitFor(() =>
      expect(taken.classList.contains("suggestions-pane__row--leaving")).toBe(true),
    );
    expect(invoke).not.toHaveBeenCalledWith("pull_into_day", expect.anything());

    end();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pull_into_day", {
        day: null,
        list: "jott.tasks/Compras.md",
        id: "b2",
      }),
    );
  });

  test("what left the day comes back under its own heading", async () => {
    // 2026-08-17: the core answers `recent` for a task that WAS in Today and
    // left. The panel gives it a section of its own, after what is pressing
    // and before the plain lists.
    onHome({
      day_tasks: [],
      grouped_suggestions: [
        ...suggestions,
        {
          path: "jott.tasks/Compras.md",
          space: "Tasks",
          task: task("d4", "Tirei do dia ontem"),
          group: "recent",
        },
      ],
    });
    render(App);

    await userEvent.click(await screen.findByText("Suggestions"));
    await screen.findByText("Suggestions for today");

    const pane = document.querySelector(".suggestions-pane");
    expect(within(pane).getByText("Pulled recently")).toBeTruthy();
    expect(within(pane).getByText("Tirei do dia ontem")).toBeTruthy();
    // It is NOT filed under its list: it is being offered for a different
    // reason than "it exists in a list somewhere".
    const headings = [...pane.querySelectorAll(".suggestions-pane__group-title")].map(
      (b) => b.textContent,
    );
    const at = (label) => headings.findIndex((h) => h.includes(label));
    expect(at("Pulled recently")).toBeGreaterThan(at("Urgent"));
    // And before the plain lists, which are the last thing offered.
    expect(at("Pulled recently")).toBeLessThan(at("Tasks/Compras"));
  });

  test("opening a task takes the panel back, and Escape closes it", async () => {
    // One right panel: the two must never try to share it.
    onHome({
      day_tasks: [{ path: "jott.tasks/Compras.md", task: task("a1", "Arrumar site") }],
      grouped_suggestions: suggestions,
    });
    render(App);

    // Let the shell finish opening the notebook before driving it.
    await screen.findByText("Arrumar site");
    await userEvent.click(screen.getByText("Suggestions"));
    await screen.findByText("Suggestions for today");

    await userEvent.click(screen.getByText("Arrumar site"));
    await waitFor(() => expect(screen.queryByText("Suggestions for today")).toBeNull());
    expect(screen.getByLabelText("task name")).toBeTruthy();

    // And back the other way, then Escape.
    await userEvent.click(screen.getByText("Suggestions"));
    await screen.findByText("Suggestions for today");
    expect(screen.queryByLabelText("task name")).toBeNull();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Suggestions for today")).toBeNull());
  });
});
