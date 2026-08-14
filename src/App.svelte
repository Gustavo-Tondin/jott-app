<script>
  // The shell: three panels, document tabs, and the router that decides which
  // screen a tab is showing.
  //
  // Phase 8.5 put the pieces where the wireframe puts them. What this file
  // owns is arrangement and navigation; every screen below it owns its own
  // data, and every rule about tabs lives in `tabs.js`. Design comes in
  // phase 10, on top of a token layer that does not exist yet — so the CSS
  // here is still structural on purpose.
  import { listen } from "@tauri-apps/api/event";
  import { slide } from "svelte/transition";
  import { api, describeError } from "./lib/services/api.js";
  import { askName, askTask } from "./lib/services/dialog.js";
  import { composeTask } from "./lib/services/taskCompose.js";
  import { shortcutFor } from "./lib/services/shortcuts.js";
  import NameDialog from "./lib/components/NameDialog.svelte";
  import ListView from "./lib/screens/ListView.svelte";
  import TasksView from "./lib/screens/TasksView.svelte";
  import CompletedView from "./lib/screens/CompletedView.svelte";
  import TagsView from "./lib/screens/TagsView.svelte";
  import TrashView from "./lib/screens/TrashView.svelte";
  import TaskInspector from "./lib/components/TaskInspector.svelte";
  import SuggestionsPane from "./lib/components/SuggestionsPane.svelte";
  import NewTaskDialog from "./lib/components/NewTaskDialog.svelte";
  import SearchDialog from "./lib/components/SearchDialog.svelte";
  import WorkspaceView from "./lib/screens/WorkspaceView.svelte";
  import NotesWidget from "./lib/widgets/NotesWidget.svelte";
  import NoteEditor from "./lib/components/NoteEditor.svelte";
  import HomeView from "./lib/screens/HomeView.svelte";
  import SettingsView from "./lib/screens/SettingsView.svelte";
  import TabBar from "./lib/shell/TabBar.svelte";
  import TitleBar from "./lib/shell/TitleBar.svelte";
  import { buttonLayout } from "./lib/shell/windowButtons.js";
  import ResizeHandles from "./lib/shell/ResizeHandles.svelte";
  import Sidebar from "./lib/shell/Sidebar.svelte";
  import PageHeader from "./lib/shell/PageHeader.svelte";
  import { listName, listTitle } from "./lib/services/paths.js";
  import { formatDate } from "./lib/services/dates.js";
  import { workspaceColors } from "./lib/services/workspaceColors.js";
  import { tagColors as tagColorMap } from "./lib/services/accent.js";
  import { themeAttribute } from "./lib/services/themes.js";
  import { reader } from "./lib/services/features.js";
  import { S } from "./lib/services/strings.js";
  import * as Tabs from "./lib/shell/tabs.js";
  import { watchWindowState, toggleFullscreen } from "./lib/shell/windowState.js";

  let notebook = $state(null);
  let clock = $state(null);
  let error = $state(null);
  let busy = $state(true);
  /// Bumped to tell the open screen to re-read from disk.
  let reloadKey = $state(0);
  let counts = $state({});
  let conflicts = $state([]);
  let workspaces = $state([]);
  let groups = $state([]);
  let tags = $state([]);
  // Name → the CSS value its pill is painted with, from the tag catalogue: the
  // map every screen hands to TaskRow so a card pill shows the tag's chosen
  // colour, not the default (services/accent.js).
  let tagColors = $derived(tagColorMap(tags));
  let noteFolders = $state([]);
  /// What is pulled into the Day, as `"<list>#<id>"` — the set every card asks
  /// "am I in today?". It rides along with the snapshot rather than being
  /// fetched per screen (2026-08-06).
  let dayRefs = $state(new Set());
  /// How the sidebar arranges workspaces — "" (dragged) or "name".
  let workspacesSort = $state("");
  /// The task open in the right-hand panel, as `{ list, task }`.
  let selected = $state(null);
  /// Left sidebar collapsed to an icon rail. Local to the session (not a
  /// notebook setting — new config keys wait until they are really needed).
  let railed = $state(false);
  /// Which window buttons the desktop wants, and where. Read once: there is no
  /// live signal for it, and the fallback is the standard set, so the worst
  /// case is a restart after changing the setting.
  let windowButtons = $state(buttonLayout(null));
  $effect(() => {
    api.windowButtonLayout().then(
      (layout) => (windowButtons = buttonLayout(layout)),
      () => {},
    );
  });
  /// What the open note reports about itself, for the page header and menu.
  let openNote = $state({ pinned: false, title: "" });

  // Tabs. The active tab's current view is what the centre panel shows.
  let tabs = $state([{ views: [{ kind: "home" }], at: 0 }]);
  let active = $state(0);
  let rawView = $derived(Tabs.currentView(tabs[active]) ?? { kind: "home" });

  /// Is this view still somewhere the app goes? A part switched off takes its
  /// screens with it, and a tab left pointing at one (restored from the last
  /// session, or open when the switch flipped) falls back to Home rather than
  /// showing a dead panel.
  function reachable(v) {
    switch (v?.kind) {
      case "tasks":
      case "list":
      case "completed":
        return f("tasks");
      case "period":
        return f(v.period === "week" ? "week" : "myDay");
      case "notes":
      case "note":
        return f("notes");
      case "tags":
        return f("taskTags");
      default:
        return true;
    }
  }

  // Nothing is closed behind the user's back: the tab stays, it just shows the
  // Home until the feature comes back.
  let view = $derived(reachable(rawView) ? rawView : { kind: "home" });

  /// Opens a view in its own tab (focusing it if already open).
  function openTab(next) {
    ({ tabs, active } = Tabs.open(tabs, active, next));
  }

  /// Navigates the active tab, replacing what it shows.
  function goTo(next) {
    ({ tabs, active } = Tabs.navigate(tabs, active, next));
  }

  /// Opens a fresh tab. Unlike following a link (which focuses an already-open
  /// document), the `+` is a deliberate "I want another tab" gesture, so it
  /// always appends — duplicates are the intent here, not an accident.
  function openNewTab() {
    tabs = [...tabs, { views: [{ kind: "home" }], at: 0 }];
    active = tabs.length - 1;
  }

  const closeTab = (i) => ({ tabs, active } = Tabs.close(tabs, active, i));
  const goBack = () => ({ tabs, active } = Tabs.back(tabs, active));
  const goForward = () => ({ tabs, active } = Tabs.forward(tabs, active));

  const isOpen = (v) => Tabs.viewId(view) === Tabs.viewId(v);

  // True while the window fills the screen (maximized or fullscreen): the
  // self-drawn frame (rounded corners + hairline) goes flush against the
  // screen edge instead of leaving dead rounded pixels.
  let flush = $state(false);
  $effect(() => watchWindowState((v) => (flush = v)));

  function onKeydown(event) {
    switch (shortcutFor(event)) {
      case "fullscreen":
        event.preventDefault();
        toggleFullscreen().catch(() => {});
        return;
      case "newTask":
        // Only where there is a notebook to write into: before that the app is
        // an onboarding screen, and a dialog over it would have nowhere to put
        // what the user typed.
        if (!notebook) return;
        event.preventDefault();
        quickTask();
        return;
      case "newNote":
        if (!notebook || !f("notes")) return;
        event.preventDefault();
        quickNote();
        return;
      case "search":
        if (!notebook) return;
        event.preventDefault();
        searching = true;
        return;
      case "dismiss":
        if (suggesting) {
          suggesting = null;
          return;
        }
        if (!selected) return;
        // The date picker catches Escape itself (capture phase) while its
        // calendar is open, so an Escape that reaches here means nothing else
        // is capturing it — closing the panel is the right response.
        selected = null;
        return;
      default:
    }
  }

  /// The search dialog is open over whatever screen is showing.
  let searching = $state(false);

  /// Goes to a task found by the search: its list opens, and the task itself
  /// opens in the panel — what was searched for is the task, not the list it
  /// happens to live in.
  ///
  /// A task with no id cannot be addressed (an id is handed out only when
  /// something needs to address it), so that one just opens its list. Same if
  /// the read fails: the list is already open, and the panel is the bonus.
  async function showFoundTask(path, id) {
    showList(path);
    if (!id) return;
    try {
      const found = (await api.listTasks(path))?.find((task) => task.id === id);
      if (found) select(path, found);
    } catch {
      // The list is open; that is the part that mattered.
    }
  }

  // ---- the two capture shortcuts (Ctrl+T / Ctrl+N) ----
  // They answer from any screen, which is why they live here and not in the
  // screen that happens to be open: the notebook's own Inbox is the one
  // destination that exists no matter what is on screen.

  const quickTask = async () => {
    try {
      const intent = await askTask({
        lists: moveTargets,
        defaultList: layout.inbox,
        dateFormat: layout.dateDisplayFormat,
        f,
      });
      if (!intent) return;
      await composeTask(intent);
      reload();
      await refreshNotebook();
    } catch (e) {
      fail(e);
    }
  };

  const quickNote = async () => {
    try {
      const title = await askName(S.promptNewNote, S.newNoteTitle, { confirm: S.create });
      if (!title) return;
      const path = await api.createNote(layout.notesFolder, layout.notesInbox, title.trim());
      reload();
      await refreshNotebook();
      showNote(path);
    } catch (e) {
      fail(e);
    }
  };

  /// Which period's suggestions the right panel is showing, or null.
  ///
  /// It shares the panel with the inspector, so opening one closes the other —
  /// there is one right panel, and two things fighting over it would be a
  /// worse answer than either.
  let suggesting = $state(null);

  const select = (list, task) => {
    suggesting = null;
    selected = { list, task };
  };

  const suggest = (period) => {
    selected = null;
    suggesting = period;
  };

  /// The Fase 9 option, default off: with `closeInspectorOnClickAway` on,
  /// clicking the truly empty content area closes the inspector. Only the
  /// container itself counts — a click on any screen element (a task row, a
  /// button) has its own meaning and must never double as "close". This
  /// handler went missing in the Fase 9 refactor while the template kept
  /// calling it, so every content click threw a ReferenceError.
  function clickedAway(event) {
    if (!layout.closeInspectorOnClickAway) return;
    if (event.target !== event.currentTarget) return;
    selected = null;
  }

  // The inspector deliberately stays open across tab and view changes (user
  // request 2026-07-23): a task opened on one screen keeps showing while you
  // look elsewhere, even where nothing is selectable yet. It closes only by
  // its ×, by Esc, or when its task is completed/gone.

  // Records where the user is, for `restoreLastScreen`.
  $effect(() => {
    const id = Tabs.viewId(view);
    if (notebook) api.rememberScreen(id).catch(() => {});
  });

  function restoreView(id) {
    if (!id) return null;
    if (id === "day" || id === "week") return { kind: "period", period: id };
    if (
      id === "home" ||
      id === "completed" ||
      id === "notes" ||
      id === "tasks" ||
      id === "settings"
    )
      return { kind: id };
    if (id.startsWith("list:")) return { kind: "list", list: id.slice(5) };
    if (id.startsWith("ws:")) return { kind: "workspace", ws: id.slice(3) };
    return null;
  }

  // The addresses the core creates travel with the notebook. The frontend
  // used to mirror them in a names.js, and when the core renamed the
  // completed list the mirror went stale and a screen read a file that no
  // longer existed.
  let layout = $derived(
    notebook?.layout ?? {
      inbox: "jott.tasks/task-list.md",
      completed: "jott.tasks/completed.md",
      tasksFolder: "jott.tasks",
      completedName: "completed",
      notesFolder: "jott.notes",
      notesInbox: "Inbox",
      dateDisplayFormat: "mm/dd/yyyy",
      closeInspectorOnClickAway: false,
      quickNoteFolder: "Inbox",
      accentColor: "",
      theme: "",
      features: {},
    },
  );

  // Theme and accent are ATTRIBUTES on the document root, because that is where
  // they reach both regions at once — the chrome and the canvas each resolve
  // them to their own values (styles/themes/*.css, styles/roles.css). All three
  // themes are loaded, each scoped to its own name, so switching is this one
  // attribute: no dynamic import and no flash. Both ride in the layout, so they
  // are set on a notebook's first paint rather than after a second round trip.
  $effect(() => {
    const root = document.documentElement;
    root.dataset.theme = themeAttribute(layout.theme);
    if (layout.accentColor) root.dataset.accent = layout.accentColor;
    else delete root.dataset.accent;
  });

  /// Is this part of the app switched on? (App Functions, 2026-08-06.) One
  /// reader for the whole shell; screens get it as a prop or through the
  /// widget context, the same way `dayRefs` travels.
  let f = $derived(reader(layout.features ?? {}));

  let userLists = $derived(
    (notebook?.lists ?? []).filter(
      (entry) =>
        entry.path !== layout.completed &&
        entry.path !== layout.inbox &&
        // Lists of user workspaces are reached through their workspace, not
        // flattened into the fixed sidebar — two Inboxes side by side with
        // the same label would be unreadable.
        entry.path.startsWith(`${layout.tasksFolder}/`),
    ),
  );

  let userWorkspaces = $derived(workspaces.filter((ws) => !ws.fixed));

  /// The fixed Tasks workspace, in the shape the tasks screen reads, so the
  /// Tasks screen hosts the notebook's own source (arrangement and all)
  /// instead of a stand-in. The folder is the workspace's own path.
  let inboxWidget = $derived.by(() => {
    const folder = layout.inbox.slice(0, layout.inbox.lastIndexOf("/"));
    const ws = workspaces.find((ws) => ws.kind === "tasks" && ws.path === folder);
    return ws
      ? {
          kind: ws.kind,
          known: ws.known,
          folder: ws.path,
          name: null,
          sort: ws.sort ?? null,
          order: ws.order ?? [],
        }
      : null;
  });

  /// Which tab of the Tasks screen is open, so the page header can read
  /// `Tasks/Index` while the browser tab keeps saying just `Tasks`.
  let tasksSub = $state("");

  // What colour each workspace reads as — a member of a group follows the
  // group (2026-08-04), which the sidebar already did through --group-color
  // and the title and the tab dot did not.
  let wsColors = $derived(workspaceColors(workspaces, groups));

  // Where the open task can move: ANY tasks list of the notebook, minus the
  // Completed files (moving into Completed is what completing a task does).
  //
  // It used to be the folder's siblings only, and a widget is one list (spec
  // 3.5) — so the footer button had a single entry, itself, and reading as a
  // dead control was the honest outcome of offering nothing (user report,
  // 2026-08-06). The bulk "Move to…" in the widget already offered the whole
  // notebook; these two are the same move and now say the same thing.
  let moveTargets = $derived(
    (notebook?.lists ?? []).filter((entry) => entry.name !== layout.completedName),
  );

  /// What a tab calls itself. Titles are derived, never stored: renaming a
  /// list has to reach the tab showing it.
  function titleOf(v) {
    switch (v?.kind) {
      case "home":
        return S.home;
      case "period":
        return v.period === "day" ? S.today : S.week;
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
      case "list":
        return listTitle(v.list);
      case "note":
        return listName(v.path);
      case "workspace":
        return (
          workspaces.find((w) => w.path === v.ws)?.name ?? v.ws
        );
      default:
        return S.untitled;
    }
  }

  /// The colour of the workspace a view comes from — feeds the tab dot. A
  /// view of a fixed workspace (or of no workspace at all) returns null and
  /// the dot falls back to the theme brand in CSS.
  ///
  /// The workspace of a file address is everything ABOVE the file, not the
  /// first segment: `Design/Tasks/task-list.md` lives in `Design/Tasks`, and
  /// taking the first segment answered "Design" — a group, which owns no
  /// colour of its own in this map (2026-08-13).
  const holderOf = (path) => (path ?? "").split("/").slice(0, -1).join("/");
  function colorOf(v) {
    const folder =
      v?.kind === "workspace"
        ? v.ws
        : v?.kind === "list"
          ? holderOf(v.list)
          : v?.kind === "note"
            ? v.folder
            : null;
    return (folder && wsColors[folder]) ?? null;
  }

  /// The page menu of the current screen — the `•••` of the wireframe.
  let pageMenu = $derived.by(() => {
    if (notebook?.readOnly) return [];

    // A note's own actions belong here, not to a second bar inside the page.
    if (view.kind === "note") {
      return [
        { label: openNote.pinned ? S.unpin : S.pin, run: toggleNotePin },
        { label: S.renameNote, run: renameCurrentNote },
        { label: S.deleteNote, run: deleteCurrentNote },
      ];
    }

    // Lists are created inside a workspace's widget now, not from here.
    // Renaming or deleting a list the app recreates on every open would only
    // confuse — the core refuses it anyway, so the menu must not offer it.
    const items = [];
    if (
      view.kind === "list" &&
      view.list !== layout.inbox &&
      view.list !== layout.completed
    ) {
      items.push(
        { label: S.renameList, run: renameCurrentList },
        { label: S.deleteList, run: deleteCurrentList },
      );
    }
    return items;
  });

  // --- the open note's document actions, owned by the shell because each
  // one changes what the tab points at ---

  let noteEditor = $state(null);

  async function noteAction(fn) {
    try {
      // Anything still being typed goes out first: renaming or deleting
      // underneath a pending write would lose it.
      await noteEditor?.flushPending();
      await fn();
      await refreshNotebook();
      reload();
    } catch (e) {
      fail(e);
    }
  }

  const toggleNotePin = () =>
    noteAction(async () => {
      await api.setNotePinned(view.folder, view.path, !openNote.pinned);
      openNote = { ...openNote, pinned: !openNote.pinned };
    });

  const renameCurrentNote = () =>
    noteAction(async () => {
      const next = await askName(S.promptRenameNote(openNote.title), openNote.title);
      if (!next || next.trim() === openNote.title) return;
      const moved = await api.renameNote(view.folder, view.path, next.trim());
      // The tab follows the file rather than pointing at a name that is gone.
      tabs = Tabs.replaceView(tabs, Tabs.viewId(view), {
        kind: "note",
        folder: view.folder,
        path: moved,
      });
    });

  const deleteCurrentNote = () =>
    noteAction(async () => {
      if (!confirm(S.confirmDeleteNote(openNote.title))) return;
      await api.deleteNote(view.folder, view.path);
      closeTab(active);
    });

  function fail(e) {
    error = describeError(e);
    console.error("[jott]", e);
  }

  const reload = () => (reloadKey += 1);

  // One round trip instead of four: the auto-save calls this on every pause
  // in typing, so the fan-out was the hottest path in the app.
  async function refreshNotebook() {
    try {
      const snap = await api.notebookSnapshot();
      notebook = snap.info;
      clock = snap.clock;
      counts = snap.counts;
      conflicts = snap.conflicts;
      workspaces = snap.workspaces ?? [];
      groups = snap.groups ?? [];
      tags = snap.tags ?? [];
      dayRefs = new Set((snap.day ?? []).map((ref) => `${ref.path}#${ref.id}`));
      noteFolders = await api.noteFolders(snap.info.layout.notesFolder);
      workspacesSort = await api.workspacesSort();
    } catch {
      // No notebook open (or it just closed): back to onboarding.
      notebook = null;
    }
  }

  async function openAt(path) {
    busy = true;
    error = null;
    try {
      notebook = await api.openNotebook(path);
      await refreshNotebook();

      const restored = restoreView(await api.screenToRestore());
      if (restored) goTo(restored);

      scheduleTurn();
      reload();
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }

  async function chooseFolder() {
    try {
      const path = await api.pickFolder();
      if (path) await openAt(path);
    } catch (e) {
      fail(e);
    }
  }


  // Sidebar drag-to-reorder (the shared `reorderable` action reports from→to).
  // The order is a notebook preference kept in the config, never a change to
  // the files: lists and workspaces sort by it, everything else stays put.
  const moveItem = (arr, from, to) => {
    const next = [...arr];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    return next;
  };

  async function reorderLists(from, to) {
    if (notebook.readOnly) return;
    const names = moveItem(userLists.map((l) => l.name), from, to);
    try {
      await api.setOrder(`lists:${layout.tasksFolder}`, names);
      await refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  /// The sidebar's whole running order — groups and loose workspaces alike,
  /// flattened to names. One namespace orders both: a group's members are
  /// contiguous in it, which is what lets the sidebar read a group's place off
  /// its members instead of keeping a second ordering in step (2026-08-06).
  ///
  /// It used to renumber `userWorkspaces` from indices that came from the
  /// LOOSE ones — so with any group in the notebook the drag reordered the
  /// wrong things, and a group could not be dragged at all.
  async function reorderEntries(names) {
    if (notebook.readOnly) return;
    try {
      await api.setOrder("workspaces", names);
      await refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  /// Two workspaces dropped one on the other become a group. The name is asked
  /// for, and cancelling leaves everything where it was — a gesture that
  /// silently reorganises the sidebar is a gesture nobody trusts.
  async function groupWith(host, moving) {
    if (notebook.readOnly) return;
    const name = await askName(S.nameGroup, host.name, { confirm: S.create });
    if (!name?.trim()) return;
    try {
      const folder = await api.createGroup(name.trim());
      // Paths, both sides: the new group's and the two workspaces' — moving
      // one names it by the address it has RIGHT NOW, and the first move
      // changes the second one's parent, not its own address.
      await api.moveWorkspace(host.path, folder);
      await api.moveWorkspace(moving.path, folder);
      await refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  async function setWorkspacesSort(sort) {
    if (notebook.readOnly) return;
    try {
      await api.setWorkspacesSort(sort);
      await refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  // ---- workspace management (Fase 11) ----
  // A workspace has one function, chosen at creation (spec 3.5): the caller
  // says whether it is a list (tasks) or a notepad (notes), and — since
  // groups nest — which group it is being made inside.
  async function createWorkspace(kind = "tasks", group = null) {
    const name = await askName(
      kind === "notes" ? S.promptNewNotepad : S.promptNewList,
      "",
      { confirm: S.create },
    );
    if (!name || !name.trim()) return;
    try {
      const folder = group
        ? await api.createWorkspaceIn(name.trim(), kind, group)
        : await api.createWorkspace(name.trim(), kind);
      await refreshNotebook();
      openTab({ kind: "workspace", ws: folder });
    } catch (e) {
      fail(e);
    }
  }

  async function renameWorkspaceTo(folder, current) {
    const to = await askName(S.promptRenameWorkspace(current), current);
    if (to == null) return;
    try {
      await api.renameWorkspace(folder, to.trim());
      await refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  async function setWorkspaceAppearance(folder, color, icon) {
    try {
      await api.setWorkspaceAppearance(folder, color ?? null, icon ?? null);
      await refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  async function deleteWorkspaceAt(folder, name) {
    if (!confirm(S.confirmDeleteWorkspace(name))) return;
    try {
      await api.deleteWorkspace(folder);
      await refreshNotebook();
      // If we were looking at it, it is gone — go Home.
      if (view.kind === "workspace" && view.ws === folder) goTo({ kind: "home" });
    } catch (e) {
      fail(e);
    }
  }

  // ---- groups (reestruturação 2026-07-30; they nest since 2026-08-11) ----
  async function createGroup(group = null) {
    const name = await askName(S.nameGroup, "", { confirm: S.create });
    if (!name) return;
    try {
      await api.createGroup(name, group);
      await refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  /// A group moved into another group, or back out of one (`null`).
  async function moveGroupTo(name, intoGroup) {
    try {
      await api.moveGroup(name, intoGroup);
      await refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  async function renameGroupTo(folder, current) {
    const to = await askName(S.renameGroup, current);
    if (to == null) return;
    try {
      await api.renameGroup(folder, to);
      await refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  // The group's colour and icon — the group is where the colour is chosen
  // now; a workspace inside one follows it (user call, 2026-08-04).
  async function setGroupAppearanceAt(folder, color, icon) {
    try {
      await api.setGroupAppearance(folder, color, icon);
      await refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  async function deleteGroupAt(folder, name) {
    if (!confirm(S.confirmDeleteGroup(name))) return;
    try {
      await api.deleteGroup(folder);
      await refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  async function moveWorkspaceTo(name, intoGroup) {
    try {
      await api.moveWorkspace(name, intoGroup);
      await refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  // A workspace's arrangement lives in its own .workspace.json. The refresh
  // brings the new sort/order back through the snapshot, which is what
  // re-arranges the cards on screen.
  async function setWorkspaceSort(sort) {
    if (view.kind !== "workspace") return;
    try {
      await api.setWorkspaceSort(view.ws, sort);
      await refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  async function setWorkspaceOrder(order) {
    if (view.kind !== "workspace") return;
    try {
      await api.setWorkspaceOrder(view.ws, order);
      await refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  async function renameCurrentList() {
    if (view.kind !== "list") return;
    const from = view.list;
    const current = listName(from);
    const to = await askName(S.promptRenameList(current), current);
    if (!to || to.trim() === current) return;
    try {
      await api.renameList(from, to.trim());
      await refreshNotebook();
      // A rename never changes the folder: swap only the file name, and let
      // the tab follow the file instead of pointing at a name that is gone.
      const dir = from.slice(0, from.lastIndexOf("/"));
      const next = { kind: "list", list: `${dir}/${to.trim()}.md` };
      tabs = Tabs.replaceView(tabs, Tabs.viewId({ kind: "list", list: from }), next);
      reload();
    } catch (e) {
      fail(e);
    }
  }

  async function deleteCurrentList() {
    if (view.kind !== "list") return;
    const list = view.list;
    if (!confirm(S.confirmDeleteList(listTitle(list)))) return;
    try {
      const rescued = await api.deleteList(list);
      await refreshNotebook();
      goTo({ kind: "list", list: layout.inbox });
      reload();
      if (rescued > 0) error = S.tasksRescued(rescued, listTitle(list));
    } catch (e) {
      fail(e);
    }
  }

  // The rollover has to happen with the app open too, not only when the
  // notebook is reopened. The core says when; this schedules the wake-up.
  let turnTimer = null;
  async function scheduleTurn() {
    if (turnTimer) clearTimeout(turnTimer);
    if (!clock) return;

    const next = Math.min(
      new Date(clock.nextDailyTurn).getTime(),
      new Date(clock.nextWeeklyTurn).getTime(),
    );
    // Cap the wait: a long sleep or a clock jump would otherwise leave the
    // screen showing yesterday until something else refreshed it.
    const delay = Math.min(Math.max(next - Date.now(), 1000), 60 * 60 * 1000);

    turnTimer = setTimeout(async () => {
      try {
        await api.refreshPeriods();
        clock = await api.periodClock();
        reload();
      } catch (e) {
        fail(e);
      }
      scheduleTurn();
    }, delay);
  }

  // Someone else wrote to the notebook (Syncthing, Obsidian, a text editor).
  listen("notebook://changed", async (event) => {
    const kind = event.payload?.kind;
    if (kind === "list") await refreshNotebook();
    reload();
  });

  // Reopen the last notebook so the app is usable straight away.
  (async () => {
    try {
      const last = await api.lastNotebook();
      if (last) await openAt(last);
      else await refreshNotebook();
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  })();

  /// Opening a document replaces what the tab shows, the way clicking a link
  /// does — a new tab is a deliberate gesture (middle click, or the option in
  /// the context menu), never the default.
  const showNote = (path, folder = layout.notesFolder, newTab = false) =>
    (newTab ? openTab : goTo)({ kind: "note", folder, path });

  const showList = (path, newTab = false) =>
    (newTab ? openTab : goTo)({ kind: "list", list: path });
</script>

<svelte:window onkeydown={onKeydown} />

<!-- The window is frameless: this bar draws the brand, the document tabs and
     the min/max/close controls itself, and is the only handle to move or close
     the window — so it renders even before a notebook is open. -->
<!-- `data-region` is what gives an element its colour ground (styles/themes/*.css):
     the whole window is the CHROME, and the content panel below overrides it
     with the CANVAS. In the factory theme that is black around white. -->
<div class="window" class:window--flush={flush} data-region="chrome">
  <!-- Frameless: draw our own resize grips at the edges. Not while flush —
       a maximized window has nothing to resize into. -->
  {#if !flush}
    <ResizeHandles />
  {/if}
  <TitleBar rail={railed} buttons={windowButtons}>
    {#if notebook}
      <TabBar
        {tabs}
        {active}
        {titleOf}
        {colorOf}
        onSelect={(i) => (active = i)}
        onClose={closeTab}
        onOpenNew={openNewTab}
        onMove={(from, to) =>
          ({ tabs, active } = Tabs.move(tabs, active, from, to))}
      />
    {/if}
  </TitleBar>

  <main class="shell__main">
    {#if !notebook}
      <section class="shell__onboarding">
        <h1 class="shell__onboarding-title">Jott</h1>
        <p class="shell__onboarding-intro">{S.onboardingIntro}</p>
        <button
          class="shell__onboarding-action"
          onclick={chooseFolder}
          disabled={busy}>{S.chooseFolder}</button
        >
        {#if error}<p class="shell__error">{error}</p>{/if}
      </section>
  {:else}
    <div class="shell">
      <!-- LEFT: workspaces on top, notebook and settings pinned to the
           bottom, as the wireframe has them. Collapses to an icon rail. -->
      <Sidebar
        {notebook}
        {userLists}
        {userWorkspaces}
        {counts}
        {isOpen}
        rail={railed}
        onToggleRail={() => (railed = !railed)}
        onOpen={(next, newTab = false) => (newTab ? openTab : goTo)(next)}
        onOpenList={showList}
        onChooseFolder={chooseFolder}
        onReorderLists={reorderLists}
        {f}
        onReorderEntries={reorderEntries}
        onGroupWith={groupWith}
        onMoveGroup={moveGroupTo}
        {workspacesSort}
        onSetWorkspacesSort={setWorkspacesSort}
        onCreateWorkspace={createWorkspace}
        onRenameWorkspace={renameWorkspaceTo}
        onSetWorkspaceAppearance={setWorkspaceAppearance}
        onDeleteWorkspace={deleteWorkspaceAt}
        {groups}
        onCreateGroup={createGroup}
        onRenameGroup={renameGroupTo}
        onSetGroupAppearance={setGroupAppearanceAt}
        onDeleteGroup={deleteGroupAt}
        onMoveWorkspace={moveWorkspaceTo}
      />

      <!-- CENTRE: page header, then the screen itself. The tabs moved up into
           the title bar; the header keeps the back/forward, title and ••• menu. -->
      <section class="shell__centre" data-region="canvas">
        <PageHeader
          title={view.kind === "tasks" && tasksSub ? tasksSub : titleOf(view)}
          context={view.kind === "tasks" && tasksSub ? S.tasks : ""}
          subtitle={view.kind === "home"
            ? formatDate(clock?.today ?? "", layout.dateDisplayFormat)
            : ""}
          canBack={Tabs.canGoBack(tabs[active])}
          canForward={Tabs.canGoForward(tabs[active])}
          onBack={goBack}
          onForward={goForward}
          onRenameTitle={view.kind === "note" && !notebook.readOnly
            ? renameCurrentNote
            : null}
          menu={pageMenu}
        />

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="shell__content" onclick={clickedAway}>
          <div class="shell__content-inner">
          {#if error}
            <p class="shell__error">
              {error}
              <button onclick={() => (error = null)}>{S.dismissError}</button>
            </p>
          {/if}

          {#if conflicts.length > 0}
            <!-- The one case where the user can silently lose work: two
                 devices edited the same file and the sync tool kept both. -->
            <div class="shell__conflict">
              <strong class="shell__conflict-title"
                >{S.conflictsTitle(conflicts.length)}</strong
              >
              <p>{S.conflictsBody}</p>
              <ul class="shell__conflict-list">
                {#each conflicts as conflict}
                  <li>
                    {#if conflict.list}<strong>{conflict.list}</strong>{/if}
                    <code class="shell__conflict-path">{conflict.path}</code>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if view.kind === "home"}
            <HomeView
              dateFormat={layout.dateDisplayFormat}
              quickNoteFolder={layout.quickNoteFolder}
              notesFolder={layout.notesFolder}
              notesInbox={layout.notesInbox}
              folders={noteFolders}
              lists={notebook.lists}
              {tags}
              completedName={layout.completedName}
              inbox={layout.inbox}
              readOnly={notebook.readOnly}
              {reloadKey}
              onChanged={refreshNotebook}
              onError={fail}
              onOpenNote={(path) => showNote(path)}
              onSelectTask={select}
              onSuggest={suggest}
              selectedTask={selected?.task ?? null}
              today={clock?.today}
              todayLabel={formatDate(clock?.today ?? "", layout.dateDisplayFormat)}
              {f}
            />
          {:else if view.kind === "tasks"}
            <TasksView
              dateFormat={layout.dateDisplayFormat}
              inbox={layout.inbox}
              inboxWidget={inboxWidget}
              lists={notebook.lists}
              {tags}
              completedName={layout.completedName}
              {clock}
              readOnly={notebook.readOnly}
              onChanged={refreshNotebook}
              onError={fail}
              {reloadKey}
              onSelect={select}
              selectedTask={selected?.task ?? null}
              {dayRefs}
              onSub={(label) => (tasksSub = label)}
              onSuggest={suggest}
              {f}
            />
          {:else if view.kind === "list"}
            <ListView
              dateFormat={layout.dateDisplayFormat}
              list={view.list}
              {tagColors}
              readOnly={notebook.readOnly}
              onChanged={refreshNotebook}
              onError={fail}
              {reloadKey}
              onSelect={select}
              selectedId={selected?.task?.id ?? null}
              selectedTask={selected?.task ?? null}
              today={clock?.today}
              {dayRefs}
              {f}
            />
          {:else if view.kind === "notes"}
            <NotesWidget
              widget={{ kind: "notes", folder: layout.notesFolder }}
              readOnly={notebook.readOnly}
              notesInbox={layout.notesInbox}
              {reloadKey}
              onChanged={refreshNotebook}
              onError={fail}
              onOpenNote={showNote}
            />
          {:else if view.kind === "note"}
            <NoteEditor
              bind:this={noteEditor}
              folder={view.folder}
              path={view.path}
              readOnly={notebook.readOnly}
              onSaved={refreshNotebook}
              onError={fail}
              onLoaded={(state) => (openNote = state)}
            />
          {:else if view.kind === "settings"}
            <SettingsView
              {notebook}
              folders={noteFolders}
              notesInbox={layout.notesInbox}
              onChanged={refreshNotebook}
              onError={fail}
            />
          {:else if view.kind === "workspace"}
            {@const current = userWorkspaces.find((w) => w.path === view.ws)}
            {#if current}
              <WorkspaceView
                workspace={current}
                color={wsColors[current.path] ?? null}
                lists={notebook.lists}
                {counts}
                {tags}
                completedName={layout.completedName}
                notesInbox={layout.notesInbox}
                today={clock?.today}
                dateFormat={layout.dateDisplayFormat}
                {dayRefs}
                {f}
                readOnly={notebook.readOnly}
                {reloadKey}
                selectedTask={selected?.task ?? null}
                onSelectTask={select}
                onOpenList={(path) => showList(path)}
                onOpenNote={(path, folder) => showNote(path, folder)}
                onSetWorkspaceSort={setWorkspaceSort}
                onSetWorkspaceOrder={setWorkspaceOrder}
                onChanged={refreshNotebook}
                onError={fail}
              />
            {:else}
              <p class="shell__empty">{S.missingWorkspace}</p>
            {/if}
          {:else if view.kind === "tags"}
            <TagsView {tags} onChanged={refreshNotebook} onError={fail} />
          {:else if view.kind === "trash"}
            <TrashView
              onChanged={refreshNotebook}
              onError={fail}
              {reloadKey}
              dateFormat={layout.dateDisplayFormat}
            />
          {:else}
            <CompletedView
              readOnly={notebook.readOnly}
              onChanged={refreshNotebook}
              onError={fail}
              {reloadKey}
            />
          {/if}
          </div>
        </div>
      </section>

      <!-- RIGHT: one panel, one thing in it — the task inspector, or the day's
           suggestions (2026-08-06). The wrapper is a flex column whose width
           slides on open/close — the same width animation the left rail uses,
           so both side panels move the same way (no grid flicker, since the
           shell is flex). The inner panel keeps a fixed width so its content is
           clipped, not reflowed, while it slides. -->
      {#if suggesting}
        <div class="shell__panel" transition:slide={{ axis: "x", duration: 200 }}>
          <SuggestionsPane
            period={suggesting}
            dateFormat={layout.dateDisplayFormat}
            {reloadKey}
            onChanged={() => {
              refreshNotebook();
              reload();
            }}
            onError={fail}
            onClose={() => (suggesting = null)}
            {f}
          />
        </div>
      {:else if selected}
        <div class="shell__panel" transition:slide={{ axis: "x", duration: 200 }}>
          <TaskInspector
            task={selected.task}
            list={selected.list}
            lists={moveTargets}
            {tags}
            readOnly={notebook.readOnly}
            dateFormat={layout.dateDisplayFormat}
            inDay={!!selected.task?.id &&
              dayRefs.has(`${selected.list}#${selected.task.id}`)}
            {f}
            onSaved={() => {
              refreshNotebook();
              reload();
            }}
            onError={fail}
            onClose={() => (selected = null)}
            onMoved={(to) => (selected = { ...selected, list: to })}
          />
        </div>
      {/if}
    </div>
  {/if}
  </main>
</div>

<!-- The app's own name prompt (window.prompt is broken in WebKitGTK). -->
<NameDialog />
<NewTaskDialog />

<!-- Ctrl+F / Ctrl+K, over whatever screen is open: a search is a question
     asked in passing, and answering it should not cost the place you were in. -->
{#if searching}
  <SearchDialog
    onClose={() => (searching = false)}
    onOpenList={showFoundTask}
    onOpenNote={(path, folder) => showNote(path, folder)}
    onError={fail}
  />
{/if}
