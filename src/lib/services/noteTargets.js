// Where a quick note lands: the notebook's `quickNoteFolder`, a path-like
// string people edit. `""` is the FIXED Notes space's root (its inbox, the
// default); `"Ideas"` a folder of it; `"Design Notes"` a user note space by
// root-relative path (its root takes the note) — what keeps the capture
// alive when the fixed space is hidden. Same name for both: the folder wins
// while the fixed space shows.

import { S } from "./strings.js";

/// The places a quick note can go, in the order the pickers offer them: the
/// fixed space's root and folders (while that space is shown), then the
/// user's note spaces. `{space, folder, label, value}` — `space`/`folder`
/// are `api.quickCaptureNote`'s arguments, `value` what the config stores.
export function noteTargets({ notesFolder, folders = [], spaces = [], fixedShown = true }) {
  const out = [];
  if (fixedShown && notesFolder) {
    // "Inbox notes": beside "Inbox tasks" a plain "Notes" would not say
    // that this is where the loose ones go.
    out.push({ space: notesFolder, folder: "", label: S.inboxNotes, value: "" });
  }
  if (fixedShown && notesFolder) {
    // `?? []`: a bridge answering null (a test's silent half, a notebook
    // mid-close) must read as no folders, not as a crash in a derived.
    for (const entry of folders ?? []) {
      // The bridge answers folder ENTRIES (`{path, color, pinned}`); a bare
      // name is accepted so a caller with only names still works.
      const name = typeof entry === "string" ? entry : entry?.path;
      if (!name) continue;
      out.push({ space: notesFolder, folder: name, label: name, value: name });
    }
  }
  for (const sp of spaces ?? []) {
    // The fixed space rides in `spaces` too (it has a marker like any other);
    // its doors are the fixed entries above, not a duplicate row here.
    if (sp?.kind !== "notes" || sp.fixed || sp.path === notesFolder) continue;
    out.push({ space: sp.path, folder: "", label: sp.name, value: sp.path });
  }
  return out;
}

/// The target `value` names, else the first offered, else null — and with no
/// target at all there is nowhere to capture, which is the caller's cue to
/// put the note half of the capture away.
export function quickNoteTarget(value, targets) {
  return targets.find((t) => t.value === value) ?? targets[0] ?? null;
}
