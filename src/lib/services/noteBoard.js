// What the notes board shows at one place in the tree: the notes of this
// folder, and a card for each folder directly inside it. At the root the
// loose notes are the space's inbox — there is no folder for them.

import { folderOf, leafOf } from "./paths.js";

/// How many notes a folder card draws inside itself: two rows of two is
/// what fits the card's height without the mini cards becoming slivers.
export const GROUP_PREVIEW = 4;

/// The board at `current` (`""` or null = the space's root). `notes` as the
/// bridge lists them; `folders` deep, as `note_folders` gives them
/// (`{ path, color, pinned }`).
/// Returns `{ cards, groups, parent }`; a pinned folder card comes first.
export function board(notes = [], folders = [], current = "", { flat = false } = {}) {
  const here = current ?? "";

  // FLAT: note folders switched off. Every note is a card and no folder is,
  // wherever the notes live — "off" never means "hidden".
  if (flat) return { cards: notes, groups: [], parent: null };

  const groups = folders
    .filter((folder) => folderOf(folder.path) === here)
    .map((folder) => ({
      path: folder.path,
      name: leafOf(folder.path),
      color: folder.color ?? null,
      pinned: !!folder.pinned,
      /// The notes directly inside it, for the small cards.
      notes: notes.filter((note) => note.folder === folder.path).slice(0, GROUP_PREVIEW),
      /// Everything below it, however deep — the number on the card has to
      /// mean "notes in there", not "notes in the first level of there".
      count: notes.filter(
        (note) =>
          note.folder === folder.path || note.folder.startsWith(`${folder.path}/`),
      ).length,
    }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return {
    cards: notes.filter((note) => note.folder === here),
    groups,
    parent: here === "" ? null : folderOf(here),
  };
}
