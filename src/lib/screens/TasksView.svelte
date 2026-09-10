<script>
  // The fixed Tasks space: the Inbox — or, with `tasksShowAll` (Settings ›
  // Tasks), every open task of every list, flat, in the sidebar's order, each
  // card wearing its space's colour as the origin bar, no Completed fold. It
  // hosts the notebook's own Tasks space, so it comes with that folder's
  // "Completed N"; a new task comes from the bar at the bottom (`compose="bar"`).
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
    /// these the drag plays out and the order is dropped on release.
    onSetSort,
    onSetOrder,
    /// The narrow shell (shell/compact.js): the bar opens from a round +.
    compact = false,
  } = $props();

  /// The folder holding the Inbox list — `jott.tasks/task-list.md` →
  /// `jott.tasks`. That folder IS a tasks space, so the screen hosts it.
  /// Titled for what it shows: the Inbox, or every list.
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
      compose={compact ? "fab" : "bar"}
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
