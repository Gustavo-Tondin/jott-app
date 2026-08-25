// The actions a note CARD offers, wherever it is drawn — the notes board, a
// notes space, the Home (2026-08-25).
//
// The board had them and the Home had none: its cards carried only "open in
// new tab", on the right button, which on a phone is no action at all. Rather
// than a second copy of four bodies and a menu, both screens read this.
//
// The split is the same one `taskActions.js` keeps: the doing is here, bound
// to a screen's `act` (services/act.js) so a failure lands in that screen's
// error line and the reload is its own; the menu ROWS are a pure function, so
// what a card offers can be tested without rendering anything.

import { api } from "./api.js";
import { askConfirm, DELETING } from "./dialog.js";
import { S } from "./strings.js";

/// The card actions, bound to a screen's `act`.
///
/// Every one takes the SPACE the note lives in, because a note's address is
/// relative to it — the Home looks into a space it does not belong to, and
/// naming it at the call site is what keeps that honest.
export function noteActions(act) {
  return {
    pin: (space, entry) => act(() => api.setNotePinned(space, entry.path, !entry.pinned)),

    duplicate: (space, entry) => act(() => api.duplicateNote(space, entry.path)),

    /// To the trash, never destroyed. The question is `confirmDeletes`, which
    /// the reader can turn off — and can, because nothing here is destroyed.
    remove: (space, entry) =>
      act(async () => {
        if (!(await askConfirm(S.confirmDeleteNote(entry.title), DELETING))) return;
        await api.deleteNote(space, entry.path);
      }),

    /// `where` is what the picker's rows carry: `["space", "folder"]`, JSON.
    /// One string because a menu row holds one value, and the pair is what
    /// `move_note_to_space` needs.
    moveTo: (space, entry, where) =>
      act(async () => {
        const [target, into] = JSON.parse(where);
        await api.moveNoteToSpace(space, entry.path, target, into);
      }),
  };
}

/// The rows of a note card's ⋮ — pure, so a screen's menu can be read in a
/// test without a DOM.
///
/// `moveTargets` is a list of groups (`{label, options: [{value, label}]}`),
/// which is what puts the space's own folders under one subtitle and the
/// other notepads under theirs. Empty means no "Move to" row at all rather
/// than a row that opens onto nothing.
export function noteCardMenu({
  entry,
  actions,
  space,
  canPin = true,
  moveTargets = [],
  /// A notebook open for reading offers OPENING and nothing else. It is the
  /// one row that is not a write, which is why it is above this line and not
  /// below it.
  readOnly = false,
  /// `() => void`, or null. The ⋮ of a board does not carry it — a card there
  /// is already a click away from opening — while the right button does, on
  /// both screens.
  openInNewTab = null,
}) {
  const rows = [];

  if (openInNewTab) rows.push({ label: S.openInNewTabItem, run: openInNewTab });
  if (readOnly) return rows;
  if (canPin) {
    rows.push({
      label: entry.pinned ? S.unpin : S.pin,
      run: () => actions.pin(space, entry),
    });
  }
  if (moveTargets.length) {
    rows.push({
      label: S.moveTo,
      items: moveTargets.flatMap((group) =>
        group.options.map((option) => ({
          label: option.label,
          context: group.label,
          run: () => actions.moveTo(space, entry, option.value),
        })),
      ),
    });
  }
  rows.push({ label: S.duplicateNote, run: () => actions.duplicate(space, entry) });
  rows.push({ label: S.deleteNote, run: () => actions.remove(space, entry) });
  return rows;
}
