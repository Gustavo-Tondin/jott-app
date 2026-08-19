// Screen tests with the bridge mocked.
//
// What these catch: a button wired to the wrong command, arguments in the
// wrong shape, a screen that never reloads after acting, an action offered
// on a read-only notebook. What they deliberately do NOT check is whether
// the core does the right thing with those calls — that lives in Rust, and
// duplicating it here would just be a slower copy.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { pace } from "./services/pace.js";
import { nameRequest, taskRequest } from "./services/dialog.js";

// Svelte 5 transitions (the inspector's slide) drive the Web Animations API,
// which jsdom does not implement. A no-op that reports "already finished" — and
// fires onfinish once assigned — lets a transitioned element mount and unmount.
if (typeof Element !== "undefined" && !Element.prototype.animate) {
  Element.prototype.animate = () => {
    const anim = {
      cancel() {},
      finished: Promise.resolve(),
      onfinish: null,
      oncancel: null,
      currentTime: 0,
      startTime: 0,
      playState: "finished",
      play() {},
      pause() {},
      reverse() {},
      finish() {},
      commitStyles() {},
      persist() {},
      updatePlaybackRate() {},
      addEventListener() {},
      removeEventListener() {},
    };
    Promise.resolve().then(() => anim.onfinish?.());
    return anim;
  };
  Element.prototype.getAnimations = () => [];
}

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args) => invoke(...args),
  // What an <img> loads a notebook file from (services/assets.js). There is no
  // asset protocol in jsdom; the path is what matters here.
  convertFileSrc: (path) => `asset://localhost/${encodeURIComponent(path)}`,
}));
// The note editor's engine is CodeMirror, which needs a real layout jsdom
// cannot give it. These tests are about the *editor screen* — auto-save,
// flush on close, read-only — so the engine is stubbed by a textarea and the
// live-preview rule is tested on its own in `markdown.test.js`.
vi.mock("./components/Editor.svelte", async () => await import("./components/EditorStub.svelte"));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
// The title bar and the shell drive the frameless window through this API;
// jsdom has no real window to minimize/maximize/close, so the handle is
// stubbed. The state getters resolve to false: screens are tested with the
// window in its framed (non-flush) state.
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn(() => Promise.resolve(false)),
    isFullscreen: vi.fn(() => Promise.resolve(false)),
    setFullscreen: vi.fn(() => Promise.resolve()),
    onResized: vi.fn(() => Promise.resolve(() => {})),
  }),
}));

const { default: ListView } = await import("./screens/ListView.svelte");
const { default: PeriodView } = await import("./screens/PeriodView.svelte");
const { default: CompletedView } = await import("./screens/CompletedView.svelte");
const { default: TaskInspector } = await import("./components/TaskInspector.svelte");
const { default: App } = await import("../App.svelte");

/// Gives a set of elements a layout jsdom does not compute: one column of
/// 200x200 boxes starting at `top`. Dragging is geometry, so a drag test has
/// to say where things are.
function place(elements, top) {
  elements.forEach((el, i) => {
    const y = top + i * 220;
    el.getBoundingClientRect = () => ({
      left: 10,
      right: 210,
      width: 200,
      top: y,
      bottom: y + 200,
      height: 200,
      x: 10,
      y,
      toJSON() {},
    });
  });
}

/// A folder of notes as the bridge answers it since 2026-08-19: an address,
/// plus the colour and the pin the SPACE remembers for it.
const noteFolder = (path, extra = {}) => ({ path, color: null, pinned: false, ...extra });
const { default: SpaceView } = await import("./screens/SpaceView.svelte");
const { default: NotesSpace } = await import("./spaces/NotesSpace.svelte");
const { default: NoteEditor } = await import("./components/NoteEditor.svelte");
const { default: HomeView } = await import("./screens/HomeView.svelte");
const { default: TasksView } = await import("./screens/TasksView.svelte");
const { default: PageHeader } = await import("./shell/PageHeader.svelte");
const { default: TabBar } = await import("./shell/TabBar.svelte");
const { default: SettingsView } = await import("./screens/SettingsView.svelte");
const { default: NewTaskDialog } = await import("./components/NewTaskDialog.svelte");
const { default: NoteBanner } = await import("./components/NoteBanner.svelte");
const { default: AssetsView } = await import("./screens/AssetsView.svelte");

const task = (id, text, extra = {}) => ({
  id,
  text,
  done: false,
  origin: null,
  meta: null,
  indent: "",
  ...extra,
});

/// Answers each command with whatever `responses` says.
function bridge(responses) {
  invoke.mockImplementation((cmd, args) => {
    if (!(cmd in responses)) return Promise.resolve(null);
    const value = responses[cmd];
    return Promise.resolve(typeof value === "function" ? value(args) : value);
  });
}

const noop = () => {};

beforeEach(() => {
  invoke.mockReset();
  // The completion beat is a real-user pause; tests stay instant.
  pace.completionMs = 0;
  // The two dialog requests are module-level stores: a test that leaves one
  // open would put every test after it behind a modal.
  nameRequest.set(null);
  taskRequest.set(null);
});

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

  test("pulling sends the task to the right period", async () => {
    bridge({ list_tasks: [task("a1", "Comprar leite")], pull_into_period: true });

    render(ListView, {
      props: { list: "jott.tasks/Compras.md", readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    await userEvent.click(await screen.findByText("→ Week"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pull_into_period", {
        period: "week",
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
      pull_into_period: true,
    });

    render(ListView, {
      props: { list: "jott.tasks/Compras.md", readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    await userEvent.click(await screen.findByText("→ Today"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pull_into_period", {
        period: "day",
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

  test("removing a pulled task only touches the period", async () => {
    bridge({
      period_tasks: [{ path: "jott.tasks/Compras.md", task: task("a1", "Puxada") }],
      grouped_suggestions: [],
      remove_from_period: true,
    });

    render(PeriodView, { props });
    await userEvent.click(await screen.findByLabelText("remove"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("remove_from_period", {
        period: "day",
        list: "jott.tasks/Compras.md",
        id: "a1",
      }),
    );
    expect(invoke.mock.calls.some(([cmd]) => cmd === "complete_task")).toBe(false);
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

describe("CompletedView", () => {
  test("unchecking sends the task back through uncomplete_task on its own list", async () => {
    bridge({
      completed_tasks: [
        {
          path: "Space 1/Tasks 1/Completed.md",
          task: task("a1", "Pagar internet", { done: true, origin: "Compras" }),
        },
      ],
      uncomplete_task: {},
    });

    render(CompletedView, {
      props: { readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    expect(await screen.findByText(/back to Compras/)).toBeTruthy();
    await userEvent.click(screen.getByLabelText("uncheck"));

    // The address is the item's own Completed list — there is one per widget,
    // and unchecking through the wrong one was exactly the aggregation bug.
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("uncomplete_task", {
        list: "Space 1/Tasks 1/Completed.md",
        id: "a1",
      }),
    );
  });

  test("a task with no id cannot be unchecked", async () => {
    // Hand-written in another editor and not yet adopted: acting on it would
    // have nothing to address.
    bridge({
      completed_tasks: [
        { path: "jott.tasks/completed.md", task: task(null, "Escrita à mão", { done: true }) },
      ],
    });

    render(CompletedView, {
      props: { readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    await screen.findByText("Escrita à mão");
    expect(screen.getByLabelText("uncheck").disabled).toBe(true);
  });

  test("aggregates the Completed of every widget, fixed and user-made", async () => {
    // The screen used to read a single hardcoded list, so anything completed
    // inside a user space never showed up here.
    bridge({
      completed_tasks: [
        { path: "jott.tasks/completed.md", task: task("a1", "Da Inbox", { done: true }) },
        { path: "Space 1/Tasks 1/Completed.md", task: task("b2", "Do space", { done: true }) },
      ],
    });

    render(CompletedView, {
      props: { readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    expect(await screen.findByText("Da Inbox")).toBeTruthy();
    expect(screen.getByText("Do space")).toBeTruthy();
    expect(screen.getByText(/Space 1\/Tasks 1/)).toBeTruthy();
  });
});


describe("TaskInspector", () => {
  // saveDelay 0 so the debounce resolves on the next tick instead of the test
  // sitting through half a second of nothing.
  const props = (task, extra = {}) => ({
    task,
    list: "jott.tasks/Compras.md",
    readOnly: false,
    saveDelay: 0,
    onSaved: noop,
    onError: noop,
    onClose: noop,
    ...extra,
  });

  /// The fields of the last `set_task_fields` call.
  const lastSave = () =>
    invoke.mock.calls.filter(([cmd]) => cmd === "set_task_fields").at(-1)[1];

  const saveCount = () =>
    invoke.mock.calls.filter(([cmd]) => cmd === "set_task_fields").length;

  // Reestruturação 2026-07-30: tags are added through the TagPicker (pick an
  // existing one or create with a colour), not a free text field. This drives
  // its create flow — the simplest way for a test to add a named tag, which is
  // also a convenient generic "make an edit".
  async function addTag(name) {
    await userEvent.click(screen.getByRole("button", { name: "add tag" }));
    await userEvent.type(screen.getByPlaceholderText("New tag name"), `${name}{enter}`);
  }

  test("opening a task writes nothing at all", async () => {
    // The whole point of the lazy id, and now of the auto-save too: looking at
    // a task must leave the `.md` untouched. Saving on open would give every
    // hand-written task an id just for having been clicked.
    bridge({ ensure_task_id: "new1", set_task_fields: null });

    render(TaskInspector, { props: props(task(null, "Escrita à mão")) });

    await screen.findByDisplayValue("Escrita à mão");
    await new Promise((r) => setTimeout(r, 20));
    expect(invoke).not.toHaveBeenCalled();
  });

  test("the footer's list button moves the task to another list", async () => {
    // The footer says where the task lives AND is how it is moved, so it is a
    // button that opens the lists — not a bare select (user call 2026-08-05).
    bridge({ move_task: {}, set_task_fields: null });
    const moved = [];
    render(TaskInspector, {
      props: props(task("a1", "Comprar leite"), {
        lists: [
          // The space label travels with the address (the core sends it),
          // so a menu never has to read it off the folder.
          { path: "jott.tasks/Compras.md", name: "Compras", space: "Tasks" },
          { path: "jott.tasks/Casa.md", name: "Casa", space: "Tasks" },
        ],
        onMoved: (path) => moved.push(path),
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "move to list" }));
    // The row reads `Tasks/`**Casa** — the space in grey, the list in ink,
    // so two lists both called "Inbox" are told apart without the row turning
    // into a file path (user call, 2026-08-06).
    const row = (await screen.findByText("Casa")).closest("button");
    expect(within(row).getByText("Tasks/")).toBeTruthy();
    await userEvent.click(row);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("move_task", {
        from: "jott.tasks/Compras.md",
        id: "a1",
        to: "jott.tasks/Casa.md",
      });
    });
    expect(moved).toEqual(["jott.tasks/Casa.md"]);
  });

  test("there is no save button to forget", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, { props: props(task("a1", "Comprar leite")) });

    await screen.findByDisplayValue("Comprar leite");
    expect(screen.queryByText("Save")).toBeNull();
  });

  test("the ⋮ menu duplicates the task", async () => {
    bridge({ duplicate_task: null });

    render(TaskInspector, { props: props(task("a1", "Comprar leite")) });
    await screen.findByDisplayValue("Comprar leite");

    await userEvent.click(screen.getByLabelText("task options"));
    await userEvent.click(screen.getByText("Duplicate task"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("duplicate_task", {
        list: "jott.tasks/Compras.md",
        id: "a1",
      }),
    );
  });

  test("editing saves on its own", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, { props: props(task("a1", "Comprar leite")) });
    await addTag("casa");

    await waitFor(() => expect(lastSave().fields.tags).toEqual(["casa"]));
    expect(lastSave().id).toBe("a1");
  });

  test("the first edit is what earns the id", async () => {
    bridge({
      list_tasks: [task(null, "Escrita à mão")],
      ensure_task_id: "new1",
      set_task_fields: null,
    });

    render(TaskInspector, { props: props(task(null, "Escrita à mão")) });
    await addTag("casa");

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("ensure_task_id", {
        list: "jott.tasks/Compras.md",
        position: 0,
      }),
    );
    expect(lastSave().id).toBe("new1");
  });

  test("a second edit does not ask for a second id", async () => {
    // The screen above still holds the id-less copy it selected. Looking the
    // position up again would find nothing — the task has an id by now — and
    // the second write would fail with taskNotFound.
    bridge({
      list_tasks: [task(null, "Escrita à mão")],
      ensure_task_id: "new1",
      set_task_fields: null,
    });

    render(TaskInspector, { props: props(task(null, "Escrita à mão")) });

    await addTag("casa");
    await waitFor(() => expect(saveCount()).toBe(1));
    await addTag("obra");
    await waitFor(() => expect(saveCount()).toBe(2));

    expect(invoke.mock.calls.filter(([cmd]) => cmd === "ensure_task_id").length).toBe(1);
  });

  test("picking a day in the calendar saves that date", async () => {
    // The custom picker seeds on the current value, so a task due in August
    // opens on August and clicking day 1 must save the 1st of that month.
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(task("a1", "Comprar leite", { due: "2026-08-15" })),
    });

    await userEvent.click(await screen.findByLabelText("Due date"));
    await userEvent.click(screen.getByRole("button", { name: "1" }));

    await waitFor(() => expect(lastSave().fields.due).toBe("2026-08-01"));
  });

  test("the date has its own way to be removed", async () => {
    // The picker can set a date but has no gesture for "none", so without
    // this button a date could be changed forever and never taken off.
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(task("a1", "Comprar leite", { due: "2026-07-25" })),
    });

    await userEvent.click(await screen.findByLabelText("clear date"));

    await waitFor(() => expect(lastSave().fields.due).toBe(null));
  });

  test("no clear button is offered when there is no date", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, { props: props(task("a1", "Comprar leite")) });

    await screen.findByLabelText("Due date");
    expect(screen.queryByLabelText("clear date")).toBeNull();
  });

  test("choosing a day closes the calendar", async () => {
    // The popup must dismiss itself once a day is picked — the whole reason it
    // replaced the native picker, which stayed open on top of the panel.
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(task("a1", "Comprar leite", { due: "2026-08-15" })),
    });

    await userEvent.click(await screen.findByLabelText("Due date"));
    expect(screen.queryByText("August 2026")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "1" }));

    expect(screen.queryByText("August 2026")).toBeNull();
    await waitFor(() => expect(lastSave().fields.due).toBe("2026-08-01"));
  });

  test("a tag with spaces is stored as a single token", async () => {
    // A loose word on the metadata line stops it from being all-tokens, and
    // the next read turns the whole line into a description — losing the
    // date, the priority and the other tags with it.
    bridge({ set_task_fields: null });

    render(TaskInspector, { props: props(task("a1", "Comprar leite")) });
    await addTag("casa nova");

    await waitFor(() => expect(lastSave().fields.tags).toEqual(["casa-nova"]));
  });

  test("the priority a task already has is the one showing", async () => {
    // The draft holds the option's own string (services/taskFields.js): a
    // `<select>` matches its options by string, so a numeric draft would leave
    // the row blank on a task that HAS a priority — and the next save would
    // then clear it. What goes back over the bridge is the number.
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(task("a1", "Pagar boleto", { priority: 2 })),
    });

    const select = await screen.findByDisplayValue("medium");
    await userEvent.selectOptions(select, "high");

    await waitFor(() => expect(lastSave().fields.priority).toBe(1));
  });

  test("repeat travels in the written form, never as an object", async () => {
    // The bridge hands back { every, unit } but only parses `every-2-weeks`.
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(
        task("a1", "Regar plantas", { repeat: { every: 2, unit: "week" } }),
      ),
    });
    await addTag("casa");

    await waitFor(() => expect(lastSave().fields.repeat).toBe("every-2-weeks"));
  });

  test("a single repetition drops the count", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(
        task("a1", "Regar plantas", { repeat: { every: 1, unit: "day" } }),
      ),
    });
    await addTag("casa");

    await waitFor(() => expect(lastSave().fields.repeat).toBe("every-day"));
  });

  test("subtasks survive the round trip", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(
        task("a1", "Obra", { subtasks: [{ text: "Cimento", done: true }] }),
      ),
    });
    await userEvent.type(
      await screen.findByPlaceholderText("New subtask…"),
      "Areia{enter}",
    );

    await waitFor(() =>
      expect(lastSave().fields.subtasks).toEqual([
        { text: "Cimento", done: true },
        { text: "Areia", done: false },
      ]),
    );
  });

  test("the repeat count is hidden until a unit is chosen", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, { props: props(task("a1", "Regar plantas")) });

    await screen.findByDisplayValue("Regar plantas");
    // No unit yet → the count is not shown at all (not merely disabled).
    expect(screen.queryByLabelText("every")).toBeNull();
  });

  test("choosing a repeat unit reveals the count", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(
        task("a1", "Regar plantas", { repeat: { every: 2, unit: "week" } }),
      ),
    });

    expect(await screen.findByLabelText("every")).toBeTruthy();
  });

  test("the sun sends the task to My Day", async () => {
    bridge({ pull_into_period: true, set_task_fields: null });

    render(TaskInspector, { props: props(task("a1", "Comprar leite")) });

    await userEvent.click(await screen.findByLabelText("Send to My Day"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pull_into_period", {
        period: "day",
        list: "jott.tasks/Compras.md",
        id: "a1",
      }),
    );
  });

  test("selecting another task replaces the draft", async () => {
    bridge({ set_task_fields: null });

    const { rerender } = render(TaskInspector, {
      props: props(task("a1", "Comprar leite")),
    });
    await screen.findByDisplayValue("Comprar leite");

    await rerender(props(task("b2", "Pagar boleto")));

    expect(await screen.findByDisplayValue("Pagar boleto")).toBeTruthy();
    expect(screen.queryByDisplayValue("Comprar leite")).toBeNull();
  });

  test("switching task mid-edit still saves what was typed, to the right task", async () => {
    // The dangerous moment of an auto-save: a pending write belongs to the
    // task it was typed into, not to whatever is on screen when it lands.
    bridge({ set_task_fields: null });

    const { rerender } = render(TaskInspector, {
      props: props(task("a1", "Comprar leite"), { saveDelay: 10_000 }),
    });
    await addTag("casa");

    await rerender(props(task("b2", "Pagar boleto"), { saveDelay: 10_000 }));

    await waitFor(() => expect(saveCount()).toBe(1));
    expect(lastSave().id).toBe("a1");
    expect(lastSave().fields.tags).toEqual(["casa"]);
  });

  test("closing with an edit pending still saves it", async () => {
    bridge({ set_task_fields: null });

    const { unmount } = render(TaskInspector, {
      props: props(task("a1", "Comprar leite"), { saveDelay: 10_000 }),
    });
    await addTag("casa");

    unmount();

    await waitFor(() => expect(saveCount()).toBe(1));
    expect(lastSave().fields.tags).toEqual(["casa"]);
  });

  test("a failed write is retried by the next edit, not counted as saved", async () => {
    let attempts = 0;
    const errors = [];
    bridge({
      set_task_fields: () => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject({ kind: "io", message: "disco cheio" })
          : Promise.resolve(null);
      },
    });

    render(TaskInspector, {
      props: props(task("a1", "Comprar leite"), {
        onError: (e) => errors.push(e),
      }),
    });
    await addTag("casa");
    await waitFor(() => expect(errors.length).toBe(1));

    await addTag("obra");
    // The retry carries the tag the failed write was meant to persist.
    await waitFor(() => expect(lastSave().fields.tags).toEqual(["casa", "obra"]));
  });

  test("a read-only notebook cannot be edited at all", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(task("a1", "Comprar leite"), { readOnly: true }),
    });

    await screen.findByDisplayValue("Comprar leite");
    expect(screen.queryByPlaceholderText("New tag…")).toBeNull();
    expect(screen.getByLabelText("task name").disabled).toBe(true);
    expect(saveCount()).toBe(0);
  });

  // ---- attachments (2026-08-18) ----
  // "Add files" stopped being an honest placeholder: the file lives in the
  // notebook's library and the task points at it with a Markdown link.

  const withFiles = (extra = {}) => ({ root: "/home/gus/Caderno", ...extra });

  test("attaching a file from the library saves a link on the task", async () => {
    bridge({
      set_task_fields: null,
      assets: [{ path: "assets/nota.pdf", name: "nota.pdf", size: 10, modified: 1, image: false }],
    });

    render(TaskInspector, { props: props(task("a1", "Enviar proposta"), withFiles()) });

    await userEvent.click(await screen.findByText("Add files"));
    // The picker offers what the library holds, image or not.
    await userEvent.click(await screen.findByTitle("nota.pdf"));

    await waitFor(() =>
      expect(lastSave().fields.files).toEqual([
        { label: "nota.pdf", address: "assets/nota.pdf" },
      ]),
    );
    // And the chip is on the panel, named after the file.
    expect(screen.getByText("nota.pdf")).toBeTruthy();
  });

  // The engine's own semantics, measured in WebKit 2.4.1 (the app's Linux
  // webview) before this test was written: resetting a file input CLEARS the
  // very `FileList` object the handler is holding — WebKit's
  // `FileInputType::setValue` calls `m_fileList->clear()`, while Blink swaps
  // in a fresh empty list. A handler that resets first and reads afterwards
  // imports nothing, in silence, on Linux only.
  function webkitFileInput(input, files) {
    const held = [...files];
    held.item = (i) => held[i] ?? null;
    Object.defineProperty(input, "files", { configurable: true, get: () => held });
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => (held.length ? held[0].name : ""),
      set: () => (held.length = 0),
    });
  }

  test("importing a file from the picker survives the input being reset", async () => {
    const imported = [];
    bridge({
      set_task_fields: null,
      assets: () => imported.map((name) => ({ path: `assets/${name}`, name, size: 4, modified: 1, image: true })),
      import_asset: ({ name }) => {
        imported.push(name);
        return `assets/${name}`;
      },
    });

    const { container } = render(TaskInspector, {
      props: props(task("a1", "Enviar proposta"), withFiles()),
    });
    await userEvent.click(await screen.findByText("Add files"));

    const input = await waitFor(() => {
      const found = container.ownerDocument.querySelector(".asset-picker__input");
      if (!found) throw new Error("no file input");
      return found;
    });
    webkitFileInput(input, [new File(["png!"], "foto.png", { type: "image/png" })]);
    await fireEvent.change(input);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("import_asset", {
        name: "foto.png",
        // "png!" in base64 — the bytes the bridge decodes.
        data: "cG5nIQ==",
      }),
    );
    // And the file it just imported is the one attached, without a second ask.
    await waitFor(() =>
      expect(lastSave().fields.files).toEqual([
        { label: "foto.png", address: "assets/foto.png" },
      ]),
    );
  });

  test("a task opens with the files it already has, and can drop one", async () => {
    bridge({ set_task_fields: null, open_asset: null });
    const attached = task("a1", "Enviar proposta", {
      files: [{ label: "o contrato assinado", address: "assets/contrato.pdf" }],
    });

    render(TaskInspector, { props: props(attached, withFiles()) });

    // The LABEL from the file, not the address: someone may have written it.
    await userEvent.click(await screen.findByText("o contrato assinado"));
    expect(invoke).toHaveBeenCalledWith("open_asset", { path: "assets/contrato.pdf" });

    await userEvent.click(screen.getByLabelText("Remove attachment"));
    await waitFor(() => expect(lastSave().fields.files).toEqual([]));
  });

  test("attaching the same file twice says nothing new", async () => {
    bridge({
      set_task_fields: null,
      assets: [{ path: "assets/nota.pdf", name: "nota.pdf", size: 10, modified: 1, image: false }],
    });
    const attached = task("a1", "Enviar proposta", {
      files: [{ label: "nota.pdf", address: "assets/nota.pdf" }],
    });

    render(TaskInspector, { props: props(attached, withFiles()) });
    await userEvent.click(await screen.findByText("Add files"));
    await userEvent.click(await screen.findByTitle("nota.pdf"));

    // Nothing was written: the address IS the attachment, and two links to one
    // file say nothing new.
    expect(saveCount()).toBe(0);
  });

  test("a read-only notebook shows the attachments and offers no way to change them", async () => {
    const attached = task("a1", "Enviar proposta", {
      files: [{ label: "nota.pdf", address: "assets/nota.pdf" }],
    });

    render(TaskInspector, { props: props(attached, withFiles({ readOnly: true })) });

    expect(await screen.findByText("nota.pdf")).toBeTruthy();
    expect(screen.queryByText("Add files")).toBeNull();
    expect(screen.queryByLabelText("Remove attachment")).toBeNull();
  });
});

