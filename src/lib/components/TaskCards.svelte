<script>
  // A list of task cards — the one implementation Home, a list screen and a
  // tasks space draw through. The hairline separating pinned cards is a list
  // item of its own but NOT a `.task-row`, so the reorder action never counts
  // it as a slot. Block hooks come in as classes, so a grep for
  // `.tasks-space__list` still finds both the markup and the CSS.
  import TaskRow from "./TaskRow.svelte";
  import { reorderable } from "../actions/reorder.js";
  import { swipe } from "../actions/swipe.js";
  import { ask } from "../services/shortcuts.js";
  import { clamp } from "../services/num.js";

  let {
    /// Each entry is a task and the list it lives in — Home draws tasks from
    /// several lists at once, so the address travels with the task.
    items = [],
    /// The host's BEM hooks. The shared form is `.theme-task-list` /
    /// `.theme-pin-divider`; these only let a theme reach one specific list.
    listClass = "",
    dividerClass = "",
    /// Drop handler, in SCREEN indices. Omitted, the list is not draggable.
    onReorder = null,
    /// The selection, for the drag (actions/reorder.js):
    /// `onHold(entry)` answers a press that rested — true to take it (enter
    /// selection mode); `carried(entry)` lists the entries that travel with
    /// one that is picked up; `onReorderMany(entries, to)` is the drop of
    /// that pile, `to` in screen indices like `onReorder`.
    onHold = null,
    carried = null,
    onReorderMany = null,
    /// Whether a pinned block floats on top, and so whether the divider is
    /// drawn. `pinnedFirst` is the host's call: a Completed list has no top.
    pinned = false,
    isSelected = () => false,
    onSelect,
    onComplete,
    onEdit,
    onPin = null,
    /// `(item) => {label, color} | null` — where an item came from, for the
    /// badge a card wears outside its space (services/origin.js). Null when
    /// the screen IS the space, and nothing is said.
    origin = null,
    /// `(entries, zone) => void` — cards dropped, by a FREE drag (Ctrl held),
    /// on a space of tasks in the sidebar or on the Home. Null: no free drag.
    onMoveTo = null,
    /// The colour of the space these cards are in (a name) — what a tag wears.
    color = null,
    /// `(entry) => boolean` — is this one pulled into the Day? Left alone on a
    /// screen that IS the day or the week: there it would be true of every
    /// card, which says nothing.
    inDay = () => false,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
    dateFormat = "mm/dd/yyyy",
    today = null,
    /// Deleting a card — by swiping it left, or by pressing Delete on it.
    /// `(entry) => void`; omitted, neither gesture gives.
    onDelete = null,
    /// What a rightward swipe means for one card: `(entry) => { adds, run }`,
    /// or null. `adds` decides which square the swipe uncovers — the owning
    /// screen knows whether it sends to the day or takes out (spaces/TasksSpace.svelte).
    daySwipe = null,
    /// `(entry) => void` — make a copy of this task. Omitted, Ctrl+D does
    /// nothing rather than something surprising.
    onDuplicate = null,
    /// Per-card actions, rendered in the row's action slot.
    actions,
  } = $props();

  // ---- the keyboard ----
  // The list answers its own keys: it HAS the tasks, and with two lists on
  // screen a shell-level handler would have to guess which one a press meant.
  // Focus moves, selection does not follow (Enter opens): roving tabindex.
  let focused = $state(0);

  /// The card the keys act on: the focused one, kept inside the list as items
  /// come and go (a completed task leaves, and the index would dangle).
  let at = $derived(clamp(focused, 0, Math.max(0, items.length - 1)));

  let list = $state(null);

  function focusCard(index) {
    focused = index;
    // After the render that moves `tabindex`, or the browser refuses focus on
    // an element that is still `-1`.
    queueMicrotask(() => list?.querySelector(`[data-card="${index}"]`)?.focus());
  }

  function onKeydown(event) {
    const entry = items[at];
    if (!entry) return;
    const id = $ask(event, "tasks");
    if (!id) return;

    switch (id) {
      case "task.up":
        if (at <= 0) return;
        focusCard(at - 1);
        break;
      case "task.down":
        if (at >= items.length - 1) return;
        focusCard(at + 1);
        break;
      case "task.open":
        onSelect?.(entry.list, entry.task);
        break;
      case "task.complete":
        onComplete?.(entry.list, entry.task);
        break;
      case "task.delete":
        if (!onDelete) return;
        onDelete(entry);
        break;
      case "task.duplicate":
        if (!onDuplicate) return;
        onDuplicate(entry);
        break;
      // Moving is the drag by another gesture, so it goes through the same
      // handler and speaks the same screen indices.
      case "task.moveUp":
      case "task.moveDown": {
        if (!onReorder) return;
        const to = id === "task.moveUp" ? at - 1 : at + 1;
        if (to < 0 || to >= items.length) return;
        onReorder(at, to);
        focusCard(to);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  }

  let pinnedCount = $derived(
    pinned ? items.filter((entry) => entry.task.pinned).length : 0,
  );
  // No divider when everything is pinned: it would be a line under the list.
  let dividerAfter = $derived(
    pinnedCount > 0 && items.length > pinnedCount ? pinnedCount - 1 : -1,
  );
</script>

<!-- Drag anywhere on a card to reorder (no grip); a plain click still opens
     the inspector — the action tells them apart by distance. A selector that
     matches nothing is how a non-reorderable list opts out. Reordering is
     vertical, swiping horizontal, and the first few pixels decide — no hold. -->

<!-- `role="grid"` with one column: the cards are `row`s, focusable and
     arrow-navigable while holding their own controls (TaskRow). The divider
     keeps `aria-hidden`, so it is not a row. A `ul` with a role is valid ARIA. -->
<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<ul
  bind:this={list}
  class="theme-task-list {listClass}"
  role="grid"
  onkeydown={onKeydown}
  use:reorderable={{
    axis: "y",
    item: onReorder || onMoveTo ? ".task-row" : ".task-row--never",
    // The free drag (Ctrl): out of the list, to a space in the sidebar or the
    // Home — the only zones it can land on. A plain drag never sees them.
    free: onMoveTo ? (e) => e.ctrlKey || e.metaKey : null,
    freeZones: onMoveTo
      ? () =>
          document.querySelectorAll('[data-space-drop][data-space-kind="tasks"], [data-day-drop]')
      : null,
    onDropZone: onMoveTo
      ? (what, zone) => onMoveTo((Array.isArray(what) ? what : [what]).map((i) => items[i]), zone)
      : null,
    // Longer than the default rest: here the hold ENTERS SELECTION MODE, and
    // a slow scroll down the list kept marking cards by accident.
    holdMs: 700,
    onReorder: onReorder ?? (() => {}),
    onHold: onHold ? (i) => onHold(items[i]) : null,
    carried: carried
      ? (i) => {
          // Matched by the task: the host's entries and these are not the
          // same objects (TasksSpace.svelte says why).
          const pile = carried(items[i]).map((entry) =>
            items.findIndex((candidate) => candidate.task === entry.task),
          );
          return [i, ...pile.filter((at) => at >= 0 && at !== i)];
        }
      : null,
    onReorderMany: onReorderMany
      ? (froms, to) => onReorderMany(froms.map((i) => items[i]), to)
      : null,
  }}
>
  <!-- Keyed by position as well as id: a duplicated id would otherwise be a
       duplicate key, and Svelte aborts rendering the whole list. A read-only
       notebook never gets its ids de-duplicated, so this can still happen. -->
  {#each items as entry, i (`${entry.list}/${entry.task.id ?? ""}#${i}`)}
    <TaskRow
      swipeAction={swipe}
      swipeOptions={{
        onLeft: onDelete && (() => onDelete(entry)),
        onRight: daySwipe?.(entry)?.run,
        rightAdds: !!daySwipe?.(entry)?.adds,
      }}
      index={i}
      focusable={i === at}
      onFocused={() => (focused = i)}
      task={entry.task}
      list={entry.list}
      origin={origin?.(entry) ?? null}
      {color}
      inDay={inDay(entry)}
      {f}
      {onSelect}
      selected={isSelected(entry.task)}
      {onComplete}
      {onEdit}
      {onPin}
      {dateFormat}
      {today}
    >
      {#if actions}{@render actions(entry)}{/if}
    </TaskRow>
    {#if i === dividerAfter}
      <li class="theme-pin-divider {dividerClass}" aria-hidden="true"></li>
    {/if}
  {/each}
</ul>
