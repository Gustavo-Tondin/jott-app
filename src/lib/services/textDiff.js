// The smallest single replacement that turns one text into another: the
// common prefix and suffix are kept, the middle is swapped. What a document
// reloaded from disk is applied as, so positions outside the change (the
// cursor, the scroll anchor) survive it.

/// `{from, to, insert}` over `current`, in the shape CodeMirror's `changes`
/// takes. `from === to` with an empty insert means the texts were equal.
export function minimalReplacement(current, incoming) {
  const max = Math.min(current.length, incoming.length);
  let from = 0;
  while (from < max && current.charCodeAt(from) === incoming.charCodeAt(from)) from++;
  let to = current.length;
  let end = incoming.length;
  while (to > from && end > from && current.charCodeAt(to - 1) === incoming.charCodeAt(end - 1)) {
    to--;
    end--;
  }
  return { from, to, insert: incoming.slice(from, end) };
}