describe("App", () => {
  // The shell had no tests until three bugs in a row turned out to live here:
  // a completed list read by the wrong name, a panel that closed on every
  // save, and a click-away rule that swallowed clicks meant for a control.
  // None of them could be seen from a single screen's test.
  const notebook = {
    path: "/n",
    name: "n",
    readOnly: false,
    lists: [
      { path: "jott.tasks/Inbox.md", name: "Inbox" },
      { path: "jott.tasks/completed.md", name: "Completed" },
    ],
    // The on-disk addresses travel with the notebook since the snapshot
    // command; since phase 7 they are paths, not names.
    layout: {
      inbox: "jott.tasks/Inbox.md",
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

  const snapshot = (spaces = [], groups = []) => ({
    info: notebook,
    clock: {
      today: "2026-07-21",
      weekStart: "2026-07-20",
      nextDailyTurn: "2026-07-22T00:00:00Z",
      nextWeeklyTurn: "2026-07-27T00:00:00Z",
    },
    counts: {},
    conflicts: [],
    spaces,
    groups,
  });

  // `path` is the identity (2026-08-13); `folderName` rides along for anything
  // that still wants the leaf.
  const aSpace = {
    folderName: "Space",
    path: "Space",
    name: "Space",
    fixed: false,
    readOnly: false,
  };

  const shell = (extra = {}) =>
    bridge({
      last_notebook: "/n",
      open_notebook: notebook,
      // One round trip for everything the shell shows after any change.
      notebook_snapshot: snapshot(),
      screen_to_restore: "list:jott.tasks/task-list.md",
      note_folders: [noteFolder("Inbox")],
      notes_created_today: [],
      list_tasks: [task("a1", "Comprar leite"), task("b2", "Pagar boleto")],
      period_tasks: [],
      grouped_suggestions: [],
      set_task_fields: null,
      ...extra,
    });

  const openTask = async (text) => {
    await userEvent.click(await screen.findByText(text));
    return await screen.findByLabelText("task name");
  };

  // Both cases below only ever happen on Android, where no one developing Jott
  // can click. The tests are the only thing standing between a working first
  // launch there and an onboarding screen whose single button cannot work,
  // because the platform has no folder for the user to pick.
  test("with no notebook to reopen, it opens the folder the platform gives it", async () => {
    const opened = vi.fn(() => notebook);
    shell({
      last_notebook: null,
      default_notebook_folder: "/storage/emulated/0/Android/data/dev.gustavotondin.jott/files/Documents/Jott",
      open_notebook: opened,
    });

    render(App);

    await waitFor(() => expect(opened).toHaveBeenCalled());
    expect(opened.mock.calls[0][0]).toEqual({
      path: "/storage/emulated/0/Android/data/dev.gustavotondin.jott/files/Documents/Jott",
    });
    // Never the onboarding screen: that folder was not a suggestion.
    expect(screen.queryByText("Choose notebook folder…")).toBeNull();
  });

  test("where the platform offers no folder, it still asks the user for one", async () => {
    const opened = vi.fn(() => notebook);
    // Desktop: `default_notebook_folder` answers null, because choosing where
    // the notebook lives is the user's call.
    shell({ last_notebook: null, default_notebook_folder: null, open_notebook: opened });

    render(App);

    await waitFor(() => expect(screen.getByText("Choose notebook folder…")).toBeTruthy());
    expect(opened).not.toHaveBeenCalled();
  });

  test("opening a note clears the right panel and takes it for the formatting", async () => {
    // User call, 2026-08-19: "ao entrar num editor de notas, se tem uma tarefa
    // aberta, ela deve fechar imediatamente". An inspector left standing over
    // a note describes something that is not on screen any more.
    shell({
      list_notes: [
        {
          path: "Inbox/Ideia.md",
          title: "Ideia",
          folder: "Inbox",
          preview: "preview",
          created: "2026-07-21",
          pinned: false,
        },
      ],
      read_note: {
        path: "Inbox/Ideia.md",
        title: "Ideia",
        body: "Corpo.",
        pinned: false,
        created: "2026-07-21",
      },
      write_note: null,
    });
    render(App);

    await openTask("Comprar leite");
    await userEvent.click(await screen.findByRole("button", { name: "Notes" }));
    await userEvent.click(await screen.findByText("Ideia"));

    await waitFor(() => expect(screen.queryByLabelText("task name")).toBeNull());
    expect(screen.getByLabelText("Formatting")).toBeTruthy();
  });

  test("the note's panel has the head and the foot every panel has", async () => {
    // User report, 2026-08-19: the formatting controls were the whole panel,
    // while the wireframe draws the same silhouette the inspector has — a way
    // to fold it away and a ⋮ above, where the note lives and a trash below.
    shell({
      list_notes: [
        {
          path: "Inbox/Ideia.md",
          title: "Ideia",
          folder: "Inbox",
          preview: "preview",
          created: "2026-07-21",
          pinned: false,
        },
      ],
      note_folders: [noteFolder("Inbox"), noteFolder("Clientes")],
      read_note: {
        path: "Inbox/Ideia.md",
        title: "Ideia",
        body: "Corpo.",
        pinned: false,
        created: "2026-07-21",
      },
      write_note: null,
      move_note_to_space: "Clientes/Ideia.md",
    });
    render(App);

    await userEvent.click(await screen.findByRole("button", { name: "Notes" }));
    await userEvent.click(await screen.findByText("Ideia"));
    await screen.findByLabelText("Formatting");

    expect(screen.getByLabelText("collapse panel")).toBeTruthy();
    expect(screen.getByLabelText("note options")).toBeTruthy();

    // The foot says where the note is filed, and is the way to move it.
    await userEvent.click(screen.getByLabelText("Move to…"));
    await userEvent.click(await screen.findByText("Clientes"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("move_note_to_space", {
        folder: "jott.notes",
        path: "Inbox/Ideia.md",
        toSpace: "jott.notes",
        toFolder: "Clientes",
      }),
    );
  });

  test("the sidebar head carries search and a + that makes things", async () => {
    // Both were only reachable by shortcut or by right-clicking empty column
    // — which stops existing as soon as the column is full (user call,
    // 2026-08-17).
    shell();
    render(App);
    await screen.findByText("Comprar leite");

    await userEvent.click(screen.getByLabelText("new list, notepad or group"));
    // Inside the dropdown: an empty column also offers its own two buttons,
    // and both say the same words.
    const made = within(document.querySelector(".menu__list"));
    expect(made.getByText("New list")).toBeTruthy();
    expect(made.getByText("New notepad")).toBeTruthy();
    expect(made.getByText("New group")).toBeTruthy();

    await userEvent.click(screen.getByLabelText("search"));
    // The whole notebook, the same box Ctrl+F opens.
    expect(await screen.findByPlaceholderText("Search tasks and notes…")).toBeTruthy();
  });

  test("the sidebar reopens as wide as it was left", async () => {
    // A machine preference, not a notebook one: it answers to a monitor.
    shell({ sidebar_width: 300 });
    render(App);
    await screen.findByText("Comprar leite");

    await waitFor(() =>
      expect(document.querySelector(".window").getAttribute("style")).toContain(
        "--theme-sidebar-left: 300px",
      ),
    );

    // And the edge between the panels is a handle that says how wide it is.
    const handle = screen.getByLabelText("resize sidebar");
    expect(handle.getAttribute("aria-valuenow")).toBe("300");
  });

  test("the right panel is resizable too, and keeps its own width", async () => {
    shell({
      panel_width: 320,
      period_tasks: [],
      grouped_suggestions: [],
    });
    render(App);
    await screen.findByText("Comprar leite");

    await waitFor(() =>
      expect(document.querySelector(".window").getAttribute("style")).toContain(
        "--theme-sidebar-right: 320px",
      ),
    );
    // The handle exists only while a panel does.
    expect(screen.queryByLabelText("resize panel")).toBeNull();
    await userEvent.click(await screen.findByText("Comprar leite"));
    expect(await screen.findByLabelText("resize panel")).toBeTruthy();
  });

  test("the two handles answer the arrow keys in opposite directions", async () => {
    // One gesture, mirrored (shell/PanelResizer.svelte): the right panel's
    // handle sits on the side its width grows AWAY from, so the same key that
    // narrows the sidebar widens the panel. A separator that can be moved has
    // to be operable from the keyboard, or the width is mouse-only.
    shell({ sidebar_width: 300, panel_width: 320, remember_panel_width: null });
    render(App);
    await screen.findByText("Comprar leite");
    await userEvent.click(await screen.findByText("Comprar leite"));

    const sidebar = await screen.findByLabelText("resize sidebar");
    sidebar.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(sidebar.getAttribute("aria-valuenow")).toBe("292");

    const panel = await screen.findByLabelText("resize panel");
    panel.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(panel.getAttribute("aria-valuenow")).toBe("328");
  });

  test("an absurd stored width is clamped instead of taking over the window", async () => {
    shell({ sidebar_width: 9000 });
    render(App);
    await screen.findByText("Comprar leite");

    await waitFor(() =>
      expect(document.querySelector(".window").getAttribute("style")).toContain(
        "--theme-sidebar-left: 480px",
      ),
    );
  });

  test("Completed lives in the right-rail menu, not among the lists", async () => {
    // It is created by the app on every open, so it never sits among the user's
    // lists; it moved to the hamburger's lesser pages.
    shell();
    render(App);

    await screen.findByText("Comprar leite");
    // Not shown in the sidebar at all.
    expect(screen.queryByText("Completed")).toBeNull();

    // But one click from the right-rail hamburger.
    await userEvent.click(screen.getByLabelText("menu"));
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("Tags management")).toBeTruthy();
    expect(screen.getByText("Trash")).toBeTruthy();
  });

  test("Ctrl+T opens the new task popup from any screen", async () => {
    // The app is a capture tool: reaching for the mouse to write down the
    // thing you just thought of is the cost it exists to remove.
    shell();
    render(App);

    await screen.findByText("Comprar leite");
    await userEvent.keyboard("{Control>}t{/Control}");

    // The popup composes an intent; writing it is `composeTask`'s job.
    const field = await screen.findByPlaceholderText("Create a task…");
    await userEvent.type(field, "Ligar para o cliente{Enter}");

    await waitFor(() =>
      expect(
        invoke.mock.calls.some(
          ([cmd, args]) => cmd === "create_task" && args.text === "Ligar para o cliente",
        ),
      ).toBe(true),
    );
    // And it closes itself, so the next screen is not behind a dialog.
    await waitFor(() => expect(screen.queryByPlaceholderText("Create a task…")).toBeNull());
  });

  test("Ctrl+F searches the whole notebook and opens what was picked", async () => {
    shell({
      search: {
        tasks: [
          {
            kind: "task",
            path: "jott.tasks/Compras.md",
            folder: "",
            id: "a1",
            title: "Comprar cimento",
            snippet: "",
            space: "Tasks",
            container: "Compras",
            done: false,
          },
        ],
        notes: [],
        truncated: false,
      },
    });
    render(App);

    await screen.findByText("Comprar leite");
    await userEvent.keyboard("{Control>}f{/Control}");
    await userEvent.type(await screen.findByPlaceholderText("Search tasks and notes…"), "cimento");

    // The core decides what matches; the dialog only asks and draws.
    await waitFor(() =>
      expect(
        invoke.mock.calls.some(([cmd, args]) => cmd === "search" && args.query === "cimento"),
      ).toBe(true),
    );

    // Picking a hit goes there and closes the dialog.
    await userEvent.click(await screen.findByText("Comprar cimento"));
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Search tasks and notes…")).toBeNull(),
    );
    expect(invoke).toHaveBeenCalledWith("list_tasks", { list: "jott.tasks/Compras.md" });
    // And the TASK opens, not just the list it happens to live in.
    expect(await screen.findByLabelText("task name")).toBeTruthy();
  });

  test("Ctrl+N asks for a note title and opens what it created", async () => {
    shell({ create_note: "Inbox/Ideia.md" });
    render(App);

    await screen.findByText("Comprar leite");
    await userEvent.keyboard("{Control>}n{/Control}");

    await userEvent.type(await screen.findByDisplayValue("New note"), "Ideia");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(invoke.mock.calls.some(([cmd]) => cmd === "create_note")).toBe(true),
    );
  });

  test("saving a task leaves the inspector open", async () => {
    // Saving refreshes the notebook, and the effect that closes the panel on
    // navigation used to depend on it. Editing the date closed the panel
    // between choosing the month and choosing the day.
    shell();
    render(App);

    await openTask("Comprar leite");
    // Make an edit through the tag picker (its create flow adds a tag).
    await userEvent.click(screen.getByRole("button", { name: "add tag" }));
    await userEvent.type(screen.getByPlaceholderText("New tag name"), "casa{enter}");

    await waitFor(() =>
      expect(invoke.mock.calls.some(([cmd]) => cmd === "set_task_fields")).toBe(true),
    );
    expect(screen.queryByLabelText("task name")).not.toBeNull();
  });

  test("an opened task is highlighted even with no id yet", async () => {
    // The lazy id: a task written by hand (or freshly respawned) has no id
    // until it is edited. Highlighting by id alone left it unhighlighted when
    // opened — only already-addressed tasks lit up. It must match by identity.
    shell({ list_tasks: [task(null, "Sem id ainda")] });
    const { container } = render(App);

    await userEvent.click(await screen.findByText("Sem id ainda"));

    await waitFor(() =>
      expect(container.querySelector(".task-row--selected")).toBeTruthy(),
    );
  });

  test("clicking another task swaps the panel instead of closing it", async () => {
    shell();
    render(App);

    await openTask("Comprar leite");
    expect(screen.getByLabelText("task name").value).toBe("Comprar leite");

    await userEvent.click(screen.getByText("Pagar boleto"));

    await waitFor(() =>
      expect(screen.getByLabelText("task name").value).toBe("Pagar boleto"),
    );
  });

  test("clicking away does not close the panel", async () => {
    // Tried and removed: even scoped to the empty space it fired too easily,
    // and losing a half-typed task costs more than the shortcut is worth.
    // Kept as a test so it does not come back by accident.
    shell();
    const { container } = render(App);

    await openTask("Comprar leite");

    await userEvent.click(screen.getByPlaceholderText("New task…"));
    await fireEvent.click(container.querySelector(".shell__content"));

    expect(screen.queryByLabelText("task name")).not.toBeNull();
  });

  test("escape closes the panel, but first only the open calendar", async () => {
    // The date picker catches Escape while its calendar is open (to dismiss
    // just the calendar); only once nothing else is open does Escape close the
    // whole panel.
    shell();
    render(App);

    await openTask("Comprar leite");

    // Calendar open: Escape dismisses it and the panel stays.
    await userEvent.click(screen.getByLabelText("Due date"));
    await fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByLabelText("task name")).not.toBeNull();

    // Calendar closed: Escape now closes the panel.
    await fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("task name")).toBeNull());
  });

  test("changing screen keeps the panel open", async () => {
    // The inspector persists across screens now (user request 2026-07-23): a
    // task opened on one screen keeps showing while you look elsewhere.
    shell();
    render(App);

    await openTask("Comprar leite");
    await userEvent.click(screen.getByRole("button", { name: "Tasks" }));

    await waitFor(() => expect(screen.getByLabelText("task name")).toBeTruthy());
  });

  test("the sidebar collapses to an icon rail and back", async () => {
    shell();
    const { container } = render(App);

    await screen.findByText("Comprar leite");
    const sidebar = container.querySelector(".shell__sidebar");
    expect(sidebar.classList.contains("shell__sidebar--rail")).toBe(false);

    await userEvent.click(screen.getByLabelText("collapse sidebar"));
    expect(sidebar.classList.contains("shell__sidebar--rail")).toBe(true);

    // The button now offers the reverse action.
    await userEvent.click(screen.getByLabelText("expand sidebar"));
    expect(sidebar.classList.contains("shell__sidebar--rail")).toBe(false);
  });

  test("dragging a sidebar list saves the new order", async () => {
    const withLists = {
      ...notebook,
      lists: [
        { path: "jott.tasks/Inbox.md", name: "Inbox" },
        { path: "jott.tasks/completed.md", name: "Completed" },
        { path: "jott.tasks/Alpha.md", name: "Alpha" },
        { path: "jott.tasks/Beta.md", name: "Beta" },
      ],
    };
    bridge({
      last_notebook: "/n",
      open_notebook: withLists,
      notebook_snapshot: {
        info: withLists,
        clock: {
          today: "2026-07-21",
          weekStart: "2026-07-20",
          nextDailyTurn: "2026-07-22T00:00:00Z",
          nextWeeklyTurn: "2026-07-27T00:00:00Z",
        },
        counts: {},
        conflicts: [],
        spaces: [],
      },
      screen_to_restore: "list:jott.tasks/task-list.md",
      note_folders: [noteFolder("Inbox")],
      notes_created_today: [],
      list_tasks: [],
      period_tasks: [],
      grouped_suggestions: [],
      set_order: null,
    });
    const { container } = render(App);

    await screen.findByText("Alpha");
    const items = container.querySelectorAll(".shell__nav-item--reorderable");
    expect(items.length).toBe(2);
    // jsdom has no layout: stack the two 40px rows top to bottom.
    items.forEach((el, i) => {
      el.getBoundingClientRect = () => ({
        left: 0, right: 200, width: 200,
        top: i * 40, bottom: i * 40 + 40, height: 40,
        x: 0, y: i * 40, toJSON() {},
      });
    });

    // Drag Alpha (row 0) below Beta's midpoint (60): it should land after Beta.
    await fireEvent.pointerDown(items[0], { button: 0, pointerId: 1, clientY: 5 });
    await fireEvent.pointerMove(items[0], { pointerId: 1, clientY: 75 });
    await fireEvent.pointerUp(items[0], { pointerId: 1, clientY: 75 });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_order", {
        namespace: "lists:jott.tasks",
        names: ["Beta", "Alpha"],
      }),
    );
  });

  test("the sidebar's right-click menu also sorts the spaces", async () => {
    shell({ spaces_sort: "", set_spaces_sort: null });
    render(App);
    await screen.findByText("Comprar leite");

    await fireEvent.contextMenu(document.querySelector(".shell__sidebar-scroll"));
    await userEvent.click(await screen.findByText("Sort"));
    await userEvent.click(await screen.findByText("Sort by name"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_spaces_sort", { sort: "name" }),
    );
  });

  test("an empty column offers both kinds by name", async () => {
    // Nothing to right-click is nothing to discover, so the first entries keep
    // their buttons (user call, 2026-08-06) — and each says what it makes: one
    // button that quietly made a task list was the bug of 2026-08-11.
    shell();
    render(App);
    await screen.findByText("Comprar leite");
    expect(screen.getByRole("button", { name: "New list" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New notepad" })).toBeTruthy();
  });

  test("once there is one, only the menu makes them", async () => {
    // Permanent buttons at the bottom of the list read as two more entries.
    shell({ notebook_snapshot: snapshot([aSpace]) });
    render(App);
    await screen.findByText("Space");
    expect(screen.queryByRole("button", { name: "New list" })).toBeNull();
    expect(screen.queryByRole("button", { name: "New notepad" })).toBeNull();
  });

  test("a group inside a group is drawn inside it, and opens its members", async () => {
    // Groups nest (user call, 2026-08-11), so the column is a tree that
    // renders itself. What this guards is the recursion: an entry two levels
    // down has to appear at all, and clicking it has to open it.
    const inner = {
      folderName: "Acme",
      path: "Design/Clients/Acme",
      name: "Acme",
      kind: "tasks",
      known: true,
      fixed: false,
      readOnly: false,
      sort: null,
      order: [],
    };
    shell({
      notebook_snapshot: snapshot(
        [inner],
        [
          { folder: "Design", parent: null, name: "Design", spaces: [] },
          {
            folder: "Design/Clients",
            parent: "Design",
            name: "Clients",
            spaces: ["Design/Clients/Acme"],
          },
        ],
      ),
    });
    render(App);

    await screen.findByText("Design");
    expect(screen.getByText("Clients")).toBeTruthy();
    // The space is drawn inside the innermost level, not loose at the top.
    const nested = document.querySelectorAll(".shell__spaces--nested");
    expect(nested.length).toBe(2);
    expect(within(nested[1]).getByText("Acme")).toBeTruthy();

    // And it opens: the space's own screen names it, so "Acme" is on the
    // page twice — once in the column, once as the title.
    await userEvent.click(within(nested[1]).getByText("Acme"));
    await waitFor(() => expect(screen.getAllByText("Acme").length).toBeGreaterThan(1));
  });

  test("creating a list from the sidebar's right-click menu", async () => {
    // window.prompt is broken in WebKitGTK, so naming goes through the app's
    // own NameDialog (reestruturação 2026-07-30). Creating itself lives in the
    // right-click menu since 2026-08-06 — a permanent button at the bottom of
    // the list read as one more entry. The menu names the two kinds outright
    // (user call, 2026-08-11): a list, or a notepad.
    shell({ create_space: "My Project", notebook_snapshot: snapshot([aSpace]) });
    render(App);
    await screen.findByText("Comprar leite");

    await fireEvent.contextMenu(document.querySelector(".shell__sidebar-scroll"));
    expect(await screen.findByText("New notepad")).toBeTruthy();
    await userEvent.click(await screen.findByText("New list"));

    // The dialog appears; type the name and confirm (scoped to the dialog, as
    // the shell has other text inputs on screen).
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "My Project");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_space", {
        name: "My Project",
        kind: "tasks",
      }),
    );
  });
});

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
      "--dot: var(--accent-orange)",
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
    // Unset, so the class's own `var(--dot, --theme-brand)` answers.
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

  test("the screen arranges its cards by the sort the config declares", async () => {
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
    expect(titles).toEqual(["Amora", "banana"]);
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
        clock: {
          today: "2026-07-21",
          weekStart: "2026-07-20",
          nextDailyTurn: "2026-07-22T00:00:00Z",
          nextWeeklyTurn: "2026-07-27T00:00:00Z",
        },
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

/// The board's ⋮ → Layout → Folders. The two view buttons that used to sit
/// above the cards are menu items since the 2026-08-19 redraw, so every test
/// that wants the tree view comes through here.
const showFolders = async () => {
  await userEvent.click(await screen.findByLabelText("space options"));
  await userEvent.click(await screen.findByText("Layout"));
  await userEvent.click(await screen.findByText("Folders"));
};

describe("NotesSpace", () => {
  const source = { kind: "notes", folder: "Notes", invalidFolder: false, options: null };

  const entry = (title, extra = {}) => ({
    path: `Inbox/${title}.md`,
    title,
    folder: "Inbox",
    preview: `preview of ${title}`,
    created: "2026-07-21",
    pinned: false,
    ...extra,
  });

  const props = (extra = {}) => ({
    source,
    readOnly: false,
    notesInbox: "Inbox",
    onChanged: noop,
    onError: noop,
    reloadKey: 0,
    ...extra,
  });

  test("lists the notes of its own folder", async () => {
    bridge({ list_notes: [entry("Ideia")], note_folders: [noteFolder("Inbox")] });

    render(NotesSpace, { props: props() });

    expect(await screen.findByText("Ideia")).toBeTruthy();
    expect(screen.getByText("preview of Ideia")).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith("list_notes", {
      folder: "Notes",
      query: "",
    });
  });

  test("an empty board says so", async () => {
    // The screen's own search box went with the 2026-08-19 redraw: searching
    // in a place is Ctrl+F with this space as its scope (SearchDialog), and a
    // second field above the cards was a second answer to the same question.
    bridge({ list_notes: [], note_folders: [] });

    render(NotesSpace, { props: props() });
    expect(await screen.findByText("No notes yet.")).toBeTruthy();
    expect(screen.queryByLabelText("Search notes…")).toBeNull();
  });

  test("pinning goes through the core and reloads", async () => {
    // A button of its own beside the ⋮ (user call, 2026-08-19: "com a mesma
    // funcionalidade das tarefas"). A pin is a STATE, and a state has to be
    // readable off the card without opening a menu to ask.
    bridge({ list_notes: [entry("Ideia")], note_folders: [], set_note_pinned: null });

    render(NotesSpace, { props: props() });
    await userEvent.click(await screen.findByLabelText("pin"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_note_pinned", {
        folder: "Notes",
        path: "Inbox/Ideia.md",
        pinned: true,
      }),
    );
  });

  test("opening a note reports it upwards instead of embedding an editor", async () => {
    // A note becomes a document tab, the same as a list — deciding that is
    // the shell's business, not this screen's.
    const opened = [];
    bridge({ list_notes: [entry("Ideia")], note_folders: [] });

    render(NotesSpace, {
      props: props({ onOpenNote: (path, folder) => opened.push([path, folder]) }),
    });
    await userEvent.click(await screen.findByText("Ideia"));

    expect(opened).toEqual([["Inbox/Ideia.md", "Notes"]]);
    expect(invoke.mock.calls.some(([cmd]) => cmd === "read_note")).toBe(false);
  });

  test("the folder view filters to the folder being looked at", async () => {
    bridge({
      list_notes: [
        entry("Solta"),
        entry("Briefing", { path: "Clientes/Briefing.md", folder: "Clientes" }),
      ],
      note_folders: [noteFolder("Clientes"), noteFolder("Inbox")],
    });

    render(NotesSpace, { props: props() });
    await showFolders();
    // The folder chip, not the card footer that also names the folder.
    await userEvent.click(screen.getByRole("button", { name: "Clientes" }));

    expect(await screen.findByText("Briefing")).toBeTruthy();
    expect(screen.queryByText("Solta")).toBeNull();
  });

  test("a read-only notebook offers no way to write", async () => {
    bridge({ list_notes: [entry("Ideia")], note_folders: [] });

    render(NotesSpace, { props: props({ readOnly: true }) });

    await screen.findByText("Ideia");
    // No quick-note bar, no pin, and no ⋮ on the card: every one of them
    // writes.
    expect(screen.queryByLabelText("Quick note…")).toBeNull();
    expect(screen.queryByLabelText("pin")).toBeNull();
    expect(screen.queryByLabelText("note options")).toBeNull();
    await userEvent.click(screen.getByLabelText("space options"));
    expect(screen.queryByText("New note")).toBeNull();
  });

  // ---- the board redrawn (2026-08-18) ----

  test("a note's banner is drawn on its card, in the colour it names", async () => {
    bridge({
      list_notes: [entry("Ideia", { banner: { kind: "color", value: "yellow" } })],
      note_folders: [],
    });

    const { container } = render(NotesSpace, { props: props() });
    await screen.findByText("Ideia");

    const banner = container.querySelector(".note-card__banner");
    // The NAME becomes a var() of the palette, never a hex: which end of the
    // ramp shows is the region's call (services/accent.js).
    expect(banner.getAttribute("style")).toContain("var(--accent-yellow-fill)");
  });

  test("a note with no banner has no block above its title", async () => {
    bridge({ list_notes: [entry("Ideia")], note_folders: [] });

    const { container } = render(NotesSpace, { props: props() });
    await screen.findByText("Ideia");
    expect(container.querySelector(".note-card__banner")).toBeNull();
  });

  test("a folder of notes is a card, and opening it shows what is inside", async () => {
    bridge({
      list_notes: [
        entry("Solta"),
        entry("Briefing", { path: "Clientes/Briefing.md", folder: "Clientes" }),
      ],
      note_folders: [noteFolder("Clientes"), noteFolder("Inbox")],
    });

    render(NotesSpace, { props: props() });

    // On the board: the loose note as a card, the folder as a card of its own
    // — and the INBOX is not one of them (services/noteBoard.js).
    expect(await screen.findByText("Solta")).toBeTruthy();
    expect(screen.getByText("Clientes")).toBeTruthy();
    expect(screen.getByText("1 note")).toBeTruthy();
    expect(screen.queryByText("Inbox")).toBeNull();

    // Opening it does NOT leave the board (user call, 2026-08-19): the folder
    // unfolds over it, so what is behind is still there to go back to.
    await userEvent.click(screen.getByLabelText("open Clientes"));
    expect(await screen.findByText("preview of Briefing")).toBeTruthy();
    expect(screen.getByText("Solta")).toBeTruthy();

    // And it closes onto the same board.
    await userEvent.click(screen.getByLabelText("open Clientes"));
    expect(screen.queryByText("preview of Briefing")).toBeNull();
  });

  // ---- the quick note bar (2026-08-19) ----

  test("what is typed in the bar becomes the note's BODY, under a name the app gives", async () => {
    // The writer types the thing, not a file name (user call): asking for a
    // title first asks for the one thing they do not know yet.
    bridge({
      list_notes: [],
      note_folders: [],
      create_note: "Inbox/New note.md",
      write_note: null,
    });

    render(NotesSpace, { props: props() });
    await userEvent.type(await screen.findByLabelText("Quick note…"), "comprar cimento");
    await userEvent.click(screen.getByLabelText("Create the note"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_note", {
        folder: "Notes",
        inFolder: "Inbox",
        title: "New note",
      }),
    );
    expect(invoke).toHaveBeenCalledWith("write_note", {
      folder: "Notes",
      path: "Inbox/New note.md",
      body: "comprar cimento\n",
    });
  });

  test("Enter files the note and Shift+Enter is a new line", async () => {
    bridge({
      list_notes: [],
      note_folders: [],
      create_note: "Inbox/New note.md",
      write_note: null,
    });

    render(NotesSpace, { props: props() });
    const field = await screen.findByLabelText("Quick note…");
    await userEvent.type(field, "uma linha{Shift>}{Enter}{/Shift}outra");
    expect(invoke.mock.calls.some(([cmd]) => cmd === "create_note")).toBe(false);

    await userEvent.type(field, "{Enter}");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_note", {
        folder: "Notes",
        path: "Inbox/New note.md",
        body: "uma linha\noutra\n",
      }),
    );
  });

  test("+ on an empty bar makes a note and hands it over, ready to type in", async () => {
    // The other gesture entirely: nothing was typed here, so there is nothing
    // keeping the writer on this screen — the note opens with the cursor in
    // its body.
    const opened = [];
    bridge({ list_notes: [], note_folders: [], create_note: "Inbox/New note.md" });

    render(NotesSpace, {
      props: props({ onOpenNote: (path, folder, opts) => opened.push([path, folder, opts]) }),
    });
    await userEvent.click(await screen.findByLabelText("Create the note"));

    await waitFor(() =>
      expect(opened).toEqual([["Inbox/New note.md", "Notes", { fresh: true }]]),
    );
    expect(invoke.mock.calls.some(([cmd]) => cmd === "write_note")).toBe(false);
  });

  test("a card duplicates through the core", async () => {
    bridge({
      list_notes: [entry("Ideia")],
      note_folders: [],
      duplicate_note: "Inbox/Ideia 2.md",
    });

    render(NotesSpace, { props: props() });
    await userEvent.click(await screen.findByLabelText("note options"));
    await userEvent.click(await screen.findByText("Duplicate"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("duplicate_note", {
        folder: "Notes",
        path: "Inbox/Ideia.md",
      }),
    );
  });

  test("a card moves to another place from its own ⋮", async () => {
    bridge({
      list_notes: [entry("Ideia")],
      note_folders: [noteFolder("Clientes"), noteFolder("Inbox")],
      move_note_to_space: "Clientes/Ideia.md",
    });

    render(NotesSpace, { props: props() });
    await userEvent.click(await screen.findByLabelText("note options"));
    await userEvent.click(await screen.findByText("Move to…"));
    // The menu row, not the folder CARD of the same name behind it.
    await userEvent.click(
      (await screen.findAllByText("Clientes")).find((el) =>
        el.classList.contains("menu__link"),
      ),
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("move_note_to_space", {
        folder: "Notes",
        path: "Inbox/Ideia.md",
        toSpace: "Notes",
        toFolder: "Clientes",
      }),
    );
  });

  test("a pinned note is drawn first, whatever the sort says", async () => {
    // Pinning outranks the arrangement, exactly as it does on a task list
    // (services/spaceOrder.js) — that is what "a mesma funcionalidade das
    // tarefas" means for a board.
    bridge({
      list_notes: [entry("Aaa"), entry("Zzz", { pinned: true })],
      note_folders: [],
    });

    const { container } = render(NotesSpace, {
      props: props({ source: { ...source, sort: "name" } }),
    });
    await screen.findByText("Zzz");
    const titles = [...container.querySelectorAll(".note-card__title")].map(
      (el) => el.textContent.trim(),
    );
    expect(titles).toEqual(["Zzz", "Aaa"]);
  });

  // ---- dragging a card (2026-08-19) ----

  test("a dragged card saves the arrangement it landed in", async () => {
    // It did nothing at all until now: the fixed Notes screen never passed an
    // `onSetOrder`, so the board dragged, called a handler nobody had given it
    // and redrew in the old order (user report).
    const saved = [];
    bridge({ list_notes: [entry("Aaa"), entry("Bbb")], note_folders: [] });

    const { container } = render(NotesSpace, {
      props: props({ onSetOrder: (order) => saved.push(order) }),
    });
    await screen.findByText("Aaa");

    const cards = [...container.querySelectorAll(".notes-space__item")];
    place(cards, 220);
    fireEvent.pointerDown(cards[0], { button: 0, pointerId: 1, clientX: 110, clientY: 60 });
    fireEvent.pointerMove(cards[0], { pointerId: 1, clientX: 110, clientY: 300 });
    fireEvent.pointerUp(cards[0], { pointerId: 1, clientX: 110, clientY: 300 });

    await waitFor(() => expect(saved).toEqual([["Inbox/Bbb.md", "Inbox/Aaa.md"]]));
  });

  test("a card dropped on a folder card is filed into it", async () => {
    // A folder card is not part of the arrangement, so it is a drop ZONE: the
    // note goes in there instead of next to it.
    bridge({
      list_notes: [entry("Aaa"), entry("Bbb")],
      note_folders: [noteFolder("Clientes"), noteFolder("Inbox")],
      move_note_to_space: "Clientes/Aaa.md",
    });

    const { container } = render(NotesSpace, { props: props() });
    await screen.findByText("Aaa");

    const group = container.querySelector(".notes-space__group");
    const cards = [...container.querySelectorAll(".notes-space__item")];
    place(cards, 220);
    place([group], 700);
    fireEvent.pointerDown(cards[0], { button: 0, pointerId: 1, clientX: 110, clientY: 240 });
    fireEvent.pointerMove(cards[0], { pointerId: 1, clientX: 110, clientY: 720 });
    fireEvent.pointerUp(cards[0], { pointerId: 1, clientX: 110, clientY: 720 });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("move_note_to_space", {
        folder: "Notes",
        path: "Inbox/Aaa.md",
        toSpace: "Notes",
        toFolder: "Clientes",
      }),
    );
  });

  test("picked notes move to another space", async () => {
    bridge({
      list_notes: [entry("Ideia")],
      note_folders: [noteFolder("Inbox")],
      move_note_to_space: "Ideia.md",
    });

    render(NotesSpace, {
      props: props({ noteSpaces: [{ path: "Design/Ideias", name: "Ideias" }] }),
    });

    await userEvent.click(await screen.findByLabelText("space options"));
    await userEvent.click(await screen.findByText("Select notes…"));
    await userEvent.click(await screen.findByText("Ideia"));
    expect(screen.getByText("1 selected")).toBeTruthy();

    await userEvent.selectOptions(
      screen.getByLabelText("Move to…"),
      JSON.stringify(["Design/Ideias", "Inbox"]),
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("move_note_to_space", {
        folder: "Notes",
        path: "Inbox/Ideia.md",
        toSpace: "Design/Ideias",
        toFolder: "Inbox",
      }),
    );
  });

  test("picked notes are deleted together", async () => {
    bridge({ list_notes: [entry("Ideia"), entry("Outra")], note_folders: [], delete_note: null });

    render(NotesSpace, { props: props() });
    await userEvent.click(await screen.findByLabelText("space options"));
    await userEvent.click(await screen.findByText("Select notes…"));
    await userEvent.click(await screen.findByText("Ideia"));
    await userEvent.click(await screen.findByText("Outra"));
    await userEvent.click(screen.getByText("Delete"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_note", {
        folder: "Notes",
        path: "Inbox/Outra.md",
      }),
    );
    expect(invoke).toHaveBeenCalledWith("delete_note", {
      folder: "Notes",
      path: "Inbox/Ideia.md",
    });
  });
});

