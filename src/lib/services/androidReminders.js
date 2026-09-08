// Android rings through the system: the notification plugin hands each
// moment to AlarmManager (exact, re-registered after a reboot), so a
// reminder rings with the app dead. The plugin is imported lazily: the
// tests' stand-in for the bridge covers `@tauri-apps/api/*`, not the plugin.

import { invoke } from "@tauri-apps/api/core";
import { notice, parseAt } from "./reminders.js";

/// How many upcoming reminders the system holds at once. Android caps
/// pending alarms per app (500), and every open re-syncs.
export const SCHEDULED_AHEAD = 50;

/// A stable 31-bit id for a reminder, so re-syncing replaces rather than
/// duplicates and a click can name what it came from.
export function reminderId(reminder) {
  const key = `${reminder.list}|${reminder.id ?? reminder.position}|${reminder.at}`;
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) || 1;
}

/// Replaces every pending reminder with the upcoming ones of `reminders`.
/// Cancel is BY ID (`cancelAll()` throws in the Android half); scheduling is
/// `batch` by name (`sendNotification()` sets the alarm but never stores it,
/// so `pending()` and the reboot re-registration miss it); `sourceJson` is
/// set here because the plugin reads it back and never writes it. See docs/platform-gotchas.md#android
export async function syncAndroidReminders(reminders, { now = new Date(), strings, onError } = {}) {
  const plugin = await import("@tauri-apps/plugin-notification");
  if (!(await plugin.isPermissionGranted())) {
    if ((await plugin.requestPermission()) !== "granted") return false;
  }
  let pending = [];
  // A store holding old `"null"` entries throws here until they fire; the
  // ids are stable, so `batch` below still replaces what exists.
  try {
    pending = (await plugin.pending()) ?? [];
  } catch (error) {
    onError?.(error);
  }
  if (pending.length) await plugin.cancel(pending.map((n) => n.id));
  const upcoming = reminders.filter((r) => parseAt(r.at) > now).slice(0, SCHEDULED_AHEAD);
  if (upcoming.length === 0) return true;
  const notifications = upcoming.map((reminder) => {
    const { title, body } = notice(reminder, strings);
    const notification = {
      id: reminderId(reminder),
      title,
      body,
      schedule: plugin.Schedule.at(parseAt(reminder.at), false, true),
      extra: { list: reminder.list, id: reminder.id ?? "" },
    };
    return { ...notification, sourceJson: JSON.stringify(notification) };
  });
  await invoke("plugin:notification|batch", { notifications });
  return true;
}

/// Calls `open({list, id})` when a reminder's notification is tapped.
export async function onAndroidReminderTap(open) {
  const plugin = await import("@tauri-apps/plugin-notification");
  return plugin.onAction((n) => {
    const data = n?.data ?? n?.extra ?? {};
    if (data.list) open({ list: data.list, id: data.id || null });
  });
}
