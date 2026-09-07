import { beforeEach, describe, expect, it } from "vitest";
import { bridge, callsTo, invoke, resetBridge } from "../test/bridge.js";
import { reminderId, syncAndroidReminders } from "./androidReminders.js";
import { S } from "./strings.js";

// The plugin's own JS does not import `@tauri-apps/api/core` — it calls
// `window.__TAURI_INTERNALS__.invoke` itself — so the stand-in for the bridge
// is put there too, and answers it by command name; nothing here mocks the
// plugin module. It also reads `window.Notification.permission` first (jsdom
// has no Notification): "default" is what sends it on to the bridge.
beforeEach(() => {
  resetBridge();
  globalThis.__TAURI_INTERNALS__ = { invoke };
  globalThis.Notification = { permission: "default" };
});

const reminders = [
  { list: "jott.tasks/task-list.md", id: "abc123", at: "2026-09-08T09:00", title: "Alugar moto" },
  { list: "jott.tasks/task-list.md", id: "def456", at: "2026-09-01T09:00", title: "passou" },
];

describe("syncing the phone's reminders", () => {
  it("cancels what is pending BY ID and schedules the upcoming ones through `batch`", async () => {
    bridge({
      "plugin:notification|is_permission_granted": true,
      "plugin:notification|get_pending": [{ id: 7, title: "old" }],
      "plugin:notification|cancel": null,
      "plugin:notification|batch": [1],
    });
    const ok = await syncAndroidReminders(reminders, { now: new Date("2026-09-07T12:00"), strings: S });
    expect(ok).toBe(true);
    // Never the bare `cancel` — that is the call the Android half throws on.
    expect(callsTo("plugin:notification|cancel")).toEqual([{ notifications: [7] }]);
    const [batch] = callsTo("plugin:notification|batch");
    expect(batch.notifications.map((n) => n.id)).toEqual([reminderId(reminders[0])]);
    expect(batch.notifications[0].extra).toEqual({ list: reminders[0].list, id: "abc123" });
    // `schedule` is the plugin's own shape, built by its own helper.
    expect(batch.notifications[0].schedule.at.date).toEqual(new Date("2026-09-08T09:00"));
  });

  it("with nothing pending, nothing is cancelled", async () => {
    bridge({
      "plugin:notification|is_permission_granted": true,
      "plugin:notification|get_pending": [],
      "plugin:notification|batch": [1],
    });
    await syncAndroidReminders(reminders, { now: new Date("2026-09-07T12:00"), strings: S });
    expect(callsTo("plugin:notification|cancel")).toEqual([]);
  });

  it("stops at a refused permission", async () => {
    bridge({ "plugin:notification|is_permission_granted": false });
    // The plugin asks the window, not the bridge, for this one.
    globalThis.Notification.requestPermission = async () => "denied";
    expect(await syncAndroidReminders(reminders, { strings: S })).toBe(false);
    expect(callsTo("plugin:notification|get_pending")).toEqual([]);
  });
});
