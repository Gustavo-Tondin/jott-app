// Creating a task from what the composer collected — text, list, and the
// quick fields the wireframe's bar offers (due date, repeat).
//
// It exists because three callers write the same task the same way (the "New
// task" dialog, the pinned bar on the Tasks screen, and whatever screen hosts
// them), and because the order of the bridge calls matters:
//
//   create_task → ensure_task_id → set_task_fields → pull_into_period
//
// `create_task` answers with a POSITION, not an id: ids are handed out only
// when something needs to address the task. So the id is asked for exactly
// when it is needed — a plain "buy milk" typed into the bar still lands in the
// file without a comment on its line.

import { api } from "./api.js";

/// A blank intent, pointed at `list`.
export function emptyIntent(list = null) {
  return { text: "", list, due: "", priority: "", repeatEvery: 1, repeatUnit: "" };
}

/// Whether the intent carries anything beyond its text.
export function hasFields(intent) {
  return !!(intent?.due || intent?.repeatUnit || intent?.priority);
}

/// The `repeat:` value the core parses, or null when there is no repetition.
///
/// Built rather than typed, for the same reason the inspector builds it: the
/// core silently drops a `repeat:` it cannot parse, so an invalid one must
/// never be possible to express.
export function repeatText(intent) {
  if (!intent?.repeatUnit) return null;
  const every = Math.max(1, Number(intent.repeatEvery) || 1);
  return every === 1
    ? `every-${intent.repeatUnit}`
    : `every-${every}-${intent.repeatUnit}s`;
}

/// Writes the intent. Returns the new task's id, or null when it needed none.
///
/// `period` pulls the fresh task into Today or This Week — which is what the
/// Home's "New task" does, since a task created from the day's block that did
/// not join the day would simply not appear (user call, 2026-08-06).
export async function composeTask(intent, { period = null } = {}) {
  const text = (intent?.text ?? "").trim();
  if (!text || !intent?.list) return null;

  const fields = {};
  if (intent.due) fields.due = intent.due;
  if (intent.priority) fields.priority = Number(intent.priority);
  const repeat = repeatText(intent);
  if (repeat) fields.repeat = repeat;
  const wants = Object.keys(fields).length > 0;

  const position = await api.createTask(intent.list, text);
  if (!wants && !period) return null;

  const id = await api.ensureTaskId(intent.list, position);
  if (wants) await api.setTaskFields(intent.list, id, fields);
  if (period) await api.pullInto(period, intent.list, id);
  return id;
}
