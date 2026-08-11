// Since phase 7 a list is addressed by its root-relative path
// (`jott.tasks/Compras.md`). The address is what every command takes; the
// name is what the user reads. This is the one place that knows how to go
// from one to the other.
//
// It deliberately does NOT answer "which workspace is this?" any more: the
// core sends the workspace's display name with every address it hands out
// (`ListEntry.workspace`). Deriving it from the path here put the folder on
// screen the moment the fixed workspaces were filed as `jott.*`.

/// Display name of a list address: `Tasks/Compras.md` → `Compras`.
export function listName(path) {
  return (path ?? "").split("/").pop().replace(/\.md$/, "");
}

/// The two addresses a tasks workspace owns: its single list and the
/// Completed file beside it (spec 3.5 — a tasks workspace is ONE list, whose
/// file is the only `.md` directly in the folder that is not the Completed
/// one).
///
/// Read from the lists the snapshot already carries, never fetched. A source
/// whose folder is missing answers with two nulls, and the screen draws its
/// warning instead of a broken list.
export function taskWidgetPaths(widget, lists = [], completedName = "Completed") {
  const folder = widget?.folder;
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
