<script>
  // The fixed Tasks space: the Inbox — or, when the notebook asks for it,
  // every list of the notebook on one screen, arranged by space.
  //
  // Until 2026-09-04 this screen had three tabs — Inbox, Today, Week. The
  // day moved to the Home, where the calendar lets any day ahead be planned
  // (and a week-sized bucket had nothing left to hold), so what is left here
  // is the one thing the fixed space owns: its Inbox. `showAll` is the
  // notebook's `tasksShowAll` (Settings › Tasks): the same screen over every
  // open task of every list, each card wearing its space's colour as the
  // origin bar. Flat, in the sidebar's order, no Completed fold — the
  // Completed screen is where finished work is read.
  //
  // It IS the tasks screen (2026-08-06): the Inbox tab hosts the notebook's
  // own Tasks space — the one it creates — so it comes with that folder's
  // "Completed N". The only thing this screen changes is where a new task
  // comes from: not the blue button, but the bar it pins to the bottom
  // (`compose="bar"`).
  import { S } from "../services/strings.js";
  import { folderOf } from "../services/paths.js";
  import TasksSpace from "../spaces/TasksSpace.svelte";

  let {
    /// The Inbox list's address, and the space that owns it.
    inbox,
    inboxSource = null,
    /// Every list of the notebook pulled together (`tasksShowAll`).
    showAll = false,
    lists = [],
    tags = [],
    completedName = "completed",
    /// What is pulled into the Day, so a card can say it is in today.
    dayRefs = null,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
    /// `(item) => {label, color} | null` — where an item came from, for the
    /// badge a card wears outside its space (services/origin.js). Null when
    /// the screen IS the space, and nothing is said.
    origin = null,
    readOnly = false,
    reloadKey = 0,
    onChanged,
    onError,
    onSelect,
    selectedTask = null,
    dateFormat = "mm/dd/yyyy",
    today = null,
    /// How the Index is arranged, saved into the space that holds it. Without
    /// these the drag played out and the order was dropped on release — the
    /// same hole the fixed Notes screen had (App.svelte says why).
    onSetSort,
    onSetOrder,
  } = $props();

  /// The folder holding the Inbox list — `jott.tasks/task-list.md` →
  /// `jott.tasks`. That folder IS a tasks space, so the screen hosts it
  /// rather than inventing a second way to show the same list. Titled for
  /// what it shows — the Inbox, or every list — since the tabs that used to
  /// say so are gone (2026-09-04).
  let source = $derived({
    ...(inboxSource ?? { kind: "tasks", folder: folderOf(inbox) }),
    name: showAll ? S.allListsTitle : S.inboxTab,
  });
</script>

<div class="tasks-view">
  <div class="tasks-view__pane">
    <TasksSpace
      {source}
      all={showAll}
      origin={showAll ? origin : null}
      align="center"
      compose="bar"
      {onSetSort}
      {onSetOrder}
      {lists}
      {tags}
      {completedName}
      {dayRefs}
      {readOnly}
      {reloadKey}
      {selectedTask}
      onSelectTask={onSelect}
      {onChanged}
      {onError}
      {dateFormat}
      {today}
      {f}
    />
  </div>
</div>
