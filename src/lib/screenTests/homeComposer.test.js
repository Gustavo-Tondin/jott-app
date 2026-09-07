// The Home's composing bar on a compact screen — what closes it, and what
// must not (user calls, 2026-08-24). Once asked for, the bar STAYS through
// the keyboard coming and going; it is put away by its pull-down handle, or
// by creating a task with the keyboard already closed.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { bridge } from "../test/bridge.js";
import { resetScreens } from "../test/screens.js";

// The note editor's engine is stubbed by a textarea — `lib/test/screens.js`
// says why. `vi.mock` is hoisted per file, so it cannot live there.
vi.mock("../components/Editor.svelte", async () => await import("../components/EditorStub.svelte"));

// The + that opens the bar only exists on the compact shell, and jsdom has no
// width to narrow. The width question answers "narrow" for this whole file.
vi.mock("../shell/compact.js", async (original) => {
  const real = await original();
  return { ...real, watchCompact: (onChange) => (onChange(true), () => {}) };
});

const { default: App } = await import("../../App.svelte");

beforeEach(resetScreens);
afterEach(() => vi.useRealTimers());

describe("Home's composing bar, the keyboard, and the way out", () => {
  const aNotebook = () => {
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
        features: {},
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
      day_tasks: [],
      day_sort: null,
      grouped_suggestions: [],
      list_tasks: [],
      create_task: 0,
      ensure_task_id: "t1",
      pull_into_day: null,
    });
  };

  /// Opens the bar the way the thumb does: the + and its "New task" row (the
  /// + asks task-or-note again since 2026-09-07 — it had offered only a task).
  const openBar = async () => {
    const plus = await waitFor(() => {
      const el = document.querySelector(".home-fab");
      if (!el) throw new Error("no +");
      return el;
    });
    await userEvent.click(plus);
    await userEvent.click(await screen.findByText("New task"));
    return await waitFor(() => {
      const el = document.querySelector(".task-composer__input");
      if (!el) throw new Error("no bar");
      return el;
    });
  };

  const keyboardGoesAway = async () =>
    await fireEvent(document, new CustomEvent("android-keyboard-hidden"));

  test("empty and let go, the bar still stays: it lives until a task is made", async () => {
    // Replacing the 2026-08-21 rule — the keyboard going away no longer puts
    // the bar away, full or empty.
    aNotebook();
    render(App);
    const field = await openBar();
    field.focus();

    await keyboardGoesAway();

    // The field lets go of the caret — the keyboard is gone — but the bar
    // stays.
    await waitFor(() => {
      expect(document.activeElement).not.toBe(field);
    });
    expect(document.querySelector(".task-composer")).not.toBeNull();
  });

  test("with something written, the writing survives the keyboard too", async () => {
    aNotebook();
    render(App);
    const field = await openBar();
    field.focus();
    await fireEvent.input(field, { target: { value: "Comprar leite" } });

    await keyboardGoesAway();

    const kept = document.querySelector(".task-composer__input");
    expect(kept).not.toBeNull();
    expect(kept.value).toBe("Comprar leite");
  });

  test("a chip holding the focus is not 'done typing' — the menu it opened survives", async () => {
    aNotebook();
    render(App);
    await openBar();
    const chip = document.querySelector(".task-composer__list");
    chip.focus();

    await keyboardGoesAway();

    expect(document.querySelector(".task-composer")).not.toBeNull();
    expect(document.activeElement).toBe(chip);
  });

  test("creating with the keyboard up keeps the bar, ready for the next task", async () => {
    aNotebook();
    render(App);
    const field = await openBar();
    field.focus();
    await fireEvent.input(field, { target: { value: "Comprar leite" } });

    const add = document.querySelector(".task-composer button[type=submit]");
    add.focus(); // what the tap itself does, before the click is dispatched
    await fireEvent.click(add);

    await waitFor(() => {
      const kept = document.querySelector(".task-composer__input");
      expect(kept).not.toBeNull();
      expect(kept.value).toBe("");
    });
  });

  test("creating with the keyboard closed puts the bar away with the task", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    aNotebook();
    render(App);
    const field = await openBar();
    field.focus();
    await fireEvent.input(field, { target: { value: "Comprar leite" } });
    // The keyboard went away a while ago: the field let go past the grace
    // that covers a tap's own focus hop (TaskComposer.svelte).
    field.blur();
    vi.advanceTimersByTime(1000);

    await fireEvent.click(document.querySelector(".task-composer button[type=submit]"));

    await waitFor(() => {
      expect(document.querySelector(".task-composer")).toBeNull();
    });
  });

  test("the bar wears the panels' handle, and tapping it closes", async () => {
    aNotebook();
    render(App);
    await openBar();

    const handle = document.querySelector(".task-composer__handle");
    expect(handle).not.toBeNull();
    await fireEvent.click(handle);

    await waitFor(() => {
      expect(document.querySelector(".task-composer")).toBeNull();
    });
  });

  test("the permanent bars have no handle to find", async () => {
    // The handle belongs to the bar that can be put away; the tasks screens'
    // bar is part of the screen, and stays.
    aNotebook();
    render(App);
    const sidebar = await waitFor(() => {
      const el = document.querySelector(".shell__sidebar");
      if (!el) throw new Error("no sidebar");
      return el;
    });
    await userEvent.click(within(sidebar).getByText("Tasks"));
    await waitFor(() => {
      if (!document.querySelector(".task-composer")) throw new Error("no bar");
    });
    expect(document.querySelector(".task-composer__handle")).toBeNull();
  });
});