describe("NoteBanner", () => {
  const props = (extra = {}) => ({
    banner: null,
    title: "Ideia",
    root: "/home/gus/Caderno",
    readOnly: false,
    onSet: noop,
    onChooseImage: noop,
    ...extra,
  });

  test("a note with no banner keeps its title, in the same place", () => {
    // The head is ONE box whose block has a colour and a height only when the
    // note asks for one (user call, 2026-08-19). So the title is drawn either
    // way, and it is the same element in both — what goes away is the fill.
    const { container } = render(NoteBanner, { props: props() });

    expect(screen.getByText("Ideia")).toBeTruthy();
    expect(container.querySelector(".note-banner__title")).toBeTruthy();
    expect(container.querySelector(".note-banner--empty")).toBeTruthy();
  });

  test("a note with no banner is where one is chosen from", () => {
    // The ⋮ is on the head, not on the block: with no banner there would be
    // nowhere to open one from at all, and "add a banner" would live only in
    // the page menu two screens away.
    render(NoteBanner, { props: props() });
    expect(screen.getByLabelText("banner options")).toBeTruthy();
  });

  test("below 768px the title is still the note's own head", () => {
    // The bar above the page stops printing the name for a note (PageHeader),
    // so this IS the name on screen — the wireframe "New note mobile - no
    // banner" draws exactly this row.
    render(NoteBanner, { props: props({ compact: true }) });
    expect(screen.getByText("Ideia")).toBeTruthy();
  });

  test("a colour banner is painted with the palette, never a hex", () => {
    const { container } = render(NoteBanner, {
      props: props({ banner: { kind: "color", value: "yellow" } }),
    });

    const banner = container.querySelector(".note-banner");
    expect(banner.getAttribute("style")).toContain("var(--accent-yellow-fill)");
    expect(container.querySelector(".note-banner__image")).toBeNull();
    // The title moves onto the chip over it — one title, in one place.
    expect(screen.getByText("Ideia")).toBeTruthy();
  });

  test("an image banner loads the file the address names", () => {
    const { container } = render(NoteBanner, {
      props: props({ banner: { kind: "image", value: "assets/foto.png" } }),
    });

    const img = container.querySelector(".note-banner__image");
    expect(img.getAttribute("src")).toContain("Caderno");
  });

  test("the ⋮ takes the banner off, and a read-only note has no ⋮ at all", async () => {
    const set = [];
    render(NoteBanner, {
      props: props({ banner: { kind: "color", value: "blue" }, onSet: (v) => set.push(v) }),
    });

    await userEvent.click(screen.getByLabelText("banner options"));
    await userEvent.click(screen.getByText("Remove banner"));
    expect(set).toEqual([null]);

    cleanup();
    render(NoteBanner, {
      props: props({ banner: { kind: "color", value: "blue" }, readOnly: true }),
    });
    expect(screen.queryByLabelText("banner options")).toBeNull();
  });
});

