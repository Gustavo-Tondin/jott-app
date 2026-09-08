// Where an item came from — the badge a card wears OUTSIDE its space. An
// item has ONE colour, its space's (`spaceColors.js`); inside the space it
// is on the sidebar and the title, outside it (Home, search, Completed,
// Timeline) the badge says it: the space's readable NAME, from the core,
// never from the path. An address nothing answers for gets no badge.

import { folderOf, listLabel, MAIN_LIST, listName } from "./paths.js";

/// `{label, color}` for the badge, or `null`: the item is inside `here`, or
/// no name is known. `item` is any shape the screens hold (`{list, task}`, a
/// search hit, a suggestion, a completed entry with only an address — then
/// the name is looked up in `lists`/`spaces`); `colors` is `spaceColors()`'s.
export function originOf(item, { lists = [], spaces = [], colors = {}, here = null } = {}) {
  if (!item) return null;
  const address = item.list ?? item.path ?? null;
  const space = item.kind === "note" ? (item.folder ?? null) : address ? folderOf(address) : null;
  if (!space || space === here) return null;

  const entry = address ? lists.find((l) => l.path === address) : null;
  let label = item.space || entry?.space || null;
  if (!label) {
    const sibling = lists.find((l) => folderOf(l.path) === space);
    label = sibling?.space ?? spaces.find((sp) => sp.path === space)?.name ?? null;
  }
  if (!label) return null;

  // A hand-made list beside the Inbox is the one case where the file name
  // tells lists apart — the same rule listLabel() keeps for the picker.
  if (address && item.kind !== "note") {
    const stem = entry?.name ?? listName(address);
    if (stem && stem !== MAIN_LIST && stem.toLowerCase() !== "completed") {
      label = listLabel({ space: label, name: stem, path: address });
    }
  }
  return { label, color: colors[space] ?? null };
}
