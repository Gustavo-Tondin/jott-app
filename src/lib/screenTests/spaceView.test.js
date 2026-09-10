// A space the user made: the screen that opens it, and the app around it.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { bridge, invoke } from "../test/bridge.js";
import { CLOCK, answerConfirm, noop, noteFolder, resetScreens, task } from "../test/screens.js";

// The note editor's engine is stubbed by a textarea — `lib/test/screens.js`
// says why. `vi.mock` is hoisted per file, so it cannot live there.
vi.mock("../components/Editor.svelte", async () => await import("../components/EditorStub.svelte"));

const { default: App } = await import("../../App.svelte");
const { default: SpaceView } = await import("../screens/SpaceView.svelte");

beforeEach(resetScreens);

describe("SpaceView", () => {
  // 2026-08-11: a space has ONE function (its type) and owns its files
  // directly — the screen renders the tasks/notes view by type, no widget
  // layer in between. An invented type still renders as the unsupported card.
  const space = {
    folderName: "Project A",
    path: "Project A",
    name: "Project A",
    kind: "tasks",
    known: true,
    fixed: false,
    readOnly: false,
    sort: null,
    order: [],
  };

  // Fixed file names in every tasks space (2026-08-13): the FOLDER says
  // which space this is, the file never does.
  const lists = [
    { path: "Project A/task-list.md", name: "task-list", space: "Project A" },
    { path: "Project A/completed.md", name: "completed", space: "Project A" },
    { path: "jott.tasks/task-list.md", name: "task-list", space: "Tasks" },
  ];

  test("renders the space's own screen by its type", async () => {
    bridge({ list_tasks: [task("a1", "Comprar leite")] });
    render(SpaceView, { props: { space, lists, counts: {}, onSelectTask: noop } });

    // The tasks screen shows the space's single list.
    expect(await screen.findByText("Comprar leite")).toBeTruthy();
  });

  test("the screen titles itself: the name in ink, the colour as the dot beside it", async () => {
    // The space had a heading of its own on top of the one the block below
    // already drew (user call, 2026-08-18). One row now — the same row the ⋮
    // was already on — and the colour is said by the dot, not by the type.
    bridge({ list_tasks: [] });
    const { container } = render(SpaceView, {
      props: { space, color: "orange", lists, counts: {}, onSelectTask: noop },
    });

    const title = await waitFor(() => {
      const el = container.querySelector(".tasks-space__title");
      if (!el) throw new Error("no title");
      return el;
    });
    expect(title.textContent).toContain("Project A");
    expect(title.getAttribute("style")).toBeNull();
    expect(title.querySelector(".theme-dot").getAttribute("style")).toContain(
      "--dot: var(--app-5)",
    );
    // And only one heading on the screen.
    expect(container.querySelectorAll("h1, h2, h3").length).toBe(1);
  });

  test("a space with no colour of its own leaves the dot to the app's accent", async () => {
    bridge({ list_tasks: [] });
    const { container } = render(SpaceView, {
      props: { space, lists, counts: {}, onSelectTask: noop },
    });

    const dot = await waitFor(() => {
      const el = container.querySelector(".tasks-space__title .theme-dot");
      if (!el) throw new Error("no dot");
      return el;
    });
    // Unset, so the class's own `var(--dot, --app-brand)` answers.
    expect(dot.getAttribute("style")).toBeFalsy();
  });

  test("a tasks space composes from the bar at the bottom, like the fixed screen", async () => {
    // Not the blue "New task" button in the corner: a user space is meant to
    // look like Tasks does (user call, 2026-08-18), and both wireframes draw
    // the pinned composer.
    bridge({ list_tasks: [] });
    const { container } = render(SpaceView, {
      props: { space, lists, counts: {}, onSelectTask: noop },
    });

    await waitFor(() => {
      if (!container.querySelector(".task-composer")) throw new Error("no bar");
    });
    expect(container.querySelector(".tasks-space__new")).toBeNull();
  });

  test("submitting from the ＋ leaves the cursor in the field, ready for the next task", async () => {
    // On Android the keyboard is up because the FIELD has focus, so focus
    // moving to the button is the keyboard going away — one task per keyboard,
    // on a row whose whole point is a run of them (user call, 2026-08-21).
    // Clicked, not submitted by hand: the button is the half that moves focus,
    // and a test that dispatches `submit` on the form would pass either way.
    bridge({ list_tasks: [], write_task: null });
    const { container } = render(SpaceView, {
      props: { space, lists, counts: {}, onSelectTask: noop },
    });

    const field = await waitFor(() => {
      const el = container.querySelector(".task-composer__input");
      if (!el) throw new Error("no field");
      return el;
    });
    field.focus();
    await fireEvent.input(field, { target: { value: "Comprar leite" } });

    const add = container.querySelector(".task-composer button[type=submit]");
    add.focus(); // what the tap itself does, before the click is dispatched
    await fireEvent.click(add);

    await waitFor(() => {
      if (document.activeElement !== field) throw new Error("focus left the field");
    });
    expect(field.value).toBe("");
  });

  test("below 768px the screen does not repeat the name the header already says", async () => {
    // Three copies of one word on a phone: the header, this heading, and the
    // block's own titled row (user report, 2026-08-18). The header keeps it.
    bridge({ list_tasks: [task("a1", "Comprar leite")] });
    const { container } = render(SpaceView, {
      props: { space, color: "orange", lists, counts: {}, compact: true, onSelectTask: noop },
    });

    await screen.findByText("Comprar leite");
    expect(container.querySelector(".tasks-space__title")).toBeNull();
    // The row itself stays: it is where the ⋮ lives.
    expect(container.querySelector(".tasks-space__more")).toBeTruthy();
  });

  test("an invented type is shown and named, never silently dropped", async () => {
    const future = { ...space, kind: "hologram", known: false };
    render(SpaceView, {
      props: { space: future, lists, counts: {}, onSelectTask: noop },
    });
    expect(await screen.findByText('"hologram" space')).toBeTruthy();
  });

  test("the ⋮ menu offers the orderings and persists the choice", async () => {
    bridge({ list_tasks: [] });
    const sorts = [];
    render(SpaceView, {
      props: {
        space,
        lists,
        counts: {},
        onSelectTask: noop,
        onSetSpaceSort: (sort) => sorts.push(sort),
      },
    });
    await screen.findAllByText("Project A");

    // The orderings live one level in, behind "Sort" (2026-08-05).
    await userEvent.click(screen.getByLabelText("space options"));
    await userEvent.click(await screen.findByText("Sort"));
    await userEvent.click(await screen.findByText(/Sort by name/));

    expect(sorts).toEqual(["name"]);
  });

  test("the screen draws its cards in the file's order, whatever the sort says", async () => {
    // A sort REWRITES the list (core `arrange`): the file order is the sort,
    // and a second copy of the rule on the screen would drift from it.
    bridge({
      list_tasks: (args) =>
        args.list.endsWith("completed.md")
          ? []
          : [task("b", "banana"), task("a", "Amora")],
    });
    render(SpaceView, {
      props: {
        space: { ...space, sort: "name" },
        lists,
        counts: {},
        onSelectTask: noop,
      },
    });

    await screen.findByText("Amora");
    const titles = [...document.querySelectorAll(".task-row__title")].map((el) =>
      el.textContent.trim(),
    );
    expect(titles).toEqual(["banana", "Amora"]);
  });

  test("the bookmark pins a task to the top, and completed cards have none", async () => {
    // The bookmark did nothing until 2026-08-05. Pinning outranks the sort,
    // and a completed card has no top to sit at, so it does not draw one.
    bridge({
      list_tasks: (args) =>
        args.list.endsWith("completed.md")
          ? [{ ...task("z", "Feita"), done: true }]
          : [{ ...task("b", "banana"), pinned: true }, task("a", "Amora")],
      set_task_pinned: null,
    });
    render(SpaceView, {
      props: {
        space: { ...space, sort: "name" },
        lists,
        counts: {},
        onSelectTask: noop,
        onChanged: noop,
      },
    });

    await screen.findByText("Amora");
    // Sorted by name, "Amora" would come first; pinned "banana" outranks it.
    const titles = () =>
      [...document.querySelectorAll(".task-row__title")].map((el) =>
        el.textContent.trim(),
      );
    expect(titles()).toEqual(["banana", "Amora"]);
    expect(document.querySelector(".tasks-space__pin-divider")).toBeTruthy();

    // Unpinning the pinned one goes through the bridge with a real id.
    await userEvent.click(screen.getAllByLabelText("Unpin")[0]);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_task_pinned", {
        list: "Project A/task-list.md",
        id: "b",
        pinned: false,
      });
    });

    // The completed section has cards but no bookmark on them.
    await userEvent.click(screen.getByText(/Completed 1/));
    await screen.findByText("Feita");
    expect(screen.queryAllByLabelText("Pin to top")).toHaveLength(1);
  });

  test("dragging a card saves the arrangement in the widget's config", async () => {
    bridge({
      list_tasks: (args) =>
        args.list.endsWith("completed.md")
          ? []
          : [task("a1", "Primeira"), task("b2", "Segunda")],
    });
    const orders = [];
    const { container } = render(SpaceView, {
      props: {
        space,
        lists,
        counts: {},
        onSelectTask: noop,
        onSetSpaceOrder: (order) => orders.push(order),
      },
    });
    await screen.findByText("Primeira");

    const rows = container.querySelectorAll(".tasks-space__list .task-row");
    rows.forEach((el, i) => {
      el.getBoundingClientRect = () => ({
        left: 0, right: 200, width: 200,
        top: i * 40, bottom: i * 40 + 40, height: 40,
        x: 0, y: i * 40, toJSON() {},
      });
    });

    // Drag the first card past the second's midpoint (60) — anywhere on the
    // card drags; there is no grip. Straight down, so the axis lock reads it
    // as a reorder and not as the card's sideways swipe.
    await fireEvent.pointerDown(rows[0], { button: 0, pointerId: 1, clientY: 5 });
    await fireEvent.pointerMove(rows[0], { pointerId: 1, clientY: 75 });
    await fireEvent.pointerUp(rows[0], { pointerId: 1, clientY: 75 });

    // The dragged arrangement goes to the space's .space.json, as
    // ids — never to the .md file.
    await waitFor(() => expect(orders).toEqual([["b2", "a1"]]));
  });

  test("dragging a card past the divider unpins it", async () => {
    // The second way to pin and unpin (2026-08-05): what the drag builds is
    // what the card becomes.
    bridge({
      list_tasks: (args) =>
        args.list.endsWith("completed.md")
          ? []
          : [{ ...task("a1", "Primeira"), pinned: true }, task("b2", "Segunda")],
      set_task_pinned: null,
    });
    const { container } = render(SpaceView, {
      props: {
        space,
        lists,
        counts: {},
        onSelectTask: noop,
        onSetSpaceOrder: noop,
        onChanged: noop,
      },
    });
    await screen.findByText("Primeira");

    const rows = container.querySelectorAll(".tasks-space__list .task-row");
    rows.forEach((el, i) => {
      el.getBoundingClientRect = () => ({
        left: 0, right: 200, width: 200,
        top: i * 40, bottom: i * 40 + 40, height: 40,
        x: 0, y: i * 40, toJSON() {},
      });
    });

    await fireEvent.pointerDown(rows[0], { button: 0, pointerId: 1, clientY: 5 });
    await fireEvent.pointerMove(rows[0], { pointerId: 1, clientY: 75 });
    await fireEvent.pointerUp(rows[0], { pointerId: 1, clientY: 75 });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_task_pinned", {
        list: "Project A/task-list.md",
        id: "a1",
        pinned: false,
      });
    });
  });

  test("the ⋮'s select mode moves several tasks at once", async () => {
    bridge({
      list_tasks: (args) =>
        args.list.endsWith("completed.md")
          ? []
          : [task("a1", "Primeira"), task("b2", "Segunda")],
      move_task: {},
    });
    render(SpaceView, {
      props: {
        space,
        lists,
        counts: {},
        onSelectTask: noop,
        onChanged: noop,
      },
    });
    await screen.findByText("Primeira");

    await userEvent.click(screen.getByLabelText("space options"));
    await userEvent.click(await screen.findByText("Select tasks…"));

    // Clicking a card now picks it instead of opening the inspector.
    await userEvent.click(screen.getByText("Primeira"));
    await userEvent.click(screen.getByText("Segunda"));
    expect(screen.getByText("2 selected")).toBeTruthy();

    await userEvent.selectOptions(
      screen.getByLabelText("Move to…"),
      "jott.tasks/task-list.md",
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("move_task", {
        from: "Project A/task-list.md",
        id: "a1",
        to: "jott.tasks/task-list.md",
      });
      expect(invoke).toHaveBeenCalledWith("move_task", {
        from: "Project A/task-list.md",
        id: "b2",
        to: "jott.tasks/task-list.md",
      });
    });
  });

  test("deleting picked tasks asks first, with the count", async () => {
    // The same question a single delete asks (2026-08-19): bulk delete used
    // to skip the confirm entirely.
    bridge({
      list_tasks: (args) =>
        args.list.endsWith("completed.md")
          ? []
          : [task("a1", "Primeira"), task("b2", "Segunda")],
      delete_task: {},
    });
    render(SpaceView, {
      props: { space, lists, onSelectTask: noop, onChanged: noop },
    });
    await screen.findByText("Primeira");

    await userEvent.click(screen.getByLabelText("space options"));
    await userEvent.click(await screen.findByText("Select tasks…"));
    await userEvent.click(screen.getByText("Primeira"));
    await userEvent.click(screen.getByText("Segunda"));
    await userEvent.click(screen.getByText("Delete"));

    const asked = await answerConfirm();
    expect(asked.title).toBe("Delete 2 tasks?");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "delete_task",
        expect.objectContaining({ id: "a1" }),
      ),
    );
  });
});

