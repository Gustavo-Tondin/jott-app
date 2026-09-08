// What the shell writes to the notebook on the user's behalf: spaces and
// groups (made, renamed, coloured, moved, deleted), lists, and a space's
// arrangement. Every write goes through the shell's `change` so it is one
// recorded action with one refresh; nothing here reads state of its own.
import { api } from "../services/api.js";
import { askConfirm, askName, DELETING } from "../services/dialog.js";
import { folderOf, listName, listTitle } from "../services/paths.js";
import { S } from "../services/strings.js";

/// The two containers with a name, a colour and a place in the tree. Each
/// pair of writes differs only in the command it calls and the words it asks
/// with, so one table says both and `crudFor` reads it.
const CONTAINERS = {
  space: {
    promptRename: (current) => S.promptRenameSpace(current),
    confirmDelete: (name) => S.confirmDeleteSpace(name),
    rename: api.renameSpace,
    setAppearance: api.setSpaceAppearance,
    remove: api.deleteSpace,
    move: api.moveSpace,
  },
  group: {
    promptRename: () => S.renameGroup,
    confirmDelete: (name) => S.confirmDeleteGroup(name),
    rename: api.renameGroup,
    setAppearance: api.setGroupAppearance,
    remove: api.deleteGroup,
    move: api.moveGroup,
  },
};

/// - `change(run, then)` — the shell's recorded action (`services/act.js`).
/// - `view()` — what the active tab shows; `goTo` / `openTab` /
///   `replaceTabView(from, to)` — where it goes after a write.
/// - `reload()` — redraws the open screen; `inbox()` — the Inbox's address;
///   `setError(text)` — the shell's banner, for what a delete rescued.
export function makeNotebookWrites({
  change,
  view,
  goTo,
  openTab,
  replaceTabView,
  reload,
  inbox,
  setError,
}) {
  /// The writes a space and a group share. `onDeleted(folder)` runs after
  /// the delete, for the caller that has to look away from what is gone.
  function crudFor(kind, { onDeleted } = {}) {
    const c = CONTAINERS[kind];
    return {
      rename: async (folder, current) => {
        const to = await askName(c.promptRename(current), current);
        if (to == null) return;
        change(() => c.rename(folder, to.trim()));
      },
      setAppearance: (folder, color, icon) =>
        change(() => c.setAppearance(folder, color ?? null, icon ?? null)),
      remove: async (folder, name) => {
        if (!(await askConfirm(c.confirmDelete(name), DELETING))) return;
        change(
          () => c.remove(folder),
          () => onDeleted?.(folder),
        );
      },
      /// Moved into a group, or back out of one (`null`).
      move: (name, intoGroup) => change(() => c.move(name, intoGroup)),
    };
  }

  const space = crudFor("space", {
    // If we were looking at it, it is gone — go Home.
    onDeleted: (folder) => {
      const v = view();
      if (v.kind === "space" && v.sp === folder) goTo({ kind: "home" });
    },
  });
  // The group is where the colour is chosen; a space inside one follows it.
  const group = crudFor("group");

  // A space has one function, chosen at creation (spec 3.5): the caller
  // says whether it is a list (tasks) or a notepad (notes), and — since
  // groups nest — which group it is being made inside.
  async function createSpace(kind = "tasks", group = null) {
    const name = await askName(
      kind === "notes" ? S.promptNewNotepad : S.promptNewList,
      "",
      { confirm: S.create },
    );
    if (!name?.trim()) return;
    change(
      () => api.createSpaceIn(name.trim(), kind, group),
      (folder) => openTab({ kind: "space", sp: folder }),
    );
  }

  async function createGroup(group = null) {
    const name = await askName(S.nameGroup, "", { confirm: S.create });
    if (!name) return;
    change(() => api.createGroup(name, group));
  }

  // A space's arrangement lives in its own .space.json. The refresh
  // brings the new sort/order back through the snapshot, which is what
  // re-arranges the cards on screen. `folder()` is asked at each call, never
  // read once: the space a screen shows is reactive, and the two writers are
  // handed down as props when the shell is built.
  const arrangementOf = (folder) => ({
    setSort: (sort) => {
      const at = folder();
      return at && change(() => api.setSpaceSort(at, sort));
    },
    setOrder: (order) => {
      const at = folder();
      return at && change(() => api.setSpaceOrder(at, order));
    },
    setNoteLayout: (layout) => {
      const at = folder();
      return at && change(() => api.setSpaceNoteLayout(at, layout));
    },
  });

  async function renameCurrentList() {
    const v = view();
    if (v.kind !== "list") return;
    const from = v.list;
    const current = listName(from);
    const to = await askName(S.promptRenameList(current), current);
    if (!to || to.trim() === current) return;
    change(
      () => api.renameList(from, to.trim()),
      () => {
        // A rename never changes the folder: swap only the file name, and let
        // the tab follow the file instead of pointing at a name that is gone.
        const next = { kind: "list", list: `${folderOf(from)}/${to.trim()}.md` };
        replaceTabView({ kind: "list", list: from }, next);
        reload();
      },
    );
  }

  async function deleteCurrentList() {
    const v = view();
    if (v.kind !== "list") return;
    const list = v.list;
    if (!(await askConfirm(S.confirmDeleteList(listTitle(list)), DELETING))) return;
    change(
      () => api.deleteList(list),
      (rescued) => {
        goTo({ kind: "list", list: inbox() });
        reload();
        if (rescued > 0) setError(S.tasksRescued(rescued, listTitle(list)));
      },
    );
  }

  return {
    createSpace,
    renameSpaceTo: space.rename,
    setSpaceAppearance: space.setAppearance,
    deleteSpaceAt: space.remove,
    moveSpaceTo: space.move,
    createGroup,
    renameGroupTo: group.rename,
    setGroupAppearanceAt: group.setAppearance,
    deleteGroupAt: group.remove,
    moveGroupTo: group.move,
    arrangementOf,
    renameCurrentList,
    deleteCurrentList,
  };
}
