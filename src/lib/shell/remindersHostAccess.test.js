import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bridge, callsTo, resetBridge, tauriInternals } from "../test/bridge.js";
import { makeRemindersHost } from "./remindersHost.js";

// A file of its own: the host listens on `document` for the life of the app,
// and a host left by another test would answer the same event.

let scheduled;
beforeEach(() => {
  resetBridge();
  scheduled = [];
  globalThis.__TAURI_INTERNALS__ = tauriInternals;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 8, 10, 0));
});
afterEach(() => {
  vi.useRealTimers();
  delete window.JottAndroid;
});

it("notifications allowed on the system screen are scheduled on the way back, and only a change resyncs", async () => {
  // The plugin's page answer stays "denied" once refused; the bridge says
  // what the system says.
  let access = { notifications: false, exact: true };
  window.JottAndroid = {
    scheduleReminders: (payload) => scheduled.push(JSON.parse(payload)) > 0,
    reminderAccess: () => JSON.stringify(access),
  };
  globalThis.Notification = { permission: "denied", requestPermission: async () => "denied" };
  bridge({
    reminders: [{ list: "jott.tasks/task-list.md", id: "soon", position: 0, text: "soon", at: "2026-09-08T10:30" }],
    reminder_scope: { root: "/sdcard/Jott", device: "phone1" },
  });
  const host = makeRemindersHost({
    open: () => true,
    enabled: () => true,
    mobile: () => true,
    summary: () => ({ on: false, time: "" }),
    openTask: vi.fn(),
    fail: vi.fn(),
  });
  await host.refresh();
  expect(scheduled).toEqual([]);

  document.dispatchEvent(new CustomEvent("android-reminder-access-changed"));
  await Promise.resolve();
  expect(callsTo("reminders")).toHaveLength(1);

  access = { notifications: true, exact: true };
  document.dispatchEvent(new CustomEvent("android-reminder-access-changed"));
  await vi.waitFor(() => expect(scheduled).toHaveLength(1));
  expect(scheduled[0].items[0].id).toBe("soon");
});
