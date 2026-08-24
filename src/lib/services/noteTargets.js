// Where a quick note can land, and how the notebook names the choice.
//
// The Home's capture writes into ONE folder of ONE notes space. Which one is
// the notebook's `quickNoteFolder` — a plain string in .jott/config.json,
// which people read and edit (principle 4), so the value stays path-like:
//
//   "Inbox", "Ideas"    — a folder of the FIXED Notes space (the shape every
//                         notebook wrote before 2026-08-24);
//   "Design Notes"      — a user note space, by its root-relative path — its
//                         own Inbox takes the note.
//
// The second form is what keeps the capture alive when the fixed Notes space
// is hidden (Fixed spaces): the note goes to another notepad instead of into
// a place with no door (user call, 2026-08-24). And the fixed INBOX itself
// stays a door while the Home shows the whole Inbox — hidden space or not,
// the notes captured there are read right on the Home (user call,
// 2026-08-24: "a opção de mandar as notas pro inbox pode continuar
// habilitada").
//
// A fixed folder and a space sharing a name is left ambiguous on purpose:
// the fixed folder wins while the fixed space is shown, and the space is the
// only reading left when it is hidden.

/// The places a quick note can go, in the order the pickers offer them: the
/// fixed space's Inbox and folders (while that space is shown), then the
/// user's note spaces. `{space, folder, label, value}` — `space`/`folder`
/// are `api.quickCaptureNote`'s arguments, `value` what the config stores.
export function noteTargets({
  notesFolder,
  notesInbox,
  folders = [],
  spaces = [],
  fixedShown = true,
  /// The Home shows the whole Inbox (`homeShowsAllInboxNotes`): the Inbox is
  /// readable there even with the fixed space hidden, so it stays a target.
  inboxOnHome = false,
}) {
  const inbox = notesInbox || "Inbox";
  const out = [];
  if ((fixedShown || inboxOnHome) && notesFolder) {
    out.push({ space: notesFolder, folder: inbox, label: inbox, value: inbox });
  }
  if (fixedShown && notesFolder) {
    for (const entry of folders) {
      // The bridge answers folder ENTRIES (`{path, color, pinned}`); a bare
      // name is accepted so a caller with only names still works.
      const name = typeof entry === "string" ? entry : entry?.path;
      if (!name || name === inbox) continue;
      out.push({ space: notesFolder, folder: name, label: name, value: name });
    }
  }
  for (const sp of spaces) {
    // The fixed space rides in `spaces` too (it has a marker like any other);
    // its doors are the fixed entries above, not a duplicate row here.
    if (sp?.kind !== "notes" || sp.fixed || sp.path === notesFolder) continue;
    out.push({ space: sp.path, folder: inbox, label: sp.name, value: sp.path });
  }
  return out;
}

/// The target `value` names, else the first offered, else null — and with no
/// target at all there is nowhere to capture, which is the caller's cue to
/// put the note half of the capture away.
export function quickNoteTarget(value, targets) {
  return targets.find((t) => t.value === value) ?? targets[0] ?? null;
}
