<script>
  import { listTitle } from "../services/paths.js";
  import { formatDate } from "../services/dates.js";
  import { S } from "../services/strings.js";
  import Icon from "./Icon.svelte";

  // One task line, drawn as the wireframe's card: a rounded panel with the
  // checkbox, the title (plus a bookmark), and a quiet meta row under it.
  //
  // Two gestures on the text, on purpose: a single click opens the task in the
  // inspector (where the fields live), a double click renames it in place. The
  // rename is the one edit frequent enough to deserve staying on the row.
  let {
    task,
    list,
    showList = false,
    selected = false,
    onComplete,
    onEdit,
    onSelect,
    // The bookmark: pins the task to the top of its list. A completed task
    // has no top to be at, so the bookmark is not drawn there at all.
    onPin,
    dateFormat = "mm/dd/yyyy",
    /// This task is pulled into the Day. A quiet marker in the meta row, like
    /// the date beside it — NOT a button (user call, 2026-08-06): the row is a
    /// summary, and the whole card is already click-to-open plus a drag handle.
    inDay = false,
    /// `(key) => boolean` — is this part of the app switched on? A field
    /// switched off leaves the CARD, not the file: the `.md` keeps it and it
    /// comes back untouched (2026-08-06).
    f = () => true,
    today = null,
    // Name → colour, from the tag catalogue (`.jott/tags.json`). A tag on the
    // card shows as a coloured pill (colour only); the inspector shows text too.
    tagColors = {},
    /// The swipe action and its options, handed in by the list rather than
    /// imported here: the row does not decide what a swipe MEANS, and a row
    /// drawn somewhere without the gesture simply gets nothing.
    swipeAction = null,
    swipeOptions = {},
    children,
  } = $props();

  // A no-op action, so the `use:` below is unconditional (Svelte has no way to
  // apply one conditionally) without the row having to know about swiping.
  const noAction = () => ({});
  let gesture = $derived(
    swipeAction && (swipeOptions.onLeft || swipeOptions.onRight) ? swipeAction : noAction,
  );

  let editing = $state(false);
  // Filled when editing starts; initialising from `task` here would only ever
  // capture the value the row was created with.
  let draft = $state("");

  // The user's click flips the DOM checkbox before the completion round-trips.
  // When the refresh hands this row a DIFFERENT task with the same `done`
  // (positional {#each} keys reuse the node — it was how a repeat's fresh
  // occurrence appeared born-checked), Svelte sees no change and never writes
  // the property back, so the clicked state leaks into the new task. Re-assert
  // it from state whenever the task changes.
  let check = $state(null);
  $effect(() => {
    const done = task.done;
    if (check && check.checked !== done) check.checked = done;
  });

  function startEditing() {
    draft = task.text;
    editing = true;
  }

  async function save() {
    editing = false;
    const text = draft.trim();
    if (text && text !== task.text) await onEdit(list, task.id, text);
  }

  function onKey(event) {
    if (event.key === "Enter") save();
    if (event.key === "Escape") editing = false;
  }

  let doneSubtasks = $derived(
    (task.subtasks ?? []).filter((s) => s.done).length,
  );

  // Overdue: a due date earlier than the logical today, on a task not yet done.
  // Both dates are ISO (YYYY-MM-DD), so a string compare is the date compare.
  let overdue = $derived(
    !task.done && !!task.due && !!today && task.due < today,
  );

  let hasMeta = $derived(
    !!(
      (task.due && f("dueDate")) ||
      (task.repeat && f("repeat")) ||
      (task.priority && f("priority")) ||
      (task.subtasks?.length && f("subtasks")) ||
      (task.tags?.length && f("taskTags")) ||
      inDay ||
      showList
    ),
  );
</script>

<!-- The whole card opens the task in the inspector; the interactive parts
     inside (checkbox, bookmark, the slotted actions) stop the click so they do
     their own thing instead. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- The whole card is also the drag handle when the list is reorderable
     (hold and drag anywhere; the action tells a 5px drag from a click and
     swallows the click a drag would otherwise fire). -->
