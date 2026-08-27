import { describe, expect, test } from "vitest";
import { ghostLabel, monthStats, monthsOf, rowsOf, yearRange } from "./timeline.js";

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
