import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bridge,
  callsTo,
  commandsCalled,
  fails,
  listen,
  resetBridge,
  tauriInternals,
} from "../test/bridge.js";
import { makeRemindersHost } from "./remindersHost.js";

const at = (id, when) => ({ list: "jott.tasks/task-list.md", id, position: 0, text: id, at: when });

function host({ open = true, enabled = true, mobile = false, summary = null } = {}) {
  const calls = { openTask: vi.fn(), fail: vi.fn() };
  const flags = { open, enabled, mobile, summary };
  const h = makeRemindersHost({
    open: () => flags.open,
    enabled: () => flags.enabled,
    mobile: () => flags.mobile,
    summary: () => flags.summary ?? { on: false, time: "" },
    ...calls,
  });
  return { h, flags, calls };
}

let scheduled;
beforeEach(() => {
  resetBridge();
  scheduled = [];
  window.JottAndroid = { scheduleReminders: (payload) => scheduled.push(JSON.parse(payload)) > 0 };
  // The notification plugin's own JS speaks to `__TAURI_INTERNALS__` and reads
  // `Notification.permission` first (services/androidReminders.test.js).
  globalThis.__TAURI_INTERNALS__ = tauriInternals;
  globalThis.Notification = { permission: "default" };
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 8, 10, 0));
});
afterEach(() => {
  vi.useRealTimers();
  delete window.JottAndroid;
  delete window.__jottOpenReminder;
});

describe("the reminders host", () => {
  it("on desktop it only nudges the process's ringer, with the Remind switch", async () => {
    const { h, flags } = host();
    bridge({ nudge_reminders: null });
    await h.refresh();
    flags.enabled = false;
    await h.refresh();
    expect(callsTo("nudge_reminders")).toEqual([{ reminders: true }, { reminders: false }]);
    // The list, the marks and the bell are the process's now.
    expect(commandsCalled().filter((c) => c !== "nudge_reminders")).toEqual([]);
  });

  it("with no notebook it asks nothing", async () => {
    const { h } = host({ open: false });
    bridge({ nudge_reminders: null });
    await h.refresh();
    expect(commandsCalled()).toEqual([]);
  });

  it("a nudge that fails is the shell's error", async () => {
    const { h, calls } = host();
    bridge({ nudge_reminders: fails("no notebook") });
    await h.refresh();
    expect(calls.fail).toHaveBeenCalledTimes(1);
  });

  it("what the process could not show is said once, naming the tasks", () => {
    const { calls } = host();
    const [[, handler]] = listen.mock.calls.filter(([n]) => n === "reminder://unshown");
    handler({ payload: ["Ligar pro dentista", "Aluguel"] });
    expect(calls.fail).toHaveBeenCalledTimes(1);
    expect(calls.fail.mock.calls[0][0]).toContain("Ligar pro dentista");
    expect(calls.fail.mock.calls[0][0]).toContain("Aluguel");
    handler({ payload: [] });
    expect(calls.fail).toHaveBeenCalledTimes(1);
  });

  it("on a phone the list is handed to the alarm service instead of a timer", async () => {
    const { h, calls } = host({ mobile: true });
    bridge({
      reminders: [at("soon", "2026-09-08T10:30")],
      "plugin:notification|is_permission_granted": true,
      reminder_scope: { root: "/sdcard/Jott", device: "phone1" },
    });
    await h.refresh();
    expect(calls.fail).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].items[0].root).toBe("/sdcard/Jott");
    expect(callsTo("nudge_reminders")).toEqual([]);
  });

  it("an alarm that lands tomorrow carries tomorrow's tasks", async () => {
    // 10:00 is past 08:00: the phone's summary rings tomorrow, so it is
    // tomorrow's tasks it asks for — not today's, which it used to list.
    const { h } = host({ mobile: true, summary: { on: true, time: "08:00" } });
    bridge({
      reminders: [],
      day_tasks: [{ task: { text: "Amanhã", done: false } }],
      "plugin:notification|is_permission_granted": true,
      reminder_scope: { root: "/sdcard/Jott", device: "phone1" },
    });
    await h.refresh();
    expect(callsTo("day_tasks")).toEqual([{ day: "2026-09-09" }]);
    const summary = scheduled[0].items.at(-1);
    expect(summary.at).toEqual(new Date(2026, 8, 9, 8, 0).getTime());
    expect(summary.body).toBe("• Amanhã");
    // Counted the day before: what it reads is the plan.
    expect(summary.title).toBe("You have 1 task planned for today");
  });

  it("the phone's summary names the first reminder of its day, and a reminder leads with its task", async () => {
    const { h } = host({ mobile: true, summary: { on: true, time: "08:00" } });
    bridge({
      reminders: [
        { ...at("hoje", "2026-09-08T18:00"), text: "Hoje", place: "Casa", due: "2026-09-10" },
        { ...at("amanha", "2026-09-09T12:30"), text: "Amanhã", place: "Casa" },
      ],
      day_tasks: [{ task: { text: "Amanhã", done: false } }],
      "plugin:notification|is_permission_granted": true,
      reminder_scope: { root: "/sdcard/Jott", device: "phone1" },
    });
    await h.refresh();
    const { items } = scheduled[0];
    expect(items.at(-1).body).toBe("• Amanhã\nFirst reminder at 12:30");
    expect(items[0].title).toBe("Hoje");
    expect(items[0].body).toBe("Casa · due 09/10/2026");
  });

  it("a tapped Android notification acknowledges the reminder it came from", async () => {
    const { h, calls } = host({ mobile: true });
    bridge({
      reminders: [at("soon", "2026-09-08T10:30")],
      ack_reminder: null,
      reminder_scope: { root: "/sdcard/Jott", device: "phone1" },
      "plugin:notification|is_permission_granted": true,
    });
    await h.refresh();
    // What MainActivity calls once the page listens.
    window.__jottOpenReminder({ list: "jott.tasks/task-list.md", id: "soon", at: "2026-09-08T10:30" });
    await vi.advanceTimersByTimeAsync(0);

    expect(callsTo("ack_reminder")).toEqual([
      { list: "jott.tasks/task-list.md", id: "soon", at: "2026-09-08T10:30" },
    ]);
    expect(calls.openTask).toHaveBeenCalledWith("jott.tasks/task-list.md", "soon");
  });

  it("a clicked notification opens its task", () => {
    const { calls } = host();
    const [[name, handler]] = listen.mock.calls.filter(([n]) => n === "reminder://open");
    expect(name).toBe("reminder://open");
    handler({ payload: { list: "jott.tasks/task-list.md", id: "" } });
    expect(calls.openTask).toHaveBeenCalledWith("jott.tasks/task-list.md", null);
    handler({ payload: {} });
    expect(calls.openTask).toHaveBeenCalledTimes(1);
  });
});