describe("AssetsView", () => {
  const asset = (name, image = true) => ({
    path: `assets/${name}`,
    name,
    size: 2048,
    modified: 1,
    image,
  });

  const props = (extra = {}) => ({
    root: "/home/gus/Caderno",
    readOnly: false,
    onChanged: noop,
    onError: noop,
    reloadKey: 0,
    ...extra,
  });

  // ---- files brought to the library itself (2026-08-19) ----
  // This screen IS the library, so it is the most obvious thing in the app to
  // hand a file to — and it was the one place that did not accept one.

  test("a file dropped on the library is imported", async () => {
    bridge({ assets: [], asset_usage: {}, import_asset_from_path: "assets/foto.webp" });
    const { container } = render(AssetsView, { props: props() });
    await screen.findByText("No files yet.");

    await fireEvent.drop(container.querySelector(".assets-view"), {
      dataTransfer: {
        files: [],
        types: ["text/uri-list"],
        getData: () => "",
        items: [
          {
            kind: "string",
            type: "text/html",
            // The shape WebKit actually hands a drag over in — the address is
            // the anchor's TEXT, while `text/uri-list` sits empty beside it.
            getAsString: (cb) => cb('<a style="color: rgb(0,0,0)">file:///home/gus/foto.webp</a>'),
          },
        ],
      },
    });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("import_asset_from_path", {
        path: "/home/gus/foto.webp",
      }),
    );
  });

  test("a pasted file falls back to the system clipboard", async () => {
    // Every accessor the webview has answers empty for a pasted file
    // (measured 2026-08-19); the system is the only one that knows.
    bridge({
      assets: [],
      asset_usage: {},
      clipboard_files: ["file:///home/gus/nota.pdf"],
      import_asset_from_path: "assets/nota.pdf",
    });
    const { container } = render(AssetsView, { props: props() });
    await screen.findByText("No files yet.");

    await fireEvent.paste(container.querySelector(".assets-view"), {
      clipboardData: { files: [], types: ["text/uri-list"], getData: () => "", items: [] },
    });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("import_asset_from_path", {
        path: "/home/gus/nota.pdf",
      }),
    );
  });

  // ---- what uses a file (2026-08-19) ----
  // The fact that makes deleting safe, and the way to what would break.

  const usedBy = (title, extra = {}) => ({
    kind: "note",
    path: "Inbox/com imagem.md",
    folder: "jott.notes",
    id: null,
    title,
    snippet: "",
    space: "Notes",
    container: "Inbox",
    done: false,
    ...extra,
  });

  test("says which files nothing points at", async () => {
    bridge({
      assets: [asset("usada.png"), asset("esquecida.png")],
      asset_usage: { "assets/usada.png": [usedBy("com imagem")] },
    });

    render(AssetsView, { props: props() });

    await screen.findByText("Not used");
    expect(screen.getByText("Used in 1 place")).toBeTruthy();
  });

  test("opens what uses one", async () => {
    const opened = vi.fn();
    bridge({
      assets: [asset("usada.png")],
      asset_usage: { "assets/usada.png": [usedBy("com imagem")] },
    });

    render(AssetsView, { props: props({ onOpenNote: opened }) });

    // The places are a detail of the row: asked for, not always on screen.
    await userEvent.click(await screen.findByText("Used in 1 place"));
    await userEvent.click(screen.getByText("com imagem"));

    expect(opened).toHaveBeenCalledWith("Inbox/com imagem.md", "jott.notes");
  });

  test("a task that attaches it is a place too", async () => {
    const opened = vi.fn();
    bridge({
      assets: [asset("nota.pdf", false)],
      asset_usage: {
        "assets/nota.pdf": [
          usedBy("Enviar proposta", {
            kind: "task",
            path: "jott.tasks/task-list.md",
            folder: "",
            id: "a1",
            space: "Tasks",
          }),
        ],
      },
    });

    render(AssetsView, { props: props({ onOpenTask: opened }) });

    await userEvent.click(await screen.findByText("Used in 1 place"));
    await userEvent.click(screen.getByText("Enviar proposta"));

    expect(opened).toHaveBeenCalledWith("jott.tasks/task-list.md", "a1");
  });

  test("lists the library, with the name a note would call the file by", async () => {
    bridge({ assets: [asset("foto.png")] });

    render(AssetsView, { props: props() });

    expect(await screen.findByText("foto.png")).toBeTruthy();
    // `/foto.png` — the piece that goes between a pair of brackets. Not the
    // machine path, which would break on another computer, and not
    // `assets/foto.png`, which is where the file lives (user call,
    // 2026-08-19).
    expect(screen.getByText("/foto.png")).toBeTruthy();
    expect(screen.getByText("1 file")).toBeTruthy();
  });

  test("deleting asks first and goes through the core", async () => {
    bridge({ assets: [asset("foto.png")], delete_asset: null });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(AssetsView, { props: props() });
    await userEvent.click(await screen.findByLabelText("Delete file"));

    expect(confirm).toHaveBeenCalled();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_asset", { path: "assets/foto.png" }),
    );
    confirm.mockRestore();
  });

  test("a read-only notebook can look but not add or delete", async () => {
    bridge({ assets: [asset("foto.png")] });

    render(AssetsView, { props: props({ readOnly: true }) });

    await screen.findByText("foto.png");
    expect(screen.queryByText("Add files")).toBeNull();
    expect(screen.queryByLabelText("Delete file")).toBeNull();
  });
});

