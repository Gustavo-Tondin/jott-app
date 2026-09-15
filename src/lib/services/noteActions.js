// The actions a note CARD offers wherever it is drawn (board, notes space,
// Home). Same split as `taskActions.js`: the doing is bound to a screen's
// `act` (services/act.js) so a failure lands in that screen's error line;
// the menu ROWS are a pure function, testable without rendering.

import { api } from "./api.js";
import { ACCENTS, accentFill } from "./accent.js";
import { isImage } from "./assets.js";
import { askConfirm, askName, DELETING } from "./dialog.js";
import { S } from "./strings.js";

/// The banner as the shell holds it — `{kind: "color" | "image", value}` —
/// from the VALUE the file carries, or null. Same rule as the core's
/// `Banner::from_value`: an image extension is an image, else a colour name.
export function bannerOf(value) {
  if (!value) return null;
  return { kind: isImage(value) ? "image" : "color", value };
}

/// A note's banner, as one row with the eight colours folded under it — the
/// open note's and a card's. The palette is words here (with the fill each
/// paints with as a dot) and swatches in the title's popover; the VALUE is the
/// same name either door, which is what keeps the file readable by hand. No
/// `pickImage`, no image row: nothing could answer it.
export function bannerMenuOf({ banner, setBanner, pickImage = null }) {
  return {
    label: S.banner,
    items: [
      ...ACCENTS.map((name) => ({
        label: S.colorName(name),
        checked: banner?.value === name,
        swatch: accentFill(name),
        run: () => setBanner(name),
      })),
      ...(pickImage ? [{ label: S.bannerImage, run: pickImage }] : []),
      ...(banner ? [{ label: S.removeBanner, run: () => setBanner(null) }] : []),
    ],
  };
}

/// The card actions, bound to a screen's `act`. Every one takes the SPACE
/// the note lives in: a note's address is relative to it, and the Home looks
/// into spaces it does not belong to.
export function noteActions(act) {
  return {
    pin: (space, entry) => act(() => api.setNotePinned(space, entry.path, !entry.pinned)),

    /// A note is titled by its FILE, so renaming one moves it: the screen
    /// reloads on the change and the card comes back at its new address.
    rename: (space, entry) =>
      act(async () => {
        const next = await askName(S.promptRenameNote(entry.title), entry.title);
        if (!next || next.trim() === entry.title) return;
        await api.renameNote(space, entry.path, next.trim());
      }),

    /// The same move with the name ALREADY typed — the note's head panel asks
    /// for it in a field of its own (components/NoteHeadPanel.svelte).
    renameTo: (space, entry, name) =>
      act(async () => {
        const next = (name ?? "").trim();
        if (!next || next === entry.title) return;
        await api.renameNote(space, entry.path, next);
      }),

    duplicate: (space, entry) => act(() => api.duplicateNote(space, entry.path)),

    /// A colour name, an asset address, or null to take the banner off.
    banner: (space, entry, value) => act(() => api.setNoteBanner(space, entry.path, value)),

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

/// THE FIVE SLICES A NOTE CARD'S RING CARRIES (components/ActionRing.svelte),
/// the same five as a task's and in the same order (`taskRing`): Pin · Move ·
/// Edit · Reorder · ⋮. Pure, like the menu below it, and the same pact: each
/// slice INVERTS with the state of the card (a pinned note reads "Unpin" in
/// the same place), and the last is always the ⋮ with what did not fit.
///
/// "Edit" is not the old rename prompt: it opens the note's HEAD — its name
/// and its banner, the panel the open note's title carries
/// (components/NoteHeadPanel.svelte) — over the card, with the note closed.
/// "Reorder" turns the board over to picking: on it a note is only ever
/// carried there, a click marks, and the bulk bar moves or deletes the marked.
export function noteRing({
  pinned = false,
  /// Each is `(from, at) => void`; a null one leaves its slice out.
  onPin = null,
  onMove = null,
  onEdit = null,
  onReorder = null,
  onMore = null,
} = {}) {
  const slices = [];
  if (onPin)
    slices.push({
      id: "pin",
      icon: pinned ? "bookmark-simple-fill" : "bookmark-simple",
      label: pinned ? S.ringUnpin : S.ringPin,
      run: onPin,
    });
  if (onMove) slices.push({ id: "move", icon: "arrow-right", label: S.ringMove, run: onMove });
  if (onEdit) slices.push({ id: "edit", icon: "pencil", label: S.ringEdit, run: onEdit });
  if (onReorder)
    slices.push({
      id: "reorder",
      icon: "arrows-out-cardinal",
      label: S.ringReorder,
      run: onReorder,
    });
  if (onMore) slices.push({ id: "more", icon: "dots-three", label: S.ringMore, run: onMore });
  return slices;
}

/// The rows of a "Move to": one per target, flat, each carrying its group's
/// name as `context` (`ContextMenu` draws it in grey). What the ⋮'s "Move to"
/// folds under one row and the ring's "Move" slice opens on its own.
export function noteMoveRows({ entry, actions, space, moveTargets = [] }) {
  return moveTargets.flatMap((group) =>
    group.options.map((option) => ({
      label: option.label,
      context: group.label,
      run: () => actions.moveTo(space, entry, option.value),
    })),
  );
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
  /// Whether the notebook draws banners (App Functions): off, no row.
  canBanner = false,
  /// `(done) => void` — opens the image picker and hands `done` the address.
  /// Null leaves the banner row to colours.
  pickImage = null,
  /// The ⋮ OF A RING (`noteRing`): the rows the four slices already carry
  /// (pin, move, the head) are left out, so the menu is what did not fit —
  /// duplicating and deleting — rather than a second copy.
  beyondRing = false,
}) {
  const rows = [];

  if (openInNewTab) rows.push({ label: S.openInNewTabItem, run: openInNewTab });
  if (readOnly) return rows;
  if (canPin && !beyondRing) {
    rows.push({
      label: entry.pinned ? S.unpin : S.pin,
      run: () => actions.pin(space, entry),
    });
  }
  if (moveTargets.length && !beyondRing) {
    rows.push({
      label: S.moveTo,
      items: noteMoveRows({ entry, actions, space, moveTargets }),
    });
  }
  // The banner is the "Edit" slice's other half, so a ring's ⋮ leaves it out.
  if (canBanner && !beyondRing) {
    const setBanner = (value) => actions.banner(space, entry, value);
    rows.push(
      bannerMenuOf({
        banner: entry.banner ?? null,
        setBanner,
        pickImage: pickImage ? () => pickImage(setBanner) : null,
      }),
    );
  }
  if (!beyondRing) rows.push({ label: S.renameNote, run: () => actions.rename(space, entry) });
  rows.push({ label: S.duplicateNote, run: () => actions.duplicate(space, entry) });
  rows.push({ label: S.deleteNote, run: () => actions.remove(space, entry) });
  return rows;
}
