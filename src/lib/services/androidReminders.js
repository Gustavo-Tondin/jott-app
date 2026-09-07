// Android rings through the system: the notification plugin hands each
// moment to AlarmManager (exact, and re-registered after a reboot), so a
// reminder rings with the app dead — which on a phone is most of the time.
//
// The plugin is imported lazily: it is only ever needed on Android, and the
// tests' stand-in for the bridge covers the `@tauri-apps/api/*` modules, not
// the plugin's.

import { invoke } from "@tauri-apps/api/core";
import { notice, parseAt } from "./reminders.js";

/// How many upcoming reminders are handed to the system at once. Android
/// caps pending alarms per app (500), and nobody has fifty reminders in the
/// time it takes to open the app again and re-sync.
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
///
/// Two plugin doors are deliberately NOT used, both measured on a Pixel 9a
/// (2026-09-07) after the user's report "Something went wrong — lateinit
/// property notifications has not been initialized":
///
///   * `cancelAll()` sends `cancel` with no argument, and the Android half
///     reads that argument into a `lateinit` list — the exception above, on
///     every sync, before anything was scheduled. The pending list is asked
///     for and cancelled BY ID instead, the one shape both halves agree on.
///   * `sendNotification()` goes through `window.Notification` → `show`, which
///     sets the alarm but never writes the notification to the plugin's
///     store — so `pending()` answered `[]` with an alarm live, the
///     re-registration after a reboot (which reads that store) had nothing
///     to re-register, and a reminder the user removed could never be found
///     to cancel. `batch` is the command that schedules AND stores; the JS
///     package has no wrapper for it, so it is invoked by name.
export async function syncAndroidReminders(reminders, { now = new Date(), strings } = {}) {
  const plugin = await import("@tauri-apps/plugin-notification");
  if (!(await plugin.isPermissionGranted())) {
    if ((await plugin.requestPermission()) !== "granted") return false;
  }
  const pending = (await plugin.pending()) ?? [];
  if (pending.length) await plugin.cancel(pending.map((n) => n.id));
  const upcoming = reminders.filter((r) => parseAt(r.at) > now).slice(0, SCHEDULED_AHEAD);
  if (upcoming.length === 0) return true;
  const notifications = upcoming.map((reminder) => {
    const { title, body } = notice(reminder, strings);
    return {
      id: reminderId(reminder),
      title,
      body,
      schedule: plugin.Schedule.at(parseAt(reminder.at), false, true),
      extra: { list: reminder.list, id: reminder.id ?? "" },
    };
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
