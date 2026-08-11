// The beat between ticking a task off and the list rearranging around it —
// the completed card leaves for the Completed section and, on a repeating
// task, the next occurrence arrives. Refreshing in the same breath as the
// click made the swap feel instant and confusing (and, before the fix in
// TaskRow, made the fresh occurrence look born-checked). A short pause lets
// the tick be seen before the list moves (user request, 2026-08-05).
//
// One mutable knob on purpose: tests zero it to stay instant.
export const pace = {
  completionMs: 250,
};

/** Waits the completion beat, when there is one. */
export const completionBeat = () =>
  pace.completionMs > 0
    ? new Promise((resolve) => setTimeout(resolve, pace.completionMs))
    : Promise.resolve();
