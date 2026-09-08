import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bridge, callsTo, commandsCalled, invoke, listen, resetBridge } from "../test/bridge.js";
import { makeRemindersHost } from "./remindersHost.js";

const at = (id, when) => ({ list: "jott.tasks/task-list.md", id, position: 0, text: id, at: when, auto: false });

function host({ open = true, enabled = true, mobile = false } = {}) {
  const calls = { openTask: vi.fn(), fail: vi.fn() };
  const flags = { open, enabled, mobile };
  const h = makeRemindersHost({
    open: () => flags.open,
    enabled: () => flags.enabled,
    mobile: () => flags.mobile,
    ...calls,
  });
  return { h, flags, calls };
}

beforeEach(() => {
  resetBridge();
  // The notification plugin's own JS speaks to `__TAURI_INTERNALS__` and reads
  // `Notification.permission` first (services/androidReminders.test.js).
  globalThis.__TAURI_INTERNALS__ = { invoke };
  globalThis.Notification = { permission: "default" };
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 8, 10, 0));
});
afterEach(() => vi.useRealTimers());

describe("the reminders host", () => {
  it("a machine that never rang this notebook starts from now, so nothing old rings", async () => {
    const { h } = host();
    bridge({
      reminders: [at("old", "2026-09-08T09:00"), at("soon", "2026-09-08T10:30")],
      reminded_until: null,
      remember_reminded_until: null,
      notify_reminder: null,
    });
    await h.refresh();
    expect(callsTo("remember_reminded_until")).toEqual([{ until: "2026-09-08T10:00" }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(callsTo("notify_reminder")).toEqual([]);

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(callsTo("notify_reminder")).toHaveLength(1);
    expect(callsTo("notify_reminder")[0].target).toEqual({ list: "jott.tasks/task-list.md", id: "soon" });
    expect(callsTo("remember_reminded_until").at(-1)).toEqual({ until: "2026-09-08T10:30" });
  });

  it("asks the machine's mark once, and re-arms the same loop on every refresh", async () => {
    const { h } = host();
    bridge({ reminders: [], reminded_until: "2026-09-08T09:00", remember_reminded_until: null });
    await h.refresh();
    await h.refresh();
    expect(callsTo("reminded_until")).toHaveLength(1);
    expect(callsTo("remember_reminded_until")).toEqual([]);
    expect(commandsCalled().filter((c) => c === "reminders")).toHaveLength(2);
  });

  it("switched off, or with no notebook, it asks nothing and stops the loop", async () => {
    const { h, flags } = host();
    bridge({ reminders: [at("soon", "2026-09-08T10:30")], reminded_until: "2026-09-08T09:00", notify_reminder: null });
    await h.refresh();
    flags.enabled = false;
    await h.refresh();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(callsTo("notify_reminder")).toEqual([]);
    expect(commandsCalled().filter((c) => c === "reminders")).toHaveLength(1);
  });

  it("on a phone the list is handed to the alarm service instead of a timer", async () => {
    const { h, calls } = host({ mobile: true });
    bridge({
      reminders: [at("soon", "2026-09-08T10:30")],
      reminded_until: "2026-09-08T09:00",
      "plugin:notification|is_permission_granted": true,
      "plugin:notification|get_pending": [],
      "plugin:notification|batch": [1],
    });
    await h.refresh();
    expect(calls.fail).not.toHaveBeenCalled();
    expect(callsTo("plugin:notification|batch")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(callsTo("notify_reminder")).toEqual([]);
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
