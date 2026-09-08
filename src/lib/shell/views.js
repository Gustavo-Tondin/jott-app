// What a VIEW is, with no Svelte around it: the plain object the app
// navigates with (`{kind: "list", list}`, `{kind: "note", folder, path}`,
// `{kind: "space", sp}`). `tabs.js` holds them; this answers the shell's
// questions about one — its title, its space, whether it is still somewhere
// the app goes, and which view a remembered screen id means.

import { S } from "../services/strings.js";
import { folderOf, listName, listTitle } from "../services/paths.js";

/// The view a remembered screen id means, or null when it means nothing here.
/// The inverse of `tabs.viewId` — keep the two in step.
export function viewFromId(id) {
  if (!id) return null;
  // Ids of screens that no longer exist (`day`, `week`) mean the Home.
  if (id === "day" || id === "week") return { kind: "home" };
  if (id.startsWith("list:")) return { kind: "list", list: id.slice(5) };
  if (id.startsWith("sp:")) return { kind: "space", sp: id.slice(3) };
  if (["home", "completed", "notes", "tasks", "settings", "assets", "timeline"].includes(id)) {
    return { kind: id };
  }
  return null;
}

/// Is this view still somewhere the app goes? A part switched off takes its
/// screens with it, and a tab left pointing at one shows the landing screen —
/// the tab itself stays. `layout` places the fixed spaces: a hidden fixed
/// space takes its screens; a user space's files stay reachable regardless.
export function reachable(view, f = () => true, layout = null) {
  switch (view?.kind) {
    case "home":
      return f("homeSpace");
    case "tasks":
    case "completed":
      return f("tasks") && f("tasksSpace");
    case "list": {
      if (!f("tasks")) return false;
      const home = layout?.tasksFolder;
      if (!home || folderOf(view.list) !== home) return true;
      return f("tasksSpace");
    }
    case "notes":
      return f("notes") && f("notesSpace");
    case "note": {
      if (!f("notes")) return false;
      const home = layout?.notesFolder;
      if (!home || view.folder !== home) return true;
      return f("notesSpace");
    }
    case "tags":
      return f("taskTags");
    // The image library exists to feed notes — banners and pictures inside
    // them. With notes switched off there is nothing to feed, and the
    // hamburger stops offering it (shell/Sidebar.svelte).
    case "assets":
      return f("notes");
    case "timeline":
      return f("timeline");
    default:
      return true;
  }
}

/// Where the app lands when a view is not somewhere it goes any more: Home,
/// unless hidden — then the first fixed screen standing, and Home regardless
/// when none is, because a notebook with every door closed still opens.
export function landing(f = () => true) {
  if (f("homeSpace")) return { kind: "home" };
  if (f("tasks") && f("tasksSpace")) return { kind: "tasks" };
  if (f("notes") && f("notesSpace")) return { kind: "notes" };
  return { kind: "home" };
}

/// What a view calls itself. Derived, never stored, so a rename reaches the
/// tab. A space is looked up in `spaces`: the DISPLAY name travels with the
/// notebook (the fixed three are filed as `jott.*`), never derived from a path.
export function titleOf(view, spaces = []) {
  switch (view?.kind) {
    case "home":
      return S.home;
    case "tasks":
      return S.tasks;
    case "notes":
      return S.notes;
    case "settings":
      return S.settings;
    case "completed":
      return S.completed;
    case "tags":
      return S.tagsManagement;
    case "trash":
      return S.trash;
    case "assets":
      return S.assetsTitle;
    case "timeline":
      return S.timeline;
    case "list":
      return listTitle(view.list);
    case "note":
      return listName(view.path);
    case "space":
      return spaces.find((sp) => sp.path === view.sp)?.name ?? view.sp;
    default:
      return S.untitled;
  }
}

/// The space a view lives in, as a root-relative path — null on a screen
/// inside none. It is everything ABOVE the file (`Design/Tasks`, not the group
/// `Design`). `layout` places the three fixed screens, which have no `sp`.
export function spaceOfView(view, layout = {}) {
  switch (view?.kind) {
    case "space":
      return view.sp;
    case "list":
      return folderOf(view.list);
    case "note":
      return view.folder;
    case "tasks":
    case "completed":
      return layout.tasksFolder ?? null;
    case "notes":
      return layout.notesFolder ?? null;
    default:
      return null;
  }
}
