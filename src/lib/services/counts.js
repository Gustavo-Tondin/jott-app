// How many open tasks a PLACE holds. The bridge counts by LIST
// (`{"jott.tasks/Inbox.md": 3, …}`, Completed left out — `core/folder.rs`);
// a sidebar row is a space, which is several lists. Off is EMPTY, not absent:
// with the counter switched off the bridge answers `{}` (`commands::counts_of`),
// so everything here returns 0 and no caller knows the preference exists.

import { folderOf } from "./paths.js";

/// The open tasks of the lists that sit DIRECTLY in `folder` — directly,
/// because a space's path is the prefix of a space nested below it, and
/// `Design/Tasks` counting `Design/Tasks Old` is a number nobody can explain.
/// A list lives in its space's folder, so the folder of the address IS the space.
export function openIn(counts, folder) {
  if (!counts || folder == null) return 0;
  let total = 0;
  for (const [path, count] of Object.entries(counts)) {
    if (folderOf(path) === folder) total += count ?? 0;
  }
  return total;
}
