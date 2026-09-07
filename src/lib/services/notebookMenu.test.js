import { describe, expect, it } from "vitest";
import { notebookRows } from "./notebookMenu.js";

const recent = [
  { path: "/home/g/Work", name: "Work", accentColor: "orange" },
  { path: "/home/g/Personal", name: "Personal", accentColor: "" },
];

describe("the footer's notebook menu", () => {
  it("ticks the open notebook, colours each row, and ends with the manage door", () => {
    const rows = notebookRows(recent, "/home/g/Work", {});
    expect(rows.map((r) => r.label)).toEqual(["Work", "Personal", "Manage notebooks…"]);
    expect(rows[0].checked).toBe(true);
    expect(rows[1].checked).toBe(false);
    expect(rows[0].swatch).toContain("orange");
    // No colour chosen reads as the app's own, never as no swatch.
    expect(rows[1].swatch).toBeTruthy();
    expect(rows[2].checked).toBeUndefined();
  });

  it("a row switches in place, or into a new window by the middle button", () => {
    const calls = [];
    const rows = notebookRows(recent, "/home/g/Work", { onSwitch: (p, w) => calls.push([p, w]) });
    rows[1].run();
    rows[1].run({ newTab: true });
    // The open one does nothing.
    rows[0].run();
    expect(calls).toEqual([
      ["/home/g/Personal", false],
      ["/home/g/Personal", true],
    ]);
  });

  it("two notebooks of one name are told apart by their folder", () => {
    const twins = [
      { path: "/home/g/Design/Work", name: "Work" },
      { path: "/home/g/Client/Work", name: "Work" },
      { path: "/home/g/Personal", name: "Personal" },
    ];
    const rows = notebookRows(twins, null, {});
    expect(rows.map((r) => r.context)).toEqual(["Design", "Client", undefined, undefined]);
  });

  it("the manage door runs its callback", () => {
    let opened = 0;
    notebookRows([], null, { onManage: () => opened++ }).at(-1).run();
    expect(opened).toBe(1);
  });
});
