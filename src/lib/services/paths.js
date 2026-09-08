import { S } from "./strings.js";

// A list is addressed by its root-relative path (`jott.tasks/Compras.md`).
// The address is what every command takes; the name is what the user reads,
// and this is the one place that goes from one to the other. It does NOT
// answer "which space is this?": the core sends the space's display name with
// every address (`ListEntry.space`); deriving it from the path shows the folder.

/// Display name of a list address: `Tasks/Compras.md` → `Compras`.
export function listName(path) {
  return leafOf(path).replace(/\.md$/, "");
}

/// What HOLDS an address — everything above the last segment.
/// `Design/Tasks/task-list.md` → `Design/Tasks`, `Tasks` → `""`. The space of
/// a file is its folder, never the first segment (that is a group).
export function folderOf(path) {
  const cut = (path ?? "").lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut);
}

/// The last segment of an address. Extension kept: what a FILE is called is
/// `listName`'s question.
export function leafOf(path) {
  const value = path ?? "";
  return value.slice(value.lastIndexOf("/") + 1);
}

/// The extension a file name is asked by — `FOTO.PNG` → `png`, `""` when
/// there is none. Lowercased, so two spellings are one question.
export function extensionOf(name) {
  const leaf = leafOf(name);
  const dot = leaf.lastIndexOf(".");
  return dot < 0 ? "" : leaf.slice(dot + 1).toLowerCase();
}

/// The file name every tasks space's single list carries (core's
/// `MAIN_LIST`). The same in all of them, so it says nothing about WHICH
/// list this is and never belongs on screen.
export const MAIN_LIST = "task-list";

/// What the user reads where a list's own name is shown: the card's "which
/// list", the composer's chip, the inspector's footer. The main list is
/// **Inbox** — `task-list` is a file name, never meant to be read; a
/// hand-made second list keeps its own name, the only case the stem informs.
export function listTitle(path) {
  const stem = listName(path);
  return stem === MAIN_LIST ? S.mainList : stem;
}

/// How a list is named in a picker: the READABLE ADDRESS of the space it
/// lives in — `Design/Tasks`, or just `Mercado` when the space is loose. The
/// stem is appended only for an extra hand-made list, the one case it tells
/// two lists apart.
export function listLabel(entry) {
  const where = entry?.space ?? "";
  const stem = entry?.name ?? listName(entry?.path);
  // Loose enough to have no space at all (a hand-made address): then the
  // stem is all there is, and it is READ, so it goes through listTitle.
  if (!where) return listTitle(entry?.path ?? stem);
  return stem === MAIN_LIST ? where : `${where}/${stem}`;
}

/// The same label, split for the places that draw the two halves in different
/// greys (the suggestions headings, the composer's chip): `name` is the last
/// segment — the list you are looking at — and `context` is everything above
/// it, the groups it sits in.
export function splitLabel(entry) {
  const full = listLabel(entry);
  const cut = full.lastIndexOf("/");
  return cut < 0
    ? { context: "", name: full }
    : { context: full.slice(0, cut), name: full.slice(cut + 1) };
}

/// The two addresses a tasks space owns: its single list (the only `.md`
/// directly in the folder that is not the Completed one) and the Completed
/// file beside it. Read from the lists the snapshot carries, never fetched;
/// a source whose folder is missing answers two nulls and the screen warns.
export function taskSpacePaths(source, lists = [], completedName = "completed") {
  const folder = source?.folder;
  if (!folder) return { list: null, completed: null };
  const prefix = `${folder}/`;
  const list =
    lists.find(
      (entry) =>
        entry.path.startsWith(prefix) &&
        !entry.path.slice(prefix.length).includes("/") &&
        entry.name !== completedName,
    )?.path ?? null;
  return { list, completed: `${folder}/${completedName}.md` };
}