describe("NoteEditor", () => {
  const props = (extra = {}) => ({
    folder: "Notes",
    path: "Inbox/Ideia.md",
    readOnly: false,
    saveDelay: 0,
    onSaved: noop,
    onError: noop,
    onClose: noop,
    onRenamed: noop,
    ...extra,
  });

  const loaded = (body = "Corpo.\n") => ({
    read_note: {
      path: "Inbox/Ideia.md",
      title: "Ideia",
      body,
      pinned: false,
      created: "2026-07-21",
    },
    write_note: null,
  });

  test("opening a note writes nothing", async () => {
    // Same promise as the lazy task id: looking must not touch the file.
    bridge(loaded());

    render(NoteEditor, { props: props() });
    await screen.findByDisplayValue("Corpo.");
    await new Promise((r) => setTimeout(r, 20));

    expect(invoke.mock.calls.some(([cmd]) => cmd === "write_note")).toBe(false);
  });

  // ---- files brought into the note (2026-08-19) ----
  //
  // The gesture is handled on the note's WRAPPER, in the capture phase, and
  // both halves were learned from the running app: a dropped file lands on
  // the wrapper and never inside the editor, and CodeMirror handles a paste
  // itself before the event could bubble out. So the tests fire on the
  // wrapper, which is where a person's gesture actually arrives.

  const picture = () => new File(["png!"], "foto.png", { type: "image/png" });
  const bodyOf = (container) => container.querySelector(".note-editor__body");

  test("pasting a file hands it to the shell instead of pasting text", async () => {
    bridge(loaded());
    const brought = vi.fn();

    const { container } = render(NoteEditor, { props: props({ onFiles: brought }) });
    await screen.findByDisplayValue("Corpo.");
    await fireEvent.paste(bodyOf(container), {
      clipboardData: { files: [picture()], types: ["Files"] },
    });

    await waitFor(() => expect(brought).toHaveBeenCalledTimes(1));
    expect(brought.mock.calls[0][0].files[0].name).toBe("foto.png");
  });

  test("a file the desktop handed over as an address is read too", async () => {
    // The shape the app's own window actually sends (measured 2026-08-19):
    // no bytes, `text/uri-list` in the types, and `getData` answering empty —
    // so the item list is what has the address.
    bridge(loaded());
    const brought = vi.fn();

    const { container } = render(NoteEditor, { props: props({ onFiles: brought }) });
    await screen.findByDisplayValue("Corpo.");
    await fireEvent.paste(bodyOf(container), {
      clipboardData: {
        files: [],
        types: ["text/uri-list"],
        getData: () => "",
        items: [
          {
            kind: "string",
            type: "text/uri-list",
            getAsString: (cb) => cb("file:///home/gus/f%C3%A9rias.jpg"),
          },
        ],
      },
    });

    await waitFor(() => expect(brought).toHaveBeenCalledTimes(1));
    expect(brought.mock.calls[0][0].paths).toEqual(["/home/gus/férias.jpg"]);
  });

  test("a dragged file is read out of the html flavour", async () => {
    // Where the address actually is, for a drag (measured 2026-08-19):
    // WebKit hands over `<a …>file:///…</a>` while `text/uri-list` sits
    // empty beside it.
    bridge(loaded());
    const brought = vi.fn();

    const { container } = render(NoteEditor, { props: props({ onFiles: brought }) });
    await screen.findByDisplayValue("Corpo.");
    await fireEvent.drop(bodyOf(container), {
      dataTransfer: {
        files: [],
        types: ["text/uri-list", "text/html"],
        getData: () => "",
        items: [
          { kind: "string", type: "text/uri-list", getAsString: (cb) => cb("") },
          {
            kind: "string",
            type: "text/html",
            getAsString: (cb) => cb('<a style="color: rgb(0,0,0)">file:///home/gus/foto.webp</a>'),
          },
        ],
      },
    });

    await waitFor(() => expect(brought).toHaveBeenCalledTimes(1));
    expect(brought.mock.calls[0][0].paths).toEqual(["/home/gus/foto.webp"]);
  });

  test("a pasted file falls back to the system clipboard", async () => {
    // For a paste there is nothing in the webview at all — no bytes, no
    // `getData`, no `getAsString`. The system is the only one that knows.
    //
    // The transfer here EMPTIES ITSELF once the handler returns, the way a
    // real one does (W3C Clipboard API: the store goes to Protected mode and
    // the `DataTransfer` is disconnected). Reading it after an await is what
    // kept the system from ever being asked, and a stub that stays readable
    // for ever cannot fail that way.
    bridge({ ...loaded(), clipboard_files: ["file:///home/gus/nota.pdf"] });
    const brought = vi.fn();

    const { container } = render(NoteEditor, { props: props({ onFiles: brought }) });
    await screen.findByDisplayValue("Corpo.");
    const clipboardData = {
      files: [],
      types: ["text/uri-list"],
      getData: () => "",
      items: [],
    };
    queueMicrotask(() => {
      clipboardData.types = [];
      clipboardData.items = [];
    });
    await fireEvent.paste(bodyOf(container), { clipboardData });

    await waitFor(() => expect(brought).toHaveBeenCalledTimes(1));
    expect(brought.mock.calls[0][0].paths).toEqual(["/home/gus/nota.pdf"]);
  });

  test("dropping a file on the note hands it over too", async () => {
    bridge(loaded());
    const brought = vi.fn();

    const { container } = render(NoteEditor, { props: props({ onFiles: brought }) });
    await screen.findByDisplayValue("Corpo.");
    await fireEvent.drop(bodyOf(container), {
      dataTransfer: { files: [picture()], types: ["Files"] },
    });

    await waitFor(() => expect(brought).toHaveBeenCalledTimes(1));
  });

  test("a drag carrying files is accepted, so the drop can arrive", async () => {
    // Without this `preventDefault` the drop never happens at all — and a
    // real drag out of a file manager announces itself as `text/uri-list`,
    // not as `Files`.
    bridge(loaded());
    const { container } = render(NoteEditor, { props: props({ onFiles: vi.fn() }) });
    await screen.findByDisplayValue("Corpo.");

    for (const types of [["Files"], ["text/uri-list"]]) {
      const carrying = new Event("dragover", { bubbles: true, cancelable: true });
      carrying.dataTransfer = { types };
      bodyOf(container).dispatchEvent(carrying);
      expect(carrying.defaultPrevented, types.join()).toBe(true);
    }
  });

  test("a paste of plain text is left alone", async () => {
    // The common case, and the one a greedy handler would break: not
    // answering is what lets the editor do its own job.
    bridge(loaded());
    const brought = vi.fn();

    const { container } = render(NoteEditor, { props: props({ onFiles: brought }) });
    await screen.findByDisplayValue("Corpo.");
    await fireEvent.paste(bodyOf(container), {
      clipboardData: { files: [], types: ["text/plain"], getData: () => "olá" },
    });

    expect(brought).not.toHaveBeenCalled();
  });

  test("a read-only note takes nothing", async () => {
    bridge(loaded());
    const brought = vi.fn();

    const { container } = render(NoteEditor, {
      props: props({ onFiles: brought, readOnly: true }),
    });
    await screen.findByDisplayValue("Corpo.");
    await fireEvent.drop(bodyOf(container), {
      dataTransfer: { files: [picture()], types: ["Files"] },
    });

    expect(brought).not.toHaveBeenCalled();
  });

  test("editing saves on its own", async () => {
    bridge(loaded());

    render(NoteEditor, { props: props() });
    await userEvent.type(await screen.findByDisplayValue("Corpo."), " Mais.");

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_note", {
        folder: "Notes",
        path: "Inbox/Ideia.md",
        body: "Corpo.\n Mais.",
      }),
    );
  });

  test("closing with an edit pending still saves it", async () => {
    bridge(loaded());

    const { unmount } = render(NoteEditor, {
      props: props({ saveDelay: 10_000 }),
    });
    await userEvent.type(await screen.findByDisplayValue("Corpo."), "!");
    unmount();

    await waitFor(() =>
      expect(invoke.mock.calls.some(([cmd]) => cmd === "write_note")).toBe(true),
    );
  });

  test("a read-only notebook cannot be edited", async () => {
    bridge(loaded());

    render(NoteEditor, { props: props({ readOnly: true }) });

    const field = await screen.findByDisplayValue("Corpo.");
    expect(field.disabled).toBe(true);
  });

  test("the editor is writable once the note has loaded", async () => {
    // The bug this guards: the engine baked `readOnly || loading` in at
    // creation, and since a note is always loading at that instant, the
    // editor rendered the file beautifully and refused every keystroke.
    bridge(loaded());

    render(NoteEditor, { props: props() });

    const field = await screen.findByDisplayValue("Corpo.");
    await waitFor(() => expect(field.disabled).toBe(false));
  });

  test("the note reports its title, pin state and banner to the shell", async () => {
    // They belong to the page header above the tabs, not to a second bar
    // inside the page — and the banner is drawn by the shell too, above this
    // editor, because it is not part of the body being typed into.
    const seen = [];
    bridge(loaded());

    render(NoteEditor, { props: props({ onLoaded: (s) => seen.push(s) }) });

    await waitFor(() => expect(seen.length).toBe(1));
    expect(seen[0]).toEqual({ pinned: false, title: "Ideia", banner: null });
    // And it draws no header of its own.
    expect(screen.queryByText("← notes")).toBeNull();
    expect(screen.queryByText("delete")).toBeNull();
  });

  test("a note that has a banner hands it over the same way", async () => {
    const seen = [];
    bridge({
      ...loaded(),
      read_note: {
        path: "Inbox/Ideia.md",
        title: "Ideia",
        body: "Corpo.",
        pinned: false,
        created: null,
        banner: { kind: "color", value: "yellow" },
      },
    });

    render(NoteEditor, { props: props({ onLoaded: (s) => seen.push(s) }) });

    await waitFor(() => expect(seen.length).toBe(1));
    expect(seen[0].banner).toEqual({ kind: "color", value: "yellow" });
    // The body it edits is the text WITHOUT the banner line — the core split
    // them, and typing must not put the head back into the prose.
    expect(await screen.findByDisplayValue("Corpo.")).toBeTruthy();
  });
});

