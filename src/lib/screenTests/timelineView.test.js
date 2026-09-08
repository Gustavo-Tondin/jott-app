// The Timeline screen.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { bridge, invoke, callsTo } from "../test/bridge.js";
import { answerConfirm, noop, resetScreens } from "../test/screens.js";
import TimelineView from "../screens/TimelineView.svelte";

beforeEach(resetScreens);

const TODAY = "2026-08-27";

const task = (title, created, extra = {}) => ({
  kind: "task",
  id: title.replace(/\s/g, ""),
  path: "jott.tasks/task-list.md",
  space: "jott.tasks",
  created,
  title,
  deleted: null,
  completed: null,
  ...extra,
});
const note = (title, created, extra = {}) => ({
  kind: "note",
  id: null,
  path: `jott.notes/${title}.md`,
  space: "jott.notes",
  created,
  title,
  deleted: null,
  completed: null,
  ...extra,
});

const ITEMS = [
  task("Buy milk", "2026-08-02", { completed: "2026-08-10", path: "jott.tasks/completed.md" }),
  task("Call the accountant", "2026-08-12"),
  task("secret", "2026-08-03", { deleted: "2026-08-20" }),
  task("other secret", "2026-08-04", { deleted: "2026-08-21" }),
  task("design", "2026-08-04", { deleted: "2026-08-21", space: "Design/Tasks" }),
  note("Kickoff", "2026-08-05"),
  task("Rust chapter 4", "2026-07-03"),
];

const mount = (props = {}) =>
  render(TimelineView, {
    props: {
      readOnly: false,
      onChanged: noop,
      onError: noop,
      reloadKey: 0,
      today: TODAY,
      colors: { "jott.tasks": "blue", "Design/Tasks": "orange" },
      onOpenTask: vi.fn(),
      onOpenNote: vi.fn(),
      ...props,
    },
  });

