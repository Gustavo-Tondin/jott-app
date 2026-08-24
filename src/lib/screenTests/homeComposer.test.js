// The Home's composing bar on a compact screen, and the Android keyboard
// going away — what closes the bar, and what must not (user report on device,
// 2026-08-24: a tap on a chip killed the menu it opened, and dismissing the
// keys mid-thought deleted the thought).
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { fireEvent, render, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
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

describe("Home's composing bar and the Android keyboard", () => {
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
      period_tasks: [],
      grouped_suggestions: [],
      list_tasks: [],
    });
  };

  /// Opens the bar the way the thumb does: the +, then "Task".
  const openBar = async () => {
    const toggle = await waitFor(() => {
      const el = document.querySelector(".capture-fab__toggle");
      if (!el) throw new Error("no +");
      return el;
    });
    await userEvent.click(toggle);
    await userEvent.click(document.querySelector(".capture-fab__choice"));
    return await waitFor(() => {
      const el = document.querySelector(".task-composer__input");
      if (!el) throw new Error("no bar");
      return el;
    });
  };

  const keyboardGoesAway = async () =>
    await fireEvent(document, new CustomEvent("android-keyboard-hidden"));

  test("empty and let go, the bar closes with the keyboard", async () => {
    aNotebook();
    render(App);
    const field = await openBar();
    field.focus();

    await keyboardGoesAway();

    await waitFor(() => {
      expect(document.querySelector(".task-composer")).toBeNull();
    });
  });

  test("with something written, the bar (and the writing) survive the keyboard", async () => {
    aNotebook();
    render(App);
    const field = await openBar();
    field.focus();
    await fireEvent.input(field, { target: { value: "Comprar leite" } });

    await keyboardGoesAway();

    // The field lets go of the caret — the keyboard is gone — but the bar
    // stays, holding the half-written task.
    await waitFor(() => {
      expect(document.activeElement).not.toBe(field);
    });
    const kept = document.querySelector(".task-composer__input");
    expect(kept).not.toBeNull();
    expect(kept.value).toBe("Comprar leite");
  });

  test("a chip holding the focus is not 'done typing' — the bar stays put", async () => {
    // Tapping the list chip moves focus off the field, which is what dismisses
    // the IME — the keyboard stepping aside for the menu is not the user
    // putting the bar away.
    aNotebook();
    render(App);
    await openBar();
    const chip = document.querySelector(".task-composer__list");
    chip.focus();

    await keyboardGoesAway();

    expect(document.querySelector(".task-composer")).not.toBeNull();
    expect(document.activeElement).toBe(chip);
  });
});
