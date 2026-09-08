// What has JUST appeared between two reads — a card new to a list, a task new
// to the day. A mark that lives for ONE read is gone before the eye sees it:
// a write is answered by a reload, and the file watcher sends its own a few
// frames later, so the key would be "new" in one read and old in the next
// while the list rebuilds its nodes in between. A mark therefore lives for a
// WINDOW OF TIME. Feeding it a different `source` is a different list, and
// marks nothing: turning to another day is not a day of arrivals.

/// How long a key stays marked. Above the plays that answer it (task-row.css),
/// so a second read cannot cut one short.
export const HELD = 700;

/// Builds the sifter. Call it with every read; it answers the whole set of
/// keys still marked, the new ones included.
export function tracker(held = HELD) {
  let previous = null;
  let marks = new Map();
  return (source, keys, now = Date.now()) => {
    const next = new Map([...marks].filter(([, until]) => until > now));
    if (previous?.source === source) {
      for (const key of keys) if (!previous.keys.has(key)) next.set(key, now + held);
    } else {
      next.clear();
    }
    previous = { source, keys: new Set(keys) };
    marks = next;
    return new Set(next.keys());
  };
}
