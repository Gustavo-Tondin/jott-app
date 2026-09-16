// The actions a task card offers, wherever it is drawn — Home, a list screen
// or a tasks space. Each of them repeated the same four bodies, and each copy
// had to remember the two rules that are easy to lose:
//
//  1. the id is LAZY, so every action resolves one first (`ensureTaskId`) —
//     a hand-written task, or one just respawned by a repetition, has none;
//  2. completing re-reads only once the card is gone (`gone`, handed by the
//     row), so the list never rearranges under a card still leaving.

import { api } from "./api.js";
import { ensureTaskId } from "./taskId.js";
import { completionBeat } from "./pace.js";
import { S } from "./strings.js";

/// The shared card actions, bound to a screen's `act` (services/act.js).
///
/// The signatures are the ones `TaskRow` calls with: `(list, task, gone)` for
/// the checkbox (`gone` resolves when the card has left), `(list, task)` for
/// the bookmark, `(list, id, text)` for the inline rename.
export function taskActions(act) {
  return {
    complete: (list, task, gone) =>
      act(async () => {
        const id = await ensureTaskId(list, task);
        await Promise.all([api.completeTask(list, id), gone]);
        await completionBeat();
      }),

    edit: (list, id, text) => act(() => api.editTaskText(list, id, text)),

    pin: (list, task, pinned) =>
      act(async () => {
        const id = await ensureTaskId(list, task);
        await api.setTaskPinned(list, id, pinned);
      }),

    /// Today's pin (`.jott/daily-state.json`), not the task's: the day screen
    /// pins to the top of the day, and the turn of the day clears it.
    pinToday: (list, task, pinned) =>
      act(async () => {
        const id = await ensureTaskId(list, task);
        await api.setDayPinned(list, id, pinned);
      }),

    pull: (day, list, task) =>
      act(async () => {
        const id = await ensureTaskId(list, task);
        await api.pullInto(day, list, id);
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

/// THE FIVE SLICES A TASK'S RING CARRIES (components/ActionRing.svelte), in
/// the order they open in. Pure, so the ring can be read without a pointer.
///
/// THE SAME FIVE AS A NOTE'S, in the same order (`noteRing`): Pin · Move ·
/// Edit · Reorder · ⋮ — a card means one thing on both screens. Completing
/// and the day are the swipes. A slice INVERTS with the state of the card
/// rather than moving (a pinned task reads "Unpin" in the same place), so the
/// muscle memory survives. The last is always the ⋮ — what did not fit is
/// still one tap away, and nothing left the app.
export function taskRing({
  pinned = false,
  /// Each is `(from, at) => void`, where `at` is the point the ring opened
  /// on — what a slice that opens a menu of its own anchors to. A null one
  /// leaves that slice out: a day ahead has nowhere to pin to, a read-only
  /// notebook has nothing at all.
  onPin = null,
  onMove = null,
  onEdit = null,
  onReorder = null,
  onMore = null,
} = {}) {
  const slices = [];
  if (onPin)
    slices.push({
      id: "pin",
      icon: pinned ? "bookmark-simple-fill" : "bookmark-simple",
      label: pinned ? S.ringUnpin : S.ringPin,
      run: onPin,
    });
  if (onMove) slices.push({ id: "move", icon: "arrow-right", label: S.ringMove, run: onMove });
  if (onEdit) slices.push({ id: "edit", icon: "pencil", label: S.ringEdit, run: onEdit });
  if (onReorder)
    slices.push({
      id: "reorder",
      icon: "arrows-out-cardinal",
      label: S.ringReorder,
      run: onReorder,
    });
  if (onMore) slices.push({ id: "more", icon: "dots-three", label: S.ringMore, run: onMore });
  return slices;
}

/// The ⋮ slice's rows: what a task can do that the four slices left out.
/// Pure, like `noteCardMenu` — the doing is bound by the screen.
export function taskCardMenu({ onDuplicate = null, onDelete = null } = {}) {
  const rows = [];
  if (onDuplicate) rows.push({ label: S.duplicateTask, run: onDuplicate });
  if (onDelete) rows.push({ label: S.deleteTaskItem, run: onDelete });
  return rows;
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