describe("TimelineView", () => {
  test("reads this year, draws months newest first with three lines each, and the header counts the month", async () => {
    bridge({ timeline_years: [2026, 2025], timeline: ITEMS });
    mount();

    expect(await screen.findByText("August")).toBeTruthy();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("timeline", { from: "2026-01-01", to: "2026-12-31" }),
    );
    // Only the year on screen — the previous one waits for the scroll.
    expect(callsTo("timeline")).toHaveLength(1);

    const months = screen.getAllByRole("heading", { level: 3 });
    expect(months.map((h) => h.textContent.replace(/\s+/g, " ").trim())).toEqual([
      "August 2026",
      "July 2026",
    ]);
    // August: 5 tasks born (one ticked, three deleted), 1 ticked, 1 note.
    expect(screen.getByText("5 Tasks created")).toBeTruthy();
    expect(screen.getByText("1 Task completed")).toBeTruthy();
    expect(screen.getByText("1 Note created")).toBeTruthy();
    // July: 1 born, nothing else — the empty lines are there, disabled.
    expect(screen.getByText("1 Task created")).toBeTruthy();
    expect(screen.getByText("0 Tasks completed").closest("button").disabled).toBe(true);

    // The header's three numbers: notes, tasks created, tasks completed.
    const stats = screen.getByRole("list", { name: "This month" });
    expect(
      within(stats)
        .getAllByRole("listitem")
        .map((li) => li.textContent.replace(/\s+/g, " ").trim()),
    ).toEqual(["1 Notes This month", "5 Tasks This month", "1 Completed This month"]);
  });

  // A repeating task writes one item per occurrence (core/recurrence.rs), and
  // a daily chore filled the month with the same sentence.
  test("a repeating task is one row carrying how many times it happened", async () => {
    const bins = (day, id) =>
      task("Take out the bins", `2026-08-${day}`, { id, path: "jott.tasks/task-list.md" });
    bridge({
      timeline_years: [2026],
      timeline: [task("Buy milk", "2026-08-02"), bins("03", "a"), bins("06", "b"), bins("09", "c")],
    });
    mount();

    await screen.findByText("4 Tasks created");
    const rows = within(document.getElementById("2026-08-created")).getAllByRole("listitem");
    expect(rows.map((li) => li.textContent.replace(/\s+/g, " ").trim())).toEqual([
      "Buy milk",
      "Take out the bins \u00d73",
    ]);
    // The line's own count is untouched: the header says how much happened,
    // the rows say what.
    expect(screen.getByText("4 Tasks created")).toBeTruthy();
  });

  test("the folded row opens the newest occurrence", async () => {
    const onOpenTask = vi.fn();
    const bins = (day, id) => task("Take out the bins", `2026-08-${day}`, { id });
    bridge({
      timeline_years: [2026],
      timeline: [bins("03", "a"), bins("09", "newest"), bins("06", "b")],
    });
    mount({ onOpenTask });

    await userEvent.click(await screen.findByRole("button", { name: "Take out the bins" }));
    expect(onOpenTask).toHaveBeenCalledWith("jott.tasks/task-list.md", "newest");
  });

  test("the current month starts open, an older one folded; a nameless ghost is one row per space", async () => {
    bridge({ timeline_years: [2026], timeline: ITEMS });
    mount();

    const created = await screen.findByText("5 Tasks created");
    expect(created.closest("button").getAttribute("aria-expanded")).toBe("true");
    // The living by title, then the ghosts folded by space — no name.
    const rows = within(document.getElementById("2026-08-created")).getAllByRole("listitem");
    expect(rows.map((li) => li.textContent.trim())).toEqual([
      "Buy milk",
      "Call the accountant",
      "2 deleted tasks",
      "1 deleted task",
    ]);
    expect(screen.queryByText("secret")).toBeNull();

    // July is folded until clicked.
    const july = screen.getByText("1 Task created").closest("button");
    expect(july.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(july);
    expect(july.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Rust chapter 4")).toBeTruthy();
  });

  test("with ghost titles on, a ghost keeps its name, struck through and not clickable", async () => {
    bridge({ timeline_years: [2026], timeline: ITEMS });
    mount({ ghostTasks: true, ghostNotes: true });

    const ghost = await screen.findByText("secret");
    expect(ghost.disabled).toBe(true);
    expect(screen.queryByText(/deleted tasks/)).toBeNull();
  });

  test("a living task opens by list and id, a note by path and space", async () => {
    bridge({ timeline_years: [2026], timeline: ITEMS });
    const onOpenTask = vi.fn();
    const onOpenNote = vi.fn();
    mount({ onOpenTask, onOpenNote });

    await userEvent.click(await screen.findByText("Call the accountant"));
    expect(onOpenTask).toHaveBeenCalledWith("jott.tasks/task-list.md", "Calltheaccountant");
    await userEvent.click(screen.getByText("Kickoff"));
    // The path INSIDE the space — the shell joins the two; handing it the
    // root-relative address doubled the space (user report, 2026-08-27).
    expect(onOpenNote).toHaveBeenCalledWith("Kickoff.md", "jott.notes");
  });

  test("remove from timeline asks, then forgets the item through the bridge", async () => {
    bridge({ timeline_years: [2026], timeline: ITEMS, forget_from_timeline: 1 });
    mount();

    await screen.findByText("Kickoff");
    const row = screen.getByText("Kickoff").closest("li");
    await userEvent.click(within(row).getByLabelText("timeline item options"));
    await userEvent.click(screen.getByText("Remove from timeline"));
    await answerConfirm(true);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("forget_from_timeline", {
        target: { kind: "note", key: "jott.notes/Kickoff.md" },
      }),
    );
  });

  test("a year pill reads its year on the way and marks itself active", async () => {
    bridge({
      timeline_years: [2026, 2025],
      timeline: (args) => (args.from === "2025-01-01" ? [note("Old", "2025-03-01")] : ITEMS),
    });
    mount();

    await screen.findByText("August");
    expect(screen.getByRole("button", { name: "Go to 2026" }).getAttribute("aria-current")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: "Go to 2025" }));
    expect(await screen.findByText("March")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go to 2025" }).getAttribute("aria-current")).toBe("true");
  });

  test("an empty log says so", async () => {
    bridge({ timeline_years: [], timeline: [] });
    mount();
    expect(await screen.findByText("Nothing here yet.")).toBeTruthy();
  });
});
