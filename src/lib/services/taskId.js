// Turning a task into something addressable.
//
// An id is a write to the user's file, so it is handed out as late as
// possible: reading a list never assigns one, and neither does opening a task
// to look at it. Only an action that has to name that exact line — pulling it
// into a period, completing it, saving a field — earns an id.
//
// This lives outside `api.js` on purpose: `api.js` only names the bridge, and
// this decides something.

import { api } from "./api.js";

/// The id of `task`, assigning one first if it does not have one yet.
///
/// The position is looked up by re-reading the list instead of being passed
/// in, because the screen's copy may be older than the file. Two id-less tasks
/// with identical text in the same list are genuinely indistinguishable here —
/// the first one wins, and to the user the result looks the same.
export async function ensureTaskId(list, task) {
  if (task?.id) return task.id;

  const tasks = await api.listTasks(list);
  const position = tasks.findIndex((t) => !t.id && t.text === task.text);
  if (position < 0) {
    throw { kind: "taskNotFound", message: task?.text ?? "" };
  }
  return await api.ensureTaskId(list, position);
}