<li
  class="task-row"
  class:swipe={gesture !== noAction}
  class:task-row--selected={selected}
  class:task-row--done={task.done}
  onclick={() => onSelect?.(list, task)}
  use:gesture={swipeOptions}
>
  <!-- What a swipe uncovers: a square in the space the card leaves, at the end
       it is leaving (wireframe `Delete task.pdf`). Real markup, not a
       background image, so it draws the app's own Phosphor icons; which of the
       two shows is the direction, and CSS reads that off the row. -->
  {#if swipeOptions.onLeft}
    <span class="swipe__action swipe__action--delete" aria-hidden="true">
      <Icon name="trash" size="1.125rem" />
    </span>
  {/if}
  {#if swipeOptions.onRight}
    <span class="swipe__action swipe__action--unpull" aria-hidden="true">
      <Icon name="x" size="1.125rem" />
    </span>
  {/if}
  <input
    bind:this={check}
    class="theme-checkbox theme-checkbox--lg task-row__check"
    type="checkbox"
    checked={task.done}
    onchange={() => onComplete(list, task)}
    onclick={(e) => e.stopPropagation()}
    aria-label={task.done ? S.uncheck : S.complete}
  />

  <div class="task-row__body">
    <div class="task-row__top">
      {#if editing}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="theme-input theme-input--plain task-row__edit"
          bind:value={draft}
          onblur={save}
          onkeydown={onKey}
          onclick={(e) => e.stopPropagation()}
          autofocus
        />
      {:else}
        <button
          class="task-row__title"
          ondblclick={startEditing}
          title={S.taskRowHint}
        >
          {task.text}
        </button>
      {/if}
      {#if onPin && !task.done}
        <button
          data-no-swipe
          class="theme-btn--icon task-row__bookmark"
          class:task-row__bookmark--on={task.pinned}
          onclick={(e) => {
            e.stopPropagation();
            onPin(list, task, !task.pinned);
          }}
          aria-label={task.pinned ? S.unpinTask : S.pinTask}
          title={task.pinned ? S.unpinTask : S.pinTask}
        >
          <!-- Pinned reads as the FILLED bookmark, not a colour: the shape
               says "marked" on its own (user call 2026-08-05). -->
          <Icon
            name={task.pinned ? "bookmark-simple-fill" : "bookmark-simple"}
            size="1rem"
          />
        </button>
      {/if}
    </div>

    {#if hasMeta}
      <!-- Quiet by default: a field is a note about the task, not a competing
           headline. -->
      <div class="task-row__meta">
        {#if task.subtasks?.length && f("subtasks")}
          <!-- The subtask count as plain text. No coloured pill: pills are
               reserved for tags. -->
          <span class="task-row__field">{doneSubtasks}/{task.subtasks.length}</span>
        {/if}
        {#if inDay}<Icon name="sun" size="0.875rem" />{/if}
        {#if task.repeat && f("repeat")}<Icon name="arrow-clockwise" size="0.875rem" />{/if}
        {#if task.due && f("dueDate")}<span
            class="task-row__field"
            class:task-row__field--overdue={overdue}
            >{formatDate(task.due, dateFormat)}</span
          >{/if}
        {#if task.priority && f("priority")}<span
            class="task-row__field task-row__field--priority"
            class:task-row__field--p1={task.priority === 1}
            class:task-row__field--p2={task.priority === 2}
            class:task-row__field--p3={task.priority === 3}
            >{"!".repeat(Math.max(1, 4 - task.priority))}</span
          >{/if}
        {#each (f("taskTags") ? (task.tags ?? []) : []) as tag}<span
            class="theme-tag-pill task-row__tag"
            title={`#${tag}`}
            style={tagColors[tag] ? `--tag-color: ${tagColors[tag]}` : ""}
          ></span>{/each}
        {#if showList}<span class="task-row__field">{listTitle(list)}</span>{/if}
      </div>
    {/if}

    <!-- The description is deliberately NOT shown here: the row is a summary,
         and the full description lives in the inspector (sidebar) only. -->
  </div>

  {#if children}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="task-row__actions"
      data-no-swipe
      onclick={(e) => e.stopPropagation()}
    >
      {@render children()}
    </div>
  {/if}
</li>
