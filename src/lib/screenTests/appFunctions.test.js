// Switching a part of the app off — what leaves the interface, and what stays on disk.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { bridge } from "../test/bridge.js";
import { resetScreens, task } from "../test/screens.js";

// The note editor's engine is stubbed by a textarea — `lib/test/screens.js`
// says why. `vi.mock` is hoisted per file, so it cannot live there.
vi.mock("../components/Editor.svelte", async () => await import("../components/EditorStub.svelte"));

const { default: App } = await import("../../App.svelte");

beforeEach(resetScreens);

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

  test("a hidden fixed space loses its row, and the function stays on", async () => {
    // Fixed spaces (2026-08-24): hiding the Tasks SPACE is not switching
    // tasks off — the Home keeps its day, only the sidebar shortcut (and the
    // fixed space's lists and Completed) leave.
    withFeatures({ tasksSpace: false });
    render(App);

    const sidebar = await waitFor(() => {
      const el = document.querySelector(".shell__sidebar");
      expect(el).not.toBeNull();
      return el;
    });
    await within(sidebar).findByText("Home");
    expect(within(sidebar).queryByText("Tasks")).toBeNull();
    expect(await screen.findByText("Today tasks")).toBeTruthy();
    await userEvent.click(screen.getByLabelText("menu"));
    expect(screen.queryByText("Completed")).toBeNull();
    expect(screen.getByText("Trash")).toBeTruthy();
  });

  test("hiding the Home lands the app on the first fixed screen standing", async () => {
    withFeatures({ homeSpace: false });
    render(App);

    const sidebar = await waitFor(() => {
      const el = document.querySelector(".shell__sidebar");
      expect(el).not.toBeNull();
      return el;
    });
    expect(within(sidebar).queryByText("Home")).toBeNull();
    // The restored screen was "home"; the landing is the Tasks screen.
    await waitFor(() => {
      expect(document.querySelector(".home")).toBeNull();
      expect(document.querySelector(".tasks-view__subs")).not.toBeNull();
    });
  });

  test("the master switch hides the three fixed rows at once", async () => {
    withFeatures({ fixedSpaces: false });
    render(App);

    const sidebar = await waitFor(() => {
      const el = document.querySelector(".shell__sidebar");
      expect(el).not.toBeNull();
      return el;
    });
    expect(within(sidebar).queryByText("Home")).toBeNull();
    expect(within(sidebar).queryByText("Tasks")).toBeNull();
    expect(within(sidebar).queryByText("Notes")).toBeNull();
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
