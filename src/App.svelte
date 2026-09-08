<script>
  // The shell: three panels, document tabs, and the router that decides which
  // screen a tab is showing. It owns arrangement and navigation only: screens
  // own their data, tabs.js owns the tab rules, shell.css owns the look, and
  // what goes on the root (theme, accent, platform) goes through rootStyle.js.
  import { listen } from "@tauri-apps/api/event";
  import { api, describeError } from "./lib/services/api.js";
  import { onOffer } from "./lib/services/undoOffer.js";
  import Notice from "./lib/components/Notice.svelte";
  import { askName, askTask, setConfirmPolicy } from "./lib/services/dialog.js";
  import { composeTask } from "./lib/services/taskCompose.js";
  import { makeAct } from "./lib/services/act.js";
  import { ask, typing, userBindings } from "./lib/services/shortcuts.js";
  import NameDialog from "./lib/components/NameDialog.svelte";
  import ConfirmDialog from "./lib/components/ConfirmDialog.svelte";
  import FolderPicker from "./lib/components/FolderPicker.svelte";
  import {
    storageAccess,
    requestStorageAccess,
    watchStorageAccess,
    pickFolderNatively,
    onKeyboardHidden,
  } from "./lib/services/androidStorage.js";
  import { untrack } from "svelte";
  import { back, onBack, installBack } from "./lib/services/back.js";
  import ContextMenu from "./lib/components/ContextMenu.svelte";
  import { entryOf } from "./lib/shell/entry.js";
  import Icon from "./lib/components/Icon.svelte";
  import AssetPicker from "./lib/components/AssetPicker.svelte";
  import ImageViewer from "./lib/components/ImageViewer.svelte";
  import { TABLE_FORMATS } from "./lib/services/tableEditing.js";
  import { assetUrl } from "./lib/services/assets.js";
  import NewTaskDialog from "./lib/components/NewTaskDialog.svelte";
  import SearchDialog from "./lib/components/SearchDialog.svelte";
  import { sourceOf } from "./lib/spaces/registry.js";
  import { movedItem } from "./lib/services/spaceOrder.js";
  import FormatBar from "./lib/components/FormatBar.svelte";
  import TabBar from "./lib/shell/TabBar.svelte";
  import AppBanners from "./lib/shell/AppBanners.svelte";
  import NotebookPicker from "./lib/shell/NotebookPicker.svelte";
  import RightPanel from "./lib/shell/RightPanel.svelte";
  import Screen from "./lib/shell/Screen.svelte";
  import TitleBar from "./lib/shell/TitleBar.svelte";
  import { buttonLayout } from "./lib/shell/windowButtons.js";
  import { isMobile, osAttribute, platformAttribute } from "./lib/shell/platform.js";
  import { installKeyboard } from "./lib/shell/keyboard.js";
  import { scheduleTurns } from "./lib/shell/turn.js";
  import { setRootData, setRootVar } from "./lib/shell/rootStyle.js";
  import { fontVars } from "./lib/services/fonts.js";
  import { watchCompact, isShortScreen } from "./lib/shell/compact.js";
  import TopBar from "./lib/shell/TopBar.svelte";
  import BottomSheet from "./lib/components/BottomSheet.svelte";
  import { drawerSwipe } from "./lib/actions/drawerSwipe.js";
  import { pullToSearch } from "./lib/actions/pullToSearch.js";
  import { risen } from "./lib/actions/risen.js";
  import DayHead from "./lib/components/DayHead.svelte";
  import DayTitle from "./lib/components/DayTitle.svelte";
  import CaptureFab from "./lib/components/CaptureFab.svelte";
  import { dayKind } from "./lib/services/calendar.js";
  import { clampWidth, SIDEBAR, PANEL } from "./lib/shell/sidebarWidth.js";
  import { clampZoom, steppedZoom, zoomFontSize } from "./lib/shell/zoom.js";
  import ResizeHandles from "./lib/shell/ResizeHandles.svelte";
  import PanelResizer from "./lib/shell/PanelResizer.svelte";
  import Sidebar from "./lib/shell/Sidebar.svelte";
  import PageHeader from "./lib/shell/PageHeader.svelte";
  import { folderOf, leafOf } from "./lib/services/paths.js";
  import { groupColors, spaceColors } from "./lib/services/spaceColors.js";
  import { originOf } from "./lib/services/origin.js";
  import { noteFontSizeAttribute, modeAttribute, paletteAttribute } from "./lib/services/themes.js";
  import { applyUserTheme, userThemeApplied } from "./lib/shell/userTheme.js";
  import { seedFrom } from "./lib/services/themeSeed.js";
  // The app's own three, as TEXT. `?raw` gives the source rather than a
  // stylesheet the page loads — these are already loaded, by app.css; what is
  // wanted here is the file's contents, to seed a theme the reader will edit.
  import factoryThemeCss from "./styles/themes/jott.css?raw";
  import {
    formatBarMode as modeOfFormatBar,
    formatBarSide as sideOfFormatBar,
  } from "./lib/services/formatBar.js";
  import { reader } from "./lib/services/features.js";
  import { autoCheck, installUpdate } from "./lib/services/update.js";
  import {
    offerIfDue as offerMenuEntry,
    addToMenu,
    dismiss as dismissMenuEntry,
  } from "./lib/services/desktopEntry.js";
  import { S } from "./lib/services/strings.js";
  import * as Tabs from "./lib/shell/tabs.js";
  import { bannerMenuOf, noteActionsOf, pageMenuOf, screenActionsOf } from "./lib/shell/menus.js";
  import { makeNoteDocument } from "./lib/shell/noteDocument.js";
  import { makeNotebookWrites } from "./lib/shell/notebookWrites.js";
  import { makeRemindersHost } from "./lib/shell/remindersHost.js";
  import { landing, reachable, spaceOfView, titleOf, viewFromId } from "./lib/shell/views.js";
  import { noteTargets } from "./lib/services/noteTargets.js";
  import { quickTaskTarget, taskTargets } from "./lib/services/taskTargets.js";
  import { watchWindowState, toggleFullscreen } from "./lib/shell/windowState.js";

  let notebook = $state(null);
  let clock = $state(null);
  let error = $state(null);
  /// The shell's states. `opening`: the path being opened while the disk has
  /// not answered. `failedOpen`: the path and reason of a door that would not
  /// open, so the picker can offer to retry it. `conflictsHidden`: the
  /// conflicts hidden THIS session (a joined key); a new one brings the box back.
  let opening = $state(null);
  let failedOpen = $state(null);
  let conflictsHidden = $state("");
  const conflictsKey = (list) => list.map((c) => c.path).join("\n");
  let busy = $state(true);
  /// Bumped to tell the open screen to re-read from disk.
  let reloadKey = $state(0);
  let counts = $state({});
  let conflicts = $state([]);
  let spaces = $state([]);
  let groups = $state([]);
  let tags = $state([]);
  let noteFolders = $state([]);
  /// What is pulled into the Day, as `"<list>#<id>"` — the set every card asks
  /// "am I in today?". Rides with the snapshot, never fetched per screen.
  let dayRefs = $state(new Set());
  /// How the sidebar arranges spaces — "" (dragged) or "name".
  let spacesSort = $state("");
  /// The themes the notebook carries (`.jott/themes/`), and which one is
  /// actually IN the document: `data-theme` may only name a theme whose
  /// stylesheet has arrived, or it paints nothing (services/themes.js).
  let userThemes = $state([]);
  let wornTheme = $state(null);
  /// How many remote references the core neutralised in the worn stylesheet,
  /// so Settings can say it rather than let a theme quietly lose its images.
  let wornThemeBlocked = $state(0);
  /// The app's own palette, as the notebook carries it (`.jott/themes/jott.css`).
  const FACTORY_THEME = "jott";

  /// Bumped when the watcher reports a stylesheet changed on disk; read in the
  /// theme effect purely to re-run it.
  let themeRevision = $state(0);
  /// The task open in the right-hand panel, as `{ list, task }`.
  let selected = $state(null);
  /// Left sidebar collapsed to an icon rail. Local to the session (not a
  /// notebook setting — new config keys wait until they are really needed).
  let railed = $state(false);
  /// How wide the sidebar was dragged, in px — null while the stylesheet
  /// decides. Remembered per MACHINE, not per notebook (src-tauri/src/prefs.rs).
  let sidebarWidth = $state(null);
  /// The same for the right panel — the inspector and the suggestions share
  /// one width, because they share one panel.
  let panelWidth = $state(null);
  /// True only while an edge is being dragged, so the widths can stop
  /// animating for the length of the gesture.
  let resizing = $state(false);
  // Plain calls, not an $effect: they read no reactive value, and an effect
  // would silently start re-running the day someone reads state inside.
  api.sidebarWidth().then((w) => (sidebarWidth = clampWidth(w, SIDEBAR)), () => {});
  api.panelWidth().then((w) => (panelWidth = clampWidth(w, PANEL)), () => {});
  // Clamped like the widths are, and for the same reason: a value
  // hand-edited into the file must not leave the app unusable with no way
  // back to a readable size.
  api.zoom().then((z) => z && (zoom = clampZoom(z)), () => {});

  /// Which window buttons the desktop wants, and where. Read once: there is no
  /// live signal for it, and the fallback is the standard set, so the worst
  /// case is a restart after changing the setting.
  let windowButtons = $state(buttonLayout(null));
  api.windowButtonLayout().then(
    (layout) => (windowButtons = buttonLayout(layout)),
    () => {},
  );
  /// Is the window too narrow for three columns? The only thing that decides
  /// the layout (shell/compact.js). Measured once, here, so the top bar and
  /// the page header never disagree about who holds the back/forward arrows.
  let compact = $state(false);
  $effect(() => watchCompact((v) => (compact = v)));

  /// The compact shell's scroller, and whether the canvas has risen to the top
  /// of it (actions/risen.js): the floating top bar paints nothing, so its
  /// buttons wear whichever ground is behind them (topbar.css reads it).
  let centre = $state(null);
  let canvasRisen = $state(false);

  /// The three panels the compact shell cannot keep on screen at once, and so
  /// opens on demand. All three are transient by nature, so none of them is
  /// remembered: a drawer left open across a restart is a drawer in the way.
  let drawerOpen = $state(false);
  /// How far a finger has carried the drawer, in px — null unless one is on it
  /// (actions/drawerSwipe.js). While a number, the drawer's transition is off.
  let drawerAt = $state(null);
  /// Published on the DOCUMENT ROOT, not on the window: the window and the
  /// drawer are siblings and must move by the same amount.
  $effect(() => setRootVar("--drawer-at", drawerAt === null ? null : `${drawerAt}px`));
  let tabsOpen = $state(false);
  /// True while the Home's + has asked for a TASK: the day's own composer bar
  /// opens, focused, pinned above the keyboard.
  let composingTask = $state(false);
  /// The Home's + (components/CaptureFab.svelte): each half is offered only
  /// where it can be written; with one the + composes directly, with neither
  /// there is no +.
  let homeView = $state(null);
  let canCaptureTask = $derived(f("tasks") && !!quickTaskTo);
  let canCaptureNote = $derived(f("notes") && quickTargets.length > 0);

  /// Set when a note was just created from the +, consumed when the editor
  /// reports loaded: a new note opens with the cursor in the BODY, not the title.
  let focusNewNote = $state(false);

  /// The notebooks screen shown OVER an open notebook. Only the phone sets it
  /// (one Activity, no second window); the desktop opens a window of its own
  /// (`showNotebooks`), which is what lets two notebooks be open at once.
  let showingPicker = $state(false);

  /// Whether this window is showing the notebooks screen rather than a
  /// notebook — read by the bar, the panel and the root styles, which must
  /// not disagree. Not `!notebook`: the phone shows it OVER an open notebook.
  let showsPicker = $derived(!notebook || showingPicker);

  // Going anywhere closes them — including the notebooks screen, which is not
  // a `view`. Read here so there is one answer to "what closes the drawer".
  $effect(() => {
    view;
    showsPicker;
    drawerOpen = false;
    tabsOpen = false;
    composingTask = false;
  });
  // Widening the window puts everything back in its column, so nothing may be
  // left holding a sheet open over a shell that no longer has one.
  $effect(() => {
    if (!compact) {
      drawerOpen = false;
      tabsOpen = false;
      composingTask = false;
    }
  });

  /// `"android"` or `"desktop"`, read once. Deliberately NOT how the layout is
  /// decided — width does that, in CSS. This gates only what belongs to the
  /// device: window buttons, resize edges, system bars (shell/platform.js).
  let platform = $state(platformAttribute(null));
  let mobile = $derived(isMobile(platform));
  /// The same answer, asked the finer question: WHICH system, for the window
  /// corner the app draws itself. Empty until the bridge replies, and empty
  /// for anything this build has no corner for — the CSS default stands then.
  let os = $state("");
  api.platform().then(
    (answer) => {
      platform = platformAttribute(answer);
      os = osAttribute(answer);
    },
    () => {},
  );

  /// What the open note reports about itself, for the page header and menu.
  let openNote = $state({ pinned: false, title: "", banner: null });

  /// What the image picker is being opened FOR: `"banner"` hangs it on the
  /// open note, `"body"` writes it where the cursor is. Null when it is shut.
  /// One dialog, two questions — the library is the same either way.
  let pickingImage = $state(null);
  /// The picture being shown full screen, by address.
  let zoomedImage = $state(null);

  // Tabs. The active tab's current view is what the centre panel shows.
  let tabs = $state([{ views: [{ kind: "home" }], at: 0 }]);
  let active = $state(0);
  let rawView = $derived(Tabs.currentView(tabs[active]) ?? { kind: "home" });

  // A view whose part of the app was switched off shows the landing screen
  // instead (shell/views.js) — Home, or the first fixed screen still standing
  // when Home itself is hidden. Nothing is closed behind the user's back.
  let view = $derived(reachable(rawView, f, layout) ? rawView : landing(f));

  /// Opens a view in its own tab (focusing it if already open).
  function openTab(next, opts) {
    ({ tabs, active } = Tabs.open(tabs, active, next, opts));
  }

  /// The one door every "open this" gesture comes through: a click follows
  /// like a link; a NEW TAB (middle click, "Open in new tab") opens BEHIND
  /// the one being read — the browser's rule.
  const openIn = (next, newTab = false) =>
    newTab ? openTab(next, { focus: false }) : goTo(next);

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
  /// The STACK, not the tab's history straight away: a screen with a step of
  /// its own (Settings on the phone) answers first; the shell's handler below
  /// walks the tab when nobody else took the press.
  const goBackAnywhere = () => back();

  // ---- "back", from wherever it is asked (services/back.js) ----
  // The SHELL's handler is the bottom of the stack: a dialog or a sheet
  // registers while mounted and answers first. `false` is a real answer: on
  // Android it hands the press to the system, which may close the app.

  /// The Settings section open on the phone (screens/SettingsView.svelte):
  /// empty while the menu is on screen, and always empty side by side.
  let settingsSub = $state("");
  // Or Settings has a section open over its menu: the arrow has somewhere
  // to go even with no tab history behind it.
  let canBack = $derived(Tabs.canGoBack(tabs[active]) || settingsSub !== "");
  let canForward = $derived(Tabs.canGoForward(tabs[active]));
  $effect(() =>
    installBack({
      onForward: () => canForward && goForward(),
    }),
  );
  // What the keyboard covers, kept true. The activity publishes the raw
  // inset; `shell/keyboard.js` turns it into the distance the LAYOUT owes.
  $effect(() => installKeyboard());
  $effect(() =>
    onBack(() => {
      if (zoomedImage) return ((zoomedImage = null), true);
      if (canvasMenuAt) return ((canvasMenuAt = null), true);
      if (drawerOpen) return ((drawerOpen = false), true);
      if (Tabs.canGoBack(tabs[active])) return (goBack(), true);
      return false;
    }),
  );

  const isOpen = (v) => Tabs.viewId(view) === Tabs.viewId(v);
  /// Whether the open view lives INSIDE the place `v` names, without being it:
  /// a note open from a space keeps that space's pill lit. Asked only of rows
  /// that are places, never of list rows.
  const holds = (v) => {
    const place = spaceOfView(v, layout);
    return place !== null && place === currentSpace && !isOpen(v);
  };

  // True while the window fills the screen (maximized or fullscreen): the
  // self-drawn frame (rounded corners + hairline) goes flush against the
  // screen edge instead of leaving dead rounded pixels.
  let flush = $state(false);
  $effect(() => watchWindowState((v) => (flush = v)));

  // The user's own bindings, published for everything that answers a key —
  // the shell here, the task list four levels down, the note editor in
  // another subtree entirely (`services/shortcuts.js`).
  $effect(() => {
    userBindings.set(layout.shortcuts ?? {});
  });

  /// What each command id DOES. The registry says a command exists and what
  /// it is called; this is the only place that knows what a notebook is.
  /// A command absent from here is one the editor answers (`Editor.svelte`
  /// maps the `editor` scope to CodeMirror commands from the same registry).
  const RUNS = {
    "task.new": () => notebook && quickTask(),
    "note.new": () => notebook && f("notes") && quickNote(),
    "search.notebook": () => notebook && openSearch(),
    "search.notebook.global": () => notebook && openSearch(),
    // Reachable with no notebook open too — unlike every other command here,
    // it is how a window with nothing in it gets something.
    "app.notebooks": () => showNotebooks(),
    "app.undo": () => notebook && takeBack("undo"),
    "app.redo": () => notebook && takeBack("redo"),
    "app.settings": () => notebook && goTo({ kind: "settings" }),
    "app.fullscreen": () => toggleFullscreen().catch(() => {}),
    "app.sidebar": () => notebook && (compact ? (drawerOpen = !drawerOpen) : (railed = !railed)),
    "page.rename": () => notebook && renameHere(),
    "app.zoomIn": () => zoomBy(1),
    "app.zoomOut": () => zoomBy(-1),
    "app.zoomReset": () => setZoom(1),
    "tab.new": openNewTab,
    "tab.close": () => closeTab(active),
    "tab.next": () => cycleTab(1),
    "tab.previous": () => cycleTab(-1),
    "tab.last": () => selectTab(tabs.length - 1),
    "nav.back": goBackAnywhere,
    "nav.forward": goForward,
    ...Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`tab.go${i + 1}`, () => selectTab(i)]),
    ),
  };

  // ---- zoom (Ctrl+= / Ctrl+- / Ctrl+0) ----
  // The ladder and its rules are shell/zoom.js's; what stays here is the
  // wiring — the state, the root font-size, and the preference write.
  let zoom = $state(1);

  $effect(() => {
    document.documentElement.style.fontSize = zoomFontSize(zoom);
  });

  function setZoom(next) {
    const clamped = clampZoom(next);
    if (clamped === zoom) return;
    zoom = clamped;
    api.rememberZoom(clamped).catch(() => {});
  }

  const zoomBy = (direction) => setZoom(steppedZoom(zoom, direction));

  /// Move between tabs by one, wrapping — a tab strip is a ring.
  function cycleTab(step) {
    if (tabs.length < 2) return;
    selectTab((active + step + tabs.length) % tabs.length);
  }

  const selectTab = (i) => {
    if (i >= 0 && i < tabs.length) active = i;
  };

  /// The search box over whatever screen is showing, asking the whole
  /// notebook — the shortcut always asks the notebook, whatever the last
  /// scoped search was.
  function openSearch() {
    searchScope = null;
    searching = true;
  }

  /// F2: rename whatever this screen IS. The page menu already offers exactly
  /// one of these per screen, so the key follows the menu rather than
  /// inventing a second rule about what "here" means.
  function renameHere() {
    if (notebook?.readOnly) return;
    if (view.kind === "note") renameCurrentNote();
    else if (view.kind === "list" && view.list !== layout.inbox && view.list !== layout.completed)
      renameCurrentList();
    else if (renamableSpace) renameSpaceTo(renamableSpace.path, renamableSpace.name);
  }

  function onKeydown(event) {
    // Escape stays the shell's own, and deliberately is NOT a command: it
    // dismisses whatever is open, which is about state rather than about a
    // binding a user could take away or point somewhere else.
    if (event.key === "Escape" && !event.defaultPrevented) {
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
    }

    // The task scope is not answered here: a focused task list answers its
    // own keys (`TaskCards`), because it is the one that HAS the tasks and
    // the one whose focus says it is the list being talked to.
    const id = $ask(event, "global");
    const run = id && RUNS[id];
    if (!run) return;
    // Ctrl+Z inside a field is the field's own undo (the search box, a task
    // being renamed inline); the app's history answers only where nothing
    // is being typed. The editor and the inspector never get this far: they
    // claim the press themselves.
    if ((id === "app.undo" || id === "app.redo") && typing(event)) return;
    event.preventDefault();
    run();
  }

  // ---- the app's history (Ctrl+Z / Ctrl+Shift+Z) ----
  // The core keeps it (`jott_core::history`). The shell only asks, reloads,
  // and announces — a box that goes away on its own, because an undo the user
  // cannot see (a reorder in another space) still has to be said.
  let undoNotice = $state(null);
  let undoNoticeTimer = null;

  function sayUndo(tone, text) {
    clearTimeout(undoNoticeTimer);
    undoNotice = { tone, text };
    undoNoticeTimer = setTimeout(() => (undoNotice = null), 4000);
  }

  async function takeBack(kind) {
    if (notebook?.readOnly) return;
    dropOffer();
    try {
      const label = kind === "undo" ? await api.undo() : await api.redo();
      await refreshNotebook();
      reload();
      if (label === null) sayUndo("info", kind === "undo" ? S.nothingToUndo : S.nothingToRedo);
      else {
        const name = S.actionName(label);
        sayUndo("success", kind === "undo" ? S.undone(name) : S.redone(name));
      }
    } catch (e) {
      if (e?.kind === "stale") sayUndo("warning", S.undoStale);
      else fail(e);
    }
  }

  // ---- the floating undo (services/undoOffer.js) ----
  // Offered where the action happened, for a moment. The click asks the
  // bridge what Ctrl+Z would take back FIRST: an action recorded since the
  // offer is never the one undone.
  let undoOffer = $state(null);
  let undoOfferTimer = null;

  function dropOffer() {
    clearTimeout(undoOfferTimer);
    undoOffer = null;
  }

  $effect(() =>
    onOffer((command) => {
      if (notebook?.readOnly) return;
      clearTimeout(undoOfferTimer);
      undoOffer = command;
      undoOfferTimer = setTimeout(dropOffer, 6000);
    }),
  );

  async function takeOffer() {
    const offered = undoOffer;
    dropOffer();
    try {
      if ((await api.undoable()) !== offered) return sayUndo("warning", S.undoOfferGone);
    } catch (e) {
      return fail(e);
    }
    await takeBack("undo");
  }

  /// The task panel's card: the panel closes (a sheet would stay over the
  /// screen on the phone) and Settings opens on the Tasks page.
  function openTaskFunctions() {
    selected = null;
    openIn({ kind: "settings", section: "fn:tasks" });
  }

  /// The search dialog is open over whatever screen is showing.
  let searching = $state(false);
  /// Which space that search is narrowed to, or null for the whole notebook:
  /// Ctrl+F and the sidebar ask the notebook; a screen's own menu asks the screen.
  let searchScope = $state(null);
  /// What the search box opens with. Set when something else asks the question
  /// on the user's behalf — an ambiguous `[[link]]`, so far.
  let searchQuery = $state("");

  /// Goes to a task found by the search: its list opens, and the task itself
  /// opens in the panel. A task with no id cannot be addressed, so that one
  /// just opens its list; same if the read fails.
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
  // They answer from any screen, so they live here: the Inbox exists whatever
  // is on screen.

  const quickTask = async () => {
    const intent = await askTask({
      lists: moveTargets,
      defaultList: layout.inbox,
      dateFormat: layout.dateDisplayFormat,
      f,
    });
    if (!intent) return;
    change(() => composeTask(intent), reload);
  };

  const quickNote = async () => {
    const title = await askName(S.promptNewNote, S.newNoteTitle, { confirm: S.create });
    if (!title) return;
    change(
      () => api.createNote(layout.notesFolder, layout.notesInbox, title.trim()),
      (path) => {
        reload();
        showNote(path);
      },
    );
  };

  // Display is this machine's, not the notebook's — the same drawer Settings
  // writes to, or the phone and the desktop would fight.
  const setNoteFontSize = (size) => change(() => api.setMachineDisplay({ noteFontSize: size }));

  /// True while the note's editor holds the cursor — what the compact strip is
  /// tied to. `focusin`/`focusout` on the window rather than props: the
  /// document's focus is a window-level fact.
  let editorFocused = $state(false);
  /// The formatting strip is up: a note has the cursor, on a phone — and
  /// the bar is not switched off (Settings › Display).
  let stripUp = $derived(
    compact &&
      !!notebook &&
      view.kind === "note" &&
      editorFocused &&
      !notebook.readOnly &&
      formatBarMode !== "off",
  );
  /// …and how tall it is, measured rather than restated — the pill sizes
  /// itself from its buttons, and a number here would drift the first time one
  /// of them changed.
  let stripHeight = $state(0);

  // The strip floats over the page, so the note's scroller pads for it — never
  // a shorter window (see docs/platform-gotchas.md#android).
  $effect(() => {
    setRootVar(
      "--app-format-strip",
      stripUp && stripHeight ? `calc(${stripHeight}px + var(--app-space-8))` : null,
    );
    return () => setRootVar("--app-format-strip", null);
  });

  /// WHERE the note's formatting controls are: docked in the right panel, or
  /// floating over the canvas. Session state, like the rail; it STARTS as the
  /// Display choice, applied every time a note opens (below). On a phone it
  /// is neither: the strip appears while the editor has the cursor.
  let formatting = $state(true);

  /// Is a note being written, at all — the condition both shapes share.
  let writing = $derived(view.kind === "note" && !notebook?.readOnly);

  /// The right panel's tenant, when the controls are docked. Off is off
  /// everywhere: the panel does not hold them either.
  let formatBarOpen = $derived(
    formatting && writing && !suggesting && !selected && formatBarMode !== "off",
  );

  /// WHAT the right panel holds, decided once (shell/RightPanel.svelte): the
  /// docked formatting never opens a panel on a phone — there the strip over
  /// the keyboard is the only formatting there is.
  let panelTenant = $derived(
    suggesting ? "suggestions" : selected ? "task" : formatBarOpen && !compact ? "format" : null,
  );

  /// HOW the bar opens with a note, and WHICH SIDE the floating one hugs.
  /// Display, so it answers to this screen. Read with the app's own answer
  /// as the fallback: an empty string means "never chosen".
  let formatBarMode = $derived(modeOfFormatBar(layout.formatBar));
  let formatBarSide = $derived(sideOfFormatBar(layout.formatBarSide));

  // Opening a note puts the bar where Display says it opens. The mode is
  // read untracked on purpose: the choice is about how a note OPENS, and
  // changing it in Settings must not move the bar of a note already open.
  $effect(() => {
    if (view.kind !== "note") return;
    void view.path;
    formatting = untrack(() => formatBarMode) === "panel";
  });

  /// Standing against a side edge rather than lying along the top or bottom:
  /// the same glyphs, only the axis differs (components/FormatBar.svelte).
  let formatBarRail = $derived(formatBarSide === "left" || formatBarSide === "right");

  /// ...and the floating bar, which takes over whenever the panel does not
  /// hold them — unless the bar is off altogether.
  let formatBarFloats = $derived(
    writing && !compact && !formatBarOpen && formatBarMode !== "off",
  );

  // Opening a note closes whatever the right panel was holding: a task
  // inspector left standing over a note describes something no longer on
  // screen — the same reason leaving a place drops its selection.
  $effect(() => {
    if (view.kind !== "note") return;
    selected = null;
    suggesting = null;
  });

  /// Which period's suggestions the right panel is showing, or null. It shares
  /// the panel with the inspector, so opening one closes the other.
  let suggesting = $state(null);

  const select = (list, task) => {
    suggesting = null;
    selected = { list, task };
  };

  /// `day` is null for today or an ISO day ahead — wrapped, because the
  /// panel is closed when `suggesting` is null and today is a day too.
  const suggest = (day) => {
    selected = null;
    suggesting = { day: day ?? null };
  };

  /// With `closeInspectorOnClickAway` on, a click ANYWHERE on the content
  /// beside the panel closes the inspector — except a click that chose a task
  /// (the panel now shows it) or landed on a field or an editor. Desktop
  /// only: on a phone the panel is a sheet with its own way out.
  let selectedAtPress = null;
  const pressedAway = () => (selectedAtPress = selected);
  function clickedAway(event) {
    if (!layout.closeInspectorOnClickAway || compact || !selected) return;
    if (selected !== selectedAtPress) return;
    if (event.target.closest("input, textarea, select, [contenteditable], .cm-editor, [role='row']"))
      return;
    selected = null;
  }

  // The inspector stays open across tab and view changes: it closes only by
  // its ×, by Esc, or when its task is completed/gone.

  // Records where the user is, for `restoreLastScreen`.
  $effect(() => {
    const id = Tabs.viewId(view);
    if (notebook) api.rememberScreen(id).catch(() => {});
  });

  // The addresses the core creates travel with the notebook — never mirrored
  // on the front, where a copy goes stale.
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
      noteLayout: "",
      tableLayout: "",
      timelineGhostTasks: false,
      timelineGhostNotes: false,
      confirmDeletes: true,
      confirmImageDownloads: true,
      accentColor: "",
      theme: "",
      headingColor: "",
      features: {},
    },
  );

  // Theme, accent and heading colour are ATTRIBUTES on the document root, so
  // both regions read them; absent = what the app ships. WITH NO NOTEBOOK THE
  // APP HAS NO LOOK OF ITS OWN: every choice is per machine AND per notebook
  // (src-tauri/src/prefs.rs), so the picker wears the neutral.
  $effect(() =>
    setRootData({
      mode: modeAttribute(showsPicker ? "" : layout.mode),
      theme: paletteAttribute(showsPicker ? "" : layout.theme, wornTheme),
      accent: showsPicker ? "neutral" : layout.accentColor || null,
      headings: !showsPicker && layout.headingColor === "ink" ? "ink" : null,
      noteSize: noteFontSizeAttribute(layout.noteFontSize),
    }),
  );

  // The NOTEBOOK's theme, fetched over the bridge (shell/userTheme.js); the
  // embedded copy stays loaded underneath, so a failed fetch never leaves the
  // app without one. ORDER: the CSS goes in FIRST, only then does the attribute
  // name the theme — an attribute matching no stylesheet assigns no colours.
  $effect(() => {
    // Read every dependency before the first await: an effect only tracks
    // what it touched synchronously.
    const wanted = showsPicker ? "" : layout.theme || FACTORY_THEME;
    void themeRevision;
    const factory = wanted === FACTORY_THEME;
    const carried = factory || userThemes.some((theme) => theme.name === wanted);

    if (!wanted || !carried) {
      applyUserTheme(null);
      wornTheme = null;
      wornThemeBlocked = 0;
      return;
    }

    let cancelled = false;
    api
      .userThemeCss(wanted)
      .then((sheet) => {
        if (cancelled) return;
        applyUserTheme(sheet.css);
        wornTheme = factory ? null : wanted;
        wornThemeBlocked = sheet.blocked ?? 0;
      })
      .catch(() => {
        // A theme that cannot be read is a theme that is not worn — the
        // attribute stays on the default, and Settings still lists the file.
        if (cancelled) return;
        applyUserTheme(null);
        wornTheme = null;
        wornThemeBlocked = 0;
      });
    return () => {
      cancelled = true;
    };
  });

  // The three faces ride on the root as custom properties, reaching both
  // regions at once; the editor inherits its family from the box around it.
  // A null REMOVES the property — that is how "the app's own face" is spelled.
  $effect(() => {
    const vars = fontVars(showsPicker ? {} : layout);
    for (const [name, value] of Object.entries(vars)) setRootVar(name, value);
  });

  // The platform rides on the root too, apart from the layout because it is
  // not a notebook's property: the onboarding screen still runs on a phone.
  $effect(() => setRootData({ platform, os: os || null }));

  /// Is this part of the app switched on? One reader for the whole shell;
  /// screens get it as a prop, the same way `dayRefs` travels.
  let f = $derived(reader(layout.features ?? {}));

  /// Where a quick note can go (services/noteTargets.js): the Home's capture
  /// and the Settings picker read the same list, so they cannot disagree.
  let quickTargets = $derived(
    noteTargets({
      notesFolder: layout.notesFolder,
      notesInbox: layout.notesInbox,
      folders: noteFolders,
      spaces,
      fixedShown: f("notesSpace"),
    }),
  );

  /// …and the tasks mirror (services/taskTargets.js): where a quick TASK can
  /// go, and the one the notebook chose.
  let quickTaskChoices = $derived(
    taskTargets({
      inbox: layout.inbox,
      completed: layout.completed,
      lists: notebook?.lists ?? [],
      spaces,
      fixedShown: f("tasksSpace"),
    }),
  );
  /// (`quickTask` above is the SHORTCUT that opens the dialog — this is
  /// where the quick capture lands.)
  let quickTaskTo = $derived(quickTaskTarget(layout.quickTaskList ?? "", quickTaskChoices));

  /// THE HOME'S DAY: which day the calendar has open, or null for today. The
  /// shell's, not the screen's: on a phone the head that picks it is drawn
  /// here, on the chrome. Back to today whenever the notebook's day turns.
  let homeDay = $state(null);
  /// `{done, total}` for that day, counted by the screen off what it read,
  /// for the head to say.
  let homeSummary = $state(null);
  /// On a phone: how much of the head is unfolded (components/DayHead.svelte)
  /// — 0 one line, 1 the week, 2 the week and the day's summary. Opens whole,
  /// except on a short screen (a phone on its side), where it starts folded.
  let homeLevel = $state(isShortScreen() ? 0 : 2);
  let seenToday = null;
  $effect(() => {
    const today = clock?.today ?? null;
    if (today === seenToday) return;
    seenToday = today;
    homeDay = null;
  });
  /// What the chosen day is against today — the + composes for today and a
  /// day ahead, never for a day gone by.
  let homeKind = $derived(dayKind(homeDay ?? clock?.today, clock?.today));

  let userLists = $derived(
    (notebook?.lists ?? []).filter(
      (entry) =>
        entry.path !== layout.completed &&
        entry.path !== layout.inbox &&
        // Lists of user spaces are reached through their space, not
        // flattened into the fixed sidebar — two Inboxes side by side with
        // the same label would be unreadable.
        entry.path.startsWith(`${layout.tasksFolder}/`),
    ),
  );

  let userSpaces = $derived(spaces.filter((sp) => !sp.fixed));

  /// Every notes space — where a picked note can be moved to. The fixed Notes
  /// space is in it: it is a place notes belong.
  let noteSpaces = $derived(
    spaces.filter((sp) => sp.kind === "notes").map((sp) => ({ path: sp.path, name: sp.name })),
  );

  /// The fixed Tasks space, in the shape the tasks screen reads, so the
  /// Tasks screen hosts the notebook's own source (arrangement and all)
  /// instead of a stand-in. The folder is the space's own path.
  const tasksSpaceFolder = $derived(layout.inbox ? folderOf(layout.inbox) : null);
  let inboxSource = $derived.by(() => {
    const sp = spaces.find((sp) => sp.kind === "tasks" && sp.path === tasksSpaceFolder);
    // `name: null` — the Tasks screen titles itself, not with the space.
    return sp ? sourceOf(sp, { name: null }) : null;
  });

  // What colour each space reads as — a member of a group follows the group.
  // The rainbow is the notebook's call and travels in the layout; the dealing
  // is the service's, so sidebar, title and tab dot agree.
  let autoColors = $derived({ auto: !!layout?.autoSpaceColors, accent: layout?.accentColor ?? null });
  let spColors = $derived(spaceColors(spaces, groups, autoColors));
  let grColors = $derived(groupColors(spaces, groups, autoColors));

  // Where the open task can move: ANY tasks list of the notebook, minus the
  // Completed files (moving into Completed is what completing does). The same
  // set the space's bulk "Move to…" offers.
  let moveTargets = $derived(
    (notebook?.lists ?? []).filter((entry) => entry.name !== layout.completedName),
  );

  /// What a tab calls itself (shell/views.js), with the notebook's own display
  /// names for the spaces.
  const title = (v) => titleOf(v, spaces);

  /// The colour of the space a view comes from — feeds the tab dot. A fixed
  /// space carries none, so its tab falls back to the theme brand in CSS.
  const colorOf = (v) => spColors[spaceOfView(v, layout)] ?? null;
  /// The origin badge of an item shown outside its space (services/origin.js):
  /// one closure over the snapshot, handed to every screen that draws cards
  /// from more than one place.
  const originOfItem = (item) =>
    originOf(item, { lists: notebook.lists, spaces, colors: spColors });

  // ---- what can be done to the SCREEN itself ----
  // Four actions served twice: from the page ⋮ and from a right-click on the
  // empty canvas. Which apply is decided by the view, never by the caller.

  /// The space the current screen lives in (shell/views.js) — null on a screen
  /// that is inside none.
  let currentSpace = $derived(spaceOfView(view, layout));

  /// The user space being looked at, when it is one — the fixed three are the
  /// app's own folders and are not renamed from here (`userSpaces` is already
  /// the list without them).
  let renamableSpace = $derived(
    view.kind === "space" ? (userSpaces.find((sp) => sp.path === view.sp) ?? null) : null,
  );

  /// What a space is called on screen, by its address — the address itself
  /// when the snapshot does not carry it (yet).
  const spaceName = (path) => spaces.find((sp) => sp.path === path)?.name ?? path;

  /// What "here" is called, for the menu label and the search box.
  let hereLabel = $derived(
    view.kind === "note"
      ? openNote.title || title(view)
      : currentSpace
        ? spaceName(currentSpace)
        : S.thisNotebook,
  );

  /// The address whose FOLDER the file manager should open: the document when
  /// there is one, the space otherwise, the notebook root when neither.
  let hereAddress = $derived(
    view.kind === "note"
      ? `${view.folder}/${view.path}`
      : view.kind === "list"
        ? view.list
        : currentSpace,
  );

  const revealHere = () =>
    api.openInFileManager(hereAddress || null).catch(fail);

  /// Search, narrowed to where the user is. In a note that is the note itself
  /// — the editor's own panel, which is also where replacing lives; anywhere
  /// else it is the space, asked of the same box Ctrl+F opens.
  function findHere() {
    if (view.kind === "note") {
      noteEditor?.openFind();
      return;
    }
    searchScope = currentSpace;
    searching = true;
  }

  /// The four screen actions, in the order both menus show them (shell/menus.js).
  let screenActions = $derived(
    screenActionsOf({
      readOnly: !!notebook?.readOnly,
      isNote: view.kind === "note",
      hereLabel,
      renamableSpace,
      findHere,
      revealHere,
      renameSpace: renameSpaceTo,
      openReplace: () => noteEditor?.openReplace(),
    }),
  );

  /// The open note's banner: one row, the eight colours folded under it.
  let bannerMenu = $derived(
    bannerMenuOf({
      banner: openNote.banner,
      setBanner: setNoteBanner,
      pickImage: () => (pickingImage = "banner"),
    }),
  );

  /// The formatting buttons this notebook does not draw. One list, three bars
  /// (the panel, the desktop strip, the Android strip), so none can still
  /// offer a picture nobody can embed.
  let hiddenFormats = $derived([
    ...(f("wikiLinks") ? [] : ["md.reference"]),
    ...(f("embeds") ? [] : ["md.attach"]),
    ...(f("tables") ? [] : TABLE_FORMATS),
  ]);

  /// Where the person is in a table — `{header}` or null — as the editor
  /// last reported it.
  let noteTable = $state(null);

  /// The table buttons that mean nothing where the caret is: outside a
  /// table everything but Insert, inside one Insert (a table does not nest)
  /// and, in the header row, Delete row (a table without one is not a table).
  let inactiveFormats = $derived(
    noteTable
      ? ["table.insert", ...(noteTable.header ? ["table.deleteRow"] : [])]
      : TABLE_FORMATS.filter((id) => id !== "table.insert"),
  );

  /// What the right button offers on the empty canvas: the screen's actions,
  /// plus the banner when the screen IS a note — the wireframe's second door
  /// to it.
  let canvasMenu = $derived(
    view.kind === "note" && !notebook?.readOnly && f("banners")
      ? [bannerMenu, ...screenActions]
      : screenActions,
  );

  /// What an open NOTE can be asked to do — the page's ••• and the ⋮ of the
  /// note's own panel read the same list (components/NotePanel.svelte).
  let noteActions = $derived(
    noteActionsOf({
      readOnly: !!notebook?.readOnly,
      isNote: view.kind === "note",
      f,
      pinned: openNote.pinned,
      togglePin: toggleNotePin,
      rename: renameCurrentNote,
      remove: deleteCurrentNote,
      bannerMenu,
      pickImage: () => (pickingImage = "body"),
      fontSize: layout.noteFontSize,
      setFontSize: setNoteFontSize,
      compact,
      formatting,
      setFormatting: (on) => (formatting = on),
      formatBarMode,
    }),
  );

  /// The page menu of the current screen — the `•••` of the wireframe.
  let pageMenu = $derived(
    pageMenuOf({
      noteActions,
      screenActions,
      readOnly: !!notebook?.readOnly,
      view,
      inbox: layout.inbox,
      completed: layout.completed,
      renameList: renameCurrentList,
      deleteList: deleteCurrentList,
    }),
  );

  // ---- the canvas's own right-click menu ----
  // The same actions, at the pointer. Only the EMPTY canvas: a click on a task
  // row, a card or a button has its own meaning, and stealing it would make
  // the right button unpredictable (the sidebar keeps the same pact).
  let canvasMenuAt = $state(null);

  function openCanvasMenu(event) {
    if (event.target.closest("button, a, input, textarea, .cm-editor, [role='menu']"))
      return;
    if (screenActions.length === 0) return;
    event.preventDefault();
    canvasMenuAt = { x: event.clientX, y: event.clientY };
  }

  // --- the open note's document actions, owned by the shell because each
  // one changes what the tab points at (shell/noteDocument.js) ---

  let noteEditor = $state(null);

  const {
    toggleNotePin,
    setNoteTags,
    createNoteTag,
    setNoteBanner,
    runFormat,
    useImage,
    addFilesToNote,
    fetchRemoteImage,
    openNoteByTitle,
    renameCurrentNote,
    deleteCurrentNote,
    moveOpenNote,
  } = makeNoteDocument({
    view: () => view,
    note: () => openNote,
    setNote: (next) => (openNote = next),
    editor: () => noteEditor,
    readOnly: () => !!notebook?.readOnly,
    // Wrapped, not passed: `change`, `reload` and `showNote` are declared
    // further down and the factory runs now.
    change: (run, then) => change(run, then),
    fail,
    reload: () => reload(),
    refreshNotebook,
    replaceTabView: (from, to) => (tabs = Tabs.replaceView(tabs, Tabs.viewId(from), to)),
    closeActiveTab: () => closeTab(active),
    goTo,
    showNote: (path, folder) => showNote(path, folder),
    openSearchAt: (title) => {
      searchScope = null;
      searchQuery = title;
      searching = true;
    },
    picking: () => pickingImage,
    pickImage: (purpose) => (pickingImage = purpose),
  });

  // Which questions are still being asked, and how to stop asking one —
  // installed once, here, because the shell is the only thing that holds the
  // notebook's settings. Every screen then asks without carrying them down
  // through props (services/dialog.js).
  $effect(() => {
    setConfirmPolicy({
      settings: {
        confirmDeletes: layout.confirmDeletes,
        confirmImageDownloads: layout.confirmImageDownloads,
      },
      save: (key) => change(() => api.setNotebookSettings({ [key]: false })),
    });
  });

  function fail(e) {
    error = describeError(e);
    console.error("[jott]", e);
  }

  const reload = () => (reloadKey += 1);
  /// Both halves of "something changed elsewhere": the layout (sidebar,
  /// counts) and whatever screen is open.
  const refreshAll = () => {
    refreshNotebook();
    reload();
  };

  // One round trip instead of four: the auto-save calls this on every pause
  // in typing, so the fan-out was the hottest path in the app.
  async function refreshNotebook() {
    try {
      const snap = await api.notebookSnapshot();
      notebook = snap.info;
      clock = snap.clock;
      counts = snap.counts;
      conflicts = snap.conflicts;
      spaces = snap.spaces ?? [];
      groups = snap.groups ?? [];
      tags = snap.tags ?? [];
      dayRefs = new Set((snap.day ?? []).map((ref) => `${ref.path}#${ref.id}`));
      noteFolders = await api.noteFolders(snap.info.layout.notesFolder);
      spacesSort = await api.spacesSort();
      // `?? []` because a bridge that does not answer this command is a
      // notebook with no themes, not a crash in the effect that reads them.
      userThemes = (await api.userThemes()) ?? [];
      await refreshReminders();
    } catch {
      // No notebook open (or it just closed): back to onboarding.
      notebook = null;
    }
  }

  /// Writes a new theme into the notebook, seeded with the look in use: a
  /// theme is ~170 declarations, and a file that already works is the only
  /// honest starting point. Wearing a notebook theme duplicates THAT one.
  async function newThemeFrom(name) {
    const css = seedFrom({ factory: factoryThemeCss, worn: userThemeApplied() });
    const made = await api.createUserTheme(name, css);
    userThemes = (await api.userThemes()) ?? [];
    return made;
  }

  /// Opens a notebook and settles the app around it. `create` is true only
  /// for the picker's "Create a new notebook", which may make one out of a
  /// folder that is not one yet; every other door demands a notebook.
  async function openAt(path, { create = false } = {}) {
    busy = true;
    error = null;
    failedOpen = null;
    opening = path;
    try {
      notebook = await api.openNotebook(path, create);
      await refreshNotebook();

      const restored = viewFromId(await api.screenToRestore());
      if (restored) goTo(restored);

      scheduleTurn();
      reload();
    } catch (e) {
      // The picker's own error panel says which door and why; the generic
      // banner would only repeat the reason without the door.
      failedOpen = { path, create, message: describeError(e) };
      console.error("[jott]", e);
    } finally {
      busy = false;
      opening = null;
    }
  }

  /// Whether Android is willing to let the app out of its own container:
  /// `"granted"`, `"denied"`, or `"notNeeded"` everywhere else. The Activity
  /// says so when the user comes back from the Settings screen.
  let storage = $state(storageAccess());
  $effect(() => watchStorageAccess((next) => (storage = next)));

  // The keyboard went away: whatever holds the focus stops being typed into.
  // Exceptions: the Home's composer stays until a task is created or it is
  // pulled down, and a composer CONTROL holding focus (chip, portaled panel)
  // is the keyboard stepping aside for a menu. See docs/platform-gotchas.md#android
  $effect(() =>
    onKeyboardHidden(() => {
      const focused = document.activeElement;
      if (focused?.closest?.("[data-popout]")) return;
      const composer = focused?.closest?.(".task-composer");
      if (composer && !focused.classList.contains("task-composer__input")) return;
      if (focused && focused !== document.body) focused.blur?.();
    }),
  );

  /// How many notebooks the picker is offering, or null before it has read.
  /// The one thing under that screen that depends on the answer is Android's
  /// private-folder offer, which only helps where there is nothing else.
  let recentCount = $state(null);

  /// The app's own container — non-null only on Android, where it is what the
  /// user gets by declining the permission, and where notebooks made by
  /// earlier versions already live.
  let privateFolder = $state(null);

  /// The in-app folder browser is open (Android only), holding the `resolve`
  /// of whoever is waiting for a folder; null when closed. A callback, not a
  /// flag: two doors ask the same question (open this notebook / move it).
  let picking = $state(null);

  /// Asks the machine which folder; null when the user backed out. On Android
  /// the permission comes FIRST — asking answers null, and the `storage`
  /// watcher brings the user back — then the system chooser, with the app's
  /// own browser as fallback when its answer is not a path (androidStorage.js).
  async function pickAFolder() {
    if (storage === "notNeeded") return (await api.pickFolder()) ?? null;
    if (storage !== "granted") {
      requestStorageAccess();
      return null;
    }
    const picked = await pickFolderNatively();
    if (picked?.cancelled) return null;
    if (picked?.path) return picked.path;
    return new Promise((resolve) => (picking = resolve));
  }

  /// Where both doors to the notebooks screen end.
  async function showNotebooks() {
    if (mobile) {
      showingPicker = true;
      return;
    }
    try {
      await api.openWindow(null);
    } catch (e) {
      fail(e);
    }
  }

  /// A card on the notebooks screen was clicked. With `pickerCloses` on (the
  /// default) THIS window becomes the notebook — reused, not replaced, so no
  /// frame of empty window. With it off, the notebook opens in a window of
  /// its own and the picker stays: two notebooks open at once.
  async function openFromPicker(path) {
    // A picker shown over a notebook (the phone) always lands here: there is
    // no second window to open it in.
    if (showingPicker) {
      showingPicker = false;
      await openAt(path);
      return;
    }
    // A bridge that cannot answer must not strand the click: closing is the
    // default, and it always ends with the notebook on screen.
    const closes = (await api.pickerCloses().catch(() => true)) ?? true;
    if (closes) {
      await openAt(path);
      return;
    }
    try {
      await api.openWindow(path);
    } catch (e) {
      fail(e);
    }
  }

  /// The footer's menu: a failure to list is reported and reads as empty — the
  /// manage row is still there, so the menu never opens on nothing.
  const listNotebooks = () => api.recentNotebooks().catch((e) => (fail(e), []));

  /// THIS window becomes `path` — the tabs start over, because every one of
  /// them named a place in the notebook being left. The middle button asks
  /// for a window instead, where there are windows to ask for.
  async function switchNotebook(path, newWindow = false) {
    if (newWindow && !mobile) {
      try {
        await api.openWindow(path);
      } catch (e) {
        fail(e);
      }
      return;
    }
    tabs = [{ views: [{ kind: "home" }], at: 0 }];
    active = 0;
    await openAt(path);
  }

  /// The picker's two doors: ask for a folder, then open what is there.
  async function chooseFolder({ create = false } = {}) {
    try {
      const path = await pickAFolder();
      if (path) await openAt(path, { create });
    } catch (e) {
      fail(e);
    }
  }


  // ---- changing the notebook ----
  // Every write is the `act` every screen uses (services/act.js). `change(fn,
  // after)` runs `after` on the RELOADED notebook, so a new space can be
  // opened once the snapshot carries it.
  const change = makeAct({ load: refreshNotebook, onError: fail });

  /// Only where there is somewhere to write. A read-only notebook still
  /// reorders nothing, and the sidebar's own guard is not enough: a drop can
  /// also come from a drag that started before the notebook was reopened.
  const canWrite = () => !notebook?.readOnly;

  // Sidebar drag-to-reorder (the shared `reorderable` action reports from→to).
  // The order is a notebook preference kept in the config, never a change to
  // the files: lists and spaces sort by it, everything else stays put.

  const reorderLists = (from, to) =>
    canWrite() &&
    change(() =>
      api.setOrder(
        `lists:${layout.tasksFolder}`,
        movedItem(
          userLists.map((l) => l.name),
          from,
          to,
        ),
      ),
    );

  /// The sidebar's whole running order — groups and loose spaces alike,
  /// flattened to names. One namespace orders both: a group's members are
  /// contiguous, which is what lets the sidebar read a group's place off its
  /// members instead of keeping a second ordering in step.
  const reorderEntries = (names) => canWrite() && change(() => api.setOrder("spaces", names));

  /// Two spaces dropped one on the other become a group. The name is asked
  /// for, and cancelling leaves everything where it was — a gesture that
  /// silently reorganises the sidebar is a gesture nobody trusts.
  async function groupWith(host, moving) {
    if (!canWrite()) return;
    const name = await askName(S.nameGroup, host.name, { confirm: S.create });
    if (!name?.trim()) return;
    change(async () => {
      const folder = await api.createGroup(name.trim());
      // Paths, both sides: the new group's and the two spaces' — moving
      // one names it by the address it has RIGHT NOW, and the first move
      // changes the second one's parent, not its own address.
      await api.moveSpace(host.path, folder);
      await api.moveSpace(moving.path, folder);
    });
  }

  const setSpacesSort = (sort) => canWrite() && change(() => api.setSpacesSort(sort));

  // ---- what the shell writes to the notebook (shell/notebookWrites.js) ----
  const {
    createSpace,
    renameSpaceTo,
    setSpaceAppearance,
    deleteSpaceAt,
    moveSpaceTo,
    createGroup,
    renameGroupTo,
    setGroupAppearanceAt,
    deleteGroupAt,
    moveGroupTo,
    arrangementOf,
    renameCurrentList,
    deleteCurrentList,
  } = makeNotebookWrites({
    change,
    view: () => view,
    goTo,
    openTab,
    replaceTabView: (from, to) => (tabs = Tabs.replaceView(tabs, Tabs.viewId(from), to)),
    reload,
    inbox: () => layout.inbox,
    setError: (text) => (error = text),
  });

  const spaceArrangement = arrangementOf(() => (view.kind === "space" ? view.sp : null));

  /// The FIXED Notes and Tasks screens are spaces too, and each needs an
  /// arrangement of its own — a missing optional handler fails silently.
  /// Notes' lives in `jott.notes/.space.json`; Tasks' in the Inbox's space.
  let notesSpace = $derived(spaces.find((sp) => sp.path === layout.notesFolder) ?? null);
  const notesArrangement = arrangementOf(() => layout.notesFolder);
  const tasksArrangement = arrangementOf(() => tasksSpaceFolder);

  // ---- reminders (shell/remindersHost.js) ----
  const { refresh: refreshReminders } = makeRemindersHost({
    open: () => !!notebook,
    enabled: () => f("remind"),
    mobile: () => mobile,
    openTask: showFoundTask,
    fail,
  });

  // The rollover has to happen with the app open too, not only when the
  // notebook is reopened. The core says when; `shell/turn.js` schedules the
  // wake-up, from the clock the last tick brought back.
  let stopTurns = () => {};
  function scheduleTurn() {
    stopTurns();
    stopTurns = scheduleTurns({
      clock: () => clock,
      tick: async () => {
        await api.refreshDay();
        clock = await api.dayClock();
        reload();
      },
      onError: fail,
    });
  }

  // Someone else wrote to the notebook (Syncthing, Obsidian, a text editor).
  // A config change reloads the layout too — that is where the theme, the
  // accent and every other synced preference travel (the bridge has already
  // re-read the file by the time this event arrives).
  listen("notebook://changed", async (event) => {
    const kind = event.payload?.kind;
    // A stylesheet under `.jott/themes/` changed: re-read the list (a theme
    // may have appeared or gone) and re-fetch what is worn. Nothing else about
    // the notebook moved, so nothing else is reloaded.
    if (kind === "theme") {
      userThemes = (await api.userThemes().catch(() => userThemes)) ?? [];
      themeRevision += 1;
      return;
    }
    if (kind === "list" || kind === "config") await refreshNotebook();
    reload();
  });

  /// What THIS window was opened to do (shell/entry.js). Read once: an
  /// address does not change under a window.
  const entry = entryOf();

  // What the window opens on. Three answers, and only the third asks the
  // machine: a window created by `open_window` carries its instruction in
  // its address.
  (async () => {
    try {
      // Kept for the picker's second choice on Android: a fallback, not a
      // default (androidStorage.js). `last_notebook` reopens it for anyone using it.
      privateFolder = await api.defaultFolder();

      if (entry.kind === "picker") return;
      if (entry.kind === "notebook") {
        await openAt(entry.path);
        return;
      }

      // The first window comes back to the WORK by default; the picker's ⋮ is
      // where someone who keeps several notebooks says otherwise.
      if (await api.opensOnPicker()) return;
      const last = await api.lastNotebook();
      if (last) await openAt(last, { create: false });
      else await refreshNotebook();
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  })();

  /// What this build calls itself, for the picker. The FULL version, patch
  /// included: it is what goes into a bug report.
  let version = $state("");
  api
    .appVersion()
    .then((v) => (version = v ?? ""))
    .catch(() => {});

  /// A newer released version, when the daily check found one. Everything
  /// about whether to even ask lives in services/update.js; a launch that is
  /// offline, up to date or switched off simply never sets this.
  let update = $state(null);
  let installing = $state(false);
  autoCheck()
    .then((found) => (update = found ?? update))
    .catch(() => {});

  async function installNow() {
    installing = true;
    try {
      await installUpdate();
    } catch (e) {
      fail(e);
    } finally {
      installing = false;
    }
  }

  /// The offer to put Jott in the applications menu (an AppImage not in it
  /// yet). Same shape as the update notice: one line, two buttons, gone once
  /// answered. Whether to ask is services/desktopEntry.js's.
  let menuOffer = $state(null);
  let addingToMenu = $state(false);
  offerMenuEntry()
    .then((found) => (menuOffer = found))
    .catch(() => {});

  async function addToMenuNow() {
    addingToMenu = true;
    try {
      await addToMenu();
      // Gone because it is done, not because it was refused: nothing is
      // remembered, so moving the file brings the offer back.
      menuOffer = null;
    } catch (e) {
      fail(e);
    } finally {
      addingToMenu = false;
    }
  }

  function dismissMenuOffer() {
    menuOffer = null;
    dismissMenuEntry().catch(() => {});
  }

  /// Opening a document replaces what the tab shows, the way clicking a link
  /// does — a new tab is a deliberate gesture (middle click, or the option in
  /// the context menu), never the default.
  const showNote = (path, folder = layout.notesFolder, newTab = false) =>
    openIn({ kind: "note", folder, path }, newTab);

  /// The folders of the OPEN note's space — where it can be filed without
  /// leaving the space. The shell's `noteFolders` is the fixed space's, kept
  /// for Settings; a note is as often in a space of the user's own.
  let openNoteFolders = $state([]);
  $effect(() => {
    const space = view.kind === "note" ? view.folder : null;
    if (!space) {
      openNoteFolders = [];
      return;
    }
    api
      .noteFolders(space)
      .then((found) => (openNoteFolders = found))
      .catch(() => (openNoteFolders = []));
  });

  /// The folder of the open note within its space — `""` at the space's root.
  let openNoteFolder = $derived(view.kind === "note" ? folderOf(view.path) : "");

  /// Where the open note could go: its own space's folders, then every other
  /// notes space (into its inbox). The same set the board's cards offer.
  let noteMoveTargets = $derived.by(() => {
    if (view.kind !== "note" || notebook?.readOnly) return [];
    const here = view.folder;
    const name = spaceName(here);
    const at = openNoteFolder;
    return [
      { path: "", label: S.allNotes },
      ...openNoteFolders.map((it) => ({ path: it.path, label: it.path })),
    ]
      .map((it) => ({
        label: it.label,
        context: name,
        disabled: it.path === at,
        run: () => moveOpenNote(here, it.path),
      }))
      .concat(
        noteSpaces
          .filter((sp) => sp.path !== here)
          .map((sp) => ({
            label: sp.name,
            context: S.notes,
            run: () => moveOpenNote(sp.path, layout.notesInbox),
          })),
      );
  });

  /// A note opened FROM a board. `fresh`: the board just created it empty, so
  /// the cursor goes into its body. `newTab`: the board reports which door
  /// was used, and only here is a tab opened.
  const openNoteFromBoard = (path, folder, { fresh = false, newTab = false } = {}) => {
    if (fresh) focusNewNote = true;
    showNote(path, folder ?? undefined, newTab);
  };

  const showList = (path, newTab = false) => openIn({ kind: "list", list: path }, newTab);

</script>

<!-- The window takes the drop it was not offered, and does nothing with it.
     With `dragDropEnabled: false` the webview handles drops itself, and
     WebKit NAVIGATES to a dropped file — the app replaced by a picture.
     Refusing here makes the editor's handler the only place a file lands. -->
<svelte:window
  onkeydown={onKeydown}
  ondragover={(e) => e.preventDefault()}
  ondrop={(e) => e.preventDefault()}
  onfocusin={(e) => (editorFocused = !!e.target?.closest?.(".cm-editor"))}
  onfocusout={(e) => {
    // `relatedTarget` is where the focus is GOING. Tapping a button on the
    // strip itself must not take the strip away from under the finger.
    const to = e.relatedTarget;
    if (to?.closest?.(".cm-editor, .format-strip")) return;
    editorFocused = false;
  }}
/>

<!-- The frameless window's bar is the only handle to move or close the
     window, so it renders before a notebook is open. `data-region` is an
     element's colour ground (CHROME here, CANVAS on the content panel). The
     sidebar width is on `.window`: the title bar's brand column is as wide. -->

<!-- The sidebar is written ONCE and placed twice: a column on the desktop, a
     drawer below 768px. The props are its contract and must not fork with
     the place. -->
{#snippet sidebar()}
  <Sidebar
    {notebook}
    {userLists}
    {userSpaces}
    spaceColor={(path) => spColors[path] ?? null}
    groupColor={(folder) => grColors[folder] ?? null}
    {counts}
    {isOpen}
    {holds}
    rail={railed && !compact}
    {compact}
    open={drawerOpen}
    sliding={drawerAt !== null}
    onToggleRail={() =>
      compact ? (drawerOpen = false) : (railed = !railed)}
    onOpen={openIn}
    onOpenList={showList}
    onNotebooks={showNotebooks}
    onListNotebooks={listNotebooks}
    onSwitchNotebook={switchNotebook}
    onReorderLists={reorderLists}
    {f}
    onReorderEntries={reorderEntries}
    onGroupWith={groupWith}
    onMoveGroup={moveGroupTo}
    {spacesSort}
    onSetSpacesSort={setSpacesSort}
    onCreateSpace={createSpace}
    onRenameSpace={renameSpaceTo}
    onSetSpaceAppearance={setSpaceAppearance}
    onDeleteSpace={deleteSpaceAt}
    {groups}
    onCreateGroup={createGroup}
    onRenameGroup={renameGroupTo}
    onSetGroupAppearance={setGroupAppearanceAt}
    onDeleteGroup={deleteGroupAt}
    onMoveSpace={moveSpaceTo}
    onSearch={() => {
      searchScope = null;
      searching = true;
    }}
  />
{/snippet}

<div
  class="window"
  class:window--flush={flush || mobile}
  class:window--resizing={resizing}
  class:window--compact={compact}
  class:window--pushed={compact && drawerOpen}
  class:window--sliding={drawerAt !== null}
  style={[
    sidebarWidth ? `--app-sidebar-left: ${sidebarWidth}px` : "",
    panelWidth ? `--app-sidebar-right: ${panelWidth}px` : "",
  ]
    .filter(Boolean)
    .join("; ") || undefined}
  data-region="chrome"
>
  <!-- Frameless: draw our own resize grips at the edges. Not while flush —
       a maximized window has nothing to resize into. -->
  {#if !flush && !mobile}
    <ResizeHandles />
  {/if}

  <!-- Everything the drawer pushes aside, in one box: the push is a transform
       on THIS, not on the window, so the drawer (a sibling) stays put. Inert
       at every other width. -->
  <div class="window__page">
  <!-- Two bars, and the shell picks (shell/TopBar.svelte). No page chrome over
       the notebooks screen: the compact bar's controls belong INSIDE a
       notebook; the desktop keeps its title bar, stripped to the window
       buttons — the frameless window has no other handle. -->
  {#if compact && !showsPicker}
    <TopBar
      {canBack}
      {canForward}
      onBack={goBackAnywhere}
      onForward={goForward}
      onOpenDrawer={() => (drawerOpen = true)}
      {drawerOpen}
      onOpenTabs={notebook ? () => (tabsOpen = true) : null}
      tabCount={tabs.length}
      menu={pageMenu}
      pageKey={title(view)}
      {mobile}
      buttons={windowButtons}
      over
      region={canvasRisen ? "canvas" : "chrome"}
    />
  {:else if !compact}
    <TitleBar rail={railed} buttons={windowButtons} brand={!!notebook}>
      {#if notebook}
        <TabBar
          {tabs}
          {active}
          titleOf={title}
          {colorOf}
          onSelect={(i) => (active = i)}
          onClose={closeTab}
          onOpenNew={openNewTab}
          onMove={(from, to) =>
            ({ tabs, active } = Tabs.move(tabs, active, from, to))}
        />
      {/if}
    </TitleBar>
  {/if}

  <!-- `--picker` while there is no notebook: the picker is a screen with a
       floor, so the main area becomes a column and hands it the height left.
       With a notebook open the shell inside lays itself out. -->
  <main class="shell__main" class:shell__main--picker={showsPicker}>
    {#if showsPicker}
      <NotebookPicker
        {opening}
        {version}
        {busy}
        {compact}
        {storage}
        {privateFolder}
        {recentCount}
        {error}
        {failedOpen}
        onChoose={chooseFolder}
        onOpen={openFromPicker}
        onOpenAt={openAt}
        onPickFolder={pickAFolder}
        onListed={(n) => (recentCount = n)}
        onClose={showingPicker ? () => (showingPicker = false) : null}
        onDismissError={() => (error = null)}
        onDismissFailed={() => (failedOpen = null)}
        onError={fail}
      />
  {:else}
    <div
      class="shell"
      class:shell--compact={compact}
      use:drawerSwipe={{
        enabled: compact,
        open: drawerOpen,
        onOpen: () => (drawerOpen = true),
        onClose: () => (drawerOpen = false),
        onDrag: (at) => (drawerAt = at),
      }}
    >
      <!-- LEFT: the sidebar as a column. Below 768px it is the SAME sidebar as
           a drawer; the scrim is a sibling, not a wrapper, so the drawer keeps
           its place in the flex row. -->

      {#if !compact}
        {@render sidebar()}
      {/if}

      <!-- The edge between the two panels is a handle. Gone with the rail,
           whose width is the app's, not a preference. A focusable separator,
           so the width is reachable from the keyboard. -->
      {#if !railed && !compact}
        <PanelResizer
          limits={SIDEBAR}
          width={sidebarWidth}
          label={S.resizeSidebar}
          onWidth={(w) => (sidebarWidth = w)}
          onCommit={(w) => api.rememberSidebarWidth(w).catch(() => {})}
          onResizing={(on) => (resizing = on)}
        />
      {/if}

      <!-- CENTRE: page header (back/forward, title, ••• menu), then the screen. -->
      <section
        class="shell__centre"
        data-region="canvas"
        bind:this={centre}
        use:pullToSearch={{ enabled: compact && !!notebook, onPull: openSearch }}
      >
        <!-- The search, pulled down from the top of the page
             (actions/pullToSearch.js). Drawn here and not in the header
             because the header scrolls away with the page below 768px. -->
        {#if compact}
          <div class="pull-search" aria-hidden="true">
            <span class="pull-search__glass"><Icon name="magnifying-glass" size="1.125rem" /></span>
          </div>
        {/if}
        {#if compact && view.kind === "home"}
          <!-- The Home's head IS its header on a phone, on the chrome above the
               canvas: drawn here because the screen is the canvas and this
               sits above it. -->
          <DayHead
            compact
            today={clock?.today}
            day={homeDay}
            weekStartsOn={clock?.weekStartsOn ?? "monday"}
            summary={homeSummary}
            dot={colorOf(view)}
            level={homeLevel}
            onPick={(iso) => (homeDay = iso)}
            onHome={() => (homeDay = null)}
            onLevel={(next) => (homeLevel = next)}
          />
        {:else}
        <PageHeader
          {compact}
          title={/* Below 768px an open note names itself: its head draws the
            title, on the banner's chip or as the heading a note with no banner
            has (components/NoteBanner.svelte). Repeating it here was the same
            "o nome dito duas vezes" the space screens were fixed for
            (2026-08-18), and the wireframes give the room to the banner. */
          compact && view.kind === "note"
            ? ""
            : compact && view.kind === "settings" && settingsSub
              ? settingsSub
              : title(view)}
          {canBack}
          {canForward}
          onBack={goBackAnywhere}
          onForward={goForward}
          onRenameTitle={view.kind === "note" && !notebook.readOnly
            ? renameCurrentNote
            : null}
          menu={pageMenu}
          dot={colorOf(view)}
        />
        {/if}

        <!-- CANVAS: what the screen is drawn on, and the box the floating
             controls are measured from, so they sit against the TOP OF THE
             SCREEN and not the top of the panel; the header is outside it. -->
        <div class="shell__canvas">
          {#if undoOffer}
            <!-- The floating undo: one line over the canvas's bottom edge,
                 gone on its own, on Undo, or on the ×. -->
            <div class="shell__toast">
              <Notice
                tone="info"
                icon={false}
                title={S.undoOfferText(undoOffer)}
                floating
                onDismiss={dropOffer}
                dismissLabel={S.dismissError}
              >
                {#snippet actions()}
                  <button class="theme-btn theme-btn--primary theme-btn--xs" onclick={takeOffer}
                    >{S.undoOfferAction}</button
                  >
                {/snippet}
              </Notice>
            </div>
          {/if}
          <!-- The formatting controls, floating: what a note has whenever the
               right panel is not holding them. THE TWO PILLS TRAVEL TOGETHER,
               centred as one row: a numeric gap would drift with each glyph. -->
          {#if formatBarFloats}
            <div class="format-floats format-floats--{formatBarSide}">
              <div class="format-float">
                <!-- CANVAS, and it matters: the folded panel is portaled out of
                     the window by `keepOnScreen`, so it paints whatever region
                     it was TOLD — and this bar sits on the light ground. -->
                <FormatBar
                  layout={formatBarRail ? "rail" : "row"}
                  region="canvas"
                  hidden={hiddenFormats}
                  inactive={inactiveFormats}
                  onRun={runFormat}
                />
              </div>

              <!-- The way BACK to the docked panel: its own pill, since it does
                   not format anything. Only while the panel is CLOSED — holding
                   a task or the suggestions, it would promise a move already made. -->
              {#if !formatting}
                <div class="format-float format-float--dock">
                  <button
                    type="button"
                    class="theme-btn theme-btn--icon format-float__dock"
                    title={S.formattingDock}
                    aria-label={S.formattingDock}
                    onclick={() => (formatting = true)}
                  >
                    <Icon name="sidebar-simple" size="1.125rem" />
                  </button>
                </div>
              {/if}
            </div>
          {/if}

          <!-- THE HOME'S +: for the day the calendar has open — today or one
               ahead, never one gone by. Opens the day's own composer bar
               (HomeView → TasksSpace), floating in the canvas's corner. -->
          {#if view.kind === "home" && !notebook.readOnly && homeKind !== "past" && (canCaptureTask || canCaptureNote)}
            <div class="home-fab">
              <CaptureFab
                canTask={canCaptureTask}
                canNote={canCaptureNote}
                onPick={(kind) => (kind === "note" ? homeView?.createNote() : (composingTask = true))}
              />
            </div>
          {/if}

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="shell__content"
          class:shell__content--note={view.kind === "note"}
          class:shell__content--home={view.kind === "home"}
          onpointerdown={pressedAway}
          onclick={clickedAway}
          oncontextmenu={openCanvasMenu}
          use:risen={{
            root: centre,
            enabled: compact,
            onRisen: (up) => (canvasRisen = up),
          }}
        >
          {#if compact && view.kind === "home"}
            <!-- THE TITLE, A SECOND TIME, INSIDE THE SHEET: pinned where the
                 chrome's copy is, in the canvas's ink and clipped to the sheet,
                 so the rising ground reveals it, then it scrolls away with the
                 cards (DayHead.svelte, day-head.css). Always the day. -->
            <div class="day-head__band">
              <DayTitle
                sheet
                compact
                showsDate
                dot={colorOf(view)}
                month={homeDay ?? clock?.today ?? ""}
                selected={homeDay ?? clock?.today ?? ""}
                onHome={() => (homeDay = null)}
              />
            </div>
          {/if}
          <div
            class="shell__content-inner"
            class:shell__content-inner--note={view.kind === "note"}
            class:shell__content-inner--wide={view.kind === "settings"}
            class:shell__content-inner--full={view.kind === "timeline"}
          >
          <AppBanners
            {error}
            onDismissError={() => (error = null)}
            {undoNotice}
            onDismissUndo={() => (undoNotice = null)}
            conflicts={conflictsHidden === conflictsKey(conflicts) ? [] : conflicts}
            onHideConflicts={() => (conflictsHidden = conflictsKey(conflicts))}
            {update}
            {installing}
            onInstall={installNow}
            onDismissUpdate={() => (update = null)}
            {menuOffer}
            {addingToMenu}
            onAddToMenu={addToMenuNow}
            onDismissMenuOffer={dismissMenuOffer}
            onError={fail}
          />

          <!-- Keyed on the view: a new screen is a NEW element, so the
               stylesheet can let it rise in. -->
          {#key Tabs.viewId(view)}
          <div class="shell__screen">
          <Screen
            {view}
            {notebook}
            {layout}
            {clock}
            {compact}
            {mobile}
            {f}
            {reloadKey}
            {tags}
            {dayRefs}
            {spColors}
            {noteSpaces}
            {userSpaces}
            {notesSpace}
            {inboxSource}
            {quickTargets}
            {quickTaskChoices}
            {quickTaskTo}
            {userThemes}
            {wornTheme}
            {wornThemeBlocked}
            {zoom}
            {openNote}
            {selected}
            origin={originOfItem}
            {colorOf}
            titleOf={title}
            onChanged={refreshNotebook}
            onChangedAll={refreshAll}
            onError={fail}
            onOpenNote={openNoteFromBoard}
            onOpenTask={showFoundTask}
            onSelectTask={select}
            onSuggest={suggest}
            onShowNote={showNote}
            onSearchTag={(name) => {
              searchScope = null;
              searchQuery = `#${name}`;
              searching = true;
            }}
            composing={composingTask}
            onCloseCompose={() => (composingTask = false)}
            {homeDay}
            onPickDay={(iso) => (homeDay = iso)}
            onSummary={(summary) => (homeSummary = summary)}
            bind:homeView
            {tasksArrangement}
            {notesArrangement}
            {spaceArrangement}
            bind:noteEditor
            onSetBanner={setNoteBanner}
            onChooseImage={() => (pickingImage = "banner")}
            onRenameNote={renameCurrentNote}
            onSetTags={setNoteTags}
            onCreateTag={createNoteTag}
            onFiles={addFilesToNote}
            onOpenNoteByTitle={openNoteByTitle}
            onZoomImage={(address) => (zoomedImage = address)}
            onTable={(status) => (noteTable = status)}
            onNoteLoaded={(state) => {
              openNote = state;
              // Consumed here, not in the editor: only the shell knows this
              // note was created a moment ago rather than opened.
              if (focusNewNote) {
                focusNewNote = false;
                noteEditor?.focusBody();
              }
            }}
            onRemoteImage={(url) => fetchRemoteImage(url)}
            onZoom={setZoom}
            onSwitchNotebook={chooseFolder}
            onNewTheme={newThemeFrom}
            onSection={(label) => (settingsSub = label)}
          />
          </div>
          {/key}
          </div>
        </div>
        </div>
      </section>

      <RightPanel
        tenant={panelTenant}
        {compact}
        width={panelWidth}
        onWidth={(w) => (panelWidth = w)}
        onResizing={(on) => (resizing = on)}
        {f}
        readOnly={notebook.readOnly}
        dateFormat={layout.dateDisplayFormat}
        {reloadKey}
        onChanged={refreshAll}
        onError={fail}
        onOpenNote={openNoteByTitle}
        {suggesting}
        origin={originOfItem}
        onCloseSuggestions={() => (suggesting = null)}
        onRun={runFormat}
        {hiddenFormats}
        {inactiveFormats}
        noteMenu={noteActions}
        noteFolder={openNoteFolder}
        noteTargets={noteMoveTargets}
        onDeleteNote={deleteCurrentNote}
        onUndock={() => (formatting = false)}
        {selected}
        {spColors}
        {moveTargets}
        {tags}
        root={notebook.path}
        reminderTime={layout.reminderTime ?? "09:00"}
        {dayRefs}
        offerFields={layout.offerTaskFields ?? true}
        onMoreFields={openTaskFunctions}
        onCloseTask={() => (selected = null)}
        onMovedTask={(to) => (selected = { ...selected, list: to })}
      />
    </div>
  {/if}
  </main>
  </div>

  <!-- The drawer, below 768px. INSIDE `.window`, absolutely placed: what slides
       is `.window__page`, so the transform never reaches it, and the frame
       clips it (outside, the desktop showed through the seam). -->
  {#if compact && notebook}
    {#if drawerOpen || drawerAt !== null}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- It draws nothing (styles/components/shell.css): a drawer that PUSHES
           leaves the whole app visible. All that is left is the tap that closes. -->
      <div
        class="shell__drawer-scrim"
        onclick={() => (drawerOpen = false)}
      ></div>
    {/if}
    {@render sidebar()}
  {/if}
</div>

<!-- The formatting strip, below 768px: rides above the on-screen keyboard while
     the editor has FOCUS. `position: fixed` and OUTSIDE `.window`: the page
     slides under it, and a transformed ancestor would be its containing block.
     In no region out here, so it declares CHROME. -->
{#if stripUp}
  <div class="format-strip" data-region="chrome" bind:clientHeight={stripHeight}>
    <FormatBar
      layout="row"
      region="chrome"
      hidden={hiddenFormats}
      inactive={inactiveFormats}
      onRun={runFormat}
    />
  </div>
{/if}

<!-- The tab strip, below 768px: a sheet pulled up, not a row across the top.
     Same TabBar, same props — the sheet is the only new thing. -->
{#if compact && tabsOpen && notebook}
  <BottomSheet
    label={S.openTabs(tabs.length)}
    maxHeight="60svh"
    sheetClass="tabs-sheet"
    onClose={() => (tabsOpen = false)}
  >
    <TabBar
      compact
      {tabs}
      {active}
      titleOf={title}
      {colorOf}
      onSelect={(i) => {
        active = i;
        tabsOpen = false;
      }}
      onClose={closeTab}
      onOpenNew={() => {
        openNewTab();
        tabsOpen = false;
      }}
      onMove={(from, to) =>
        ({ tabs, active } = Tabs.move(tabs, active, from, to))}
    />
  </BottomSheet>
{/if}

<!-- The app's own name prompt (window.prompt is broken in WebKitGTK). -->
<NameDialog />
<ConfirmDialog />

{#if picking}
  <FolderPicker
    start={notebook?.path ?? null}
    onChoose={(path) => {
      const answer = picking;
      picking = null;
      answer(path);
    }}
    onClose={() => {
      const answer = picking;
      picking = null;
      // Closed without choosing is an answer too: whoever is awaiting this
      // would otherwise wait for the rest of the session.
      answer(null);
    }}
    onError={fail}
  />
{/if}
<NewTaskDialog />

<!-- The canvas's own menu: the screen's actions, at the pointer. Outside the
     panel so the popup is never clipped by the content it was opened over. -->
<ContextMenu
  at={canvasMenuAt}
  items={canvasMenu}
  region="canvas"
  onClose={() => (canvasMenuAt = null)}
/>


{#if zoomedImage && notebook}
  <ImageViewer
    src={assetUrl(notebook.path, zoomedImage)}
    alt={leafOf(zoomedImage)}
    onClose={() => (zoomedImage = null)}
  />
{/if}

<!-- The image library, as a question: which picture? Opens over whatever
     screen asked; `pickingImage` says which, and what to do with the answer. -->
{#if pickingImage && notebook}
  <AssetPicker
    root={notebook.path}
    readOnly={notebook.readOnly}
    onPick={useImage}
    onClose={() => (pickingImage = null)}
    onError={fail}
  />
{/if}

<!-- Ctrl+F / Ctrl+K, over whatever screen is open. -->
{#if searching}
  <SearchDialog
    query={searchQuery}
    origin={originOfItem}
    scope={searchScope}
    scopeLabel={searchScope ? spaceName(searchScope) : ""}
    onClose={() => {
      searching = false;
      searchScope = null;
      searchQuery = "";
    }}
    onOpenList={showFoundTask}
    onOpenNote={(path, folder, opts) => showNote(path, folder, opts?.newTab)}
    onError={fail}
  />
{/if}
