// How many open tasks a PLACE holds.
//
// The bridge counts by LIST — `{"jott.tasks/Inbox.md": 3, …}`, the Completed
// left out and only unfinished tasks counted (`core/folder.rs`). The sidebar
// asks a different question: a row there is a *space*, and a space is several
// lists. Adding them up is a one-liner that was about to be written twice (the
// fixed Tasks row and every tasks space row), which is exactly when it becomes
// a function with a test.
//
// Off is EMPTY, not absent: with the counter switched off the bridge answers
// `{}` (`commands::counts_of`), so everything here quietly returns 0 and no
// caller needs to know the preference exists.

import { folderOf } from "./paths.js";

/// The open tasks of the lists that sit DIRECTLY in `folder`.
///
/// Directly, and that is the whole subtlety: a space's own path is the prefix
/// of a space nested below it, and `Design/Tasks` counting `Design/Tasks Old`
/// would be a number nobody can explain. A list lives in its space's folder,
/// so the folder of the address IS the space.
export function openIn(counts, folder) {
  if (!counts || folder == null) return 0;
  let total = 0;
  for (const [path, count] of Object.entries(counts)) {
    if (folderOf(path) === folder) total += count ?? 0;
  }
  return total;
}
