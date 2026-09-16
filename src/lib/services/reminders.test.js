import { describe, expect, test } from "vitest";
import { S } from "./strings.js";
import {
  formatAt,
  joinAt,
  normalizeAt,
  notice,
  parseAt,
  presets,
  splitAt,
  toAt,
} from "./reminders.js";

const at = (list, id, when) => ({ list, id, position: 0, text: id, at: when, auto: false });

describe("the moment's shape", () => {
  test("round-trips the file's form and drops the bridge's seconds", () => {
    expect(toAt(parseAt("2026-07-25T09:05"))).toBe("2026-07-25T09:05");
    expect(normalizeAt("2026-07-25T09:05:00")).toBe("2026-07-25T09:05");
    expect(normalizeAt("")).toBe("");
    expect(splitAt("2026-07-25T09:05")).toEqual({ date: "2026-07-25", time: "09:05" });
    expect(joinAt("2026-07-25", "09:05")).toBe("2026-07-25T09:05");
    expect(joinAt("2026-07-25", "")).toBe("");
  });

  test("reads like the notebook's dates, then the time", () => {
    expect(formatAt("2026-07-25T09:05", "dd/mm/yyyy")).toBe("25/07/2026 09:05");
    expect(formatAt("")).toBe("");
  });
});

describe("presets", () => {
  const now = new Date(2026, 6, 22, 10, 20); // a Wednesday

  test("later today is three hours on, on the hour", () => {
    const list = presets({ now, time: "09:00" });
    expect(list.find((p) => p.id === "laterToday").at).toBe("2026-07-22T13:00");
  });

  test("later today is not offered when it would be tomorrow", () => {
    const late = new Date(2026, 6, 22, 22, 30);
    expect(presets({ now: late }).map((p) => p.id)).not.toContain("laterToday");
  });

  test("tomorrow and next week land on the reminder time", () => {
    const list = presets({ now, time: "07:30" });
    expect(list.find((p) => p.id === "tomorrow").at).toBe("2026-07-23T07:30");
    expect(list.find((p) => p.id === "nextWeek").at).toBe("2026-07-27T07:30");
  });

  test("next week from a Monday is the Monday after", () => {
    const monday = new Date(2026, 6, 27, 9, 0);
    expect(presets({ now: monday }).find((p) => p.id === "nextWeek").at).toBe("2026-08-03T09:00");
  });

  test("on the due date only for a dated task still ahead", () => {
    expect(presets({ now, due: "2026-08-01" }).find((p) => p.id === "onDue").at).toBe(
      "2026-08-01T09:00",
    );
    expect(presets({ now, due: "" }).map((p) => p.id)).not.toContain("onDue");
    expect(presets({ now, due: "2026-07-01" }).map((p) => p.id)).not.toContain("onDue");
  });
});

describe("presets from the due date", () => {
  const now = new Date(2026, 6, 22, 10, 20);

  test("the day before is offered only while it is ahead", () => {
    const eve = presets({ now, due: "2026-08-01", time: "18:00" }).find((p) => p.id === "dayBefore");
    expect(eve.at).toBe("2026-07-31T18:00");
    // Due tomorrow at 09:00: the eve is today at 09:00, already gone.
    expect(presets({ now, due: "2026-07-23" }).map((p) => p.id)).not.toContain("dayBefore");
  });

  test("each preset says its group", () => {
    const groups = Object.fromEntries(presets({ now, due: "2026-08-01" }).map((p) => [p.id, p.group]));
    expect(groups).toEqual({
      laterToday: "now",
      tomorrow: "now",
      nextWeek: "now",
      dayBefore: "due",
      onDue: "due",
    });
  });
});

describe("the notice", () => {
  test("leads with the task and says where it lives", () => {
    const reminder = { list: "Casa/task-list.md", text: "Pagar aluguel", place: "Casa", at: "2026-07-24T18:00" };
    expect(notice(reminder, S)).toEqual({ title: "Pagar aluguel", body: "Casa" });
    expect(notice({ ...reminder, due: "2026-07-25" }, S, "dd/mm/yyyy").body).toBe("Casa · due 25/07/2026");
  });
});
