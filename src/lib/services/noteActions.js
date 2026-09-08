// The actions a note CARD offers wherever it is drawn (board, notes space,
// Home). Same split as `taskActions.js`: the doing is bound to a screen's
// `act` (services/act.js) so a failure lands in that screen's error line;
// the menu ROWS are a pure function, testable without rendering.

import { api } from "./api.js";
import { isImage } from "./assets.js";
import { askConfirm, DELETING } from "./dialog.js";
import { S } from "./strings.js";

/// The banner as the shell holds it — `{kind: "color" | "image", value}` —
/// from the VALUE the file carries, or null. Same rule as the core's
/// `Banner::from_value`: an image extension is an image, else a colour name.
export function bannerOf(value) {
  if (!value) return null;
  return { kind: isImage(value) ? "image" : "color", value };
}

/// The card actions, bound to a screen's `act`. Every one takes the SPACE
/// the note lives in: a note's address is relative to it, and the Home looks
/// into spaces it does not belong to.
export function noteActions(act) {
  return {
    pin: (space, entry) => act(() => api.setNotePinned(space, entry.path, !entry.pinned)),

    duplicate: (space, entry) => act(() => api.duplicateNote(space, entry.path)),

    /// To the trash, never destroyed — which is why `confirmDeletes` may be off.
    remove: (space, entry) =>
      act(async () => {
        if (!(await askConfirm(S.confirmDeleteNote(entry.title), DELETING))) return;
        await api.deleteNote(space, entry.path);
      }),

    /// `where` is what the picker's rows carry: `["space", "folder"]` as JSON,
    /// because a menu row holds one value.
    moveTo: (space, entry, where) =>
      act(async () => {
        const [target, into] = JSON.parse(where);
        await api.moveNoteToSpace(space, entry.path, target, into);
      }),
  };
}

/// The rows of a note card's ⋮ — pure, so a menu can be read in a test.
/// `moveTargets` is a list of groups (`{label, options: [{value, label}]}`);
/// empty means no "Move to" row at all.
export function noteCardMenu({
  entry,
  actions,
  space,
  canPin = true,
  moveTargets = [],
  /// A read-only notebook offers OPENING and nothing else — the one row
  /// that is not a write, hence above this line.
  readOnly = false,
  /// `() => void`, or null: a board's ⋮ does not carry it (the card is a
  /// click from opening); the right button does.
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
