import { S } from "./strings.js";

// Since phase 7 a list is addressed by its root-relative path
// (`jott.tasks/Compras.md`). The address is what every command takes; the
// name is what the user reads. This is the one place that knows how to go
// from one to the other.
//
// It deliberately does NOT answer "which space is this?" any more: the
// core sends the space's display name with every address it hands out
// (`ListEntry.space`). Deriving it from the path here put the folder on
// screen the moment the fixed spaces were filed as `jott.*`.

/// Display name of a list address: `Tasks/Compras.md` → `Compras`.
export function listName(path) {
  return (path ?? "").split("/").pop().replace(/\.md$/, "");
}

/// What HOLDS an address — everything above the last segment.
/// `Design/Tasks/task-list.md` → `Design/Tasks`, `Tasks` → `""`.
///
/// The space of a file is its folder, never the first segment: taking the
/// first answered "Design", which is a group (the bug of 2026-08-13). Five
/// callers were slicing at `lastIndexOf("/")` by hand, each with its own
/// answer for an address that has no slash at all.
export function folderOf(path) {
  const cut = (path ?? "").lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut);
}

/// The file name every tasks space's single list carries (core's
/// `MAIN_LIST`). Since 2026-08-13 it is the same in all of them, so it says
/// nothing about WHICH list this is and never belongs on screen.
export const MAIN_LIST = "task-list";

/// What the user reads where a list's own name is shown: the card's "which
/// list", the composer's destination chip, the inspector's footer.
///
/// The main list is called **Inbox** (user call, 2026-08-13). `task-list` is a
/// file name — hyphenated, lowercase, the same in every space — and it was
/// never meant to be read. "Inbox" is what the thing IS: where a task lands
/// when nothing more specific was said. A hand-made second list keeps its own
/// name, which is the only case the stem carries information.
export function listTitle(path) {
  const stem = listName(path);
  return stem === MAIN_LIST ? S.mainList : stem;
}

/// How a list is named in a picker: the READABLE ADDRESS of the space it
/// lives in — `Design/Tasks`, or just `Mercado` when the space is loose.
///
/// The stem used to be appended to it, which is how the picker came to say
/// "Tasks/Work" for a space the user had renamed to Tasks: the file kept
/// the old name, and the label showed both halves of the disagreement. A tasks
/// space is ONE list whose file name is now fixed, so the stem carries no
/// information — unless the folder holds an extra hand-made list, and then it
/// is the only thing telling them apart.
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

/// The two addresses a tasks space owns: its single list and the
/// Completed file beside it (spec 3.5 — a tasks space is ONE list, whose
/// file is the only `.md` directly in the folder that is not the Completed
/// one).
///
/// Read from the lists the snapshot already carries, never fetched. A source
/// whose folder is missing answers with two nulls, and the screen draws its
/// warning instead of a broken list.
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
