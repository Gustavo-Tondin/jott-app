// What a VIEW is, on its own — with no Svelte around it.
//
// A view is the plain object the whole app navigates with (`{kind: "list",
// list}`, `{kind: "note", folder, path}`, `{kind: "space", sp}`). `tabs.js`
// holds them and knows their identity; this holds the four questions the shell
// asks ABOUT one:
//
//   • what does it call itself?      (the tab, the page header)
//   • which space is it inside?      (the tab's dot, the ⋮'s "find here")
//   • is it still somewhere the app goes, with this notebook's parts?
//   • which view does a remembered screen id mean?
//
// They lived in App.svelte, where each was a function nobody could test
// without mounting the whole shell — and the last one is the exact inverse of
// `viewId` in tabs.js, which does have tests.

import { S } from "../services/strings.js";
import { folderOf, listName, listTitle } from "../services/paths.js";

/// The view a remembered screen id means, or null when it means nothing here.
/// The inverse of `tabs.viewId` — keep the two in step.
export function viewFromId(id) {
  if (!id) return null;
  // Ids from before the day moved to the Home (2026-09-04) and, before
  // that, from before Today and This Week became tabs of the Tasks screen.
  // A session restored onto one used to fall through every screen branch to
  // the Completed, which is the one place those ids never meant; the day is
  // the Home's now, and the week is any day on its calendar.
  if (id === "day" || id === "week") return { kind: "home" };
  if (id.startsWith("list:")) return { kind: "list", list: id.slice(5) };
  if (id.startsWith("sp:")) return { kind: "space", sp: id.slice(3) };
  if (["home", "completed", "notes", "tasks", "settings", "assets", "timeline"].includes(id)) {
    return { kind: id };
  }
  return null;
}

/// Is this view still somewhere the app goes? A part switched off takes its
/// screens with it (App Functions, 2026-08-06), and a tab left pointing at one
/// — restored from the last session, or open when the switch flipped — shows
/// the landing screen rather than a dead panel. Nothing is closed behind the
/// user's back: the tab stays.
///
/// `layout` joined for the fixed spaces (2026-08-24): a hidden fixed space
/// takes its own screens with it, and only the layout knows whether a list or
/// a note lives in one — a user space's files stay reachable regardless.
///
/// Until 2026-09-04 the Home could host a fixed space whole
/// (`homeTasksSource`/`homeNotesSource`) and that kept the space's files
/// reachable with the space hidden; the Home is the day now, and a hidden
/// fixed space is simply hidden.
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

/// Where the app lands when a view is not somewhere it goes any more. Home,
/// unless Home itself is hidden (Fixed spaces, 2026-08-24) — then the first
/// fixed screen still standing, and Home regardless when none is: the app has
/// to land somewhere, and a notebook with every door closed still opens.
export function landing(f = () => true) {
  if (f("homeSpace")) return { kind: "home" };
  if (f("tasks") && f("tasksSpace")) return { kind: "tasks" };
  if (f("notes") && f("notesSpace")) return { kind: "notes" };
  return { kind: "home" };
}

/// What a view calls itself. Derived, never stored: renaming a list has to
/// reach the tab showing it.
///
/// A space is looked up by its path in `spaces`, because the DISPLAY name
/// travels with the notebook — the fixed three are filed as `jott.*` and read
/// as Home, Tasks and Notes, and deriving a name from a path put the folder on
/// screen the moment those were renamed (2026-08-13).
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

/// The space a view lives in, as a root-relative path — null on a screen that
/// is inside none (Home, Settings, the Trash).
///
/// The space of a file address is everything ABOVE the file, not the first
/// segment: `Design/Tasks/task-list.md` lives in `Design/Tasks`, and taking
/// the first answered "Design" — a group, which owns no colour (2026-08-13).
///
/// `layout` is what places the three fixed screens, which have no `sp` of
/// their own; without it, only the views that name a space answer.
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
