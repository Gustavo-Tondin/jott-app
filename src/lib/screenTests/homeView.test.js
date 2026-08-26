// Home — the day, with no files of its own.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { bridge, invoke } from "../test/bridge.js";
import { noop, resetScreens, task } from "../test/screens.js";
import HomeView from "../screens/HomeView.svelte";
import { originOf } from "../services/origin.js";

beforeEach(resetScreens);

describe("HomeView", () => {
  const props = (extra = {}) => ({
    notesFolder: "jott.notes",
    // The targets the shell computes (services/noteTargets.js): the fixed
    // space's folders, plus any user note space.
    noteTargets: [
      { space: "jott.notes", folder: "Inbox", label: "Inbox", value: "Inbox" },
      { space: "jott.notes", folder: "Clientes", label: "Clientes", value: "Clientes" },
    ],
    readOnly: false,
    onChanged: noop,
    onError: noop,
    onOpenNote: noop,
    onSelectTask: noop,
    lists: [
      { path: "jott.tasks/task-list.md", name: "Inbox" },
      { path: "jott.tasks/completed.md", name: "Completed" },
    ],
    inbox: "jott.tasks/task-list.md",
    reloadKey: 0,
    ...extra,
  });

  test("shows the day's tasks and the notes written today", async () => {
    bridge({
      period_tasks: [{ path: "jott.tasks/Inbox.md", task: task("a1", "Arrumar site") }],
      notes_created_today: [
        {
          path: "Inbox/ideia.md",
          title: "ideia",
          folder: "Inbox",
          preview: "uma ideia",
          created: "2026-07-21",
          pinned: false,
        },
      ],
    });

    render(HomeView, { props: props() });

    expect(await screen.findByText("Arrumar site")).toBeTruthy();
    expect(screen.getByText("ideia")).toBeTruthy();
    // The Home owns no notes: it asks for today's, it does not store them.
    expect(invoke).toHaveBeenCalledWith("notes_created_today", { folder: "jott.notes" });
  });

  test("a card pulled into the day says where it came from, in the space's colour", async () => {
    // The colour grammar (2026-08-26): outside its space a card wears ONE
    // colour, the origin badge — the space's readable name, never the folder.
    const lists = [
      { path: "jott.tasks/task-list.md", name: "task-list", space: "Tasks" },
      { path: "Design/Tasks/task-list.md", name: "task-list", space: "Design/Tasks" },
    ];
    const colors = { "Design/Tasks": "blue" };
    bridge({
      period_tasks: [
        { path: "jott.tasks/task-list.md", task: task("a1", "Arrumar site") },
        { path: "Design/Tasks/task-list.md", task: task("b2", "Logo do cliente") },
      ],
      notes_created_today: [],
    });

    render(HomeView, {
      props: props({ lists, origin: (item) => originOf(item, { lists, colors }) }),
    });

    expect(await screen.findByText("Logo do cliente")).toBeTruthy();
    // Colour alone, as a bar on the card's edge (wireframe "Home Screen -
    // mobile", 2026-08-26): the name would compete with the task.
    const bars = document.querySelectorAll(".task-row .theme-origin");
    expect(bars).toHaveLength(2);
    const styles = [...bars].map((b) => b.getAttribute("style"));
    expect(styles).toContain("--dot: var(--app-blue);");
    // The fixed space: the app's accent, which is the bar's own default.
    expect(styles).toContain(null);
    expect(screen.queryByText(/jott\.tasks|Design\/Tasks/)).toBeNull();
  });

  test("a card dragged with Ctrl onto a space in the sidebar moves into its Inbox", async () => {
    // The free drag (2026-08-26): Ctrl at pointerdown, no rest, no axis lock,
    // and the sidebar's spaces are the only places it can land. The zone is
    // what the sidebar draws (`data-space-drop`), planted here by hand.
    const lists = [
      { path: "jott.tasks/task-list.md", name: "task-list", space: "Tasks" },
      { path: "Mercado/task-list.md", name: "task-list", space: "Mercado" },
    ];
    bridge({
      period_tasks: [{ path: "jott.tasks/task-list.md", task: task("a1", "Comprar pão") }],
      notes_created_today: [],
      move_task: {},
      pull_into_period: {},
    });
    const zone = document.createElement("div");
    zone.dataset.spaceDrop = "Mercado";
    zone.dataset.spaceKind = "tasks";
    zone.getBoundingClientRect = () => ({ left: 0, right: 100, top: 500, bottom: 540, width: 100, height: 40, x: 0, y: 500, toJSON() {} });
    document.body.append(zone);
    render(HomeView, { props: props({ lists }) });

    const row = (await screen.findByText("Comprar pão")).closest(".task-row");
    await fireEvent.pointerDown(row, { button: 0, pointerId: 1, clientX: 10, clientY: 10, ctrlKey: true });
    await fireEvent.pointerMove(row, { pointerId: 1, clientX: 40, clientY: 200 });
    await fireEvent.pointerMove(row, { pointerId: 1, clientX: 50, clientY: 520 });
    expect(zone.classList.contains("reorder-item--into")).toBe(true);
    await fireEvent.pointerUp(row, { pointerId: 1, clientX: 50, clientY: 520 });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("move_task", {
        from: "jott.tasks/task-list.md",
        id: "a1",
        to: "Mercado/task-list.md",
      }),
    );
    zone.remove();
  });

  test("today's notes are drawn as the board's cards, banner and all", async () => {
    // Home draws THE note card now (2026-08-19), not a copy of it: the banner,
    // the title on its chip and the first lines. It had a card of its own from
    // before a note could have a banner at all, and it was the copy that fell
    // behind.
    bridge({
      period_tasks: [],
      notes_created_today: [
        {
          path: "Inbox/ideia.md",
          title: "ideia",
          folder: "Inbox",
          preview: "uma ideia",
          created: "2026-07-21",
          pinned: false,
          banner: { kind: "color", value: "yellow" },
        },
      ],
    });

    const { container } = render(HomeView, { props: props() });

    expect(await screen.findByText("ideia")).toBeTruthy();
    expect(screen.getByText("uma ideia")).toBeTruthy();
    expect(container.querySelector(".note-card__banner")).toBeTruthy();
    // …and the card's own actions with it (2026-08-25). It used to carry
    // neither ⋮ nor pin, on the reading that what a note IS belongs where the
    // note lives — which on a phone, with no right button, left a note on the
    // Home with no action at all.
    expect(container.querySelector(".note-card__more")).toBeTruthy();
    expect(container.querySelector(".note-card__pin")).toBeTruthy();
  });

  test("a card of the day offers the same rows the board offers", async () => {
    bridge({
      period_tasks: [],
      notes_created_today: [
        {
          path: "Inbox/ideia.md",
          title: "ideia",
          folder: "Inbox",
          preview: "uma ideia",
          created: "2026-07-21",
          pinned: false,
        },
      ],
      set_note_pinned: null,
    });

    const { container } = render(HomeView, { props: props() });
    await screen.findByText("ideia");

    await userEvent.click(container.querySelector(".note-card__more"));
    const rows = [...document.querySelectorAll(".menu__list > .menu__item > .menu__link")].map(
      (el) => el.textContent.trim(),
    );
    // The same four the board offers, in the same order.
    expect(rows).toEqual(["Pin", "Move to…", "Duplicate", "Delete"]);

    // The pin is a button of its own, because a pin is a STATE: the card has
    // to say whether it is pinned without being asked.
    await userEvent.click(container.querySelector(".note-card__pin"));
    await waitFor(() =>
      // Named with the SPACE Home was given — it looks into one, it does not
      // live in it.
      expect(invoke).toHaveBeenCalledWith("set_note_pinned", {
        folder: "jott.notes",
        path: "Inbox/ideia.md",
        pinned: true,
      }),
    );
  });

  test("a read-only notebook still opens a card of the day in a new tab", async () => {
    // The one row that is not a write.
    bridge({
      period_tasks: [],
      notes_created_today: [
        { path: "Inbox/ideia.md", title: "ideia", folder: "Inbox", created: "2026-07-21" },
      ],
    });

    const { container } = render(HomeView, { props: props({ readOnly: true }) });
    await screen.findByText("ideia");

    expect(container.querySelector(".note-card__more")).toBeNull();
    await fireEvent.contextMenu(container.querySelector(".note-card"));
    const rows = [...document.querySelectorAll(".context-menu button")].map((el) =>
      el.textContent.trim(),
    );
    expect(rows).toEqual(["Open in new tab"]);
  });

  test("the capture box writes a note where the notes ⋮ points", async () => {
    // ONE box for both halves (2026-08-13): the segmented control says where
    // what you typed goes, and the notes block's ⋮ says into which folder.
    bridge({ period_tasks: [], notes_created_today: [], quick_capture_note: "Clientes/x.md" });

    render(HomeView, { props: props() });

    await userEvent.click(await screen.findByLabelText("notes options"));
    await userEvent.click(await screen.findByText("Clientes"));

    await userEvent.click(screen.getByRole("button", { name: "Note" }));
    // Enter saves; Shift+Enter would be a new line.
    await userEvent.type(
      await screen.findByPlaceholderText("New note…"),
      "Comprar cimento{Enter}",
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("quick_capture_note", {
        folder: "jott.notes",
        inFolder: "Clientes",
        text: "Comprar cimento",
      }),
    );
  });

  test("the + makes a blank note and opens it when nothing was typed", async () => {
    // User call, 2026-08-24: the desktop's + is the phone's + — with the Note
    // half armed and an empty field it makes the note and goes to the page,
    // instead of sitting there greyed out.
    bridge({ period_tasks: [], notes_created_today: [], create_note: "Inbox/Untitled.md" });
    const opened = [];
    render(HomeView, { props: props({ onOpenNote: (...args) => opened.push(args) }) });

    await userEvent.click(await screen.findByRole("button", { name: "Note" }));
    const plus = screen.getByRole("button", { name: "New note" });
    expect(plus.disabled).toBe(false);
    await userEvent.click(plus);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_note", {
        folder: "jott.notes",
        inFolder: "Inbox",
        title: "Untitled",
      }),
    );
    // And it hands the note over OPENED, marked fresh so the cursor lands in
    // the body rather than on the board.
    await waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0][0]).toBe("Inbox/Untitled.md");
    expect(opened[0][2]).toEqual({ fresh: true });
    // Nothing was captured: an empty note is created, never written.
    expect(invoke.mock.calls.some(([cmd]) => cmd === "quick_capture_note")).toBe(false);
  });

  test("the + stays out of reach for an empty TASK — a row nobody can read", async () => {
    bridge({ period_tasks: [], notes_created_today: [] });
    render(HomeView, { props: props() });

    await userEvent.click(await screen.findByRole("button", { name: "Task" }));
    expect(screen.getByRole("button", { name: "capture task" }).disabled).toBe(true);
  });

  test("pointed at a source, the block reads its whole Inbox and says so", async () => {
    // `homeNotesSource` (user call, 2026-08-24): every Inbox note of the
    // chosen space, not just today's — and the heading names the source.
    bridge({ period_tasks: [], inbox_notes: [] });
    render(HomeView, {
      props: props({ notesSource: { space: "jott.notes", label: "Inbox notes" } }),
    });

    expect(await screen.findByText("Inbox notes")).toBeTruthy();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("inbox_notes", { folder: "jott.notes" }));
    expect(invoke).not.toHaveBeenCalledWith("notes_created_today", { folder: "jott.notes" });
  });

  test("pointed at a task space, the block hosts it even with My Day off", async () => {
    // `homeTasksSource` (user call, 2026-08-24): the tasks block hosts the
    // chosen space whole — the workflow that survives hiding the Tasks
    // screen, which turns My Day off with it.
    bridge({ notes_created_today: [], list_tasks: [task("a1", "Pagar boleto")] });
    render(HomeView, {
      props: props({
        f: (key) => key !== "myDay" && key !== "week",
        tasksSource: {
          source: { kind: "tasks", known: true, folder: "jott.tasks", name: null, sort: null, order: [] },
          label: "Inbox",
        },
      }),
    });

    expect(await screen.findByText("Pagar boleto")).toBeTruthy();
  });

  test("with the fixed space hidden, a quick note still lands in another notepad", async () => {
    // The shell computes the targets with the fixed space left out: only the
    // user's note space is offered, and the capture writes THERE (user call,
    // 2026-08-24: "ainda deveria ser possível criar uma nota rápida, mas ela
    // vai pra outro caderno").
    bridge({ period_tasks: [], notes_created_today: [], quick_capture_note: "Inbox/x.md" });
    render(HomeView, {
      props: props({
        noteTargets: [
          { space: "Design Notes", folder: "Inbox", label: "Design Notes", value: "Design Notes" },
        ],
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Note" }));
    await userEvent.type(
      await screen.findByPlaceholderText("New note…"),
      "Comprar cimento{Enter}",
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("quick_capture_note", {
        folder: "Design Notes",
        inFolder: "Inbox",
        text: "Comprar cimento",
      }),
    );
  });

  test("the capture box writes a task and pulls it into the day", async () => {
    // Armed on Task by default, because that is what the day's screen is for.
    // The task joins the day: one captured on the day's screen that did not
    // show up there would read as the box having swallowed it.
    bridge({
      period_tasks: [],
      notes_created_today: [],
      create_task: 0,
      ensure_task_id: "novo",
      pull_into_period: true,
    });

    render(HomeView, { props: props() });

    await userEvent.type(
      await screen.findByPlaceholderText("New task…"),
      "Comprar cimento{Enter}",
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_task", {
        list: "jott.tasks/task-list.md",
        text: "Comprar cimento",
      }),
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pull_into_period", {
        period: "day",
        list: "jott.tasks/task-list.md",
        id: "novo",
      }),
    );
    // And nothing was written as a note.
    expect(invoke.mock.calls.some(([cmd]) => cmd === "quick_capture_note")).toBe(false);
  });

  test("the day's block offers no second way to write", async () => {
    // The blue "New task" in the tasks header went into the capture box
    // (2026-08-13): two controls doing one thing, a hand's width apart.
    bridge({ period_tasks: [], notes_created_today: [] });

    render(HomeView, { props: props() });

    await screen.findByText("No tasks yet");
    expect(screen.queryByRole("button", { name: "New task" })).toBeNull();
  });

  test("the day's tasks are the widget — Completed section and Suggestions pill", async () => {
    // Home hosts THE tasks widget over the day (2026-08-06), so it gets the
    // widget's whole shape rather than a partial copy. A completed task keeps
    // its period reference and comes back done, which is what fills the
    // "Completed N" section instead of the card just vanishing.
    bridge({
      period_tasks: [
        { path: "jott.tasks/Inbox.md", task: task("a1", "Arrumar site") },
        {
          path: "jott.tasks/completed.md",
          task: task("b2", "Comprar leite", { done: true }),
        },
      ],
      notes_created_today: [],
    });

    const asked = [];
    render(HomeView, { props: props({ onSuggest: (p) => asked.push(p) }) });

    expect(await screen.findByText("Arrumar site")).toBeTruthy();
    // Done cards are folded away behind the count until asked for.
    expect(screen.queryByText("Comprar leite")).toBeNull();
    await userEvent.click(screen.getByText("Completed 1"));
    expect(await screen.findByText("Comprar leite")).toBeTruthy();

    // And the day offers what could still be pulled — in the right panel,
    // which is the shell's to open.
    await userEvent.click(screen.getByText("Suggestions"));
    expect(asked).toEqual(["day"]);
  });

  test("the empty day still offers suggestions, inside its card", async () => {
    // Wireframe "Empity Home Screen": the pill lives IN the empty card, so an
    // empty day points somewhere instead of only saying it is empty.
    bridge({ period_tasks: [], notes_created_today: [] });

    render(HomeView, { props: props() });

    const card = (await screen.findByText("No tasks yet")).closest(".theme-empty-card");
    expect(within(card).getByText("Suggestions")).toBeTruthy();
  });

  test("the day can be sorted from the ⋮, like any other widget", async () => {
    // A period has no `.widget.json`, so the preference lives in the notebook
    // config (2026-08-06) — but the menu is the same menu, and the Home is a
    // widget like the others.
    bridge({
      period_tasks: [{ path: "jott.tasks/Inbox.md", task: task("a1", "Arrumar site") }],
      period_sort: null,
      set_period_sort: null,
      notes_created_today: [],
    });

    render(HomeView, { props: props() });

    await screen.findByText("Arrumar site");
    await userEvent.click(screen.getByLabelText("space options"));
    await userEvent.click(await screen.findByText("Sort"));
    await userEvent.click(await screen.findByText("Sort by name"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_period_sort", {
        period: "day",
        sort: "name",
      }),
    );
    // Nothing a period cannot keep: no custom order, nowhere to move a widget
    // that has no folder.
    expect(screen.queryByText("Custom order (dragged)")).toBeNull();
    expect(screen.queryByText("Move widget to")).toBeNull();
  });

  test("a read-only notebook offers no capture box", async () => {
    bridge({ period_tasks: [], notes_created_today: [] });

    render(HomeView, { props: props({ readOnly: true }) });

    await screen.findByText("No tasks yet");
    expect(screen.queryByPlaceholderText("New task…")).toBeNull();
    expect(screen.queryByText("What do you want to capture?")).toBeNull();
  });
});