describe("NotesSpace folder management", () => {
  const source = { kind: "notes", folder: "Notes", invalidFolder: false, options: null };

  const props = (extra = {}) => ({
    source,
    readOnly: false,
    notesInbox: "Inbox",
    onChanged: noop,
    onError: noop,
    reloadKey: 0,
    ...extra,
  });

  const withFolders = (extra = {}) =>
    bridge({
      list_notes: [],
      note_folders: [noteFolder("Clientes"), noteFolder("Inbox")],
      rename_note_folder: "Contas",
      delete_note_folder: 2,
      ...extra,
    });

  /// The folder card's own ⋮ (2026-08-19). The two underlined words that used
  /// to hang under the board are gone: they only appeared once a folder was
  /// already open, which is the one moment you did not need them.
  const openFolderMenu = async () =>
    await userEvent.click(await screen.findByLabelText("folder options"));

  test("a folder card carries its own menu, on the board itself", async () => {
    withFolders();
    render(NotesSpace, { props: props() });

    await openFolderMenu();
    expect(screen.getByText("Delete")).toBeTruthy();
    expect(screen.getByText("Rename")).toBeTruthy();
    // And pinning and colouring, which a folder never had before.
    expect(screen.getByText("pin")).toBeTruthy();
    expect(screen.getByText("colour")).toBeTruthy();
  });

  test("a folder is pinned and coloured through the space's own config", async () => {
    // A folder of notes is a plain directory: what it is coloured lives in the
    // space's `.space.json`, never in a marker inside the user's tree.
    withFolders({ set_note_folder_pinned: null, set_note_folder_color: null });
    render(NotesSpace, { props: props() });

    await openFolderMenu();
    await userEvent.click(screen.getByText("pin"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_note_folder_pinned", {
        folder: "Notes",
        path: "Clientes",
        pinned: true,
      }),
    );

    await openFolderMenu();
    await userEvent.click(screen.getByText("colour"));
    await userEvent.click(await screen.findByText("Red"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_note_folder_color", {
        folder: "Notes",
        path: "Clientes",
        color: "red",
      }),
    );
  });

  test("renaming a folder goes through the core", async () => {
    // Naming goes through the app's own askName now (window.prompt is a no-op
    // in WebKitGTK); the widget renders without the dialog, so the pending
    // request is answered directly on the store.
    withFolders();
    const { nameRequest } = await import("./services/dialog.js");
    const { get } = await import("svelte/store");

    render(NotesSpace, { props: props() });
    await openFolderMenu();
    await userEvent.click(screen.getByText("Rename"));

    await waitFor(() => expect(get(nameRequest)).toBeTruthy());
    get(nameRequest).resolve("Contas");
    nameRequest.set(null);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("rename_note_folder", {
        folder: "Notes",
        path: "Clientes",
        name: "Contas",
      }),
    );
  });

  test("deleting a folder is confirmed and reports what moved", async () => {
    // Nothing is destroyed — the notes move up a level, and the user is told.
    const messages = [];
    withFolders();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(NotesSpace, {
      props: props({ onError: (e) => messages.push(e.message) }),
    });
    await openFolderMenu();
    await userEvent.click(screen.getByText("Delete"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_note_folder", {
        folder: "Notes",
        path: "Clientes",
      }),
    );
    expect(window.confirm.mock.calls[0][0]).toContain("nothing is deleted");
    await waitFor(() =>
      expect(messages.some((m) => m.includes("moved up one level"))).toBe(true),
    );
    window.confirm.mockRestore();
  });

  test("a refused confirmation deletes nothing", async () => {
    withFolders();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(NotesSpace, { props: props() });
    await openFolderMenu();
    await userEvent.click(screen.getByText("Delete"));

    expect(invoke.mock.calls.some(([cmd]) => cmd === "delete_note_folder")).toBe(false);
    window.confirm.mockRestore();
  });

  test("a read-only notebook offers no folder actions", async () => {
    withFolders();
    render(NotesSpace, { props: props({ readOnly: true }) });

    // The card is drawn and opens; it simply carries no ⋮ and no pin, because
    // every item in one writes.
    expect(await screen.findByLabelText("open Clientes")).toBeTruthy();
    expect(screen.queryByLabelText("folder options")).toBeNull();
    expect(screen.queryByLabelText("pin")).toBeNull();
  });
});

describe("HomeView", () => {
  const props = (extra = {}) => ({
    notesFolder: "jott.notes",
    notesInbox: "Inbox",
    folders: ["Inbox", "Clientes"],
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

describe("the New task popup", () => {
  // The blue button opens a centred dialog over a dimmed page (wireframe
  // "New task popup.pdf"). It only COMPOSES — the caller writes, which is why
  // the same dialog can pull into the day from a period screen and not from a
  // space widget.
  //
  // It is driven by a STORE (services/dialog.js), so the dialog and the screen
  // that opens it are mounted side by side here rather than through App. Home
  // no longer opens it at all: its blue button became the capture box
  // (2026-08-13), and what that button used to guarantee is now asserted in
  // the HomeView block above.
  const props = {
    period: "day",
    clock: { today: "2026-07-21", weekStart: "2026-07-20" },
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

  const openOn = (extra = {}) => {
    bridge({ period_tasks: [], period_sort: null, ...extra });
    render(NewTaskDialog);
    // `compose="button"` is the widget's default everywhere except the Tasks
    // screen, which pins a bar instead; PeriodView passes the host's choice
    // through, so the screen has to ask for the button explicitly.
    render(PeriodView, { props: { ...props, compose: "button" } });
  };

  test("the blue button composes a task and pulls it into the period", async () => {
    openOn({ create_task: 0, ensure_task_id: "novo", pull_into_period: true });

    await userEvent.click(await screen.findByText("New task"));

    // A real dialog, not a prompt: it has the composing row inside it.
    const composer = await screen.findByPlaceholderText("Create a task…");
    await userEvent.type(composer, "Comprar cimento{Enter}");

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_task", {
        list: "jott.tasks/task-list.md",
        text: "Comprar cimento",
      }),
    );
    // Created from the day's block, so it joins the day — otherwise it would
    // not appear where the button was clicked.
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pull_into_period", {
        period: "day",
        list: "jott.tasks/task-list.md",
        id: "novo",
      }),
    );
    // And it closes itself once it has an answer.
    await waitFor(() => expect(screen.queryByPlaceholderText("Create a task…")).toBeNull());
  });

  test("closing it writes nothing", async () => {
    openOn({ create_task: 0 });

    await userEvent.click(await screen.findByText("New task"));
    await screen.findByPlaceholderText("Create a task…");
    await userEvent.click(screen.getByLabelText("Cancel"));

    await waitFor(() => expect(screen.queryByPlaceholderText("Create a task…")).toBeNull());
    expect(invoke.mock.calls.some(([cmd]) => cmd === "create_task")).toBe(false);
  });

  test("Escape closes it, and nothing behind it hears the key", async () => {
    // The three dialogs share one frame (components/Modal.svelte), and the
    // rule that frame exists to keep is this one: Escape is SWALLOWED. Without
    // it the shell's own Escape closes the task inspector at the same time —
    // one key, two things dismissed.
    openOn({ create_task: 0 });
    const heard = [];
    window.addEventListener("keydown", (e) => heard.push(e.key));

    await userEvent.click(await screen.findByText("New task"));
    const composer = await screen.findByPlaceholderText("Create a task…");
    await fireEvent.keyDown(composer, { key: "Escape", bubbles: true });

    await waitFor(() => expect(screen.queryByPlaceholderText("Create a task…")).toBeNull());
    expect(heard).not.toContain("Escape");
  });
});

