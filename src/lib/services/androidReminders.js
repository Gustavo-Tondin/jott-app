// Android rings through the system: the notification plugin hands each
// moment to AlarmManager (exact, re-registered after a reboot), so a
// reminder rings with the app dead. The plugin is imported lazily: the
// tests' stand-in for the bridge covers `@tauri-apps/api/*`, not the plugin.

import { invoke } from "@tauri-apps/api/core";
import { notice, parseAt } from "./reminders.js";
import { summaryAt } from "./daySummary.js";
import { toIso } from "./dates.js";

/// How many upcoming reminders the system holds at once. Android caps
/// pending alarms per app (500), and every open re-syncs.
const SCHEDULED_AHEAD = 50;

/// The day summary's alarm id. Fixed, so every sync replaces the one alarm
/// instead of stacking one per sync.
const SUMMARY_ID = 1;

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
/// The day summary as an alarm, or null when there is nothing to announce:
/// the next `time` still ahead, carrying the text the day reads RIGHT NOW.
/// Android holds no timer of ours, so the count is the one the last sync saw
/// — every open and every notebook change re-syncs it.
function summaryAlarm(summary, now) {
  if (!summary?.notice || !summary.time) return null;
  let at = summaryAt(toIso(now), summary.time);
  if (at <= now) {
    at = new Date(at);
    at.setDate(at.getDate() + 1);
  }
  return { at, ...summary.notice };
}

export async function syncAndroidReminders(
  reminders,
  { now = new Date(), strings, summary = null, onError } = {},
) {
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
  const alarm = summaryAlarm(summary, now);
  if (upcoming.length === 0 && !alarm) return true;
  const notifications = upcoming.map((reminder) => {
    const { title, body } = notice(reminder, strings);
    const notification = {
      id: reminderId(reminder),
      title,
      body,
      schedule: plugin.Schedule.at(parseAt(reminder.at), false, true),
      // The summary is about the day, not about a task: tapping it only
      // opens the app, which is what an empty list means to `onAction`.
      extra: { list: reminder.list, id: reminder.id ?? "" },
    };
    return { ...notification, sourceJson: JSON.stringify(notification) };
  });
  if (alarm) {
    const notification = {
      id: SUMMARY_ID,
      title: alarm.title,
      body: alarm.body,
      schedule: plugin.Schedule.at(alarm.at, false, true),
      extra: { list: "", id: "" },
    };
    notifications.push({ ...notification, sourceJson: JSON.stringify(notification) });
  }
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