describe("App with a user space", () => {
  const notebook = {
    path: "/n",
    name: "n",
    readOnly: false,
    lists: [
      { path: "jott.tasks/task-list.md", name: "Tasks" },
      { path: "jott.tasks/completed.md", name: "Completed" },
      { path: "Project A/Sprint.md", name: "Sprint" },
    ],
    layout: {
      inbox: "jott.tasks/task-list.md",
      completed: "jott.tasks/completed.md",
      tasksFolder: "jott.tasks",
      completedName: "completed",
      notesFolder: "jott.notes",
      notesInbox: "Inbox",
      dateDisplayFormat: "mm/dd/yyyy",
      closeInspectorOnClickAway: false,
      quickNoteFolder: "Inbox",
    },
  };

  const shell = () =>
    bridge({
      last_notebook: "/n",
      open_notebook: notebook,
      notebook_snapshot: {
        info: notebook,
        clock: CLOCK,
        counts: {},
        conflicts: [],
        spaces: [
          { folderName: "Home", path: "Home", name: "Home", kind: "home", known: true, fixed: true, readOnly: false, sort: null, order: [] },
          {
            folderName: "Project A",
            path: "Project A",
            name: "Project A",
            kind: "tasks",
            known: true,
            fixed: false,
            readOnly: false,
            sort: null,
            order: [],
          },
        ],
      },
      screen_to_restore: null,
      note_folders: [noteFolder("Inbox")],
      notes_created_today: [],
      list_tasks: [],
      period_tasks: [],
      grouped_suggestions: [],
    });

  test("a user space appears in the sidebar and opens its screen", async () => {
    shell();
    render(App);

    // Fixed spaces never show among the user's — Home has its own
    // dedicated entry at the top. (The "Spaces" section title was
    // removed by the user, 2026-08-04.)
    await screen.findByText("Project A");

    await userEvent.click(screen.getByText("Project A"));
    // The space renders its own tasks screen, titled by the space.
    expect((await screen.findAllByText("Project A")).length).toBeGreaterThan(1);

    // Its lists are not flattened into the fixed sidebar.
    expect(screen.queryByRole("button", { name: /^Sprint/ })).toBeNull();
  });

  test("the page ⋮ acts on the screen: rename, folder, find", async () => {
    // 2026-08-17. Renaming is offered only for a space the USER made — the
    // fixed three are the app's own folders.
    shell();
    render(App);
    await userEvent.click(await screen.findByText("Project A"));

    await userEvent.click(screen.getByLabelText("page menu"));
    expect(screen.getByText("Rename space")).toBeTruthy();
    expect(screen.getByText("Find in Project A")).toBeTruthy();

    await userEvent.click(screen.getByText("Open in file manager"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("open_in_file_manager", {
        path: "Project A",
      }),
    );
  });

  test("the same actions answer the right button on the empty canvas", async () => {
    shell();
    render(App);
    await userEvent.click(await screen.findByText("Project A"));

    await fireEvent.contextMenu(document.querySelector(".shell__content"));

    const menu = document.querySelector(".context-menu");
    expect(menu).not.toBeNull();
    expect(within(menu).getByText("Rename space")).toBeTruthy();
    expect(within(menu).getByText("Open in file manager")).toBeTruthy();

    await userEvent.click(within(menu).getByText("Find in Project A"));
    // Scoped to the space, so the box says where it is looking and the core
    // is told to stay there.
    const box = await screen.findByPlaceholderText("Search in Project A…");
    await userEvent.type(box, "cimento");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("search", {
        query: "cimento",
        limit: null,
        scope: "Project A",
      }),
    );
  });

  test("opening a space loads its own list", async () => {
    // A tasks space is one list (spec 3.5): opening the space loads
    // that list's tasks — no intermediate list-name to click.
    shell();
    render(App);

    await userEvent.click(await screen.findByText("Project A"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("list_tasks", {
        list: "Project A/Sprint.md",
      }),
    );
  });
});