describe("App functions — switching a part of the app off", () => {
  // The promise of the whole feature: it leaves the INTERFACE, never the file.
  const withFeatures = (features) => {
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
        features,
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
        day: [],
      },
      screen_to_restore: "home",
      note_folders: [],
      notes_created_today: [],
      period_tasks: [],
      grouped_suggestions: [],
      list_tasks: [],
    });
  };

  test("with tasks off, the sidebar and the Home have none", async () => {
    withFeatures({ tasks: false });
    render(App);

    // "Home" is both the sidebar entry and the tab, so scope to the sidebar.
    const sidebar = await waitFor(() => {
      const el = document.querySelector(".shell__sidebar");
      expect(el).not.toBeNull();
      return el;
    });
    await within(sidebar).findByText("Home");
    expect(within(sidebar).queryByText("Tasks")).toBeNull();
    // The Home keeps its notes half, and loses the day.
    expect(screen.queryByText("Today tasks")).toBeNull();
    expect(screen.getByText("Today notes")).toBeTruthy();
    // Completed and Tags belong to tasks; the trash does not.
    await userEvent.click(screen.getByLabelText("menu"));
    expect(screen.queryByText("Completed")).toBeNull();
    expect(screen.queryByText("Tags management")).toBeNull();
    expect(screen.getByText("Trash")).toBeTruthy();
  });

  test("with notes off, the Home keeps only the day", async () => {
    withFeatures({ notes: false });
    render(App);

    await screen.findByText("Today tasks");
    expect(screen.queryByText("Today notes")).toBeNull();
    expect(screen.queryByLabelText("Quick note…")).toBeNull();
  });

  test("with My Day off, the day is gone from the Home and from Tasks", async () => {
    withFeatures({ myDay: false });
    render(App);

    await screen.findByText("Today notes");
    expect(screen.queryByText("Today tasks")).toBeNull();

    // And the Tasks screen loses the tab, keeping Index and Week.
    const sidebar = document.querySelector(".shell__sidebar");
    await userEvent.click(within(sidebar).getByText("Tasks"));
    const strip = await waitFor(() => {
      const el = document.querySelector(".tasks-view__subs");
      expect(el).not.toBeNull();
      return el;
    });
    expect(within(strip).getByText("Inbox")).toBeTruthy();
    expect(within(strip).queryByText("Today")).toBeNull();
  });

  test("a task field switched off leaves the card and the panel, not the task", async () => {
    // Priority off: the `!!` goes, the field goes — and the task still says 2,
    // which is the whole promise (nothing is written, nothing is lost).
    withFeatures({ priority: false });
    bridge({
      last_notebook: "/n",
      open_notebook: { path: "/n", name: "n", readOnly: false, lists: [], layout: {
        inbox: "jott.tasks/task-list.md", completed: "jott.tasks/completed.md",
        tasksFolder: "jott.tasks", completedName: "completed",
        notesFolder: "jott.notes", notesInbox: "", dateDisplayFormat: "mm/dd/yyyy",
        closeInspectorOnClickAway: false, quickNoteFolder: "Inbox",
        features: { priority: false },
      }},
      notebook_snapshot: {
        info: { path: "/n", name: "n", readOnly: false,
          lists: [{ path: "jott.tasks/task-list.md", name: "Inbox" }],
          layout: {
            inbox: "jott.tasks/task-list.md", completed: "jott.tasks/completed.md",
            tasksFolder: "jott.tasks", completedName: "completed",
            notesFolder: "jott.notes", notesInbox: "",
            dateDisplayFormat: "mm/dd/yyyy", closeInspectorOnClickAway: false,
            quickNoteFolder: "Inbox", features: { priority: false },
          } },
        clock: { today: "2026-07-21", weekStart: "2026-07-20",
          nextDailyTurn: "2026-07-22T00:00:00Z", nextWeeklyTurn: "2026-07-27T00:00:00Z" },
        counts: {}, conflicts: [], spaces: [], groups: [], tags: [], day: [],
      },
      screen_to_restore: "list:jott.tasks/task-list.md",
      note_folders: [],
      list_tasks: [task("a1", "Pagar boleto", { priority: 2 })],
      set_task_fields: null,
    });
    render(App);

    await screen.findByText("Pagar boleto");
    expect(screen.queryByText("!!")).toBeNull();

    await userEvent.click(screen.getByText("Pagar boleto"));
    await screen.findByLabelText("task name");
    expect(screen.queryByLabelText("Priority")).toBeNull();
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
          weekStart: "2026-07-20",
          nextDailyTurn: "2026-07-22T00:00:00Z",
          nextWeeklyTurn: "2026-07-27T00:00:00Z",
        },
        counts: {},
        conflicts: [],
        spaces: [],
      },
      screen_to_restore: "home",
      note_folders: [],
      notes_created_today: [],
      list_tasks: [],
      ...extra,
    });

  const suggestions = [
    { path: "jott.tasks/Compras.md", space: "Tasks", task: task("b2", "Vencida", { due: "2026-07-05" }), group: "urgent" },
    { path: "jott.tasks/Compras.md", space: "Tasks", task: task("c3", "Tranquila"), group: "lists" },
  ];

  test("the pill fills the right panel, grouped, and a row pulls", async () => {
    onHome({
      period_tasks: [{ path: "jott.tasks/Compras.md", task: task("a1", "Arrumar site") }],
      grouped_suggestions: suggestions,
      pull_into_period: true,
    });
    render(App);

    await screen.findByText("Arrumar site");
    // Nothing is fetched until the panel is asked for.
    expect(invoke.mock.calls.some(([cmd]) => cmd === "grouped_suggestions")).toBe(false);

    await userEvent.click(screen.getByText("Suggestions"));

    expect(await screen.findByText("Suggestions for today")).toBeTruthy();
    expect(screen.getByText("Urgent")).toBeTruthy();
    // "From the lists" is gone: each list has its own heading now, space
    // in front (user call, 2026-08-06).
    expect(screen.queryByText("From the lists")).toBeNull();
    const pane = document.querySelector(".suggestions-pane");
    expect(within(pane).getByText("Compras")).toBeTruthy();
    expect(within(pane).getByText("Tasks/")).toBeTruthy();
    // Dates in the panel read like every other date in the app.
    expect(screen.getByText("07/05/2026")).toBeTruthy();

    // Every heading folds its section away.
    await userEvent.click(screen.getByText("Urgent"));
    await waitFor(() => expect(screen.queryByText("Vencida")).toBeNull());
    await userEvent.click(screen.getByText("Urgent"));
    expect(await screen.findByText("Vencida")).toBeTruthy();

    await userEvent.click(screen.getByText("Vencida"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pull_into_period", {
        period: "day",
        list: "jott.tasks/Compras.md",
        id: "b2",
      }),
    );
    // Pulling keeps the panel open — pulling several in a row is the gesture.
    expect(screen.queryByText("Suggestions for today")).not.toBeNull();
  });

  test("what left the day comes back under its own heading", async () => {
    // 2026-08-17: the core answers `recent` for a task that WAS in Today or
    // the Week and left. The panel gives it a section of its own, after the
    // week's live choices and before the plain lists.
    onHome({
      period_tasks: [],
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
    expect(at("Pulled recently")).toBeLessThan(at("Compras"));
  });

  test("opening a task takes the panel back, and Escape closes it", async () => {
    // One right panel: the two must never try to share it.
    onHome({
      period_tasks: [{ path: "jott.tasks/Compras.md", task: task("a1", "Arrumar site") }],
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

describe("TasksView", () => {
  // The three tabs are the SAME widget (2026-08-06): Index over the notebook's
  // own Inbox widget, Today and Week over a period. What the screen changes is
  // only where a new task comes from — the pinned bar, not the blue button.
  const props = (extra = {}) => ({
    inbox: "jott.tasks/task-list.md",
    clock: { today: "2026-07-20", weekStart: "2026-07-20" },
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

  test("switching to Today reads the period, and Week shows its span", async () => {
    bridge({ list_tasks: [], period_tasks: [], grouped_suggestions: [] });

    render(TasksView, { props: props() });

    await userEvent.click(await screen.findByText("Today"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("period_tasks", { period: "day" }),
    );

    await userEvent.click(screen.getByText("Week"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("period_tasks", { period: "week" }),
    );
    // Monday the 20th through Sunday the 26th, in the notebook's shape.
    // Day and month only: both ends share the year (user call, 2026-08-06).
    expect(await screen.findByText("07/20 - 07/26")).toBeTruthy();
  });

  test("the open tab is reported so the page header can name it", async () => {
    const subs = [];
    bridge({ list_tasks: [] });

    render(TasksView, { props: props({ onSub: (label) => subs.push(label) }) });

    await waitFor(() => expect(subs.at(-1)).toBe("Inbox"));
    await userEvent.click(screen.getByText("Today"));
    await waitFor(() => expect(subs.at(-1)).toBe("Today"));
  });
});

describe("App shell with tabs", () => {
  const notebook = {
    path: "/n",
    name: "n",
    readOnly: false,
    lists: [
      { path: "jott.tasks/Inbox.md", name: "Inbox" },
      { path: "jott.tasks/Compras.md", name: "Compras" },
      { path: "jott.tasks/completed.md", name: "Completed" },
    ],
    layout: {
      inbox: "jott.tasks/Inbox.md",
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

  const shell = (extra = {}) =>
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
      },
      screen_to_restore: null,
      note_folders: [noteFolder("Inbox")],
      notes_created_today: [],
      period_tasks: [],
      grouped_suggestions: [],
      list_tasks: [],
      ...extra,
    });

  /// The tab strip's labels, in order.
  const tabLabels = () =>
    screen.getAllByRole("tab").map((el) => el.textContent.trim());

  test("opens on Home, in a tab", async () => {
    shell();
    render(App);

    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));
  });

  test("a document opens in the tab you are on, not a new one", async () => {
    // Clicking a document is like following a link: it replaces what the tab
    // shows. A new tab is a deliberate gesture.
    shell();
    render(App);
    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));

    await userEvent.click(screen.getByRole("button", { name: /^Compras/ }));
    await waitFor(() => expect(tabLabels()).toEqual(["Compras"]));
  });

  test("the plus opens a fresh tab", async () => {
    // The + is a deliberate "new tab" gesture, so it appends even when the
    // view is already open — unlike following a link, which focuses.
    shell();
    render(App);
    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));

    await userEvent.click(screen.getByLabelText("new tab"));
    await waitFor(() => expect(tabLabels()).toEqual(["Home", "Home"]));
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true");
  });

  test("middle click opens a document in a new tab", async () => {
    shell();
    render(App);
    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));

    await fireEvent(
      screen.getByRole("button", { name: /^Compras/ }),
      new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
    );

    await waitFor(() => expect(tabLabels()).toEqual(["Home", "Compras"]));
  });

  test("the sidebar navigates the tab you are on; middle click makes a new one", async () => {
    // Same contract as documents: a click follows like a link (the back arrow
    // returns), and a fresh tab is the deliberate middle-click gesture.
    shell();
    render(App);
    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));

    await userEvent.click(screen.getByRole("button", { name: "Tasks" }));
    await waitFor(() => expect(tabLabels()).toEqual(["Tasks"]));

    expect(screen.getByLabelText("back").disabled).toBe(false);
    await userEvent.click(screen.getByLabelText("back"));
    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));

    await fireEvent(
      screen.getByRole("button", { name: "Tasks" }),
      new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
    );
    await waitFor(() => expect(tabLabels()).toEqual(["Home", "Tasks"]));
  });

  test("closing a tab lands on its neighbour, and the last one stays", async () => {
    shell();
    render(App);
    await waitFor(() => expect(tabLabels().length).toBe(1));

    await fireEvent(
      screen.getByRole("button", { name: "Tasks" }),
      new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
    );
    await waitFor(() => expect(tabLabels().length).toBe(2));

    await userEvent.click(screen.getAllByLabelText("close tab")[1]);
    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));

    // The last tab has no close button: an app with no tab has nothing to
    // show and no way back.
    expect(screen.queryByLabelText("close tab")).toBeNull();
  });

  test("the arrows walk the active tab's own history", async () => {
    shell();
    render(App);
    await waitFor(() => expect(tabLabels().length).toBe(1));

    // Navigating inside a tab (deleting a list sends you to the Inbox) is
    // what fills its history; opening from the sidebar makes new tabs.
    expect(screen.getByLabelText("back").disabled).toBe(true);
    expect(screen.getByLabelText("forward").disabled).toBe(true);
  });

  test("the page menu offers the actions of the screen it is on", async () => {
    shell();
    render(App);
    await waitFor(() => expect(tabLabels().length).toBe(1));

    // On a list, the menu renames and deletes it.
    await userEvent.click(screen.getByRole("button", { name: /^Compras/ }));
    await userEvent.click(await screen.findByLabelText("page menu"));
    expect(await screen.findByText("rename list")).toBeTruthy();
    expect(screen.getByText("delete list")).toBeTruthy();
  });

  test("Tasks is one entry with its views inside it", async () => {
    // Today and This Week are views of the same tasks, not places of their
    // own, so the sidebar says so with one entry and its buttons. Week ships
    // OFF (user call, 2026-08-06), so by default there are two.
    shell();
    render(App);
    await waitFor(() => expect(tabLabels().length).toBe(1));

    expect(screen.queryByRole("button", { name: "Week" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Tasks" }));
    expect(await screen.findByRole("button", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Inbox" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Week" })).toBeNull();

    // Switching view stays inside the tab — it is looking around one
    // document, not opening another.
    await userEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(tabLabels()).toEqual(["Tasks"]);
  });
});

describe("PageHeader", () => {
  const props = (extra = {}) => ({
    title: "Compras",
    subtitle: "",
    canBack: false,
    canForward: false,
    onBack: noop,
    onForward: noop,
    menu: [{ label: "rename list", run: noop }],
    ...extra,
  });

  test("the menu closes when the page changes", async () => {
    // A menu left hanging over a screen the user has already left would act
    // on the wrong thing.
    const { rerender } = render(PageHeader, { props: props() });

    await userEvent.click(screen.getByLabelText("page menu"));
    expect(await screen.findByText("rename list")).toBeTruthy();

    await rerender(props({ title: "Mercado" }));
    await waitFor(() => expect(screen.queryByText("rename list")).toBeNull());
  });

  test("picking an item runs it and closes the menu", async () => {
    let ran = 0;
    render(PageHeader, { props: props({ menu: [{ label: "go", run: () => ran++ }] }) });

    await userEvent.click(screen.getByLabelText("page menu"));
    await userEvent.click(await screen.findByText("go"));

    expect(ran).toBe(1);
    expect(screen.queryByText("go")).toBeNull();
  });

  test("the title renames the document when it can be renamed", async () => {
    let renamed = 0;
    render(PageHeader, { props: props({ onRenameTitle: () => renamed++ }) });

    await userEvent.click(screen.getByRole("button", { name: /Compras/ }));
    expect(renamed).toBe(1);
  });

  test("a title with no rename is plain text, not a button", async () => {
    render(PageHeader, { props: props() });
    expect(screen.queryByRole("button", { name: /Compras/ })).toBeNull();
  });
});

