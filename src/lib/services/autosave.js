// The auto-save engine — a debounced write with a captured target.
//
// It existed twice, ~50 lines each (TaskInspector and NoteEditor, the
// latter's header saying "the mechanics are the same"), and the mechanics
// are exactly the part a copy loses:
//
//   • The TARGET is captured when the document opens and read synchronously
//     when the write fires — the user can click another task while a write
//     is still on its way, and that write has to land on the document it was
//     typed into.
//   • The BASELINE (what the document looked like when it was last known
//     saved) advances only after the write lands, and only if the panel is
//     still on the same target: a failed write has to be retried by the next
//     edit, not quietly counted as saved.
//   • The SNAPSHOT rides along with the value it was taken from, so marking
//     the write as done later cannot swallow something typed in between.
//
// None of this is reactive state on purpose: nothing here should re-render
// anything, and a reactive `pending` would make the caller's auto-save
// effect trigger itself.

/// Builds one engine. `write(target, value)` performs the actual save (and
/// whatever success reporting the caller wants); `onError` gets anything it
/// throws.
export function autosave({ delay = 500, write, onError }) {
  let slot = null;
  let baseline = "";
  let pending = null;
  let timer = null;

  async function send() {
    // Read synchronously: by the time the first await returns, the user may
    // already have opened another document and replaced the slot.
    const target = slot;
    const job = pending;
    pending = null;
    if (timer) clearTimeout(timer);
    timer = null;
    if (!target || !job) return;

    try {
      await write(target, job.value);
      if (target === slot) baseline = job.snapshot;
    } catch (e) {
      onError?.(e);
    }
  }

  /// Sends whatever is waiting right now, without waiting for the timer.
  function flush() {
    if (!pending) return Promise.resolve();
    if (timer) clearTimeout(timer);
    timer = null;
    return send();
  }

  return {
    /// A new document under the panel. Whatever was typed into the previous
    /// one goes out first, addressed to it, before the slot is replaced —
    /// `send` reads the slot synchronously, so the order here is what makes
    /// that address right.
    open(target, snapshot) {
      flush();
      slot = target;
      baseline = snapshot;
    },
    /// Whether `snapshot` is a real edit, or just the document as it was
    /// loaded (the caller's effect fires for both).
    dirty: (snapshot) => snapshot !== baseline,
    /// Schedules a write of `value`; `snapshot` is what the document reads
    /// as WITH this value, and becomes the baseline once the write lands.
    edit(value, snapshot) {
      pending = { value, snapshot };
      if (timer) clearTimeout(timer);
      timer = setTimeout(send, delay);
    },
    flush,
    /// The captured target — for a caller that needs to read the document
    /// the draft belongs to (the inspector keeps the old text when the name
    /// is emptied).
    target: () => slot,
  };
}
