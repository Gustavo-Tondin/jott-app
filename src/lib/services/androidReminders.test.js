import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bridge, callsTo, invoke, resetBridge } from "../test/bridge.js";
import { onAndroidReminderTap, reminderId, syncAndroidReminders } from "./androidReminders.js";
import { S } from "./strings.js";

// The plugin's own JS does not import `@tauri-apps/api/core` — it calls
// `window.__TAURI_INTERNALS__.invoke` itself — so the stand-in for the bridge
// is put there too; it is only asked for the permission.
// What schedules is `window.JottAndroid.scheduleReminders` (MainActivity).
let scheduled;
beforeEach(() => {
  resetBridge();
  globalThis.__TAURI_INTERNALS__ = { invoke };
  globalThis.Notification = { permission: "default" };
  scheduled = [];
  window.JottAndroid = { scheduleReminders: vi.fn((payload) => scheduled.push(JSON.parse(payload)) > 0) };
});
afterEach(() => {
  delete window.JottAndroid;
  delete window.__jottOpenReminder;
});

const reminders = [
  { list: "jott.tasks/task-list.md", id: "abc123", at: "2026-09-08T09:00", text: "Alugar moto", place: "Tasks" },
  { list: "jott.tasks/task-list.md", id: "def456", at: "2026-09-01T09:00", text: "passou", place: "Tasks" },
  { list: "jott.tasks/task-list.md", id: null, position: 4, at: "2026-09-09T09:00", text: "sem id", place: "Tasks" },
];
const granted = () => bridge({ "plugin:notification|is_permission_granted": true });
const scope = { root: "/sdcard/Jott", device: "phone1" };

describe("syncing the phone's reminders", () => {
  it("reminders are scheduled through the native bridge, never the plugin's batch", async () => {
    granted();
    const ok = await syncAndroidReminders(reminders, { now: new Date(2026, 8, 7, 12, 0), strings: S, scope });
    expect(ok).toBe(true);
    expect(callsTo("plugin:notification|batch")).toEqual([]);
    expect(callsTo("plugin:notification|get_pending")).toEqual([]);
    const [{ items, channels }] = scheduled;
    expect(channels).toEqual({ reminders: "Reminders", summary: "Day summary" });
    expect(items.map((i) => i.key)).toEqual([reminderId(reminders[0]), reminderId(reminders[2])]);
    expect(items[0]).toEqual({
      key: reminderId(reminders[0]),
      at: new Date(2026, 8, 8, 9, 0).getTime(),
      kind: "reminder",
      title: "Alugar moto",
      body: "Tasks",
      list: "jott.tasks/task-list.md",
      id: "abc123",
      moment: "2026-09-08T09:00",
      root: "/sdcard/Jott",
      device: "phone1",
      buttons: { done: "Done", later: "Later", tomorrow: "Tomorrow" },
    });
    // A task with no id cannot be named by the core: no buttons, only the tap.
    expect(items[1].buttons).toBeUndefined();
  });

  it("the summary goes the same way, at the moment the host chose", async () => {
    granted();
    await syncAndroidReminders([], {
      now: new Date(2026, 8, 7, 6, 0),
      strings: S,
      summary: { at: new Date(2026, 8, 7, 8, 0), notice: { title: "You have 1 task today", body: "• a" } },
    });
    const [{ items }] = scheduled;
    expect(items).toEqual([
      {
        key: 1,
        at: new Date(2026, 8, 7, 8, 0).getTime(),
        kind: "summary",
        title: "You have 1 task today",
        body: "• a",
        list: "",
        id: "",
        moment: "",
      },
    ]);
  });

  it("an empty sync still replaces what was scheduled", async () => {
    granted();
    await syncAndroidReminders([], { strings: S });
    expect(scheduled).toEqual([{ channels: expect.any(Object), items: [] }]);
  });

  it("a missing or refusing native bridge is an error, not silence", async () => {
    granted();
    window.JottAndroid.scheduleReminders = () => false;
    await expect(syncAndroidReminders(reminders, { strings: S })).rejects.toThrow("not scheduled");
    delete window.JottAndroid;
    await expect(syncAndroidReminders(reminders, { strings: S })).rejects.toThrow("bridge is missing");
  });

  it("stops at a refused permission", async () => {
    bridge({ "plugin:notification|is_permission_granted": false });
    // The plugin asks the window, not the bridge, for this one.
    globalThis.Notification.requestPermission = async () => "denied";
    expect(await syncAndroidReminders(reminders, { strings: S })).toBe(false);
    expect(scheduled).toEqual([]);
  });
});

describe("a tapped notification", () => {
  it("is handed to the page by MainActivity, naming the task and its moment", () => {
    const open = vi.fn();
    onAndroidReminderTap(open);
    window.__jottOpenReminder({ list: "jott.tasks/task-list.md", id: "abc123", at: "2026-09-08T09:00" });
    expect(open).toHaveBeenCalledWith({ list: "jott.tasks/task-list.md", id: "abc123", at: "2026-09-08T09:00" });
    window.__jottOpenReminder({ list: "", id: "", at: "" });
    expect(open).toHaveBeenCalledTimes(1);
  });
});