describe("TabBar", () => {
  const tab = (title) => ({ views: [{ kind: "list", list: `Tasks/${title}.md` }], at: 0 });
  const titleOf = (v) => v.list.replace("jott.tasks/", "").replace(".md", "");

  const props = (extra = {}) => ({
    tabs: [tab("Um"), tab("Dois"), tab("Tres")],
    active: 0,
    titleOf,
    onSelect: noop,
    onClose: noop,
    onMove: noop,
    ...extra,
  });

  test("closing freezes the widths so the next × lands under the pointer", async () => {
    // The browser behaviour worth copying: closing several tabs in a row is
    // one gesture instead of a hunt.
    const closed = [];
    const { container } = render(TabBar, {
      props: props({ onClose: (i) => closed.push(i) }),
    });

    await userEvent.click(screen.getAllByLabelText("close tab")[1]);

    expect(closed).toEqual([1]);
    const widths = [...container.querySelectorAll(".tabs__item")].map((el) => el.style.width);
    expect(widths.every((w) => w !== "")).toBe(true);

    // Leaving the bar releases them, so the tabs breathe again.
    await fireEvent.mouseLeave(container.querySelector(".tabs"));
    const after = [...container.querySelectorAll(".tabs__item")].map((el) => el.style.width);
    expect(after.every((w) => w === "")).toBe(true);
  });

  test("middle click closes a tab", async () => {
    const closed = [];
    render(TabBar, { props: props({ onClose: (i) => closed.push(i) }) });

    await fireEvent(
      screen.getAllByRole("tab")[2].closest(".tabs__item"),
      new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
    );

    expect(closed).toEqual([2]);
  });

  // Reordering is pointer-based (no native drag), so jsdom has no layout to
  // offer — each tab is given a fake 100px-wide rect side by side, and the
  // pointer is moved to the slot to land in.
  const layOut = (els) =>
    [...els].forEach((el, i) => {
      el.getBoundingClientRect = () => ({
        left: i * 100,
        right: i * 100 + 100,
        width: 100,
        top: 0,
        bottom: 28,
        height: 28,
        x: i * 100,
        y: 0,
        toJSON() {},
      });
    });

  test("dragging a tab onto another reports the move", async () => {
    const moves = [];
    const { container } = render(TabBar, {
      props: props({ onMove: (from, to) => moves.push([from, to]) }),
    });

    const els = container.querySelectorAll(".tabs__item");
    layOut(els);
    // Grab the first tab and carry it past the third's midpoint.
    await fireEvent.pointerDown(els[0], { button: 0, pointerId: 1, clientX: 10 });
    await fireEvent.pointerMove(els[0], { pointerId: 1, clientX: 260 });
    await fireEvent.pointerUp(els[0], { pointerId: 1, clientX: 260 });

    expect(moves).toEqual([[0, 2]]);
  });

  test("a tab released on itself moves nothing", async () => {
    const moves = [];
    const { container } = render(TabBar, {
      props: props({ onMove: (from, to) => moves.push([from, to]) }),
    });

    const els = container.querySelectorAll(".tabs__item");
    layOut(els);
    // Past the 5px threshold, but still over its own slot.
    await fireEvent.pointerDown(els[1], { button: 0, pointerId: 1, clientX: 110 });
    await fireEvent.pointerMove(els[1], { pointerId: 1, clientX: 130 });
    await fireEvent.pointerUp(els[1], { pointerId: 1, clientX: 130 });

    expect(moves).toEqual([]);
  });
});

describe("SettingsView", () => {
  const settings = {
    dailyMode: "reset",
    dailyAt: "00:00",
    weeklyMode: "reset",
    weeklyAt: "00:00",
    weekStartsOn: "monday",
    restoreLastScreen: false,
    showListCounts: true,
    autoUrgentByDate: true,
    dateDisplayFormat: "mm/dd/yyyy",
    closeInspectorOnClickAway: false,
    quickNoteFolder: "Inbox",
    accentColor: "",
    theme: "",
  };

  const notebook = { path: "/n", name: "n", readOnly: false };

  const props = (extra = {}) => ({
    notebook,
    folders: ["Inbox", "Clientes"],
    notesInbox: "Inbox",
    onChanged: noop,
    onError: noop,
    ...extra,
  });

  test("the note's own text size is a notebook setting, chosen here", async () => {
    // Reading taste travels with the notebook; the interface's zoom does not
    // (it is a machine preference, like the panel widths).
    bridge({ notebook_settings: settings, set_notebook_settings: null });
    render(SettingsView, { props: props() });

    await userEvent.click(await screen.findByRole("button", { name: "Large" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_notebook_settings", {
        settings: { noteFontSize: "large" },
      }),
    );
  });

  test("a shortcut is recorded here and stored on the notebook", async () => {
    bridge({ notebook_settings: settings, set_shortcut: null });
    render(SettingsView, { props: props() });

    // Every command has a row, grouped by what the user is doing.
    expect(await screen.findByText("In a task list")).toBeTruthy();
    expect(screen.getByText("While writing a note")).toBeTruthy();

    const rows = screen.getAllByTitle("Record a new key");
    await userEvent.click(rows[0]);
    await fireEvent.keyDown(screen.getByText("Press a key…"), {
      key: "j",
      ctrlKey: true,
      shiftKey: true,
    });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_shortcut", {
        id: "task.new",
        chord: "Mod+Shift+J",
      }),
    );
  });

  test("resetting forgets every binding", async () => {
    bridge({ notebook_settings: settings, reset_shortcuts: null });
    render(SettingsView, { props: props() });

    await userEvent.click(await screen.findByText("Reset to defaults"));
    await waitFor(() =>
      expect(invoke.mock.calls.some(([cmd]) => cmd === "reset_shortcuts")).toBe(true),
    );
  });

  test("the theme and the accent are chosen here, and stored by name", async () => {
    // Both are a NAME, never colours (2026-08-13): the theme picks which CSS
    // file dresses the app, the accent which of the seven the brand is. Absent
    // means the one the app ships as, so the default reads as chosen without
    // the notebook having to say so.
    bridge({ notebook_settings: settings, set_notebook_settings: null });
    render(SettingsView, { props: props() });

    const jott = await screen.findByRole("button", { name: "Jott" });
    expect(jott.getAttribute("aria-pressed")).toBe("true");

    await userEvent.click(screen.getByRole("button", { name: "Dark" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_notebook_settings", {
        settings: { theme: "dark" },
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "orange" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_notebook_settings", {
        settings: { accentColor: "orange" },
      }),
    );
  });

  test("a read-only notebook offers neither", async () => {
    bridge({ notebook_settings: settings });
    render(SettingsView, {
      props: props({ notebook: { ...notebook, readOnly: true } }),
    });

    const dark = await screen.findByRole("button", { name: "Dark" });
    expect(dark.hasAttribute("disabled")).toBe(true);
    // Disabled on the button, not merely ignored by the handler: a control
    // that looks pressable and does nothing reads as broken.
    expect(screen.getByRole("button", { name: "orange" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  test("shows every documented key with its stored value", async () => {
    bridge({ notebook_settings: settings });
    render(SettingsView, { props: props() });

    expect(await screen.findByLabelText("Date format")).toBeTruthy();
    expect(screen.getByLabelText("Show task counts in the sidebar").checked).toBe(true);
    expect(screen.getByLabelText("Reopen on the last screen").checked).toBe(false);
    expect(
      screen.getByLabelText("Close the task panel when clicking outside").checked,
    ).toBe(false);
    expect(screen.getByLabelText("Week starts on").value).toBe("monday");
  });

  test("changing one setting sends only that key", async () => {
    // The core keeps what it is not told about, so a screen never has to
    // hold — or risk overwriting — the rest of the config.
    bridge({ notebook_settings: settings, set_notebook_settings: null });
    render(SettingsView, { props: props() });

    await userEvent.click(
      await screen.findByLabelText("Show task counts in the sidebar"),
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_notebook_settings", {
        settings: { showListCounts: false },
      }),
    );
  });

  test("the screen shows what was stored, not what it sent", async () => {
    // The core normalises: a value it cannot use falls back, and the screen
    // must show the fallback rather than the rejected input.
    let stored = { ...settings };
    bridge({
      notebook_settings: () => stored,
      set_notebook_settings: () => {
        stored = { ...stored, dateDisplayFormat: "mm/dd/yyyy" };
        return null;
      },
    });
    render(SettingsView, { props: props() });

    const field = await screen.findByLabelText("Date format");
    await userEvent.selectOptions(field, "yyyy/mm/dd");

    await waitFor(() =>
      expect(screen.getByLabelText("Date format").value).toBe("mm/dd/yyyy"),
    );
  });

  test("a read-only notebook says so and edits nothing", async () => {
    bridge({ notebook_settings: settings });
    render(SettingsView, { props: props({ notebook: { ...notebook, readOnly: true } }) });

    expect(await screen.findByText(/newer version of Jott/)).toBeTruthy();
    expect(screen.getByLabelText("Date format").disabled).toBe(true);
    expect(screen.getByLabelText("Week starts on").disabled).toBe(true);
  });

  test("the quick note destination offers the notes folders", async () => {
    bridge({ notebook_settings: settings });
    render(SettingsView, { props: props() });

    const field = await screen.findByLabelText("Quick note goes to");
    const options = [...field.options].map((o) => o.value);
    expect(options).toEqual(["Inbox", "Clientes"]);
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

describe("the compact shell", () => {
  // Below 768px the top bar replaces the title bar (shell/TopBar.svelte). What
  // these guard is what that swap must NOT cost — a swap nobody here can click
  // on a phone, and which on a narrow desktop window took away the only way to
  // close the app (user report, 2026-08-18).
  const notebook = {
    path: "/n",
    name: "n",
    readOnly: false,
    features: {},
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
      notesInbox: "Inbox",
      dateDisplayFormat: "mm/dd/yyyy",
    },
  };

  const compactShell = (extra = {}) =>
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
      },
      screen_to_restore: "home",
      period_tasks: [],
      grouped_suggestions: [],
      notes_created_today: [],
      window_button_layout: "appmenu:minimize,maximize,close",
      ...extra,
    });

  /// jsdom has no matchMedia at all, and shell/compact.js answers `false`
  /// without one — which is the right fallback and useless for testing the
  /// compact shell. This is the narrow window.
  const narrow = () => {
    window.matchMedia = (query) => ({
      matches: true,
      media: query,
      addEventListener: noop,
      removeEventListener: noop,
      addListener: noop,
      removeListener: noop,
    });
  };

  beforeEach(narrow);

  test("a narrow desktop window keeps the buttons that close it", async () => {
    // The title bar is the ONLY handle a frameless window has, and below 768px
    // it is not rendered. Without these the app could be resized into a state
    // it cannot be closed from (user report, 2026-08-18).
    compactShell({ platform: "desktop" });

    render(App);

    expect(await screen.findByLabelText("close window")).toBeTruthy();
    expect(screen.getByLabelText("minimize")).toBeTruthy();
  });

  test("on Android there are none: the system owns the window", async () => {
    compactShell({ platform: "android" });

    render(App);

    // Waited for through something the compact bar always draws, so this is
    // not asserting on an empty screen.
    await screen.findByLabelText("open sidebar");
    expect(screen.queryByLabelText("close window")).toBeNull();
  });

  test("the tasks block keeps its own ⋮, with the twin that centres the strip", async () => {
    // Both places were tried on the device (user calls, 2026-08-18). The ⋮
    // moved up to the screen's black header and came straight back: one below
    // the top bar's own ⋮, two of them stacked in the corner read as one
    // control drawn twice. It belongs on the block's row — and the invisible
    // twin opposite it is what keeps the Inbox/Today/Week strip centred on the
    // screen rather than pushed off by the width of a menu button.
    compactShell({
      platform: "android",
      screen_to_restore: "tasks",
      list_tasks: [task("a1", "Comprar leite")],
    });

    const { container } = render(App);

    // Waited on the screen's own strip, so this is not asserting on a shell
    // that has not drawn the tasks screen yet.
    await screen.findByText("Today");
    expect(container.querySelector(".tasks-space__more")).toBeTruthy();
    expect(container.querySelector(".tasks-space__mirror")).toBeTruthy();
    // The screen's header holds the place's name and Home's +, never a block's
    // menu.
    expect(container.querySelector(".page-header--compact .page-menu__toggle")).toBeNull();
  });

  test("the task sheet has no ×: the page behind it and the handle already close it", async () => {
    // A sheet is dismissed two ways that cost no room — tapping the page it is
    // raised over, and pulling it down by its handle (BottomSheet.svelte) — so
    // an × in the toolbar only spends the corner the sun wants (user call,
    // 2026-08-18). What is left takes an end each.
    compactShell({
      platform: "android",
      screen_to_restore: "tasks",
      list_tasks: [task("a1", "Comprar leite")],
    });

    const { container } = render(App);

    await userEvent.click(await screen.findByText("Comprar leite"));

    const toolbar = await waitFor(() => {
      const el = container.querySelector(".inspector__toolbar");
      if (!el) throw new Error("no inspector");
      return el;
    });
    expect(within(toolbar).queryByLabelText("close")).toBeNull();
    expect(within(toolbar).queryByLabelText("collapse panel")).toBeNull();
    // The sun first, the gap, then the ⋮ — the two ends of the row.
    const order = [...toolbar.children].map((el) => el.className);
    expect(order[0]).toContain("inspector__myday");
    expect(order[1]).toContain("inspector__gap");
  });

  test("the desktop panel keeps the button that folds it away", async () => {
    // The other half of the same rule: a column has nowhere to be pulled down
    // to, so it still needs a control.
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      addEventListener: noop,
      removeEventListener: noop,
      addListener: noop,
      removeListener: noop,
    });
    compactShell({
      platform: "desktop",
      screen_to_restore: "tasks",
      list_tasks: [task("a1", "Comprar leite")],
    });

    render(App);

    await userEvent.click(await screen.findByText("Comprar leite"));

    expect(await screen.findByLabelText("collapse panel")).toBeTruthy();
  });

  test("the header carries the colour of the place on every screen", async () => {
    // A fixed space has no colour of its own and falls back to the app's
    // accent in CSS. A mark that comes and goes says less than one that is
    // always there to be read (user call, 2026-08-18).
    compactShell({ platform: "android" });

    const { container } = render(App);

    await screen.findByLabelText("open sidebar");
    await waitFor(() => {
      if (!container.querySelector(".page-header--compact .theme-dot"))
        throw new Error("no dot");
    });
  });

  test("the day the tasks screen is looking at moves into the header", async () => {
    // On the desktop it rides beside the Inbox/Today/Week strip; a phone has
    // no room there, and the wireframe puts it under the screen's name.
    compactShell({
      platform: "android",
      screen_to_restore: "tasks",
      period_tasks: [],
    });

    const { container } = render(App);

    await userEvent.click(await screen.findByText("Today"));

    await waitFor(() => {
      const date = container.querySelector(".page-header__date");
      if (!date?.textContent.includes("07/21")) throw new Error("not in the header");
    });
    expect(container.querySelector(".tasks-view__range")).toBeNull();
  });

  test("opening the drawer hides the toggle without taking its place", async () => {
    // Two open-sidebar buttons ended up side by side (user report). The fix is
    // `visibility`, not removal: a button that leaves the row lets everything
    // after it slide left as the drawer opens.
    compactShell({ platform: "android" });

    const { container } = render(App);

    await userEvent.click(await screen.findByLabelText("open sidebar"));

    const toggle = container.querySelector(".topbar__button");
    expect(toggle.classList.contains("topbar__button--hidden")).toBe(true);
    // Still in the row, still the same square.
    expect(container.querySelectorAll(".topbar__button").length).toBeGreaterThan(0);
  });
});
