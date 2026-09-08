// Home — the screen of time: a week of days on top, and the chosen day below
// (wireframes "Home Screen Desktop / Mobile", 2026-09-04).
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
  // 2026-09-03 is a Thursday: on a Monday-first week the strip shows Aug 31
  // through Sep 6.
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
    today: "2026-09-03",
    weekStartsOn: "monday",
    reloadKey: 0,
    ...extra,
  });

  /// A row of `notes_created_today`: the note and the SPACE holding it
  /// (the core's `ListedNote`) — the day answers for every notes space.
  const aNote = (extra = {}, folder = "jott.notes") => ({
    folder,
    note: {
      path: "Inbox/ideia.md",
      title: "ideia",
      folder: "Inbox",
      preview: "uma ideia",
      created: "2026-09-03",
      pinned: false,
      ...extra,
    },
  });

  test("shows the day's tasks and the notes written today", async () => {
    bridge({
      day_tasks: [{ path: "jott.tasks/Inbox.md", task: task("a1", "Arrumar site") }],
      day_sort: null,
      notes_created_today: [aNote()],
    });

    render(HomeView, { props: props() });

    expect(await screen.findByText("Arrumar site")).toBeTruthy();
    expect(screen.getByText("ideia")).toBeTruthy();
    expect(screen.getByText("Today tasks")).toBeTruthy();
    expect(screen.getByText("Today notes")).toBeTruthy();
    // The Home owns no notes: it asks for today's, it does not store them —
    // and it names no space, because every one of them answers.
    expect(invoke).toHaveBeenCalledWith("notes_created_today");
    // And today is the day it asks for, said the short way.
    expect(invoke).toHaveBeenCalledWith("day_tasks", { day: null });
  });

  test("the head shows the week around today, with today lit", async () => {
    bridge({ day_tasks: [], day_sort: null, notes_created_today: [] });
    const { container } = render(HomeView, { props: props() });
    await screen.findByText("No tasks yet");

    // Three pages — the week before, the week on show, the week after — so
    // a drag shows the days coming (user call, 2026-09-04); today's is the
    // middle one.
    expect(container.querySelectorAll(".day-head__page").length).toBe(3);
    const days = [...container.querySelectorAll(".day-head__page.is-current .day-head__day")];
    expect(days.map((d) => d.getAttribute("aria-label"))).toEqual([
      "Monday 31",
      "Tuesday 1",
      "Wednesday 2",
      "Thursday 3",
      "Friday 4",
      "Saturday 5",
      "Sunday 6",
    ]);
    expect(days[3].classList.contains("is-selected")).toBe(true);
    expect(days[3].getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".day-head__month").textContent).toBe("September");
    // The notebook's first day of the week, not the machine's.
    const { container: sunday } = render(HomeView, { props: props({ weekStartsOn: "sunday" }) });
    await waitFor(() =>
      expect(
        sunday.querySelector(".day-head__page.is-current .day-head__day").getAttribute("aria-label"),
      ).toBe("Sunday 30"),
    );
  });

  test("the head says how the day stands, and the greeting follows the hour", async () => {
    bridge({
      day_tasks: [
        { path: "jott.tasks/Inbox.md", task: task("a1", "Arrumar site") },
        { path: "jott.tasks/completed.md", task: task("b2", "Comprar leite", { done: true }) },
      ],
      day_sort: null,
      notes_created_today: [],
    });
    const { container } = render(HomeView, { props: props() });

    await screen.findByText("Arrumar site");
    await waitFor(() =>
      expect(container.querySelector(".day-head__line").textContent).toBe("1 of 2 tasks done today."),
    );
    // The greeting is the machine's hour; whichever it is, it is one of the three.
    expect(container.querySelector(".day-head__greeting").textContent).toMatch(
      /^Good (morning|afternoon|evening) —$/,
    );
  });

  test("picking a day ahead reads its plan, names the block for it, and drops the notes", async () => {
    // A day ahead is for tasks (user call, 2026-09-04): no notes are written
    // for a day that has not come. The shell keeps the choice; the screen
    // only asks (`onPickDay`), so the head on a phone reads the same day.
    const picked = [];
    bridge({
      day_tasks: (args) =>
        args.day === "2026-09-05"
          ? [{ path: "jott.tasks/Inbox.md", task: task("c3", "Entregar logo") }]
          : [],
      day_sort: null,
      notes_created_today: [],
    });
    const { container, rerender } = render(HomeView, {
      props: props({ onPickDay: (iso) => picked.push(iso) }),
    });
    await screen.findByText("No tasks yet");

    await userEvent.click(screen.getByRole("button", { name: "Saturday 5" }));
    expect(picked).toEqual(["2026-09-05"]);
    await rerender(props({ day: "2026-09-05", onPickDay: (iso) => picked.push(iso) }));

    expect(await screen.findByText("Entregar logo")).toBeTruthy();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("day_tasks", { day: "2026-09-05" }));
    expect(screen.getByText("09/05 tasks")).toBeTruthy();
    expect(screen.queryByText("Today notes")).toBeNull();
    expect(container.querySelector(".day-head__day.is-selected").getAttribute("aria-label")).toBe(
      "Saturday 5",
    );
    await waitFor(() =>
      expect(container.querySelector(".day-head__line").textContent).toBe("1 task planned."),
    );
    // No greeting on a day that is not today.
    expect(container.querySelector(".day-head__greeting")).toBeNull();

    // The name is the way back to today.
    await userEvent.click(screen.getByTitle("back to today"));
    expect(picked.at(-1)).toBeNull();
  });

  test("the arrows turn the strip a week at a time without moving the chosen day", async () => {
    // jsdom lays nothing out, so the strip turns by state here; on a screen
    // the same call scrolls the carrousel to the neighbouring page and the
    // settle makes it the middle.
    bridge({ day_tasks: [], day_sort: null, notes_created_today: [] });
    const { container } = render(HomeView, { props: props() });
    await screen.findByText("No tasks yet");

    await userEvent.click(screen.getByLabelText("next week"));
    const current = () =>
      [...container.querySelectorAll(".day-head__page.is-current .day-head__day")].map((d) =>
        d.getAttribute("aria-label"),
      );
    await waitFor(() => expect(current()[0]).toBe("Monday 7"));
    expect(container.querySelector(".day-head__month").textContent).toBe("September");
    // Still today's block below: turning shows, it does not choose.
    expect(screen.getByText("Today tasks")).toBeTruthy();
    expect(container.querySelector(".day-head__page.is-current .day-head__day.is-selected")).toBeNull();

    await userEvent.click(screen.getByLabelText("previous week"));
    await userEvent.click(screen.getByLabelText("previous week"));
    await waitFor(() => expect(current()[0]).toBe("Monday 24"));
    expect(container.querySelector(".day-head__month").textContent).toBe("August");
  });

  test("a day gone by is the log's record: the three lines, read", async () => {
    // Nothing is planned or composed for a past day (user call, 2026-09-04);
    // what the Home shows is a cut of the Timeline, one day wide.
    const opened = [];
    bridge({
      day_tasks: [],
      day_sort: null,
      notes_created_today: [],
      timeline: (args) =>
        args.from === "2026-09-01" && args.to === "2026-09-01"
          ? [
              { kind: "task", id: "a1", path: "jott.tasks/task-list.md", created: "2026-09-01", title: "Nascida", deleted: null, completed: null, space: "jott.tasks" },
              { kind: "task", id: "b2", path: "jott.tasks/completed.md", created: "2026-08-20", title: "Fechada", deleted: null, completed: "2026-09-01", space: "jott.tasks" },
              { kind: "note", id: null, path: "jott.notes/Inbox/ata.md", created: "2026-09-01", title: "Ata", deleted: null, completed: null, space: "jott.notes" },
            ]
          : [],
    });
    const { container } = render(HomeView, {
      props: props({ day: "2026-09-01", onOpenTask: (...args) => opened.push(args) }),
    });

    expect(await screen.findByText("1 Task created")).toBeTruthy();
    expect(screen.getByText("1 Task completed")).toBeTruthy();
    expect(screen.getByText("1 Note created")).toBeTruthy();
    // Every line starts open: one day is short.
    expect(screen.getByText("Nascida")).toBeTruthy();
    expect(screen.getByText("Fechada")).toBeTruthy();
    expect(screen.getByText("Ata")).toBeTruthy();
    // Nothing to compose, nothing to pull: no bar, no pill, no cards of the day.
    expect(screen.queryByText("Suggestions")).toBeNull();
    expect(screen.queryByText("No tasks yet")).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith("day_tasks", { day: "2026-09-01" });
    await waitFor(() =>
      expect(container.querySelector(".day-head__line").textContent).toBe(
        "1 task completed, 1 task created, 1 note created.",
      ),
    );

    // A living row still opens.
    await userEvent.click(screen.getByText("Nascida"));
    expect(opened).toEqual([["jott.tasks/task-list.md", "a1"]]);
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
      day_tasks: [
        { path: "jott.tasks/task-list.md", task: task("a1", "Arrumar site") },
        { path: "Design/Tasks/task-list.md", task: task("b2", "Logo do cliente") },
      ],
      day_sort: null,
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
      day_tasks: [{ path: "jott.tasks/task-list.md", task: task("a1", "Comprar pão") }],
      day_sort: null,
      notes_created_today: [],
      move_task: {},
      pull_into_day: {},
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
    // Home draws THE note card (2026-08-19), not a copy of it: the banner,
    // the title on its chip and the first lines — and the card's own actions
    // with it (2026-08-25).
    bridge({
      day_tasks: [],
      day_sort: null,
      notes_created_today: [aNote({ banner: { kind: "color", value: "yellow" } })],
    });

    const { container } = render(HomeView, { props: props() });

    expect(await screen.findByText("ideia")).toBeTruthy();
    expect(screen.getByText("uma ideia")).toBeTruthy();
    expect(container.querySelector(".note-card__banner")).toBeTruthy();
    expect(container.querySelector(".note-card__more")).toBeTruthy();
    expect(container.querySelector(".note-card__pin")).toBeTruthy();
  });

  test("the day shows notes from EVERY space, each acting on its own", async () => {
    // The Home is the screen of TIME: a note written today counts wherever
    // it was filed (user call, 2026-09-08). Each card names ITS space —
    // opening, pinning and the ⋮ would otherwise write to the wrong one.
    bridge({
      day_tasks: [],
      day_sort: null,
      set_note_pinned: null,
      notes_created_today: [
        aNote(),
        aNote({ path: "Inbox/viagem.md", title: "viagem" }, "Trip to Lisbon"),
      ],
    });
    const opened = [];
    const { container } = render(HomeView, {
      props: props({
        onOpenNote: (...args) => opened.push(args),
        // The badge a card wears outside its space — what the tasks half of
        // this very screen already draws.
        origin: (item) => (item.folder === "jott.notes" ? null : { label: "Trip", color: "orange" }),
      }),
    });

    expect(await screen.findByText("viagem")).toBeTruthy();
    expect(screen.getByText("ideia")).toBeTruthy();

    const cards = [...container.querySelectorAll(".note-card")];
    expect(cards.length).toBe(2);
    // Only the one from another space wears the origin dot.
    expect(container.querySelectorAll(".note-card__origin").length).toBe(1);

    await userEvent.click(cards[1].querySelector(".note-card__open"));
    expect(opened).toEqual([["Inbox/viagem.md", "Trip to Lisbon", { newTab: false }]]);

    await userEvent.click(cards[1].querySelector(".note-card__pin"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_note_pinned", {
        folder: "Trip to Lisbon",
        path: "Inbox/viagem.md",
        pinned: true,
      }),
    );
  });

  test("a card of the day offers the same rows the board offers", async () => {
    bridge({ day_tasks: [], day_sort: null, notes_created_today: [aNote()], set_note_pinned: null });

    const { container } = render(HomeView, { props: props() });
    await screen.findByText("ideia");

    await userEvent.click(container.querySelector(".note-card__more"));
    const rows = [...document.querySelectorAll(".menu__list > .menu__item > .menu__link")].map(
      (el) => el.textContent.trim(),
    );
    // The same five the board offers, in the same order.
    expect(rows).toEqual(["Pin", "Move to…", "Rename", "Duplicate", "Delete"]);

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

  test("the + can create a note: untitled, in the capture target, opened fresh", async () => {
    // The shell's + menu calls this door (user report, 2026-09-07: the +
    // offered only a task). The target is the notes ⋮'s choice, else the
    // notebook's quickNoteFolder — here "Clientes".
    bridge({ day_tasks: [], day_sort: null, notes_created_today: [], create_note: "Clientes/Untitled.md" });
    const opened = [];
    const view = render(HomeView, {
      props: props({ quickNoteFolder: "Clientes", onOpenNote: (...args) => opened.push(args) }),
    });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("notes_created_today"));

    view.component.createNote();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_note", {
        folder: "jott.notes",
        inFolder: "Clientes",
        title: "New note",
      }),
    );
    await waitFor(() =>
      expect(opened).toEqual([["Clientes/Untitled.md", "jott.notes", { fresh: true }]]),
    );
  });

  test("a read-only notebook still opens a card of the day in a new tab", async () => {
    // The one row that is not a write.
    bridge({ day_tasks: [], day_sort: null, notes_created_today: [aNote()] });

    const { container } = render(HomeView, { props: props({ readOnly: true }) });
    await screen.findByText("ideia");

    expect(container.querySelector(".note-card__more")).toBeNull();
    await fireEvent.contextMenu(container.querySelector(".note-card"));
    const rows = [...document.querySelectorAll(".context-menu button")].map((el) =>
      el.textContent.trim(),
    );
    expect(rows).toEqual(["Open in new tab"]);
  });

  test("the notes ⋮ says where a quick note is filed", async () => {
    bridge({ day_tasks: [], day_sort: null, notes_created_today: [] });
    render(HomeView, { props: props() });

    await userEvent.click(await screen.findByLabelText("notes options"));
    expect(await screen.findByText("Clientes")).toBeTruthy();
    expect(screen.getByText("Inbox")).toBeTruthy();
  });

  test("the composing bar, asked for, writes a task and pulls it into the day", async () => {
    // The + is the shell's (App.svelte); what it does is ask for this bar.
    // The task joins the day: one captured on the day's screen that did not
    // show up there would read as the bar having swallowed it.
    bridge({
      day_tasks: [],
      day_sort: null,
      notes_created_today: [],
      create_task: 0,
      ensure_task_id: "novo",
      pull_into_day: true,
    });

    render(HomeView, { props: props({ composing: true }) });

    await userEvent.type(
      await screen.findByPlaceholderText("Create a task…"),
      "Comprar cimento{Enter}",
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_task", {
        list: "jott.tasks/task-list.md",
        text: "Comprar cimento",
      }),
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pull_into_day", {
        day: null,
        list: "jott.tasks/task-list.md",
        id: "novo",
      }),
    );
  });

  test("on a day ahead the bar plans the task for that day", async () => {
    bridge({
      day_tasks: [],
      day_sort: null,
      notes_created_today: [],
      create_task: 0,
      ensure_task_id: "novo",
      pull_into_day: true,
    });

    render(HomeView, { props: props({ day: "2026-09-05", composing: true }) });

    await userEvent.type(
      await screen.findByPlaceholderText("Create a task…"),
      "Entregar logo{Enter}",
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pull_into_day", {
        day: "2026-09-05",
        list: "jott.tasks/task-list.md",
        id: "novo",
      }),
    );
  });

  test("the day's block offers no second way to write", async () => {
    // The blue "New task" in the tasks header went with the capture box
    // (2026-08-13); the + that floats over the canvas is the shell's.
    bridge({ day_tasks: [], day_sort: null, notes_created_today: [] });

    render(HomeView, { props: props() });

    await screen.findByText("No tasks yet");
    expect(screen.queryByRole("button", { name: "New task" })).toBeNull();
    expect(screen.queryByPlaceholderText("Create a task…")).toBeNull();
  });

  test("the day's tasks are the widget — Completed section and Suggestions pill", async () => {
    // Home hosts THE tasks widget over the day (2026-08-06), so it gets the
    // widget's whole shape rather than a partial copy. A completed task keeps
    // its day reference and comes back done, which is what fills the
    // "Completed N" section instead of the card just vanishing.
    bridge({
      day_tasks: [
        { path: "jott.tasks/Inbox.md", task: task("a1", "Arrumar site") },
        {
          path: "jott.tasks/completed.md",
          task: task("b2", "Comprar leite", { done: true }),
        },
      ],
      day_sort: null,
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
    // which is the shell's to open. Today, said the short way.
    await userEvent.click(screen.getByText("Suggestions"));
    expect(asked).toEqual([null]);
  });

  test("a day ahead offers its own suggestions", async () => {
    bridge({ day_tasks: [], day_sort: null, notes_created_today: [] });
    const asked = [];
    render(HomeView, { props: props({ day: "2026-09-05", onSuggest: (p) => asked.push(p) }) });

    const card = (await screen.findByText("No tasks yet")).closest(".theme-empty-card");
    await userEvent.click(within(card).getByText("Suggestions"));
    expect(asked).toEqual(["2026-09-05"]);
  });

  test("the empty day still offers suggestions, inside its card", async () => {
    // Wireframe "Empity Home Screen": the pill lives IN the empty card, so an
    // empty day points somewhere instead of only saying it is empty.
    bridge({ day_tasks: [], day_sort: null, notes_created_today: [] });

    render(HomeView, { props: props() });

    const card = (await screen.findByText("No tasks yet")).closest(".theme-empty-card");
    expect(within(card).getByText("Suggestions")).toBeTruthy();
  });

  test("the day can be sorted from the ⋮, like any other widget", async () => {
    // A day has no `.space.json`, so the preference lives in the notebook
    // config (2026-08-06) — one choice for every day — but the menu is the
    // same menu.
    bridge({
      day_tasks: [{ path: "jott.tasks/Inbox.md", task: task("a1", "Arrumar site") }],
      day_sort: null,
      set_day_sort: null,
      notes_created_today: [],
    });

    render(HomeView, { props: props() });

    await screen.findByText("Arrumar site");
    await userEvent.click(screen.getByLabelText("space options"));
    await userEvent.click(await screen.findByText("Sort"));
    await userEvent.click(await screen.findByText("Sort by name"));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("set_day_sort", { sort: "name" }));
    // Nothing a day cannot keep: no custom order, nowhere to move a widget
    // that has no folder.
    expect(screen.queryByText("Custom order (dragged)")).toBeNull();
    expect(screen.queryByText("Move widget to")).toBeNull();
  });

  // A task pulled into the day LANDS: the card that was not in the last read
  // rises out of the space that opens for it (task-row.css). What the screen
  // decides is WHO gets it; the movement is the stylesheet's.
  describe("a task landing in the day", () => {
    const card = (text) =>
      [...document.querySelectorAll(".task-row")].find((one) => one.textContent.includes(text));
    const arriving = (text) => card(text).classList.contains("task-row--arriving");
    const day = (...tasks) => ({
      day_tasks: tasks.map((one) => ({ path: "jott.tasks/Inbox.md", task: one })),
      day_sort: null,
      notes_created_today: [],
    });

    test("only the card that was not there before rises into place", async () => {
      bridge(day(task("a1", "Arrumar site")));
      const { rerender } = render(HomeView, { props: props() });
      await screen.findByText("Arrumar site");
      // Nothing plays on the first read: the whole list would animate at once.
      expect(arriving("Arrumar site")).toBe(false);

      bridge(day(task("a1", "Arrumar site"), task("b2", "Entregar logo")));
      await rerender(props({ reloadKey: 1 }));

      await screen.findByText("Entregar logo");
      await waitFor(() => expect(arriving("Entregar logo")).toBe(true));
      // And the one that was already in the day is simply still there.
      expect(arriving("Arrumar site")).toBe(false);
    });

    test("the arrival outlives the reload the watcher sends after the write", async () => {
      // Measured 2026-09-08: the write is answered by one reload and the file
      // watcher's own a few frames later. A mark that lived for ONE read was
      // gone before a single frame of the play was drawn.
      bridge(day(task("a1", "Arrumar site")));
      const { rerender } = render(HomeView, { props: props() });
      await screen.findByText("Arrumar site");

      bridge(day(task("a1", "Arrumar site"), task("b2", "Entregar logo")));
      await rerender(props({ reloadKey: 1 }));
      await screen.findByText("Entregar logo");
      await waitFor(() => expect(arriving("Entregar logo")).toBe(true));

      // The watcher's reload: the same day, nothing new in it.
      const reads = () => invoke.mock.calls.filter(([cmd]) => cmd === "day_tasks").length;
      const before = reads();
      await rerender(props({ reloadKey: 2 }));
      await waitFor(() => expect(reads()).toBeGreaterThan(before));
      expect(arriving("Entregar logo")).toBe(true);
    });

    test("turning to another day is a new list, not a day of arrivals", async () => {
      bridge({
        day_tasks: (args) =>
          args.day === "2026-09-05"
            ? [{ path: "jott.tasks/Inbox.md", task: task("c3", "Entregar logo") }]
            : [{ path: "jott.tasks/Inbox.md", task: task("a1", "Arrumar site") }],
        day_sort: null,
        notes_created_today: [],
      });
      const { rerender } = render(HomeView, { props: props() });
      await screen.findByText("Arrumar site");

      await rerender(props({ day: "2026-09-05" }));
      await screen.findByText("Entregar logo");
      expect(arriving("Entregar logo")).toBe(false);
    });
  });

  test("with tasks off, the Home is the notes written today", async () => {
    bridge({ notes_created_today: [aNote()] });

    render(HomeView, { props: props({ f: (key) => key !== "tasks" }) });

    expect(await screen.findByText("ideia")).toBeTruthy();
    expect(screen.queryByText("Today tasks")).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith("day_tasks", expect.anything());
  });
});
