// The actions a task card offers, wherever it is drawn — Home, a list screen
// or a tasks space. Each of them repeated the same four bodies, and each copy
// had to remember the two rules that are easy to lose:
//
//  1. the id is LAZY, so every action resolves one first (`ensureTaskId`) —
//     a hand-written task, or one just respawned by a repetition, has none;
//  2. completing waits a beat before the reload, so the tick is seen before
//     the list rearranges under the pointer.

import { api } from "./api.js";
import { ensureTaskId } from "./taskId.js";
import { completionBeat } from "./pace.js";

/// The shared card actions, bound to a screen's `act` (services/act.js).
///
/// The signatures are the ones `TaskRow` calls with: `(list, task)` for the
/// checkbox and the bookmark, `(list, id, text)` for the inline rename.
export function taskActions(act) {
  return {
    complete: (list, task) =>
      act(async () => {
        const id = await ensureTaskId(list, task);
        await api.completeTask(list, id);
        // Let the tick be seen before the list rearranges.
        await completionBeat();
      }),

    edit: (list, id, text) => act(() => api.editTaskText(list, id, text)),

    pin: (list, task, pinned) =>
      act(async () => {
        const id = await ensureTaskId(list, task);
        await api.setTaskPinned(list, id, pinned);
      }),

    pull: (period, list, task) =>
      act(async () => {
        const id = await ensureTaskId(list, task);
        await api.pullInto(period, list, id);
      }),

    /// To the trash, never destroyed — `.jott/trash/` keeps it, and the
    /// restore puts it back on the line it was on.
    remove: (list, task) =>
      act(async () => {
        const id = await ensureTaskId(list, task);
        await api.deleteTask(list, id);
      }),

    duplicate: (list, task) =>
      act(async () => {
        const id = await ensureTaskId(list, task);
        await api.duplicateTask(list, id);
      }),
  };
}

/// Whether `task` is the one the inspector has open.
///
/// By id when it has one, but also by object identity: ids are lazy, so a task
/// without one would never match and only the already-addressed cards would
/// ever highlight. The selected object is the very one the screen rendered, so
/// `===` holds until the next reload.
export function isSelectedTask(task, selectedId = null, selectedTask = null) {
  return (!!task.id && task.id === selectedId) || task === selectedTask;
}
