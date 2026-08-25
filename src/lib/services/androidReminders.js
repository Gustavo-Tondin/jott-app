// Android rings through the system: the notification plugin hands each
// moment to AlarmManager (exact, and re-registered after a reboot), so a
// reminder rings with the app dead — which on a phone is most of the time.
//
// The plugin is imported lazily: it is only ever needed on Android, and the
// tests' stand-in for the bridge covers the `@tauri-apps/api/*` modules, not
// the plugin's.

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
export async function syncAndroidReminders(reminders, { now = new Date(), strings } = {}) {
  const plugin = await import("@tauri-apps/plugin-notification");
  if (!(await plugin.isPermissionGranted())) {
    if ((await plugin.requestPermission()) !== "granted") return false;
  }
  await plugin.cancelAll();
  const upcoming = reminders.filter((r) => parseAt(r.at) > now).slice(0, SCHEDULED_AHEAD);
  for (const reminder of upcoming) {
    const { title, body } = notice(reminder, strings);
    plugin.sendNotification({
      id: reminderId(reminder),
      title,
      body,
      schedule: plugin.Schedule.at(parseAt(reminder.at), false, true),
      extra: { list: reminder.list, id: reminder.id ?? "" },
    });
  }
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
