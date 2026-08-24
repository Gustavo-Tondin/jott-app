// The task inspector's own undo — a history of DRAFTS, not of actions.
//
// Three histories answer Ctrl+Z in this app, and they are deliberately not
// one (user call, 2026-08-24): the note's is CodeMirror's, the app's is the
// core's (`jott_core::history`, what takes back a delete or a reorder), and
// the one in between is this — the fields of the task open in the inspector.
// Every field edit there is an autosave, and an autosave is not an action
// anyone wants "Undo" to list twenty times over; what they want is the field
// back the way it was, without leaving the panel.
//
// So this keeps snapshots of the draft (the inspector already stringifies it
// for the autosave's dirty check) and hands one back on undo. It knows
// nothing about tasks: a snapshot is an opaque string, and a `key` says what
// changed so that typing into one field for a while is one step back, not
// one per keystroke — the same 500 ms the autosave waits.

/// `merge` is how long two edits to the same field stay one step; `limit`
/// how many steps are kept; `now` is a clock, for tests.
export function draftHistory({ merge = 500, limit = 100, now = () => Date.now() } = {}) {
  let past = [];
  let future = [];
  let current = null;
  let lastKey = null;
  let lastAt = 0;

  return {
    /// A new draft was opened: nothing to undo, `snapshot` is where it starts.
    reset(snapshot) {
      past = [];
      future = [];
      current = snapshot;
      lastKey = null;
    },

    /// The draft was re-read from the notebook after a save (the same task,
    /// fresh from disk): that is where the draft IS now, not a step — the
    /// steps are the user's edits, and this is the app catching up on them.
    settle(snapshot) {
      current = snapshot;
      lastKey = null;
    },

    /// The draft changed to `snapshot`. `key` names the field (null when the
    /// change is not one field, which never merges). A snapshot equal to the
    /// current one is not a change — which is how an undo's own effect does
    /// not land back in the history.
    push(snapshot, key = null) {
      if (snapshot === current) return;
      const at = now();
      const merges = key !== null && key === lastKey && at - lastAt <= merge && past.length > 0;
      if (!merges) {
        past.push(current);
        if (past.length > limit) past.shift();
      }
      future = [];
      current = snapshot;
      lastKey = key;
      lastAt = at;
    },

    /// The snapshot before the last change, or null when there is none. The
    /// change is not lost: it is what `redo` brings back.
    undo() {
      if (past.length === 0) return null;
      future.push(current);
      current = past.pop();
      lastKey = null;
      return current;
    },

    redo() {
      if (future.length === 0) return null;
      past.push(current);
      current = future.pop();
      lastKey = null;
      return current;
    },

    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    current: () => current,
  };
}

/// Which single top-level field differs between two JSON snapshots — the
/// `key` for `push`. Null when they differ in more than one (a whole draft
/// swapped in), in none, or when either is not JSON.
export function changedField(before, after) {
  let a;
  let b;
  try {
    a = JSON.parse(before);
    b = JSON.parse(after);
  } catch {
    return null;
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return null;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changed = [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  return changed.length === 1 ? changed[0] : null;
}
