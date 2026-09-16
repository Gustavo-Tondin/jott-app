import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bridge,
  callsTo,
  commandsCalled,
  fails,
  listen,
  resetBridge,
  sendPluginEvent,
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

beforeEach(() => {
  resetBridge();
  // The notification plugin's own JS speaks to `__TAURI_INTERNALS__` and reads
  // `Notification.permission` first (services/androidReminders.test.js).
  globalThis.__TAURI_INTERNALS__ = tauriInternals;
  globalThis.Notification = { permission: "default" };
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 8, 10, 0));
});
afterEach(() => vi.useRealTimers());

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
      "plugin:notification|get_pending": [],
      "plugin:notification|batch": [1],
    });
    await h.refresh();
    expect(calls.fail).not.toHaveBeenCalled();
    expect(callsTo("plugin:notification|batch")).toHaveLength(1);
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
      "plugin:notification|get_pending": [],
      "plugin:notification|batch": [1],
    });
    await h.refresh();
    expect(callsTo("day_tasks")).toEqual([{ day: "2026-09-09" }]);
    const [batch] = callsTo("plugin:notification|batch");
    const summary = batch.notifications.at(-1);
    expect(summary.schedule.at.date).toEqual(new Date(2026, 8, 9, 8, 0));
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
      "plugin:notification|get_pending": [],
      "plugin:notification|batch": [1],
    });
    await h.refresh();
    const [batch] = callsTo("plugin:notification|batch");
    expect(batch.notifications.at(-1).body).toBe("• Amanhã\nFirst reminder at 12:30");
    expect(batch.notifications[0].title).toBe("Hoje");
    expect(batch.notifications[0].body).toBe("Casa · due 09/10/2026");
  });

  it("a tapped Android notification acknowledges the reminder it came from", async () => {
    const { h, calls } = host({ mobile: true });
    bridge({
      reminders: [at("soon", "2026-09-08T10:30")],
      ack_reminder: null,
      "plugin:notification|is_permission_granted": true,
      "plugin:notification|get_pending": [],
      "plugin:notification|batch": [1],
      "plugin:notification|register_action_types": null,
      "plugin:notification|registerActionTypes": null,
    });
    await h.refresh();
    // The plugin's own door, opened by its real JS: the tap is the only
    // dismissal Android reports, so the path is driven for real.
    await vi.advanceTimersByTimeAsync(0);
    await sendPluginEvent("notification", "actionPerformed", {
      extra: { list: "jott.tasks/task-list.md", id: "soon", at: "2026-09-08T10:30" },
    });
    // The plugin hands the tap to a listener that does not wait on ours.
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
