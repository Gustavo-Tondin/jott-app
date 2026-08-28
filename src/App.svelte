<script>
  // The shell: three panels, document tabs, and the router that decides which
  // screen a tab is showing.
  //
  // Phase 8.5 put the pieces where the wireframe puts them. What this file
  // owns is arrangement and navigation; every screen below it owns its own
  // data, and every rule about tabs lives in `tabs.js`. Nothing visual lives
  // here: the shell's look is `styles/components/shell.css` over the token
  // layer, and what this file writes on the root (theme, accent, platform)
  // goes through `shell/rootStyle.js`.
  import { listen } from "@tauri-apps/api/event";
  import { slide } from "svelte/transition";
  import { api, describeError } from "./lib/services/api.js";
  import { askConfirm, askName, askTask, DELETING, setConfirmPolicy } from "./lib/services/dialog.js";
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
  import { onBack, installBack } from "./lib/services/back.js";
  import { scheduleReminders } from "./lib/shell/reminders.js";
  import { notice, toAt } from "./lib/services/reminders.js";
  import { onAndroidReminderTap, syncAndroidReminders } from "./lib/services/androidReminders.js";
  import ContextMenu from "./lib/components/ContextMenu.svelte";
  import NotebooksView from "./lib/screens/NotebooksView.svelte";
  import { entryOf } from "./lib/shell/entry.js";
  import ListView from "./lib/screens/ListView.svelte";
  import TasksView from "./lib/screens/TasksView.svelte";
  import CompletedView from "./lib/screens/CompletedView.svelte";
  import TimelineView from "./lib/screens/TimelineView.svelte";
  import TagsView from "./lib/screens/TagsView.svelte";
  import TrashView from "./lib/screens/TrashView.svelte";
  import AssetsView from "./lib/screens/AssetsView.svelte";
  import Icon from "./lib/components/Icon.svelte";
  import Notice from "./lib/components/Notice.svelte";
  import Loading from "./lib/components/Loading.svelte";
  import EmptyState from "./lib/components/EmptyState.svelte";
  import NoteBanner from "./lib/components/NoteBanner.svelte";
  import AssetPicker from "./lib/components/AssetPicker.svelte";
  import ImageViewer from "./lib/components/ImageViewer.svelte";
  import { importBrought } from "./lib/services/assets.js";
  import { embedMarkdown } from "./lib/services/embeds.js";
  import { TABLE_FORMATS } from "./lib/services/tableEditing.js";
  import { assetUrl } from "./lib/services/assets.js";
  import TaskInspector from "./lib/components/TaskInspector.svelte";
  import SuggestionsPane from "./lib/components/SuggestionsPane.svelte";
  import NewTaskDialog from "./lib/components/NewTaskDialog.svelte";
  import SearchDialog from "./lib/components/SearchDialog.svelte";
  import SpaceView from "./lib/screens/SpaceView.svelte";
  import NotesSpace from "./lib/spaces/NotesSpace.svelte";
  import { sourceOf } from "./lib/spaces/registry.js";
  import { movedItem } from "./lib/services/spaceOrder.js";
  import NoteEditor from "./lib/components/NoteEditor.svelte";
  import FormatBar from "./lib/components/FormatBar.svelte";
  import NotePanel from "./lib/components/NotePanel.svelte";
  import HomeView from "./lib/screens/HomeView.svelte";
  import SettingsView from "./lib/screens/SettingsView.svelte";
  import TabBar from "./lib/shell/TabBar.svelte";
  import TitleBar from "./lib/shell/TitleBar.svelte";
  import { buttonLayout } from "./lib/shell/windowButtons.js";
  import { isMobile, osAttribute, platformAttribute } from "./lib/shell/platform.js";
  import { installKeyboard } from "./lib/shell/keyboard.js";
  import { scheduleTurns } from "./lib/shell/turn.js";
  import { setRootData, setRootVar } from "./lib/shell/rootStyle.js";
  import { fontVars } from "./lib/services/fonts.js";
  import { watchCompact } from "./lib/shell/compact.js";
  import TopBar from "./lib/shell/TopBar.svelte";
  import BottomSheet from "./lib/components/BottomSheet.svelte";
  import { drawerSwipe } from "./lib/actions/drawerSwipe.js";
  import { pullToSearch } from "./lib/actions/pullToSearch.js";
  import CaptureFab from "./lib/components/CaptureFab.svelte";
  import { clampWidth, SIDEBAR, PANEL } from "./lib/shell/sidebarWidth.js";
  import { clampZoom, steppedZoom, zoomFontSize } from "./lib/shell/zoom.js";
  import ResizeHandles from "./lib/shell/ResizeHandles.svelte";
  import PanelResizer from "./lib/shell/PanelResizer.svelte";
  import Sidebar from "./lib/shell/Sidebar.svelte";
  import PageHeader from "./lib/shell/PageHeader.svelte";
  import { folderOf, leafOf, listName, listTitle } from "./lib/services/paths.js";
  import { formatDate } from "./lib/services/dates.js";
  import { groupColors, spaceColors } from "./lib/services/spaceColors.js";
  import { ACCENTS, accentFill } from "./lib/services/accent.js";
  import { originOf } from "./lib/services/origin.js";
  import { bannerOf } from "./lib/services/noteActions.js";
  import { cleanTagName } from "./lib/services/taskFields.js";
  import {
    NOTE_FONT_SIZES,
    noteFontSizeAttribute,
    modeAttribute,
    paletteAttribute,
  } from "./lib/services/themes.js";
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
  import { autoCheck, installUpdate, openReleasePage } from "./lib/services/update.js";
  import {
    offerIfDue as offerMenuEntry,
    addToMenu,
    dismiss as dismissMenuEntry,
  } from "./lib/services/desktopEntry.js";
  import { S } from "./lib/services/strings.js";
  import * as Tabs from "./lib/shell/tabs.js";
  import { landing, reachable, spaceOfView, titleOf, viewFromId } from "./lib/shell/views.js";
  import { noteTargets } from "./lib/services/noteTargets.js";
  import { quickTaskTarget, taskTargets } from "./lib/services/taskTargets.js";
  import { watchWindowState, toggleFullscreen } from "./lib/shell/windowState.js";

  let notebook = $state(null);
  let clock = $state(null);
  let error = $state(null);
  /// The shell's states (Etapa 7, 2026-08-24). `opening` is the path being
  /// opened while the disk has not answered — the picker gives way to a
  /// "Opening…" screen rather than sitting there with its buttons greyed.
  /// `failedOpen` is the door that would not open: the path and the reason,
  /// so the picker can offer to try that one again instead of a bare line.
  /// `conflictsHidden` is the set of conflicts the user asked to stop seeing
  /// THIS session (a joined key): a new conflict brings the box back.
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
  // Name → the CSS value its pill is painted with, from the tag catalogue: the
  // map every screen hands to TaskRow so a card pill shows the tag's chosen
  // colour, not the default (services/accent.js).
  let noteFolders = $state([]);
  /// What is pulled into the Day, as `"<list>#<id>"` — the set every card asks
  /// "am I in today?". It rides along with the snapshot rather than being
  /// fetched per screen (2026-08-06).
  let dayRefs = $state(new Set());
  /// How the sidebar arranges spaces — "" (dragged) or "name".
  let spacesSort = $state("");
  /// The themes the open notebook carries (`.jott/themes/`, 2026-08-25), and
  /// which of them is actually IN the document right now. Two pieces of state
  /// because they answer two questions: what to offer in Settings, and what
  /// the `data-theme` attribute is allowed to say — a name whose stylesheet
  /// has not arrived would paint nothing at all (services/themes.js).
  let userThemes = $state([]);
  let wornTheme = $state(null);
  /// How many remote references the core neutralised in the worn stylesheet,
  /// so Settings can say it rather than let a theme quietly lose its images.
  let wornThemeBlocked = $state(0);
  /// The app's own palette, as the notebook carries it (`.jott/themes/jott.css`).
  const FACTORY_THEME = "jott";

  /// Bumped when the watcher reports a stylesheet changing on disk. It is in
  /// the effect below purely to re-run it: saving the file is the whole
  /// authoring loop, and without this the app would have to be restarted to
  /// see a colour change.
  let themeRevision = $state(0);
  /// The task open in the right-hand panel, as `{ list, task }`.
  let selected = $state(null);
  /// Left sidebar collapsed to an icon rail. Local to the session (not a
  /// notebook setting — new config keys wait until they are really needed).
  let railed = $state(false);
  /// How wide the sidebar was dragged, in pixels — null while it is whatever
  /// the stylesheet says (2026-08-17). Unlike the rail, this one IS remembered,
  /// and on the machine rather than in the notebook: it answers to a monitor,
  /// not to a set of files (src-tauri/src/prefs.rs).
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
  /// Is the window too narrow for three columns side by side? The WIDTH
  /// question, and the only thing that decides the layout (shell/compact.js).
  /// It is measured once, here, so the top bar and the page header can never
  /// disagree about which of them is holding the back/forward arrows.
  let compact = $state(false);
  $effect(() => watchCompact((v) => (compact = v)));

  /// The three panels the compact shell cannot keep on screen at once, and so
  /// opens on demand. All three are transient by nature, so none of them is
  /// remembered: a drawer left open across a restart is a drawer in the way.
  let drawerOpen = $state(false);
  /// How far a finger has carried the drawer, in px — null unless one is on it
  /// (actions/drawerSwipe.js). While it is a number the drawer follows the
  /// finger and its own transition is off, so it arrives where the hand is
  /// instead of easing towards it.
  let drawerAt = $state(null);
  /// …and it is published on the DOCUMENT ROOT, not on the window.
  ///
  /// The window and the drawer are siblings (the drawer is rendered outside
  /// `.window`, see below), so a custom property set on one of them does not
  /// reach the other — and this one has to move BOTH: the app slides right by
  /// exactly what the drawer slides in by. Written on `.window` it reached
  /// only the window, the drawer stayed at its closed wall for the whole drag,
  /// and the gesture read as the page sliding off to reveal a white strip that
  /// the sidebar only filled once the finger was lifted (user report,
  /// 2026-08-18: "primeiro o canvas desliza, depois a sidebar aparece").
  $effect(() => setRootVar("--drawer-at", drawerAt === null ? null : `${drawerAt}px`));
  let tabsOpen = $state(false);
  /// True while the Home's + has asked for a TASK: the day's composer opens,
  /// focused, pinned above the keyboard. It is the same bar the tasks screens
  /// carry — the + only asks for it (mobile wireframe "New task").
  let composingTask = $state(false);
  /// Set when a note was just created from the +, and consumed the moment the
  /// editor reports it has loaded: a new note opens with the cursor in the
  /// BODY, not in the title (user call, 2026-08-18 — "fazer começar digitando
  /// na nota é melhor, se quiser muda o título depois").
  let focusNewNote = $state(false);

  /// The notebooks screen, shown OVER a window that already has a notebook.
  ///
  /// Only the phone ever sets it: Android has one Activity and no second
  /// window to put anything in, so "show me my notebooks" can only mean
  /// "here". On the desktop the same request opens a window of its own
  /// (`showNotebooks`), which is what lets a second notebook be opened without
  /// closing the first.
  let showingPicker = $state(false);

  /// Whether this window is showing the notebooks screen rather than a
  /// notebook. Three things read it and they must not disagree: the bar above
  /// the panel, the panel itself, and the look the app wears (styles on the root).
  ///
  /// Not `!notebook`: the phone shows this screen OVER an open notebook, for
  /// the reason just above.
  let showsPicker = $derived(!notebook || showingPicker);

  // Going anywhere closes them: a drawer still open over the page you just
  // navigated to is the sidebar hiding the thing you asked for.
  //
  // "Anywhere" includes the notebooks screen (user report, 2026-08-24). It is
  // not a `view` — it is not a page of a notebook at all — so it reached this
  // rule through neither dependency, and tapping the notebook's name in the
  // drawer's own footer swapped the panel behind a drawer that stayed open
  // over it. Read here rather than closed at the call site, so there is one
  // answer to "what closes the drawer" instead of two that can drift.
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

  /// What kind of machine this is: `"android"` or `"desktop"`. Read once, like
  /// the window buttons — a build cannot change platform while it runs. It is
  /// deliberately NOT how the app decides its layout: width does that, in CSS
  /// alone. This gates the affordances that belong to the device (window
  /// buttons, resize edges, system bars). See shell/platform.js.
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
  /// The picture being shown full screen, by address — the second of the two
  /// clicks a photo in a note answers (2026-08-19).
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

  // ---- "back", from wherever it is asked (2026-08-20) ----
  // Until now the back arrow in the title bar was the only caller, and the two
  // the platform provides did nothing with it: Android's back gesture closed
  // the app from anywhere at all, and a mouse's back button was inert. Both
  // arrive here now (services/back.js).
  //
  // This is the SHELL's handler and so the bottom of the stack — a dialog or a
  // sheet registers while it is mounted and is asked first, which is what
  // makes "close what is open before leaving where you are" true without
  // anyone listing what can be open. What is left for the shell is what only
  // it holds: the two overlays it draws itself, then the tab's own history.
  //
  // Answering `false` is a real answer, not a failure: on Android it hands the
  // press back to the system, and closing the app is the right end of the road
  // when there is nowhere left to go back to.
  /// Whether the open tab has somewhere to go back or forward to — read by
  /// the two bars, the back gesture and the forward button alike.
  let canBack = $derived(Tabs.canGoBack(tabs[active]));
  let canForward = $derived(Tabs.canGoForward(tabs[active]));
  $effect(() =>
    installBack({
      onForward: () => canForward && goForward(),
    }),
  );
  // What the keyboard covers, kept true (2026-08-20). The activity publishes
  // the raw inset; this is what turns it into the distance the LAYOUT owes,
  // which is not the same number on a WebView that already shrank the page —
  // `shell/keyboard.js` carries the whole reason.
  $effect(() => installKeyboard());
  $effect(() =>
    onBack(() => {
      if (zoomedImage) return ((zoomedImage = null), true);
      if (canvasMenuAt) return ((canvasMenuAt = null), true);
      if (drawerOpen) return ((drawerOpen = false), true);
      if (canBack) return (goBack(), true);
      return false;
    }),
  );

  const isOpen = (v) => Tabs.viewId(view) === Tabs.viewId(v);
  /// Whether the open view lives INSIDE the place `v` names, without being it
  /// (roadmap, Etapa 7): a note open from a space keeps that space's pill in
  /// the sidebar, where before it simply went dark. Asked only of rows that
  /// are places (spaces and the fixed Tasks/Notes), never of list rows — a
  /// list is inside its space, not the other way round.
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
  /// it is called; this is the only place that knows what a notebook is, and
  /// so the only place that can run one.
  ///
  /// A command absent from here is not broken — it is one the editor answers
  /// (`Editor.svelte` maps the `editor` scope to CodeMirror commands from the
  /// same registry).
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
    "nav.back": goBack,
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

  /// Move between tabs by one, wrapping. Wrapping because a strip of tabs is
  /// a ring in every app that has one, and stopping at the end would make the
  /// chord feel broken on the last tab.
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

  // ---- the app's history (Ctrl+Z / Ctrl+Shift+Z, 2026-08-24) ----
  // The core keeps it (`jott_core::history`): every action that changed the
  // notebook on the user's word, as the files it touched. The shell only
  // asks, reloads, and says what happened — a box that goes away on its own,
  // because an undo the user cannot see (a reorder in another space) still
  // has to be announced, and one they can see needs no ok.
  let undoNotice = $state(null);
  let undoNoticeTimer = null;

  function sayUndo(tone, text) {
    clearTimeout(undoNoticeTimer);
    undoNotice = { tone, text };
    undoNoticeTimer = setTimeout(() => (undoNotice = null), 4000);
  }

  async function takeBack(kind) {
    if (notebook?.readOnly) return;
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

  /// The search dialog is open over whatever screen is showing.
  let searching = $state(false);
  /// Which space that search is narrowed to, or null for the whole notebook.
  /// Ctrl+F and the sidebar's magnifier ask the notebook; a screen's own menu
  /// asks the screen (2026-08-17).
  let searchScope = $state(null);
  /// What the search box opens with. Set when something else asks the question
  /// on the user's behalf — an ambiguous `[[link]]`, so far.
  let searchQuery = $state("");

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

  // Display is this machine's, not the notebook's (2026-08-20): the same
  // drawer Settings writes to, or the phone and the desktop would fight.
  const setNoteFontSize = (size) => change(() => api.setMachineDisplay({ noteFontSize: size }));

  /// True while the note's editor holds the cursor — what the compact
  /// formatting strip is tied to. `focusin`/`focusout` on the window rather
  /// than props down through two components: the question is about the
  /// document's focus, which is a window-level fact.
  let editorFocused = $state(false);
  /// The formatting strip is up: a note has the cursor, on a phone.
  let stripUp = $derived(
    compact && !!notebook && view.kind === "note" && editorFocused && !notebook.readOnly,
  );
  /// …and how tall it is, measured rather than restated — the pill sizes
  /// itself from its buttons, and a number here would drift the first time one
  /// of them changed.
  let stripHeight = $state(0);

  // The strip floats over the page, so the note's scroller has to pad for it
  // or the last line — and the cursor with it — sits behind the buttons
  // (measured on the emulator, 2026-08-20). PADDING, not a shorter window:
  // taking it off `#app` ended the whole frame above the keys and showed the
  // document's background in the gap (user report on device, 2026-08-21).
  // The air the pill leaves under itself is added in CSS rather than here, so
  // the two never disagree about the gap.
  $effect(() => {
    setRootVar(
      "--app-format-strip",
      stripUp && stripHeight ? `calc(${stripHeight}px + var(--app-space-8))` : null,
    );
    return () => setRootVar("--app-format-strip", null);
  });

  /// WHERE the note's formatting controls are: docked in the right panel, or
  /// floating over the top of the canvas (user call, 2026-08-19). Not whether
  /// they are there at all — writing a note is what the panel is for, and the
  /// two shapes are the same controls in a different frame
  /// (components/FormatBar.svelte).
  ///
  /// Session state, like the sidebar's rail: it answers "how am I writing
  /// right now", which is not something a notebook has an opinion about. On a
  /// phone it is neither — the strip appears while the editor has the cursor,
  /// because there the question is answered by the keyboard being up.
  let formatting = $state(true);

  /// Is a note being written, at all — the condition both shapes share.
  let writing = $derived(view.kind === "note" && !notebook?.readOnly);

  /// The right panel's tenant, when the controls are docked.
  let formatBarOpen = $derived(formatting && writing && !suggesting && !selected);

  /// WHEN the floating bar shows, and WHICH SIDE of the canvas it hugs
  /// (2026-08-21). Display, so it answers to this screen: where a bar sits
  /// over a document is a fact about the monitor it is on, and a phone has no
  /// floating bar to place at all.
  ///
  /// Read with the app's own answer as the fallback, the same way every other
  /// by-name choice is — an empty string means "never chosen", and the
  /// notebook's own empty string reaches here unchanged.
  let formatBarMode = $derived(modeOfFormatBar(layout.formatBar));
  let formatBarSide = $derived(sideOfFormatBar(layout.formatBarSide));

  /// Standing on its end against a side edge, rather than lying along the top
  /// or the bottom (user call, 2026-08-21). It is the same seven glyphs
  /// either way; only the axis differs (components/FormatBar.svelte).
  let formatBarRail = $derived(formatBarSide === "left" || formatBarSide === "right");

  /// Whether the open note has something selected right now — what "on
  /// selection" is asking about. Reported BY the editor, because the
  /// selection is CodeMirror's state and nothing outside it sees the same
  /// thing (components/Editor.svelte).
  let noteSelected = $state(false);

  /// ...and the floating bar, which takes over whenever the panel does not
  /// hold them: undocked, or busy with something else.
  ///
  /// The mode is the LAST condition and only ever takes the bar away: `off`
  /// never floats it, `selection` floats it while something is selected. The
  /// docked panel is untouched by either — turning the floating bar off is a
  /// choice about a bar over the document, not about having the controls
  /// (core/src/settings.rs). The phone's strip is untouched too: it is the
  /// only formatting there is down there, and it is tied to the keyboard
  /// rather than to this.
  let formatBarFloats = $derived(
    writing &&
      !compact &&
      !formatBarOpen &&
      formatBarMode !== "off" &&
      (formatBarMode !== "selection" || noteSelected),
  );

  // Opening a note closes whatever the right panel was holding (user call,
  // 2026-08-19: "ao entrar num editor de notas, se tem uma tarefa aberta, ela
  // deve fechar imediatamente"). A task inspector belongs to the task list it
  // was opened from; left standing over a note it describes something that is
  // not on screen any more — the same reason leaving a place drops its
  // selection (spaces/NotesSpace.svelte).
  $effect(() => {
    if (view.kind !== "note") return;
    selected = null;
    suggesting = null;
  });

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
      noteLayout: "",
      tableLayout: "",
      timelineGhostTitles: false,
      accentColor: "",
      theme: "",
      headingColor: "",
      features: {},
    },
  );

  // Theme, accent and heading colour are ATTRIBUTES on the document root,
  // because that is where they reach both regions at once — the chrome and the
  // canvas each resolve them to their own values (styles/themes/*.css,
  // styles/roles.css). All three themes are loaded, each scoped to its own
  // name, so switching is this one attribute: no dynamic import and no flash.
  // All three ride in the layout, so they are set on a notebook's first paint
  // rather than after a second round trip.
  //
  // Only `ink` is written for the headings: the accent is what the app ships
  // as, and an absent attribute is what the default rule in roles.css answers.
  // `noteSize` is how big a note's body is drawn. Absent for the size the app
  // ships as, like the accent and the headings.
  //
  // WITH NO NOTEBOOK, THE APP HAS NO LOOK OF ITS OWN (user call, 2026-08-24).
  // Every one of these choices is now kept per machine AND per notebook
  // (src-tauri/src/prefs.rs), so a window with no notebook has nothing to read
  // them from — and the honest answer is the app's own neutral: the default
  // theme, black and white, and `neutral` for the accent rather than the blue
  // an absent attribute falls back to. That is also exactly what the notebooks
  // wireframe draws — its primary button is white on the black frame, which is
  // what `--app-neutral` resolves to in the chrome — and it is what leaves
  // the CARDS as the only coloured things on the screen, which is the whole
  // point of the colour being there.
  $effect(() =>
    setRootData({
      mode: modeAttribute(showsPicker ? "" : layout.mode),
      theme: paletteAttribute(showsPicker ? "" : layout.theme, wornTheme),
      accent: showsPicker ? "neutral" : layout.accentColor || null,
      headings: !showsPicker && layout.headingColor === "ink" ? "ink" : null,
      noteSize: noteFontSizeAttribute(layout.noteFontSize),
    }),
  );

  // The NOTEBOOK's theme: its stylesheet fetched and put in the document.
  //
  // The modes are `@import`ed by app.css and cost nothing to switch between;
  // a theme is text on the reader's disk, so it travels over the bridge
  // (shell/userTheme.js says why it lands where it lands). Since 2026-08-26
  // that includes the app's OWN: an empty setting wears `jott`, the copy of
  // the factory palette the core writes into `.jott/themes/` — so editing
  // that file re-tunes the notebook, and deleting it brings the factory
  // back. The embedded copy is loaded underneath either way, so a fetch that
  // fails leaves the app on the factory palette, never without one.
  //
  // The order matters and is the whole reason `wornTheme` exists: the CSS goes
  // in FIRST, and only then does the attribute start naming the theme. Naming
  // it first would leave a frame — or a whole session, if the fetch fails —
  // with an attribute that matches no stylesheet at all, which is not a
  // fallback but a window with no colour roles assigned. The factory `jott`
  // is never named: it is the default, and a palette needs no attribute.
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

  // The three faces ride on the root as custom properties, beside the
  // attributes above and for the same reason: they have to reach both regions
  // at once, and the note's editor inherits its family from the box around it
  // (styles/components/note-editor.css). A null REMOVES the property, which
  // is how "the app's own face" is spelled — never by writing the stack back.
  $effect(() => {
    const vars = fontVars(showsPicker ? {} : layout);
    for (const [name, value] of Object.entries(vars)) setRootVar(name, value);
  });

  // The platform rides on the root next to them, and for the same reason: it
  // reaches both regions at once, and the CSS reads it without a single
  // component being told. It is set apart from the layout because it is not a
  // notebook's property — the onboarding screen, with no notebook open yet,
  // still runs on a phone.
  $effect(() => setRootData({ platform, os: os || null }));

  /// Is this part of the app switched on? (App Functions, 2026-08-06.) One
  /// reader for the whole shell; screens get it as a prop or through the
  /// space's screen, the same way `dayRefs` travels.
  let f = $derived(reader(layout.features ?? {}));

  /// Where a quick note can go — the fixed Notes space's folders while that
  /// space is shown, and the user's note spaces always
  /// (services/noteTargets.js). The Home's capture and the Settings picker
  /// read the same list, so they cannot disagree.
  let quickTargets = $derived(
    noteTargets({
      notesFolder: layout.notesFolder,
      notesInbox: layout.notesInbox,
      folders: noteFolders,
      spaces,
      fixedShown: f("notesSpace"),
      inboxOnHome: !!layout.homeNotesSource && layout.homeNotesSource === layout.notesFolder,
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
      inboxOnHome: !!layout.homeTasksSource && layout.homeTasksSource === layout.tasksFolder,
    }),
  );
  /// (`quickTask` above is the SHORTCUT that opens the dialog — this is
  /// where the quick capture lands.)
  let quickTaskTo = $derived(quickTaskTarget(layout.quickTaskList ?? "", quickTaskChoices));

  /// What the Home's two blocks show instead of their defaults — a task
  /// space hosted whole, a note space's Inbox — resolved against what
  /// exists; null is each block's default reading (My Day / today's notes).
  let homeTasks = $derived.by(() => {
    const at = layout.homeTasksSource;
    if (!at) return null;
    const sp = spaces.find((s) => s.kind === "tasks" && s.path === at);
    if (!sp) return null;
    return { source: sourceOf(sp, { name: null }), label: sp.fixed ? S.inboxTasks : sp.name };
  });
  let homeNotes = $derived.by(() => {
    const at = layout.homeNotesSource;
    if (!at) return null;
    const sp = spaces.find((s) => s.kind === "notes" && s.path === at);
    if (!sp) return null;
    return { space: sp.path, label: sp.fixed ? S.inboxNotes : sp.name };
  });

  /// The rows the two "Home shows" pickers offer (SettingsView) — the
  /// defaults first, then every space of the right kind, the fixed one under
  /// its Inbox name.
  let homeTasksChoices = $derived([
    { value: "", label: S.featureMyDay },
    ...spaces
      .filter((sp) => sp.kind === "tasks")
      .map((sp) => ({ value: sp.path, label: sp.fixed ? S.inboxTasks : sp.name })),
  ]);
  let homeNotesChoices = $derived([
    { value: "", label: S.todaysNotes },
    ...spaces
      .filter((sp) => sp.kind === "notes")
      .map((sp) => ({ value: sp.path, label: sp.fixed ? S.inboxNotes : sp.name })),
  ]);

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

  /// Every notes space of the notebook — where a picked note can be moved to
  /// (the board's "move to", 2026-08-18). The fixed Notes space is in it: it
  /// is a place notes belong, and leaving it out would make the one space
  /// everybody has the one you cannot file into.
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

  /// Which tab of the Tasks screen is open, so the page header can read
  /// `Tasks/Index` while the browser tab keeps saying just `Tasks`.
  let tasksSub = $state("");
  /// The Settings section the screen went into, for the compact header to name
  /// (screens/SettingsView.svelte). Empty while the menu is what is on screen,
  /// and always empty side by side — there the menu says which one is open.
  let settingsSub = $state("");
  /// And what date that tab is looking at — the day for Today, the span for
  /// Week, nothing for the Index. Below 768px the screen hands it up instead
  /// of drawing it beside the strip: there it is the header's second line
  /// (user call, 2026-08-18).
  let tasksSpan = $state("");

  // What colour each space reads as — a member of a group follows the
  // group (2026-08-04), which the sidebar already did through --group-color
  // and the title and the tab dot did not.
  // The rainbow (2026-08-24) is the notebook's call and travels in the
  // layout; the dealing itself is the service's, so the sidebar, the title
  // and the tab dot all agree about which space is the orange one.
  let autoColors = $derived({ auto: !!layout?.autoSpaceColors, accent: layout?.accentColor ?? null });
  let spColors = $derived(spaceColors(spaces, groups, autoColors));
  let grColors = $derived(groupColors(spaces, groups, autoColors));

  // Where the open task can move: ANY tasks list of the notebook, minus the
  // Completed files (moving into Completed is what completing a task does).
  //
  // It used to be the folder's siblings only, and a tasks space is one list (spec
  // 3.5) — so the footer button had a single entry, itself, and reading as a
  // dead control was the honest outcome of offering nothing (user report,
  // 2026-08-06). The bulk "Move to…" in the space already offered the whole
  // notebook; these two are the same move and now say the same thing.
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

  // ---- what can be done to the SCREEN itself (2026-08-17) ----
  // Four actions that make sense wherever the user is, so they are written
  // once and served twice: from the page ⋮ and from a right-click on the empty
  // canvas. Which ones apply is decided by the view, never by the caller.

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

  /// The four screen actions, in the order both menus show them.
  let screenActions = $derived.by(() => {
    if (notebook?.readOnly) {
      // Reading is still reading: finding and opening the folder cost nothing.
      return [
        { label: S.findInPlace(hereLabel), run: findHere },
        { label: S.openInFileManager, run: revealHere },
      ];
    }
    const items = [];
    if (renamableSpace) {
      items.push({
        label: S.renameThisSpace,
        run: () => renameSpaceTo(renamableSpace.path, renamableSpace.name),
      });
    }
    items.push({ label: S.openInFileManager, run: revealHere });
    items.push(
      view.kind === "note"
        ? { label: S.findInNote, run: findHere }
        : { label: S.findInPlace(hereLabel), run: findHere },
    );
    // Replacing is a note's own gesture: a task list is rows in a screen, not
    // a document with a body to rewrite.
    if (view.kind === "note") {
      items.push({ label: S.replaceInNote, run: () => noteEditor?.openReplace() });
    }
    return items;
  });

  /// The open note's banner, as one row with the eight colours folded under
  /// it (user call, 2026-08-19: "escolher a cor ou carregar uma imagem nos 3
  /// pontos do canvas ou clicando com o botão direito nele").
  ///
  /// The palette is written out as words here (with the fill each paints
  /// with, as a dot before the word) and as swatches in the block's own
  /// popover, because a menu row is a word — but the VALUE is the same name
  /// either door, which is what keeps the file readable by hand.
  let bannerMenu = $derived({
    label: S.banner,
    items: [
      ...ACCENTS.map((name) => ({
        label: S.colorName(name),
        checked: openNote.banner?.value === name,
        swatch: accentFill(name),
        run: () => setNoteBanner(name),
      })),
      { label: S.bannerImage, run: () => (pickingImage = "banner") },
      ...(openNote.banner
        ? [{ label: S.removeBanner, run: () => setNoteBanner(null) }]
        : []),
    ],
  });

  /// The formatting buttons this notebook does not draw (App Functions,
  /// 2026-08-20). One list, three bars: the panel, the desktop strip and the
  /// one above the Android keyboard all read it, so none of them can be the
  /// one that still offers a picture nobody can embed.
  let hiddenFormats = $derived([
    ...(f("wikiLinks") ? [] : ["md.reference"]),
    ...(f("embeds") ? [] : ["md.attach"]),
    ...(f("tables") ? [] : TABLE_FORMATS),
  ]);

  /// Where the person is in a table — `{header}` or null — as the editor
  /// last reported it (2026-08-24).
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

  /// What an open NOTE can be asked to do — written once and served twice
  /// (2026-08-19): the page's ••• and the ⋮ of the note's own panel
  /// (components/NotePanel.svelte). Two lists would have drifted the first
  /// time one of them grew an item.
  let noteActions = $derived.by(() => {
    if (notebook?.readOnly || view.kind !== "note") return [];
    const own = [];
    {
      own.push(
        // Each of these is a switch of its own (App Functions, 2026-08-20):
        // an item that acts on something the notebook does not have would be
        // a promise the app cannot keep.
        ...(f("pinNotes")
          ? [{ label: openNote.pinned ? S.unpin : S.pin, run: toggleNotePin }]
          : []),
        { label: S.renameNote, run: renameCurrentNote },
        { label: S.deleteNote, run: deleteCurrentNote },
        // The banner, from the page's own ⋮ and — through `screenActions` —
        // from the right button on the canvas (user call, 2026-08-19). The
        // block carries the same choices in its corner; this is the door for
        // someone who did not think to look there, and the only one when the
        // note is scrolled past its head.
        ...(f("banners") ? [bannerMenu] : []),
        ...(f("embeds")
          ? [{ label: S.insertImage, run: () => (pickingImage = "body") }]
          : []),
        // The reading size, where a reader asks for it — on the note itself,
        // not only two screens away in Settings (user call, 2026-08-18). It is
        // the same notebook setting either way.
        {
          label: S.noteTextSize,
          items: NOTE_FONT_SIZES.map((size) => ({
            label: size.label(),
            checked: layout.noteFontSize === size.key,
            run: () => setNoteFontSize(size.key),
          })),
        },
      );
      // Only on the desktop: the compact strip answers to the keyboard being
      // up, so there is nothing here to switch.
      if (!compact)
        own.push({
          label: S.formatting,
          items: [
            {
              label: S.formattingDocked,
              checked: formatting,
              run: () => (formatting = true),
            },
            {
              // What the other half IS depends on Settings: with the floating
              // bar off, undocking the panel does not float anything, so the
              // menu says so rather than promising a bar that never comes
              // (2026-08-21).
              label: formatBarMode === "off" ? S.formattingHidden : S.formattingFloating,
              checked: !formatting,
              run: () => (formatting = false),
            },
          ],
        });
    }
    return own;
  });

  /// The page menu of the current screen — the `•••` of the wireframe.
  let pageMenu = $derived.by(() => {
    // A note's own actions belong here, not to a second bar inside the page.
    const own = [...noteActions];
    // Lists are created inside the space itself now, not from here.
    // Renaming or deleting a list the app recreates on every open would only
    // confuse — the core refuses it anyway, so the menu must not offer it.
    if (
      !notebook?.readOnly &&
      view.kind === "list" &&
      view.list !== layout.inbox &&
      view.list !== layout.completed
    ) {
      own.push(
        { label: S.renameList, run: renameCurrentList },
        { label: S.deleteList, run: deleteCurrentList },
      );
    }
    return [...own, ...screenActions];
  });

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
  // one changes what the tab points at ---

  let noteEditor = $state(null);

  /// Anything still being typed goes out first: renaming or deleting
  /// underneath a pending write would lose it.
  const noteAction = (fn) =>
    change(async () => {
      await noteEditor?.flushPending();
      await fn();
    }, reload);

  const toggleNotePin = () =>
    noteAction(async () => {
      await api.setNotePinned(view.folder, view.path, !openNote.pinned);
      openNote = { ...openNote, pinned: !openNote.pinned };
    });

  /// Replaces the open note's tags — its subjects, the `tags:` property.
  /// One line of the note's own file, so it goes through the same flush the
  /// banner does.
  const setNoteTags = (next) =>
    noteAction(async () => {
      const tags = next.map(cleanTagName).filter(Boolean);
      await api.setNoteTags(view.folder, view.path, tags);
      openNote = { ...openNote, tags };
    });

  /// A tag typed into the note's picker that the catalogue does not know:
  /// saved there first (so the next picker offers it), then applied.
  async function createNoteTag(name) {
    try {
      await api.setTag(name, null);
      await setNoteTags([...(openNote?.tags ?? []), name]);
      refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  /// Hangs a banner on the open note, or takes it off with `null`.
  ///
  /// It writes ONE line of the note's own file (`core/src/note.rs`), so it
  /// goes through the same flush the other document actions do: a pending body
  /// write and a banner write both rewrite the file, and the last one there
  /// would win.
  const setNoteBanner = (value) =>
    noteAction(async () => {
      await api.setNoteBanner(view.folder, view.path, value);
      openNote = { ...openNote, banner: bannerOf(value) };
    });

  /// What a formatting button asks for. All but one go straight to the editor,
  /// which owns the cursor; the paperclip asks the SHELL for a file, because
  /// the library is the notebook's and the editor only ever speaks text — the
  /// same split the picker has kept since 2026-08-18.
  const runFormat = (id) => {
    if (id === "md.attach") pickingImage = "body";
    else noteEditor?.run(id);
  };

  /// What the image picker does with what was chosen, by what it was opened
  /// for. Closing it is the same either way.
  function useImage(address) {
    const purpose = pickingImage;
    pickingImage = null;
    if (purpose === "banner") setNoteBanner(address);
    else noteEditor?.insert(embedMarkdown(address));
  }

  /// Files the user brought into the open note — pasted, or dropped on it
  /// (2026-08-19). They go into the notebook's library like any other file,
  /// and the note gets the markdown for them where the caret is.
  ///
  /// Importing here rather than in the editor is the same split the picker
  /// keeps: the editor writes text, and what an address MEANS is the shell's
  /// question. One markdown line per file, each on its own line, because two
  /// pictures pasted at once are two pictures and not a sentence.
  async function addFilesToNote(brought) {
    if (notebook?.readOnly) return;
    if (brought?.files?.length || brought?.paths?.length) {
      try {
        for (const address of await importBrought(brought)) {
          noteEditor?.insert(`${embedMarkdown(address)}\n`);
        }
      } catch (e) {
        fail(e);
      }
      return;
    }
    // Nothing local, but an address on the web: a picture copied from a page.
    // Drawing it means FETCHING it, which is the one thing this app does that
    // leaves the machine — so it is asked for, until the person says to stop
    // asking (principle 9, and `confirmImageDownloads`).
    if (brought?.remote) {
      const address = await fetchRemoteImage(brought.remote);
      if (address) noteEditor?.insert(`${embedMarkdown(address)}\n`);
      return;
    }
    // The desktop said it was handing over a file and handed over something
    // this app cannot read. Saying WHAT it was beats doing nothing at all —
    // it is the difference between a bug report and a mystery.
    fail(S.noFileInGesture(brought?.types ?? []));
  }

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

  /// Fetches a picture that is only on the web, having asked first.
  ///
  /// The one thing this app does that leaves the machine, so it says which
  /// host it will contact before doing it (principle 9) — until the person
  /// says to stop asking, which is a setting of the notebook and not of the
  /// session. Answers with the address it took, or `null`.
  async function fetchRemoteImage(url) {
    const ok = await askConfirm(S.downloadImageTitle, {
      detail: S.downloadImageBody,
      code: hostOf(url),
      danger: S.downloadImageConfirm,
      remember: "confirmImageDownloads",
    });
    if (!ok) return null;
    try {
      const address = await api.importAssetFromUrl(url);
      reload();
      return address;
    } catch (e) {
      fail(e);
      return null;
    }
  }

  /// The host, which is the part worth reading — and the whole address when it
  /// will not parse, because the question still has to say what it is doing.
  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  /// Opens the note a `[[link]]` names (2026-08-19).
  ///
  /// A link carries a TITLE, so a title has to be turned into a note — and
  /// the notebook's own search is what already knows every note there is.
  /// Exact matches only: `[[Ideias]]` means the note called Ideias, not every
  /// note with the word in it.
  ///
  /// Two of them is not a guess the app gets to make (it made one in v0.5.0
  /// and it was wrong): the search box opens at that title and the person
  /// picks. None of them is worth saying — a link that names nothing looks
  /// exactly like one that works.
  async function openNoteByTitle(title) {
    const wanted = String(title ?? "").trim().toLowerCase();
    if (!wanted) return;
    try {
      const found = (await api.search(title, 50))?.notes ?? [];
      const exact = found.filter((note) => note.title.trim().toLowerCase() === wanted);
      if (exact.length === 1) showNote(exact[0].path, exact[0].folder);
      else if (exact.length === 0) fail(S.noteNotFound(title));
      else {
        searchScope = null;
        searchQuery = title;
        searching = true;
      }
    } catch (e) {
      fail(e);
    }
  }

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
      if (!(await askConfirm(S.confirmDeleteNote(openNote.title), DELETING))) return;
      await api.deleteNote(view.folder, view.path);
      closeTab(active);
    });

  function fail(e) {
    error = describeError(e);
    console.error("[jott]", e);
  }

  const reload = () => (reloadKey += 1);
  /// Both halves of "something changed elsewhere": the layout (sidebar,
  /// counts) and whatever screen is open. Written three times before it had
  /// a name.
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

  /// Writes a new theme into the notebook, seeded with the look in use.
  ///
  /// The seed is the whole reason this button exists: a theme assigns both
  /// regions in full, which is ~170 declarations, and copying those out of a
  /// documentation page is not something anybody does. What is written is a
  /// file that already works and is already the right shape — the editing is
  /// then changing colours, which is the part a person actually wants to do.
  ///
  /// Wearing a notebook theme and asking for a new one duplicates THAT one,
  /// which is the same operation and needs no separate button.
  async function newThemeFrom(name) {
    const css = seedFrom({ factory: factoryThemeCss, worn: userThemeApplied() });
    const made = await api.createUserTheme(name, css);
    userThemes = (await api.userThemes()) ?? [];
    return made;
  }

  /// Opens a notebook and settles the app around it.
  ///
  /// `create` is which door was used (2026-08-24): true only for the picker's
  /// "Create a new notebook", which is allowed to make one out of a folder
  /// that is not one yet. Every other caller — a card on the picker, the "Open
  /// a notebook" door, the last notebook reopened at launch — demands a
  /// notebook, and is told plainly when the folder is not one.
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

  // The keyboard went away, so whatever it was typing into should stop being
  // typed into (user report on device, 2026-08-20: dismissing it with the back
  // gesture left the note focused, the caret blinking on a line nobody was
  // writing, and the formatting strip floating above a keyboard that was no
  // longer there).
  //
  // Whatever holds the focus, not the editor by name: the keyboard was up
  // because SOMETHING had it — a note, a task composer, a rename field — and
  // the same thing is true of all of them. Android only reports the edge, so
  // this cannot fire while someone is still typing (services/androidStorage.js).
  //
  // The Home's composer does NOT go with it (user call, 2026-08-24, replacing
  // the 2026-08-21 rule): once asked for, the bar stays — through the keyboard
  // coming and going — until a task is created with the keyboard already
  // closed, or it is pulled down by its handle (TaskComposer.svelte). Closing
  // the keyboard mid-thought was deleting the thought.
  //
  // One exception, measured on device (2026-08-24): a composer CONTROL
  // holding the focus — a chip, a field button, or a panel portaled out by
  // `keepOnScreen` — is not "done typing": the keyboard stepped aside for the
  // menu the tap just opened, and blurring here killed that menu before it
  // drew.
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
  /// of whoever is waiting for a folder. Null when it is closed.
  ///
  /// A callback rather than a flag since 2026-08-24: the browser used to end
  /// in one place (open this notebook), and now the picker's ⋮ asks the same
  /// question to answer a different one (move this notebook into it). The
  /// browser does not need to know which.
  let picking = $state(null);

  /// Asks the machine which folder, and answers with the path — or null when
  /// the user backed out.
  ///
  /// Three questions wearing one function. The desktop opens the system's
  /// picker, which is better at this than anything the app could draw. Android
  /// needs the file permission FIRST — without it there is nothing to browse —
  /// and then opens the system's chooser too, converted back to a path by the
  /// Activity (services/androidStorage.js says why that is sound). The app's
  /// own browser is what is left when the chooser names a folder that cannot
  /// be turned into a path: it is the fallback, not the answer.
  ///
  /// Asking for the permission answers null: the user leaves the app for
  /// Android's settings screen, and whatever they were doing is over. The
  /// `storage` watcher brings them back to a screen that can now ask properly.
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

  /// A card on the notebooks screen was clicked.
  ///
  /// With `pickerCloses` on — the default, and the way someone who works in
  /// one notebook at a time wants it — THIS window stops being the picker and
  /// becomes the notebook. Opening a new window and closing this one has the
  /// same outcome and a frame of empty window in between, so the window is
  /// reused: what the setting is really about is whether the picker survives
  /// the choice, not how many windows are spawned on the way.
  ///
  /// With it off, the notebook opens in a window of its own and the picker
  /// stays where it is — and that is two notebooks open at once.
  async function openFromPicker(path) {
    // A picker shown over a notebook (the phone) always lands here: there is
    // no second window to open it in.
    if (showingPicker) {
      showingPicker = false;
      await openAt(path);
      return;
    }
    // A bridge that cannot answer must not strand the click; closing is the
    // default and the safe one — it always ends with the notebook on screen.
    // `??` for the same reason the screen's own read uses it: a bridge with
    // nothing to say lands on the default, and the default always ends with
    // the notebook on screen.
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
  // Every one of these takes the same shape: do it, re-read the snapshot, and
  // route a failure to the error banner instead of an unhandled rejection —
  // which is exactly the `act` every screen already uses (services/act.js).
  // The shell was the one caller writing it out by hand, eighteen times over.
  // `change(fn, after)` runs `after` on the RELOADED notebook, which is what
  // lets a new space be opened once the snapshot carries it.
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
  /// contiguous in it, which is what lets the sidebar read a group's place off
  /// its members instead of keeping a second ordering in step (2026-08-06).
  ///
  /// It used to renumber `userSpaces` from indices that came from the
  /// LOOSE ones — so with any group in the notebook the drag reordered the
  /// wrong things, and a group could not be dragged at all.
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

  // ---- space management (Fase 11) ----
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

  async function renameSpaceTo(folder, current) {
    const to = await askName(S.promptRenameSpace(current), current);
    if (to == null) return;
    change(() => api.renameSpace(folder, to.trim()));
  }

  const setSpaceAppearance = (folder, color, icon) =>
    change(() => api.setSpaceAppearance(folder, color ?? null, icon ?? null));

  async function deleteSpaceAt(folder, name) {
    if (!(await askConfirm(S.confirmDeleteSpace(name), DELETING))) return;
    change(
      () => api.deleteSpace(folder),
      // If we were looking at it, it is gone — go Home.
      () => view.kind === "space" && view.sp === folder && goTo({ kind: "home" }),
    );
  }

  // ---- groups (reestruturação 2026-07-30; they nest since 2026-08-11) ----
  async function createGroup(group = null) {
    const name = await askName(S.nameGroup, "", { confirm: S.create });
    if (!name) return;
    change(() => api.createGroup(name, group));
  }

  /// A group moved into another group, or back out of one (`null`).
  const moveGroupTo = (name, intoGroup) => change(() => api.moveGroup(name, intoGroup));

  async function renameGroupTo(folder, current) {
    const to = await askName(S.renameGroup, current);
    if (to == null) return;
    change(() => api.renameGroup(folder, to));
  }

  // The group's colour and icon — the group is where the colour is chosen
  // now; a space inside one follows it (user call, 2026-08-04).
  const setGroupAppearanceAt = (folder, color, icon) =>
    change(() => api.setGroupAppearance(folder, color, icon));

  async function deleteGroupAt(folder, name) {
    if (!(await askConfirm(S.confirmDeleteGroup(name), DELETING))) return;
    change(() => api.deleteGroup(folder));
  }

  const moveSpaceTo = (name, intoGroup) => change(() => api.moveSpace(name, intoGroup));

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
  const spaceArrangement = arrangementOf(() => (view.kind === "space" ? view.sp : null));

  /// The FIXED Notes screen is a space too, and it had none of this (user
  /// report, 2026-08-19: "arrastar não move"). The board dragged, called an
  /// `onSetOrder` nobody had passed, and redrew in the old order — silently,
  /// because an optional handler that is missing simply does nothing. Its
  /// arrangement lives in `jott.notes/.space.json` like any other space's.
  let notesSpace = $derived(spaces.find((sp) => sp.path === layout.notesFolder) ?? null);
  const notesArrangement = arrangementOf(() => layout.notesFolder);

  /// ...and the FIXED Tasks screen had exactly the same hole (user report,
  /// 2026-08-19: on a phone "ele quer ficar selecionando e movendo as tarefas",
  /// and when the gesture was fixed the cards still snapped back). It is the
  /// space that holds the Inbox, so its arrangement lives in that space's
  /// `.space.json` — which `inboxSource` above already READS. Only the writing
  /// was missing, and a missing optional handler does nothing at all: the drag
  /// played out in full and the order was thrown away on release.
  const tasksArrangement = arrangementOf(() => tasksSpaceFolder);

  async function renameCurrentList() {
    if (view.kind !== "list") return;
    const from = view.list;
    const current = listName(from);
    const to = await askName(S.promptRenameList(current), current);
    if (!to || to.trim() === current) return;
    change(
      () => api.renameList(from, to.trim()),
      () => {
        // A rename never changes the folder: swap only the file name, and let
        // the tab follow the file instead of pointing at a name that is gone.
        const next = { kind: "list", list: `${folderOf(from)}/${to.trim()}.md` };
        tabs = Tabs.replaceView(tabs, Tabs.viewId({ kind: "list", list: from }), next);
        reload();
      },
    );
  }

  async function deleteCurrentList() {
    if (view.kind !== "list") return;
    const list = view.list;
    if (!(await askConfirm(S.confirmDeleteList(listTitle(list)), DELETING))) return;
    change(
      () => api.deleteList(list),
      (rescued) => {
        goTo({ kind: "list", list: layout.inbox });
        reload();
        if (rescued > 0) error = S.tasksRescued(rescued, listTitle(list));
      },
    );
  }

  // ---- reminders (2026-08-25) ----
  // The core lists what should ring; on desktop `shell/reminders.js` keeps
  // the timer (the window may be hidden in the tray, the timer runs on) and
  // the bridge shows the system's notification; on Android the list is
  // handed to the system's alarm service instead. Either way the machine
  // remembers up to where it rang, so a relaunch neither repeats nor
  // swallows.
  let reminders = [];
  /// `undefined` until asked; `null` when this machine never rang this
  /// notebook — and then "now" becomes the mark, so nothing old rings.
  let remindedUntil = undefined;
  let remindersLoop = null;

  async function ringReminders(due, now) {
    for (const reminder of due) {
      const { title, body } = notice(reminder, S);
      await api.notifyReminder(title, body, { list: reminder.list, id: reminder.id ?? null });
    }
    remindedUntil = now;
    await api.rememberRemindedUntil(now);
  }

  async function refreshReminders() {
    if (!notebook || !f("remind")) {
      reminders = [];
      remindersLoop?.stop();
      remindersLoop = null;
      if (mobile && notebook) await syncAndroidReminders([], { strings: S }).catch(() => {});
      return;
    }
    reminders = (await api.reminders()) ?? [];
    if (remindedUntil === undefined) {
      remindedUntil = (await api.remindedUntil()) ?? null;
      if (remindedUntil === null) {
        remindedUntil = toAt(new Date());
        await api.rememberRemindedUntil(remindedUntil);
      }
    }
    if (mobile) {
      if (!androidTapInstalled) {
        androidTapInstalled = true;
        onAndroidReminderTap((target) => showFoundTask(target.list, target.id)).catch(() => {});
      }
      await syncAndroidReminders(reminders, { strings: S }).catch(fail);
      return;
    }
    if (remindersLoop) remindersLoop.rearm();
    else
      remindersLoop = scheduleReminders({
        list: () => reminders,
        until: () => remindedUntil,
        ring: ringReminders,
        onError: fail,
      });
  }

  // A clicked notification names its task; the list opens and the panel
  // with it, exactly as a search hit does.
  listen("reminder://open", (event) => {
    const target = event.payload ?? {};
    if (target.list) showFoundTask(target.list, target.id || null);
  });
  // Installed on the first refresh rather than here: `mobile` is answered
  // by the bridge after mount, and at this point it still says desktop.
  let androidTapInstalled = false;

  // The rollover has to happen with the app open too, not only when the
  // notebook is reopened. The core says when; `shell/turn.js` schedules the
  // wake-up, from the clock the last tick brought back.
  let stopTurns = () => {};
  function scheduleTurn() {
    stopTurns();
    stopTurns = scheduleTurns({
      clock: () => clock,
      tick: async () => {
        await api.refreshPeriods();
        clock = await api.periodClock();
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

  // What the window opens on.
  //
  // Three answers, and only the third asks the machine anything. A window
  // created by `open_window` already carries its instruction in its address —
  // it is a second window, and reopening the last notebook in it would ignore
  // the reason it was opened.
  (async () => {
    try {
      // Kept for the picker, which offers it as the second choice on Android.
      // The platform used to open it silently, because there was nothing else
      // it could give: no folder picker, and a Storage Access Framework URI
      // the core cannot read. That was revised on 2026-08-19 — the app asks
      // for file access and browses real folders (androidStorage.js), so this
      // folder is a fallback and not a default. Anyone already using it is
      // unaffected: `last_notebook` reopens it.
      privateFolder = await api.defaultFolder();

      if (entry.kind === "picker") return;
      if (entry.kind === "notebook") {
        await openAt(entry.path);
        return;
      }

      // The first window of the app. It comes back to the WORK by default —
      // asking which notebook on every launch is a question with the same
      // answer nearly every time — and the picker's ⋮ is where someone who
      // keeps several says otherwise.
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

  /// What this build calls itself, for the number under the logo on the
  /// picker. The FULL version, patch included: it is what someone copies into
  /// a bug report, and a number cut short there names a build that does not
  /// exist.
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

  /// The offer to put Jott in the applications menu, when this install is an
  /// AppImage that is not in it yet. Same shape as the update notice on
  /// purpose: one line, two buttons, and gone once answered. The whole rule
  /// for whether to ask is in services/desktopEntry.js.
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
    (newTab ? openTab : goTo)({ kind: "note", folder, path });

  /// The folders of the OPEN note's space — where it can be filed without
  /// leaving the space. The shell's own `noteFolders` cannot answer: it is the
  /// fixed space's, kept for the Settings screen, and a note is as often in a
  /// space of the user's own.
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

  /// Where the open note could go: the folders of its own space, then every
  /// other notes space (into its inbox, which is where a note filed into a
  /// space belongs). The same set the board's cards offer, asked from the
  /// other side.
  /// The folder of the open note within its space — `""` at the space's root.
  let openNoteFolder = $derived(view.kind === "note" ? folderOf(view.path) : "");

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

  /// Moves the open note, and follows it: the tab points at an address, and
  /// the address just changed.
  const moveOpenNote = (space, into) =>
    noteAction(async () => {
      const landed = await api.moveNoteToSpace(view.folder, view.path, space, into);
      goTo({ kind: "note", folder: space, path: landed });
    });

  /// A note opened FROM a board. `fresh` says the board has just created it
  /// empty (the quick-note bar's + on an empty field), so the cursor goes
  /// straight into its body — the same hand-off the Home's + makes. `newTab`
  /// is the card's middle click and the right button's first row: the board
  /// reports which door was used, and only here is a tab opened.
  const openNoteFromBoard = (path, folder, { fresh = false, newTab = false } = {}) => {
    if (fresh) focusNewNote = true;
    showNote(path, folder ?? undefined, newTab);
  };

  const showList = (path, newTab = false) =>
    (newTab ? openTab : goTo)({ kind: "list", list: path });

  /// The Home +, "Note" half: makes an empty note in the notes inbox and opens
  /// it straight away, with nothing asked first. The name is a placeholder the
  /// header is already offering to rename — a prompt here would stop the one
  /// gesture the button exists to make fast.
  const captureNote = () =>
    change(
      async () => {
        const folder = layout.notesFolder;
        if (!folder) return null;
        return {
          folder,
          path: await api.createNote(folder, layout.notesInbox, S.untitled),
        };
      },
      // In `after`, so the note is opened on a snapshot that already carries
      // it — the same reason creating a space opens it here and not inline.
      (made) => {
        if (!made) return;
        focusNewNote = true;
        showNote(made.path, made.folder);
      },
    );
</script>

<!-- The window takes the drop it was not offered, and does nothing with it.
     With `dragDropEnabled: false` (`tauri.conf.json`) the webview handles
     drops itself, and WebKit's own answer to a file dropped on a page is to
     NAVIGATE to it — which here means the app replaced by a picture, with no
     way back. Refusing by default is what makes the editor's own handler the
     only place a file can land. -->
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

<!-- The window is frameless: this bar draws the brand, the document tabs and
     the min/max/close controls itself, and is the only handle to move or close
     the window — so it renders even before a notebook is open. -->
<!-- `data-region` is what gives an element its colour ground (styles/themes/*.css):
     the whole window is the CHROME, and the content panel below overrides it
     with the CANVAS. In the factory theme that is black around white. -->
<!-- The dragged sidebar width is written HERE, not on the panel: the title
     bar's brand column is as wide as the sidebar and lives outside the shell,
     so both edges have to read the same variable. Unset means the token in
     tokens.css stands, which keeps the stylesheet the source of the default. -->
<!-- The sidebar is written ONCE and placed twice. On the desktop it is a
     column in this row; below 768px it is a drawer that has to cover the
     top bar and sit still while the app slides out from under it, which
     it can only do from outside `.window` (the drawer's own toolbar is
     the top of the screen in the wireframe, not a strip below the app's).
     The props are the sidebar's contract and must not fork with the
     place. -->
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
    onOpen={(next, newTab = false) => (newTab ? openTab : goTo)(next)}
    onOpenList={showList}
    onNotebooks={showNotebooks}
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

  <!-- Everything the drawer pushes aside, in one box. The push is a transform
       on THIS, not on the window, because the drawer has to stay put while it
       happens and it is now the window's own child (see below). Inert at every
       other width: a plain flex column that fills the frame. -->
  <div class="window__page">
  <!-- Two bars, and the shell picks. The compact one holds the drawer toggle
       and the page ⋮, which the desktop bar has never had, and holds neither
       the brand nor the window buttons — see shell/TopBar.svelte. -->
  <!-- No page chrome over the notebooks screen (user report, 2026-08-24). The
       compact bar carries the drawer toggle, the history arrows and the page
       ⋮ — every one of them an affordance of being INSIDE a notebook, and on
       the picker they offered a sidebar for a notebook that is not open. The
       wireframe draws the phone's picker with nothing above the logo, and
       that is why: it is a screen, not a page of the app.

       The desktop keeps its title bar, and has to: the window is frameless, so
       that strip is the only way to move or close it. It is already stripped
       to the window buttons alone (`brand={!!notebook}`, and no tabs). -->
  {#if compact && !showsPicker}
    <TopBar
      {canBack}
      {canForward}
      onBack={goBack}
      onForward={goForward}
      onOpenDrawer={() => (drawerOpen = true)}
      {drawerOpen}
      onOpenTabs={notebook ? () => (tabsOpen = true) : null}
      tabCount={tabs.length}
      menu={pageMenu}
      pageKey={title(view)}
      {mobile}
      buttons={windowButtons}
      over={view.kind === "note"}
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
       floor (its two choices sit on it), so the main area becomes a column and
       hands it whatever height is left. With a notebook open the shell inside
       lays itself out and this does nothing. -->
  <main class="shell__main" class:shell__main--picker={showsPicker}>
    {#if showsPicker && opening}
      <!-- Between the click and the notebook: the disk is reading, and the
           picker with its buttons greyed said nothing about it. -->
      <Loading screen label={S.openingNotebook(leafOf(opening))} />
    {:else if showsPicker}
      <!-- The door of the app (wireframes "Notebooks screen", 2026-08-24). It
           replaced a paragraph and one button: the app remembers the notebooks
           this machine has opened, so the usual answer to "which notebook?" is
           already on the screen and the folder picker is for the other days.

           Android keeps the two extra sentences below it, and they stay HERE
           rather than moving into the screen: they are about the PERMISSION
           this platform needs and the container it offers when that permission
           is refused, which is a fact about the machine and not about the list
           of notebooks. -->
      <NotebooksView
        {version}
        {busy}
        {compact}
        onChoose={chooseFolder}
        onOpen={openFromPicker}
        onPickFolder={pickAFolder}
        onListed={(n) => (recentCount = n)}
        onClose={showingPicker ? () => (showingPicker = false) : null}
        onError={fail}
      />
      <!-- Only when it has something to say, and the private-folder offer only
           on a phone with NOTHING to offer above it (user report, 2026-08-24).
           `privateFolder` is non-null on every Android run, so the condition
           it was written under — a screen that existed only before the first
           notebook — kept a paragraph about where a notebook could live under
           a list of notebooks that already do. -->
      {#if storage === "denied" || (privateFolder && recentCount === 0) || error || failedOpen}
        <section class="shell__onboarding">
          {#if storage === "denied"}
            <p class="shell__onboarding-intro">{S.storageIntro}</p>
            <button
              class="theme-btn theme-btn--primary shell__onboarding-action"
              onclick={() => chooseFolder({ create: true })}
              disabled={busy}>{S.allowFiles}</button
            >
          {/if}
          {#if privateFolder && recentCount === 0}
            <button
              class="theme-btn shell__onboarding-alt"
              onclick={() => openAt(privateFolder, { create: true })}
              disabled={busy}>{S.usePrivateFolder}</button
            >
            <p class="shell__onboarding-note">{S.privateFolderNote}</p>
          {/if}
          {#if failedOpen}
            <!-- The door that would not open (Etapa 7): which one, why, and
                 the two ways on — the same door again (a drive that was not
                 mounted yet, a permission just granted) or another one. -->
            <Notice
              tone="error"
              title={S.openFailedTitle}
              class="shell__notice"
              onDismiss={() => (failedOpen = null)}
              dismissLabel={S.dismissError}
            >
              <p><code class="shell__notice-path">{failedOpen.path}</code></p>
              <p>{failedOpen.message}</p>
              {#snippet actions()}
                <button
                  class="theme-btn theme-btn--primary theme-btn--xs"
                  disabled={busy}
                  onclick={() => openAt(failedOpen.path, { create: failedOpen.create })}
                  >{S.openFailedRetry}</button
                >
                <button
                  class="theme-btn theme-btn--outline theme-btn--xs"
                  disabled={busy}
                  onclick={() => chooseFolder({ create: false })}>{S.openFailedOther}</button
                >
              {/snippet}
            </Notice>
          {:else if error}
            <Notice
              tone="error"
              title={S.errorTitle}
              class="shell__notice"
              onDismiss={() => (error = null)}
              dismissLabel={S.dismissError}
            >
              <p>{error}</p>
            </Notice>
          {/if}
        </section>
      {/if}
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
      <!-- LEFT: spaces on top, notebook and settings pinned to the
           bottom, as the wireframe has them. Collapses to an icon rail.

           Below 768px it is the SAME sidebar, only presented as a drawer that
           pushes the page aside (user call: "o sidebar esquerdo fica
           basicamente igual"). The scrim is a sibling rather than a wrapper so
           the drawer keeps its place in the flex row and simply slides. -->

      {#if !compact}
        {@render sidebar()}
      {/if}

      <!-- The edge between the two panels is a handle (user call, 2026-08-17).
           Gone with the rail, whose width is the app's answer, not a
           preference. A focusable separator, so the width is also reachable
           from the keyboard. -->
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

      <!-- CENTRE: page header, then the screen itself. The tabs moved up into
           the title bar; the header keeps the back/forward, title and ••• menu. -->
      <section
        class="shell__centre"
        data-region="canvas"
        use:pullToSearch={{ enabled: compact && !!notebook, onPull: openSearch }}
      >
        <!-- The search, pulled down from the top of the page (2026-08-21,
             actions/pullToSearch.js): a glass that grows out of the top edge
             as the page is pulled, and pops when it is far enough. Below
             768px the search is otherwise a ⋮ away; the pull puts it under the
             thumb. Drawn here and not in the header because the header
             scrolls away with the page in the compact shell. -->
        {#if compact}
          <div class="pull-search" aria-hidden="true">
            <span class="pull-search__glass"><Icon name="magnifying-glass" size="1.125rem" /></span>
          </div>
        {/if}
        <PageHeader
          {compact}
          title={/* Below 768px an open note names itself: its head draws the
            title, on the banner's chip or as the heading a note with no banner
            has (components/NoteBanner.svelte). Repeating it here was the same
            "o nome dito duas vezes" the space screens were fixed for
            (2026-08-18), and the wireframes give the room to the banner. */
          compact && view.kind === "note"
            ? ""
            : view.kind === "tasks" && tasksSub
              ? tasksSub
              : compact && view.kind === "settings" && settingsSub
                ? settingsSub
                : title(view)}
          context={view.kind === "tasks" && tasksSub ? S.tasks : ""}
          subtitle={/* The day, ONCE, and only where a date means something.
            On the desktop the two screens that carry one draw it themselves —
            the capture box at its own top right (components/CaptureBox.svelte),
            the Tasks strip beside its tabs — and the header repeating it three
            inches above was two dates on one screen (user report, 2026-08-18).
            Below 768px neither of those places survives: there is no capture
            box (the + replaces it) and the strip is a phone wide, so the date
            comes up here, under the name, which is where both mobile
            wireframes draw it (user call, 2026-08-18). The Tasks screen sends
            up what its open tab is looking at — the week's span on Week — and
            falls back to today, as the wireframe shows on the Index. */
          compact && (view.kind === "home" || view.kind === "tasks")
            ? tasksSpan && view.kind === "tasks"
              ? tasksSpan
              : formatDate(clock?.today ?? "", layout.dateDisplayFormat)
            : ""}
          {canBack}
          {canForward}
          onBack={goBack}
          onForward={goForward}
          onRenameTitle={view.kind === "note" && !notebook.readOnly
            ? renameCurrentNote
            : null}
          menu={pageMenu}
          dot={colorOf(view)}
          action={compact && view.kind === "home" && !notebook.readOnly
            ? homeCapture
            : undefined}
        />

        <!-- Home is the one screen that is neither tasks nor notes, so it is
             the one place the + still has to ask which. It only reports the
             answer: HomeView holds the folders and does the writing. -->
        {#snippet homeCapture()}
          <CaptureFab
            canTask={f("tasks") && (!!homeTasks || f("myDay")) && !!quickTaskTo}
            canNote={f("notes") && quickTargets.length > 0}
            onPick={(kind) =>
              kind === "note" ? captureNote() : (composingTask = true)}
          />
        {/snippet}

        <!-- CANVAS: what the screen is drawn on, and the box the floating
             controls are measured from. It exists so they can be placed
             against the TOP OF THE SCREEN rather than the top of the panel —
             measured from the panel they landed on the page header, the dock
             button right on top of its ⋮ (user report, 2026-08-19). The
             header is outside this box, so "below the header" needs no number
             that would have to be kept in step with it. -->
        <div class="shell__canvas">
          <!-- The formatting controls, floating (user call, 2026-08-19): the
               same narrow bar the phone gets, centred over the top of the
               canvas, on a LIGHT ground because here it floats over the
               document and not over a phone's chrome. It is what a note has
               whenever the right panel is not holding them — closed, or busy
               with a task.

               THE TWO PILLS TRAVEL TOGETHER, centred as one (user call,
               2026-08-19: "logo à direita dos outros botões"). A row, not two
               placements: pinning the button to the canvas's far edge put it
               in the corner the page ⋮ already owns, and any gap written as a
               number would drift the moment the bar gains a glyph. -->
          {#if formatBarFloats}
            <div class="format-floats format-floats--{formatBarSide}">
              <div class="format-float">
                <!-- CANVAS, and it matters: the folded panel is portaled out of
                     the window by `keepOnScreen`, so it paints whatever region
                     it was TOLD. Told "chrome" it came out dark on a light bar
                     (this bar is the one place the same component sits on the
                     two grounds). -->
                <FormatBar
                  layout={formatBarRail ? "rail" : "row"}
                  region="canvas"
                  hidden={hiddenFormats}
                  inactive={inactiveFormats}
                  onRun={runFormat}
                />
              </div>

              <!-- The way BACK to the docked panel (user call, 2026-08-19).
                   Sending the controls to the side was one click on the
                   panel's ×; bringing them back was two, buried in the page ⋮
                   under a submenu — and nothing on screen said the panel was
                   still there to reopen.

                   Its own pill, not a tenth button on the bar: it does not
                   format anything. Same ground, same radius, same shadow, so
                   the two read as one family and still as two things — which
                   is what "mesmo formato com fundo, mas separado" asks for.

                   Only when the panel was CLOSED. The bar also floats while
                   the panel is busy holding a task or the suggestions, and
                   there the button would promise a move that is already
                   made. -->
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

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="shell__content"
          class:shell__content--note={view.kind === "note"}
          onclick={clickedAway}
          oncontextmenu={openCanvasMenu}
        >
          <div
            class="shell__content-inner"
            class:shell__content-inner--note={view.kind === "note"}
            class:shell__content-inner--wide={view.kind === "settings"}
            class:shell__content-inner--full={view.kind === "timeline"}
          >
          {#if error}
            <Notice
              tone="error"
              title={S.errorTitle}
              class="shell__notice"
              onDismiss={() => (error = null)}
              dismissLabel={S.dismissError}
            >
              <p>{error}</p>
            </Notice>
          {/if}

          {#if undoNotice}
            <Notice
              tone={undoNotice.tone}
              icon={undoNotice.tone === "success" ? "undo" : null}
              title={undoNotice.text}
              class="shell__notice"
              onDismiss={() => (undoNotice = null)}
              dismissLabel={S.dismissError}
            />
          {/if}

          {#if conflicts.length > 0 && conflictsHidden !== conflictsKey(conflicts)}
            <!-- The one case where the user can silently lose work: two
                 devices edited the same file and the sync tool kept both.
                 A row per copy, each with the door to its folder (the core's
                 `folder_of` turns the file into the folder around it), and
                 "hide for now" for the session — a NEW conflict brings the
                 box back, because the key is the list of paths. -->
            <Notice
              tone="warning"
              title={S.conflictsTitle(conflicts.length)}
              class="shell__notice"
              onDismiss={() => (conflictsHidden = conflictsKey(conflicts))}
              dismissLabel={S.conflictsHide}
            >
              <p>{S.conflictsBody}</p>
              <ul class="shell__conflict-list">
                {#each conflicts as conflict (conflict.path)}
                  <li class="shell__conflict">
                    <span class="shell__conflict-what">
                      {#if conflict.list}<strong>{conflict.list}</strong>{/if}
                      <code class="shell__notice-path">{conflict.relative ?? conflict.path}</code>
                      {#if !conflict.original}<span class="shell__conflict-gone">({S.conflictOriginalGone})</span>{/if}
                    </span>
                    {#if conflict.relative}
                      <button
                        class="theme-btn theme-btn--outline theme-btn--xs"
                        onclick={() => api.openInFileManager(conflict.relative).catch(fail)}
                        >{S.conflictReveal}</button
                      >
                    {/if}
                  </li>
                {/each}
              </ul>
            </Notice>
          {/if}

          {#if update}
            <!-- Good news, quietly: one line and two buttons, gone for the
                 session on "Later". Which button depends on the install —
                 an AppImage or the Windows build can replace itself, a
                 package-manager install gets the release page instead. -->
            <Notice tone="success" title={S.updateBanner(update.latest)} class="shell__notice">
              {#snippet actions()}
                {#if update.canInstall}
                  <button
                    class="theme-btn theme-btn--primary theme-btn--xs"
                    disabled={installing}
                    onclick={installNow}
                    >{installing ? S.updateInstalling : S.updateInstall}</button
                  >
                {:else}
                  <button
                    class="theme-btn theme-btn--primary theme-btn--xs"
                    onclick={() => openReleasePage(update.url).catch(fail)}
                    >{S.updateDownload}</button
                  >
                {/if}
                <button
                  class="theme-btn theme-btn--outline theme-btn--xs"
                  onclick={() => (update = null)}>{S.updateDismiss}</button
                >
              {/snippet}
            </Notice>
          {/if}

          {#if menuOffer}
            <!-- The one thing an AppImage cannot do for itself until it is
                 asked: a single file installs nothing, so the desktop has no
                 entry and no icon to find. Offered once — "No thanks" is
                 remembered on this machine, "Add to menu" is not, so moving
                 the file asks again. -->
            <Notice tone="success" icon="info" title={S.menuEntryBanner} class="shell__notice">
              {#snippet actions()}
                <button
                  class="theme-btn theme-btn--primary theme-btn--xs"
                  disabled={addingToMenu}
                  onclick={addToMenuNow}
                  >{addingToMenu ? S.menuEntryAdding : S.menuEntryAdd}</button
                >
                <button
                  class="theme-btn theme-btn--outline theme-btn--xs"
                  onclick={dismissMenuOffer}>{S.menuEntryDismiss}</button
                >
              {/snippet}
            </Notice>
          {/if}

          <!-- Keyed on the view: a new screen is a NEW element, and the
               stylesheet lets it rise in (2026-08-21) — opening a space from
               the sidebar or the search arrives rather than switches. -->
          {#key Tabs.viewId(view)}
          <div class="shell__screen">
          <!-- The screens, each handed what it needs, one prop at a time.
               TRIED AND REVERTED (2026-08-18): gathering the five or six props
               they share into one `$derived` object and spreading it. It reads
               shorter and it is wrong — a spread makes every prop of the child
               a getter over ONE object, so a screen's `$effect(() => { list;
               reloadKey; load(); })` re-runs whenever anything else in that
               object changes. Selecting a task re-read the whole list from
               disk, and the fresh objects lost the identity the selection is
               matched by, so the card stopped being highlighted. The test
               "an opened task is highlighted even with no id yet" is what
               caught it; it is still the one that would catch it again. -->
          {#if view.kind === "home"}
            <HomeView
              {compact}
              origin={originOfItem}
              notesColor={spColors[layout.homeNotesSource || layout.notesFolder] ?? null}
              root={notebook.path}
              dot={colorOf(view)}
              composing={composingTask}
              onCloseCompose={() => (composingTask = false)}
              dateFormat={layout.dateDisplayFormat}
              quickNoteFolder={layout.quickNoteFolder}
              tasksSource={homeTasks}
              notesSource={homeNotes}
              quickTask={quickTaskTo}
              notesFolder={layout.notesFolder}
              noteTargets={quickTargets}
              lists={notebook.lists}
              {tags}
              completedName={layout.completedName}
              inbox={layout.inbox}
              readOnly={notebook.readOnly}
              {reloadKey}
              onChanged={refreshNotebook}
              onError={fail}
              onOpenNote={openNoteFromBoard}
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
              origin={originOfItem}
              inbox={layout.inbox}
              {inboxSource}
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
              {compact}
              onSub={(label) => (tasksSub = label)}
              onSpan={(span) => (tasksSpan = span)}
              onSuggest={suggest}
              onSetSort={tasksArrangement.setSort}
              onSetOrder={tasksArrangement.setOrder}
              {f}
            />
          {:else if view.kind === "list"}
            <ListView
              dateFormat={layout.dateDisplayFormat}
              list={view.list}
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
            <NotesSpace
              {f}
              dateFormat={layout.dateDisplayFormat}
              source={sourceOf(
                // The arrangement comes from the space's own config — without
                // it the ⋮ could not tick the sorting in force and dragging
                // had nowhere to be saved. The folder falls back to the
                // layout's answer so the screen still opens if the space list
                // has not caught up.
                {
                  kind: "notes",
                  known: true,
                  path: notesSpace?.path ?? layout.notesFolder,
                  sort: notesSpace?.sort,
                  order: notesSpace?.order,
                  noteLayout: notesSpace?.noteLayout,
                },
                // The screen names itself, and what it is called is what the
                // app calls this place everywhere else — the sidebar entry,
                // the tab, the header. (The wireframe writes "Inbox" there,
                // from a time when this screen was thought of as showing that
                // one folder; the board shows the whole space, so the space's
                // name is the honest label.)
                { name: title(view) },
              )}
              onSetSort={notesArrangement.setSort}
              onSetOrder={notesArrangement.setOrder}
              onSetLayout={notesArrangement.setNoteLayout}
              defaultLayout={layout.noteLayout}
              header={!compact}
              dot={colorOf(view)}
              readOnly={notebook.readOnly}
              notesInbox={layout.notesInbox}
              root={notebook.path}
              {noteSpaces}
              {reloadKey}
              onChanged={refreshNotebook}
              onError={fail}
              onOpenNote={openNoteFromBoard}
            />
          {:else if view.kind === "note"}
            <!-- The note's head: its banner and its title, as the "Editor
                 screen" wireframes draw them. Without a banner the block has
                 no colour and no height, and the title stays exactly where it
                 was (user call, 2026-08-19). -->
            <NoteBanner
              enabled={f("banners")}
              banner={openNote.banner}
              title={openNote.title}
              root={notebook.path}
              readOnly={notebook.readOnly}
              {compact}
              onSet={setNoteBanner}
              onChooseImage={() => (pickingImage = "banner")}
              onRename={notebook.readOnly ? null : renameCurrentNote}
              created={openNote.created ?? null}
              tags={openNote.tags ?? []}
              catalogue={tags}
              dateFormat={layout.dateDisplayFormat}
              tagsEnabled={f("noteTags")}
              color={colorOf(view)}
              onSetTags={setNoteTags}
              onCreateTag={createNoteTag}
            />
            <NoteEditor
              bind:this={noteEditor}
              folder={view.folder}
              path={view.path}
              readOnly={notebook.readOnly}
              onSaved={refreshNotebook}
              onError={fail}
              onFiles={addFilesToNote}
              onOpenFile={(address) => api.openAsset(address).catch(fail)}
              onOpenNote={openNoteByTitle}
              onZoomImage={(address) => (zoomedImage = address)}
              onSelection={(has) => (noteSelected = has)}
              onTable={(status) => (noteTable = status)}
              version={reloadKey}
              wikiLinks={f("wikiLinks")}
              embeds={f("embeds")}
              tables={f("tables")}
              tableLayout={layout.tableLayout}
              root={notebook.path}
              onLoaded={(state) => {
                openNote = state;
                // Consumed here, not in the editor: only the shell knows this
                // note was created a moment ago rather than opened.
                if (focusNewNote) {
                  focusNewNote = false;
                  noteEditor?.focusBody();
                }
              }}
            />
          {:else if view.kind === "settings"}
            <SettingsView
              {compact}
              {mobile}
              {notebook}
              {zoom}
              onZoom={setZoom}
              onSwitchNotebook={chooseFolder}
              noteTargets={quickTargets}
              taskTargets={quickTaskChoices}
              {homeTasksChoices}
              {homeNotesChoices}
              {userThemes}
              {wornTheme}
              onNewTheme={newThemeFrom}
              blockedInTheme={wornThemeBlocked}
              onSection={(label) => (settingsSub = label)}
              onChanged={refreshNotebook}
              onError={fail}
            />
          {:else if view.kind === "space"}
            {@const current = userSpaces.find((w) => w.path === view.sp)}
            {#if current}
              <SpaceView
                {compact}
                space={current}
                color={spColors[current.path] ?? null}
                lists={notebook.lists}
                {tags}
                completedName={layout.completedName}
                notesInbox={layout.notesInbox}
                root={notebook.path}
                {noteSpaces}
                today={clock?.today}
                dateFormat={layout.dateDisplayFormat}
                {dayRefs}
                {f}
                readOnly={notebook.readOnly}
                {reloadKey}
                selectedTask={selected?.task ?? null}
                onSelectTask={select}
                onOpenNote={openNoteFromBoard}
                onSetSpaceSort={spaceArrangement.setSort}
                onSetSpaceOrder={spaceArrangement.setOrder}
                onSetSpaceNoteLayout={spaceArrangement.setNoteLayout}
                noteLayout={layout.noteLayout}
                onChanged={refreshNotebook}
                onError={fail}
              />
            {:else}
              <EmptyState icon="folder" title={S.missingSpace} />
            {/if}
          {:else if view.kind === "tags"}
            <TagsView
              {tags}
              onSearch={(name) => {
                searchScope = null;
                searchQuery = `#${name}`;
                searching = true;
              }}
              onChanged={refreshNotebook}
              onError={fail}
            />
          {:else if view.kind === "assets"}
            <AssetsView
              root={notebook.path}
              readOnly={notebook.readOnly}
              onChanged={refreshAll}
              onError={fail}
              onOpenNote={(path, folder, opts) => showNote(path, folder, opts?.newTab)}
              onOpenTask={showFoundTask}
              onRemoteImage={(url) => fetchRemoteImage(url)}
              {reloadKey}
            />
          {:else if view.kind === "timeline"}
            <TimelineView
              readOnly={notebook.readOnly}
              today={clock?.today}
              dateFormat={layout.dateDisplayFormat}
              origin={originOfItem}
              colors={spColors}
              ghostTitles={layout.timelineGhostTitles}
              onOpenTask={showFoundTask}
              onOpenNote={(path, folder) => showNote(path, folder)}
              onChanged={refreshNotebook}
              onError={fail}
              {reloadKey}
            />
          {:else if view.kind === "trash"}
            <TrashView
              onChanged={refreshNotebook}
              onError={fail}
              {reloadKey}
              dateFormat={layout.dateDisplayFormat}
              readOnly={notebook?.readOnly ?? false}
            />
          {:else}
            <CompletedView
              readOnly={notebook.readOnly}
              origin={originOfItem}
              onChanged={refreshNotebook}
              onError={fail}
              {reloadKey}
            />
          {/if}
          </div>
          {/key}
          </div>
        </div>
        </div>
      </section>

      <!-- RIGHT: one panel, one thing in it — the task inspector, the day's
           suggestions (2026-08-06), or an open note's formatting (2026-08-18). The wrapper is a flex column whose width
           slides on open/close — the same width animation the left rail uses,
           so both side panels move the same way (no grid flicker, since the
           shell is flex). The inner panel keeps a fixed width so its content is
           clipped, not reflowed, while it slides. -->
      <!-- Its own handle, on the side it opens from (user call, 2026-08-17).
           Only while there is a panel to resize; the same separator the
           sidebar's edge is, mirrored. -->
      {#if (suggesting || selected || formatBarOpen) && !compact}
        <!-- Its own handle, on the side the panel opens from: the same
             separator, mirrored (`sign`). -->
        <PanelResizer
          limits={PANEL}
          sign={-1}
          width={panelWidth}
          label={S.resizePanel}
          onWidth={(w) => (panelWidth = w)}
          onCommit={(w) => api.rememberPanelWidth(w).catch(() => {})}
          onResizing={(on) => (resizing = on)}
        />
      {/if}

      <!-- What the right panel is holding, written ONCE and framed twice: a
           sliding column on the desktop, a bottom sheet below 768px, where
           there is no "right" left to open into. The props are the panel's
           contract and must not fork with the frame. -->
      {#snippet rightPanel()}
        {#if suggesting}
          <SuggestionsPane
            period={suggesting}
            origin={originOfItem}
            dateFormat={layout.dateDisplayFormat}
            {compact}
            {reloadKey}
            onChanged={refreshAll}
            onError={fail}
            onClose={() => (suggesting = null)}
            {f}
          />
        {:else if formatBarOpen}
          <NotePanel
            onRun={runFormat}
            hidden={hiddenFormats}
            inactive={inactiveFormats}
            menu={noteActions}
            where={leafOf(openNoteFolder) || S.allNotes}
            targets={noteMoveTargets}
            onDelete={deleteCurrentNote}
            onClose={() => (formatting = false)}
            readOnly={notebook.readOnly}
          />
        {:else if selected}
          <TaskInspector
            task={selected.task}
            list={selected.list}
            color={spColors[folderOf(selected.list)] ?? null}
            lists={moveTargets}
            {tags}
            {compact}
            root={notebook.path}
            readOnly={notebook.readOnly}
            dateFormat={layout.dateDisplayFormat}
            reminderTime={layout.reminderTime ?? "09:00"}
            inDay={!!selected.task?.id &&
              dayRefs.has(`${selected.list}#${selected.task.id}`)}
            {f}
            onSaved={refreshAll}
            onError={fail}
            onClose={() => (selected = null)}
            onMoved={(to) => (selected = { ...selected, list: to })}
            onOpenNote={openNoteByTitle}
          />
        {/if}
      {/snippet}

      {#if suggesting || selected || (formatBarOpen && !compact)}
        {#if compact}
          <!-- 72% of the screen, from the wireframe: tall enough for the
               inspector's form, short enough that the list it belongs to is
               still visible behind it. -->
          <BottomSheet
            label={suggesting ? S.suggestionsTitle : S.taskName}
            onClose={() => (suggesting ? (suggesting = null) : (selected = null))}
          >
            {@render rightPanel()}
          </BottomSheet>
        {:else}
          <div class="shell__panel" transition:slide={{ axis: "x", duration: 200 }}>
            {@render rightPanel()}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
  </main>
  </div>

  <!-- The drawer, below 768px. INSIDE `.window`, and absolutely placed against
       it (user call, 2026-08-18: "o sidebar deve continuar dentro do app,
       somente estar invisível fora da janela").

       It was outside for two frames' worth of good reasons — it has to cover
       the top bar, and it has to stay still while the app slides out from
       under it — and both are met here too, now that what slides is
       `.window__page` and not the window: the drawer is that box's sibling, so
       the transform never reaches it, and a higher layer puts it over the bar.
       What being outside cost was the app's own edge: the window kept its
       rounded corners and hairline while the drawer sat beside it, un-clipped,
       so an open drawer showed the desktop through the seam between the two.
       Inside, the frame clips it — off-canvas is simply outside the window. -->
  {#if compact && notebook}
    {#if drawerOpen || drawerAt !== null}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- It draws nothing at all (styles/components/shell.css): a drawer that
           PUSHES leaves the whole app on screen, and veiling a frame you can
           still see whole only made its black read as another black (user
           report, 2026-08-18). All that is left of it is the tap that closes. -->
      <div
        class="shell__drawer-scrim"
        onclick={() => (drawerOpen = false)}
      ></div>
    {/if}
    {@render sidebar()}
  {/if}
</div>

<!-- The formatting strip, below 768px: it rides above the on-screen keyboard
     while a note has the cursor (user call, 2026-08-18).

     `position: fixed` and OUTSIDE `.window`, the same two reasons the drawer
     is: the page slides under it, and a transform on an ancestor would make it
     the containing block of anything fixed inside. Outside the window it is in
     no region at all, so it declares one — CHROME (2026-08-19, wireframe "New
     note mobile"): it is drawn dark against the light page, the way the top
     bar and the drawer are, because it belongs to the app around the note and
     not to the note. On the desktop the same bar floats over the canvas and is
     light, and that difference is exactly the difference between the two
     places it sits.

     Tied to the editor having FOCUS, not to the screen being a note: with the
     keyboard down the strip would be a bar floating over nothing, and the
     wireframe puts it against the keyboard's top edge. -->
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

<!-- The tab strip, below 768px: a sheet you pull up rather than a row across
     the top. There is no room for a row of tabs on a phone, and a tab strip
     squeezed to three glyphs stops naming anything. Same TabBar, same props —
     the sheet is the only thing that is new. -->
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

<!-- Ctrl+F / Ctrl+K, over whatever screen is open: a search is a question
     asked in passing, and answering it should not cost the place you were in. -->
<!-- The canvas's own menu (2026-08-17): the screen's actions, at the pointer.
     Outside the panel in the markup so the popup is never clipped by the
     scrolling content it was opened over. -->
<ContextMenu
  at={canvasMenuAt}
  items={canvasMenu}
  region="canvas"
  onClose={() => (canvasMenuAt = null)}
/>

<!-- The image library, as a question: which picture? Mounted out here with the
     other dialogs, and it opens over whatever screen asked — the banner's ⋮ or
     the note's ⋮ (`pickingImage` says which, and what to do with the answer). -->
{#if zoomedImage && notebook}
  <ImageViewer
    src={assetUrl(notebook.path, zoomedImage)}
    alt={leafOf(zoomedImage)}
    onClose={() => (zoomedImage = null)}
  />
{/if}

{#if pickingImage && notebook}
  <AssetPicker
    root={notebook.path}
    readOnly={notebook.readOnly}
    onPick={useImage}
    onClose={() => (pickingImage = null)}
    onError={fail}
  />
{/if}

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
