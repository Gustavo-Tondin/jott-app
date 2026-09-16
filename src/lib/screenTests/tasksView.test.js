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
import { ringBox, ringQuadrant, ringRowCenter } from "../services/ring.js";
import ActionRing from "../components/ActionRing.svelte";

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

  // A press that rests on a card opens the ACTION RING around the finger
  // (2026-09-14). It used to enter selection mode; selection is a row of the
  // ring's ⋮ now, which is what the second half of this test walks.
  const holdCard = async (card) => {
    const down = new Event("pointerdown", { bubbles: true });
    Object.assign(down, { button: 0, pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 40, clientY: 40 });
    card.dispatchEvent(down);
    await new Promise((r) => setTimeout(r, 450));
  };

  /// The point of the LAST square — the ⋮, at the bottom of the column the
  /// hold opened (services/ring.js).
  const lastRow = (at, count = 5) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const box = ringBox(at, viewport, count, ringQuadrant(at, viewport));
    return ringRowCenter(box, count - 1);
  };

  const releaseOnLastSlice = (card, at = { x: 40, y: 40 }) => {
    const up = new Event("pointerup", { bubbles: true });
    const point = lastRow(at);
    Object.assign(up, { pointerId: 1, clientX: point.x, clientY: point.y });
    card.dispatchEvent(up);
  };

  test("holding a card lifts it and opens the ring instead of selecting", async () => {
    bridge({
      list_tasks: [task("a1", "Fix website"), task("a2", "Send invoice")],
      day_tasks: [],
      grouped_suggestions: [],
    });
    const { container } = render(TasksView, { props: props({ compact: true }) });
    const card = await screen.findByText("Fix website");
    await holdCard(card);

    const row = card.closest(".task-row");
    await waitFor(() => expect(row.classList.contains("reorder-item--carried")).toBe(true));
    // Nothing is picked, and the bulk bar never came up.
    expect(row.classList.contains("task-row--selected")).toBe(false);
    expect(container.querySelector(".bulkbar__count")).toBeNull();

    // Let go on the card itself: the ring cancels and the card comes home —
    // which is also what keeps it out of the drag layer for the next test.
    const up = new Event("pointerup", { bubbles: true });
    Object.assign(up, { pointerId: 1, clientX: 40, clientY: 40 });
    card.dispatchEvent(up);
    await waitFor(() => expect(row.classList.contains("reorder-item--carried")).toBe(false));
  });

  test("a mouse resting on a card does nothing: the hold no longer selects", async () => {
    // 2026-09-16: the long press of a mouse used to mark the card and turn
    // the screen over to picking. The ring took that job (right button on a
    // desktop), so a cursor held still is just a cursor held still.
    bridge({
      list_tasks: [task("a1", "Fix website"), task("a2", "Send invoice")],
      day_tasks: [],
      grouped_suggestions: [],
    });
    const { container } = render(TasksView, { props: props({ compact: true }) });
    const card = await screen.findByText("Fix website");
    const down = new Event("pointerdown", { bubbles: true });
    Object.assign(down, { button: 0, pointerId: 1, pointerType: "mouse", isPrimary: true, clientX: 40, clientY: 40 });
    card.dispatchEvent(down);
    // Longer than either rest the action ever waited (400ms, and the 700ms
    // this screen used to ask for).
    await new Promise((r) => setTimeout(r, 750));

    const row = card.closest(".task-row");
    expect(row.classList.contains("task-row--picked")).toBe(false);
    expect(row.classList.contains("reorder-item--carried")).toBe(false);
    expect(container.querySelector(".bulkbar__count")).toBeNull();

    const up = new Event("pointerup", { bubbles: true });
    Object.assign(up, { pointerId: 1, clientX: 40, clientY: 40 });
    card.dispatchEvent(up);
  });

  test("the ring's Edit opens the title in a small card, and Enter saves it", async () => {
    bridge({
      list_tasks: [task("a1", "Fix website"), task("a2", "Send invoice")],
      day_tasks: [],
      grouped_suggestions: [],
      edit_task_text: null,
    });
    render(ActionRing);
    render(TasksView, { props: props({ compact: true }) });
    const card = await screen.findByText("Fix website");
    await holdCard(card);
    await waitFor(() => expect(document.querySelector(".action-ring__pill")).toBeTruthy());
    const labels = [...document.querySelectorAll(".action-ring__pill")].map((el) =>
      el.getAttribute("aria-label"),
    );
    const at = { x: 40, y: 40 };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const box = ringBox(at, viewport, labels.length, ringQuadrant(at, viewport));
    const point = ringRowCenter(box, labels.indexOf("Edit"));
    const move = new Event("pointermove", { bubbles: true });
    Object.assign(move, { pointerId: 1, clientX: point.x, clientY: point.y });
    card.dispatchEvent(move);
    const up = new Event("pointerup", { bubbles: true });
    Object.assign(up, { pointerId: 1, clientX: point.x, clientY: point.y });
    card.dispatchEvent(up);

    const field = await screen.findByLabelText("Title");
    expect(field.value).toBe("Fix website");
    await userEvent.clear(field);
    await userEvent.type(field, "Fix the website{Enter}");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("edit_task_text", {
        list: "jott.tasks/task-list.md",
        id: "a1",
        text: "Fix the website",
      }),
    );
    expect(screen.queryByLabelText("Title")).toBe(null);
  });

  test("the ring's Reorder slice turns the screen over to picking, with nothing picked", async () => {
    bridge({
      list_tasks: [task("a1", "Fix website"), task("a2", "Send invoice")],
      day_tasks: [],
      grouped_suggestions: [],
    });
    render(ActionRing);
    const { container } = render(TasksView, { props: props({ compact: true }) });
    const card = await screen.findByText("Fix website");
    await holdCard(card);
    // The same squares as a note's, in the same order — the ring is read off
    // the screen, and the finger let go on the "Reorder" square (services/ring.js).
    await waitFor(() => expect(document.querySelector(".action-ring__pill")).toBeTruthy());
    const labels = [...document.querySelectorAll(".action-ring__pill")].map((el) =>
      el.getAttribute("aria-label"),
    );
    expect(labels[0]).toBe("Pin");
    expect(labels.at(-1)).toBe("More");
    expect(labels.indexOf("Reorder")).toBe(labels.length - 2);
    expect(labels).not.toContain("Complete");
    const at = { x: 40, y: 40 };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const box = ringBox(at, viewport, labels.length, ringQuadrant(at, viewport));
    const point = ringRowCenter(box, labels.indexOf("Reorder"));
    const move = new Event("pointermove", { bubbles: true });
    Object.assign(move, { pointerId: 1, clientX: point.x, clientY: point.y });
    card.dispatchEvent(move);
    const up = new Event("pointerup", { bubbles: true });
    Object.assign(up, { pointerId: 1, clientX: point.x, clientY: point.y });
    card.dispatchEvent(up);

    // Entered from the ring, nothing is marked yet: a click marks from here.
    await waitFor(() =>
      expect(container.querySelector(".bulkbar__count").textContent).toBe("0 selected"),
    );
    // The click that follows a release is the gesture's own and is swallowed
    // for a frame (reorder.js); this one is a new click.
    await new Promise((r) => setTimeout(r, 40));
    await userEvent.click(screen.getByText("Send invoice"));
    await waitFor(() =>
      expect(container.querySelector(".bulkbar__count").textContent).toBe("1 selected"),
    );
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
      notes_of_today: [],
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
