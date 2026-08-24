// The beat between ticking a task off and the list rearranging around it —
// the completed card leaves for the Completed section and, on a repeating
// task, the next occurrence arrives. Refreshing in the same breath as the
// click made the swap feel instant and confusing (and, before the fix in
// TaskRow, made the fresh occurrence look born-checked). A short pause lets
// the tick be seen before the list moves (user request, 2026-08-05).
//
// One mutable knob on purpose: tests zero it to stay instant.
export const pace = {
  // Zero since 2026-08-24: the completing card now HOLDS for a second of its
  // own (task-row.css) before the write happens, so a second pause here only
  // widened the blank moment before the Completed section arrived. The knob
  // stays: the inspector's completes still pass through it, and a test zeroes
  // it explicitly either way.
  completionMs: 0,
};

/** Waits the completion beat, when there is one. */
export const completionBeat = () =>
  pace.completionMs > 0
    ? new Promise((resolve) => setTimeout(resolve, pace.completionMs))
    : Promise.resolve();
