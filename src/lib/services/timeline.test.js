import { describe, expect, test } from "vitest";
import { dayGroups, ghostLabel, monthStats, monthsOf, rowsOf, yearRange } from "./timeline.js";

const task = (title, created, extra = {}) => ({
  kind: "task",
  id: title,
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

describe("services/timeline", () => {
  test("a year is asked for by its two bounds", () => {
    expect(yearRange(2026)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  test("months come newest first, each with its three lines, and a task ticked later is in two of them", () => {
    const months = monthsOf([
      task("velha", "2026-07-03", { completed: "2026-08-02" }),
      task("nova", "2026-08-10"),
      note("Ideia", "2026-08-01"),
      note("Antiga", "2026-05-20"),
    ]);
    expect(months.map((m) => m.key)).toEqual(["2026-08", "2026-07", "2026-05"]);
    const [aug, jul, may] = months;
    expect(aug.created.map((t) => t.title)).toEqual(["nova"]);
    expect(aug.completed.map((t) => t.title)).toEqual(["velha"]);
    expect(aug.notes.map((n) => n.title)).toEqual(["Ideia"]);
    expect(jul.created.map((t) => t.title)).toEqual(["velha"]);
    expect(jul.completed).toEqual([]);
    expect(may.notes.map((n) => n.title)).toEqual(["Antiga"]);
    expect(aug.year).toBe(2026);
    expect(aug.month).toBe(8);
  });

  test("within a line the order is by title, case aside — never by time", () => {
    const [aug] = monthsOf([task("b", "2026-08-03"), task("A", "2026-08-30"), task("c", "2026-08-01")]);
    expect(aug.created.map((t) => t.title)).toEqual(["A", "b", "c"]);
  });

  test("a nameless ghost folds into one row per space, after the living", () => {
    const rows = rowsOf([
      task("Buy milk", "2026-08-01"),
      task("secret", "2026-08-02", { deleted: "2026-08-05" }),
      task("other", "2026-08-02", { deleted: "2026-08-05" }),
      task("design", "2026-08-02", { deleted: "2026-08-05", space: "Design/Tasks" }),
    ]);
    expect(rows.map((r) => r.title ?? `${r.count}×${r.space}`)).toEqual([
      "Buy milk",
      "2×jott.tasks",
      "1×Design/Tasks",
    ]);
    expect(rows[1].ghost).toBe(true);
    expect(ghostLabel(rows[1])).toBe("2 deleted tasks");
    expect(ghostLabel({ ghost: true, kind: "note", count: 1 })).toBe("1 deleted note");
  });

  // Every occurrence of a repeating task is its own task with its own id
  // (core/recurrence.rs), so a daily chore writes one line per day into a
  // single month and the screen was a wall of the same sentence.
  test("a repeating task is one row with a count, not thirty rows", () => {
    const rows = rowsOf([
      task("Buy milk", "2026-08-01"),
      task("Take out the bins", "2026-08-03", { id: "a" }),
      task("Take out the bins", "2026-08-06", { id: "b" }),
      task("Take out the bins", "2026-08-09", { id: "c" }),
      task("Pay rent", "2026-08-01"),
    ]);
    expect(rows.map((r) => [r.title, r.count])).toEqual([
      ["Buy milk", 1],
      ["Take out the bins", 3],
      ["Pay rent", 1],
    ]);
  });

  // The row has to open something that is still there, and the newest
  // occurrence is the one that is.
  test("the folded row IS the newest occurrence", () => {
    const [row] = rowsOf([
      task("Water the plants", "2026-08-03", { id: "a" }),
      task("Water the plants", "2026-08-10", { id: "c" }),
      task("Water the plants", "2026-08-06", { id: "b" }),
    ]);
    expect(row.id).toBe("c");
    expect(row.count).toBe(3);
  });

  test("on the completed line the newest is the one ticked last", () => {
    const [row] = rowsOf([
      task("Standup", "2026-08-01", { id: "a", completed: "2026-08-02" }),
      task("Standup", "2026-08-08", { id: "b", completed: "2026-08-09" }),
    ]);
    expect(row.id).toBe("b");
  });

  // Two spaces can hold the same chore, and they are two chores.
  test("the same title in two spaces stays two rows", () => {
    const rows = rowsOf([
      task("Standup", "2026-08-01", { id: "a" }),
      task("Standup", "2026-08-02", { id: "b", space: "Work/Tasks" }),
    ]);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.count === 1)).toBe(true);
  });

  // A note is a FILE: two files with one title are two documents, and a count
  // with nothing to open would put one of them out of reach.
  test("notes are never folded by title", () => {
    const rows = rowsOf([
      note("Ideas", "2026-08-01"),
      { ...note("Ideas", "2026-08-02"), path: "jott.notes/Old/Ideas.md" },
    ]);
    expect(rows.length).toBe(2);
  });

  // With the titles shown, a thrown-away occurrence keeps its own struck row
  // rather than adding to a live count.
  test("a deleted occurrence is not counted into a live row", () => {
    const rows = rowsOf(
      [
        task("Standup", "2026-08-01", { id: "a" }),
        task("Standup", "2026-08-02", { id: "b", deleted: "2026-08-03" }),
      ],
      { ghostTitles: true },
    );
    expect(rows.length).toBe(2);
    expect(rows[0].count).toBe(1);
    expect(rows[1].deleted).toBe("2026-08-03");
  });

  test("with ghost titles on, a ghost keeps its row and its birth name", () => {
    const rows = rowsOf(
      [task("Buy milk", "2026-08-01"), task("secret", "2026-08-02", { deleted: "2026-08-05" })],
      { ghostTitles: true },
    );
    expect(rows.map((r) => r.title)).toEqual(["Buy milk", "secret"]);
    expect(rows.every((r) => !r.ghost)).toBe(true);
  });

  test("the header counts this month only", () => {
    const stats = monthStats(
      [
        note("Ideia", "2026-08-01"),
        note("Antiga", "2026-07-01"),
        task("nova", "2026-08-10"),
        task("velha", "2026-07-03", { completed: "2026-08-02" }),
        task("fechada em julho", "2026-06-03", { completed: "2026-07-02" }),
      ],
      "2026-08-27",
    );
    expect(stats).toEqual({ notes: 1, created: 1, completed: 1 });
  });
});

describe("dayGroups", () => {
  // The Home's recap of a day gone by (2026-09-04): the window the core
  // answers holds everything born OR ticked that day, and each item lands
  // in the line it earned that day — a task born earlier and ticked on the
  // day is completed only.
  test("one day's three groups, by what happened on it", () => {
    const items = [
      { kind: "task", id: "a", path: "l.md", created: "2026-09-01", title: "Born and done", completed: "2026-09-01" },
      { kind: "task", id: "b", path: "l.md", created: "2026-08-20", title: "Old, done today", completed: "2026-09-01" },
      { kind: "task", id: "c", path: "l.md", created: "2026-09-01", title: "Born, still open" },
      { kind: "note", path: "n/x.md", created: "2026-09-01", title: "Written" },
      { kind: "note", path: "n/y.md", created: "2026-08-31", title: "Yesterday's" },
    ];
    const groups = dayGroups(items, "2026-09-01");
    expect(groups.created.map((i) => i.title)).toEqual(["Born and done", "Born, still open"]);
    expect(groups.completed.map((i) => i.title)).toEqual(["Born and done", "Old, done today"]);
    expect(groups.notes.map((i) => i.title)).toEqual(["Written"]);
    expect(dayGroups([], "2026-09-01")).toEqual({ created: [], completed: [], notes: [] });
  });
});
