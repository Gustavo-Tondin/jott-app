// Creating a task from what the composer collected — text, list, quick fields.
// The order of the bridge calls matters:
//   create_task → ensure_task_id → set_task_fields → pull_into_day
// `create_task` answers with a POSITION, not an id: the id is asked for only
// when something needs it, so a plain "buy milk" lands without a comment.

import { api } from "./api.js";
import { repeatText } from "./taskFields.js";

/// A blank intent, pointed at `list`.
export function emptyIntent(list = null) {
  return { text: "", list, due: "", priority: "", repeatEvery: 1, repeatUnit: "" };
}

/// Writes the intent. Returns the new task's id, or null when it needed none.
/// `into` pulls the fresh task into a day — `null` for today, an ISO day for
/// one ahead (the Home's composer: a task created from the day's screen that
/// did not join the day would not appear). Left out, it only lands in its list.
export async function composeTask(intent, { into } = {}) {
  const text = (intent?.text ?? "").trim();
  if (!text || !intent?.list) return null;

  const fields = {};
  if (intent.due) fields.due = intent.due;
  if (intent.priority) fields.priority = Number(intent.priority);
  const repeat = repeatText(intent);
  if (repeat) fields.repeat = repeat;
  const wants = Object.keys(fields).length > 0;

  const joins = into !== undefined;
  const position = await api.createTask(intent.list, text);
  if (!wants && !joins) return null;

  const id = await api.ensureTaskId(intent.list, position);
  if (wants) await api.setTaskFields(intent.list, id, fields);
  if (joins) await api.pullInto(into, intent.list, id);
  return id;
}
