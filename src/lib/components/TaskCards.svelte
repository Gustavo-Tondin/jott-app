<script>
  // A list of task cards — the one implementation Home, a list screen and a
  // tasks space draw their tasks through.
  //
  // The three of them had copied the same twenty lines of markup, and with it
  // the rule that is easy to get subtly wrong: the hairline that separates the
  // pinned cards from the rest is a list item of its own, but NOT a `.task-row`,
  // so the reorder action never counts it as a slot (2026-08-05).
  //
  // The block hooks come in as classes rather than being built from a name, so
  // a grep for `.tasks-space__list` still finds both the markup and the CSS.
  import TaskRow from "./TaskRow.svelte";
  import { reorderable } from "../actions/reorder.js";
  import { swipe } from "../actions/swipe.js";
  import { ask } from "../services/shortcuts.js";

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
    /// Deleting a card — by swiping it left, or by pressing Delete on it.
    /// `(entry) => void`; omitted, neither gesture gives.
    onDelete = null,
    /// Swiping a card right takes it out of the period, where there is one.
    onSwipeUnpull = null,
    /// `(entry) => void` — make a copy of this task. Omitted, Ctrl+D does
    /// nothing rather than something surprising.
    onDuplicate = null,
    /// Per-card actions, rendered in the row's action slot.
    actions,
  } = $props();

  // ---- the keyboard (2026-08-18) ----
  //
  // The list answers its own keys, because it is the one that HAS the tasks
  // and its focus is what says it is the list being talked to. The shell
  // deliberately does not: with two lists on screen (a space draws its tasks
  // and its completed ones), a shell-level handler would have to guess which
  // one a press meant, and would sometimes fire both.
  //
  // Focus moves, selection does not follow it. Arrowing through ten cards
  // would otherwise open — and reload — the inspector ten times; Enter is
  // what opens one. This is also the roving-tabindex pattern, so a task card
  // is finally reachable by Tab at all, which it was not before.
  let focused = $state(0);

  /// The card the keys act on: the focused one, kept inside the list as items
  /// come and go (a completed task leaves, and the index would dangle).
  let at = $derived(Math.min(focused, Math.max(0, items.length - 1)));

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
     matches nothing is how a non-reorderable list opts out entirely. -->
<!-- Reordering is vertical, swiping is horizontal, and the first few pixels
     decide which (2026-08-06). No waiting: a hold made the drag feel stuck, and
     both actions ended up capturing the same pointer, which left the reorder
     deaf to every move after the swipe grabbed it. -->
<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<!-- The rule reads the TAG and not the role: an interactive role on a `ul` is
     valid ARIA (a role replaces the element's semantics, which is the point),
     and a `div` here would cost the list semantics for nothing — the CSS,
     the reorder action and the pin divider are all written against `ul`/`li`.
     -->
<!-- `role="grid"` with one column: the cards are `row`s, which is what makes
     them focusable and arrow-navigable while still holding their own controls
     (see TaskRow). The divider keeps `aria-hidden`, so it is not a row. -->
<ul
  bind:this={list}
  class="theme-task-list {listClass}"
  role="grid"
  onkeydown={onKeydown}
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
        onLeft: onDelete && (() => onDelete(entry)),
        onRight: onSwipeUnpull && (() => onSwipeUnpull(entry)),
      }}
      index={i}
      focusable={i === at}
      onFocused={() => (focused = i)}
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
