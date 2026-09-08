// The floating "Undo": an action that makes something vanish — a delete, a
// task taken off the day — is offered back where it happened, for a moment,
// with no chord to remember. `api.js` reports every command that answered;
// this decides which ones are worth offering, and the shell draws the offer.

/// The commands worth an offer: what they take away is gone from the screen
/// the moment they answer, which is when a second thought arrives.
const OFFERED = new Set([
  "delete_task",
  "delete_note",
  "delete_list",
  "delete_space",
  "delete_group",
  "delete_note_folder",
  "remove_from",
]);

let listener = null;

/// Called by the bridge's face with the name of a command that succeeded.
export function announce(command) {
  if (OFFERED.has(command)) listener?.(command);
}

/// The shell's ear: one at a time, the latest wins. Returns how to stop.
export function onOffer(fn) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}
