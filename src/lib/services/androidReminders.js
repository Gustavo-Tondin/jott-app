// Android rings through the system's alarms, set by the app's own Kotlin
// (`ReminderAlarms.kt`): this module decides WHAT rings and hands the whole
// set over through `window.JottAndroid.scheduleReminders`. Not the
// notification plugin's `batch` — every button of its notifications opens
// the app, and Done, Later and Tomorrow must not. The plugin is kept for the
// permission prompt, and imported lazily: the tests' stand-in for the bridge
// covers `@tauri-apps/api/*`, not the plugin.

import { notice, parseAt } from "./reminders.js";

/// How many upcoming reminders the system holds at once. Android caps
/// pending alarms per app (500), and every open re-syncs.
const SCHEDULED_AHEAD = 50;

/// The day summary's alarm key. Fixed, so every sync replaces the one alarm
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

const native = () => (typeof window === "undefined" ? undefined : window.JottAndroid);

/// Replaces every scheduled alarm with the upcoming reminders of `reminders`
/// and, when there is one, the day summary. `summary` is `{at, notice}`: the
/// moment the host chose and what THAT day reads at sync time — Android holds
/// no timer of ours, so the count is the one the last sync saw. `scope` is
/// `{root, device}` (`api.reminderScope`): a button acts on the notebook with
/// the app closed, and needs to know which. The alarms an older build left
/// with the plugin are retired on the native side (`ReminderAlarms.kt`).
export async function syncAndroidReminders(
  reminders,
  { now = new Date(), strings, dateFormat, summary = null, scope = {} } = {},
) {
  const plugin = await import("@tauri-apps/plugin-notification");
  if (!(await plugin.isPermissionGranted())) {
    if ((await plugin.requestPermission()) !== "granted") return false;
  }

  const buttons = { done: strings.notifyDone, later: strings.notifyLater, tomorrow: strings.notifyTomorrow };
  const items = reminders
    .filter((r) => parseAt(r.at) > now)
    .slice(0, SCHEDULED_AHEAD)
    .map((reminder) => {
      const { title, body } = notice(reminder, strings, dateFormat);
      return {
        key: reminderId(reminder),
        at: parseAt(reminder.at).getTime(),
        kind: "reminder",
        title,
        body,
        list: reminder.list,
        id: reminder.id ?? "",
        moment: reminder.at,
        root: scope.root ?? "",
        device: scope.device ?? "",
        // A task with no id cannot be named by the core: it only opens.
        ...(reminder.id ? { buttons } : {}),
      };
    });
  if (summary?.notice && summary.at instanceof Date) {
    items.push({
      key: SUMMARY_ID,
      at: summary.at.getTime(),
      kind: "summary",
      title: summary.notice.title,
      body: summary.notice.body,
      // About the day, not a task: tapping it only brings the app back.
      list: "",
      id: "",
      moment: "",
    });
  }
  const bridge = native();
  if (!bridge?.scheduleReminders) throw new Error("the app's alarm bridge is missing");
  const channels = { reminders: strings.notifyChannelReminders, summary: strings.notifyChannelSummary };
  if (!bridge.scheduleReminders(JSON.stringify({ channels, items }))) {
    throw new Error("the alarms were not scheduled");
  }
  return true;
}

/// Calls `open({list, id, at})` when a reminder's notification is tapped:
/// `MainActivity` hands the tap to `window.__jottOpenReminder` once it
/// exists, retrying through a cold start. `at` is the moment the task asked
/// for, carried by the alarm itself.
export function onAndroidReminderTap(open) {
  if (typeof window === "undefined") return;
  window.__jottOpenReminder = (detail) => {
    if (detail?.list) open({ list: detail.list, id: detail.id || null, at: detail.at || "" });
  };
}
