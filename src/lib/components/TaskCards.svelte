<script>
  // A list of task cards — the one implementation Home, a list screen and a
  // tasks widget draw their tasks through.
  //
  // The three of them had copied the same twenty lines of markup, and with it
  // the rule that is easy to get subtly wrong: the hairline that separates the
  // pinned cards from the rest is a list item of its own, but NOT a `.task-row`,
  // so the reorder action never counts it as a slot (2026-08-05).
  //
  // The block hooks come in as classes rather than being built from a name, so
  // a grep for `.tasks-widget__list` still finds both the markup and the CSS.
  import TaskRow from "./TaskRow.svelte";
  import { reorderable } from "../actions/reorder.js";
  import { swipe } from "../actions/swipe.js";

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
    /// Whether a pinned block floats on top, and so whether the divider is
    /// drawn. `pinnedFirst` is the host's call: a Completed list has no top.
    pinned = false,
    isSelected = () => false,
    onSelect,
    onComplete,
    onEdit,
    onPin = null,
    showList = false,
    /// `(entry) => boolean` — is this one pulled into the Day? Left alone on a
    /// screen that IS the day or the week: there it would be true of every
    /// card, which says nothing.
    inDay = () => false,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
    tagColors = {},
    dateFormat = "mm/dd/yyyy",
    today = null,
    /// Swiping a card: left deletes it, right takes it out of the period.
    /// Each is `(entry) => void`; omitted, that direction does not give.
    onSwipeDelete = null,
    onSwipeUnpull = null,
    /// Per-card actions, rendered in the row's action slot.
    actions,
  } = $props();

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
     matches nothing is how a non-reorderable list opts out entirely. -->
<!-- Reordering is vertical, swiping is horizontal, and the first few pixels
     decide which (2026-08-06). No waiting: a hold made the drag feel stuck, and
     both actions ended up capturing the same pointer, which left the reorder
     deaf to every move after the swipe grabbed it. -->
<ul
  class="theme-task-list {listClass}"
  use:reorderable={{
    axis: "y",
    item: onReorder ? ".task-row" : ".task-row--never",
    onReorder: onReorder ?? (() => {}),
  }}
>
  <!-- Keyed by position as well as id: a duplicated id would otherwise be a
       duplicate key, and Svelte aborts rendering the whole list. A read-only
       notebook never gets its ids de-duplicated, so this can still happen. -->
  {#each items as entry, i (`${entry.list}/${entry.task.id ?? ""}#${i}`)}
    <TaskRow
      swipeAction={swipe}
      swipeOptions={{
        onLeft: onSwipeDelete && (() => onSwipeDelete(entry)),
        onRight: onSwipeUnpull && (() => onSwipeUnpull(entry)),
      }}
      task={entry.task}
      list={entry.list}
      {showList}
      inDay={inDay(entry)}
      {f}
      {onSelect}
      selected={isSelected(entry.task)}
      {onComplete}
      {onEdit}
      {onPin}
      {tagColors}
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
