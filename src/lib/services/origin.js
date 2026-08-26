// Where an item came from — the badge a card wears OUTSIDE its space.
//
// The colour grammar (2026-08-26): a task or a note has ONE colour, the
// colour of the space it lives in (a group's, when the space is inside one —
// `spaceColors.js`). Inside that space the colour is on the sidebar and the
// title and saying it again on every card would be noise; outside it — the
// Home, a search hit, a suggestion, the Completed list, the Timeline — the
// card is the only thing that can say where it belongs, and it says so with
// a badge: the space's readable name, in the space's colour.
//
// The NAME comes from the core, never from the path (`ListEntry.space`,
// `SearchHit.space`, `Suggestion.space` — the fixed `jott.tasks` folder reads
// "Tasks"). Where the core did not send it (a completed task carries only its
// address), it is looked up in the lists the snapshot already holds; an
// address nothing answers for gets no badge rather than a folder name on
// screen.

import { folderOf, listLabel, MAIN_LIST, listName } from "./paths.js";

/// `{label, color}` for the badge, or `null` when there is nothing to say:
/// the item is inside `here` (its own space), or no name is known for it.
///
/// `item` is any of the shapes the screens hold: a card `{list, task}`, a
/// search hit `{path, folder, kind, space}`, a suggestion or a completed
/// entry `{path, space?}`. `lists` are the snapshot's `notebook.lists`,
/// `spaces` its `notebook.spaces`, `colors` the map `spaceColors()` built.
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
    if (stem && stem !== MAIN_LIST && stem !== "completed") {
      label = listLabel({ space: label, name: stem, path: address });
    }
  }
  return { label, color: colors[space] ?? null };
}
