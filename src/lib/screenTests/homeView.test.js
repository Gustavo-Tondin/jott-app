// Home — the day, with no files of its own.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { bridge, invoke } from "../test/bridge.js";
import { noop, resetScreens, task } from "../test/screens.js";
import HomeView from "../screens/HomeView.svelte";

beforeEach(resetScreens);

describe("HomeView", () => {
  const props = (extra = {}) => ({
    notesFolder: "jott.notes",
    notesInbox: "Inbox",
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
    // Its own actions belong where the note lives — Home is the day looking in.
    expect(container.querySelector(".note-card__more")).toBeNull();
    expect(container.querySelector(".note-card__pin")).toBeNull();
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

  test("widened to the Inbox, the block reads the whole of it and says so", async () => {
    // `homeShowsAllInboxNotes` (user call, 2026-08-24): every Inbox note, not
    // just today's — and the heading stops claiming "Today".
    bridge({ period_tasks: [], inbox_notes: [] });
    render(HomeView, { props: props({ showAllInboxNotes: true }) });

    expect(await screen.findByText("Inbox notes")).toBeTruthy();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("inbox_notes", { folder: "jott.notes" }));
    expect(invoke).not.toHaveBeenCalledWith("notes_created_today", { folder: "jott.notes" });
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
