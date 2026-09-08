// Whether a note is still called what the APP called it. A note is titled by
// its file (`core/notefolder.rs`), so "untitled" is not a state on disk: it is
// the default name, and the " 2" a second one is filed under
// (`fsio::free_name`). A card drops the title rather than repeating "New note"
// down a column (components/NoteCard.svelte).

import { S } from "./strings.js";

/// True for the name the app gives a note nobody has named, numbered or not.
export function isUntitled(title) {
  const name = String(title ?? "").trim();
  if (!name || name === S.newNoteTitle) return true;
  const numbered = name.startsWith(`${S.newNoteTitle} `)
    ? name.slice(S.newNoteTitle.length + 1)
    : null;
  return numbered !== null && /^\d+$/.test(numbered);
}
