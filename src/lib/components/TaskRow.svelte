<script>
  import { tick } from "svelte";
  import Badge from "./Badge.svelte";
  import { dotStyle } from "../services/accent.js";
  import { priorityClass } from "../services/taskFields.js";
  import { formatDate } from "../services/dates.js";
  import { ageStamp } from "../services/age.js";
  import { S } from "../services/strings.js";
  import { played, CEILING } from "../services/motion.js";
  import Icon from "./Icon.svelte";

  // One task line, drawn as a card: checkbox, title (plus bookmark), and a
  // quiet meta row. Two gestures on the text: a single click opens the task
  // in the inspector, a double click renames it in place.
  let {
    task,
    list,
    /// `{label, color}` — the space this card came from, when the card is
    /// shown OUTSIDE it (the day, the week): drawn as a bar of its colour on
    /// the card's left edge. Null inside its own space.
    origin = null,
    /// The colour of the space the card is IN — what its tags wear when
    /// there is no origin to take it from (services/accent.js, a name).
    color = null,
    selected = false,
    onComplete,
    onEdit,
    onSelect,
    // The bookmark: pins the task to the top of its list. A completed task
    // has no top to be at, so the bookmark is not drawn there at all.
    onPin,
    dateFormat = "mm/dd/yyyy",
    /// This task is pulled into the Day. A quiet marker in the meta row — NOT
    /// a button: the row is a summary, and the card is already click-to-open.
    inDay = false,
    /// This card was not in the list at the last read: it plays the arrival
    /// (task-row.css) instead of simply being there. The LIST decides — a row
    /// cannot tell a card that has just arrived from one drawn for the first
    /// time (components/TaskCards.svelte).
    arriving = false,
    /// `(key) => boolean` — is this part of the app switched on? A field
    /// switched off leaves the CARD, not the file.
    f = () => true,
    today = null,
    /// The swipe action and its options, handed in by the list rather than
    /// imported here: the row does not decide what a swipe MEANS, and a row
    /// drawn somewhere without the gesture simply gets nothing.
    swipeAction = null,
    swipeOptions = {},
    /// Where this card sits in the list, and whether it is the one the list's
    /// keyboard is on. Together they are the roving tabindex: exactly one card
    /// per list is reachable by Tab, and the arrows move which.
    index = 0,
    focusable = false,
    onFocused = null,
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
  // (positional keys reuse the node), Svelte sees no change and never writes
  // the property back, so the clicked state leaks. Re-assert it from state.
  let check = $state(null);
  $effect(() => {
    const done = task.done;
    if (check && check.checked !== done) check.checked = done;
  });

  // COMPLETING PLAYS BEFORE IT IS WRITTEN: the row is marked `--finishing`,
  // the stylesheet plays the send-off (task-row.css), and the write waits on
  // what the engine says is playing — nothing (jsdom, reduced motion) means
  // at once; a ceiling guards a play that never reports. Ticking again undoes.
  let row = $state(null);
  let finishing = $state(false);
  // The FINISHING row waits on the HOLD, not the fold: the fold plays while
  // the write and the re-read already run underneath (task-row.css says why).
  // Unticking still waits its whole play — it has no second act.
  const SEND_OFFS = new Set(["task-row-hold", "task-row-restore"]);

  // Unticking a completed card plays the same way: `--restoring` is the
  // shorter cousin, and the write waits on it alike.
  async function finish() {
    if (finishing) {
      finishing = false;
      return;
    }
    finishing = true;
    await tick();
    await played(row, SEND_OFFS, CEILING);
    if (!finishing) return;
    finishing = false;
    onComplete(list, task);
  }

  // THE SUN LIGHTS UP the moment the task joins a day. The marker is drawn
  // for the first time then, so the pop plays on the element as it appears —
  // and only for a card that was already on screen without it, never for one
  // that arrives with the sun already on.
  let joined = $state(false);
  let wasInDay = null;
  $effect(() => {
    const now = inDay;
    if (wasInDay === false && now) joined = true;
    wasInDay = now;
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

  // How old the task is (spec 3.6): stamped by the core; only whether it is
  // drawn is decided here, on the time axis's one switch.
  let stamp = $derived(
    f("time")
      ? ageStamp(task.age, { since: task.created, dateFormat, title: S.createdOn })
      : null,
  );

  let hasMeta = $derived(
    !!(
      (task.due && f("dueDate")) ||
      (task.repeat && f("repeat")) ||
      (task.priority && f("priority")) ||
      (task.subtasks?.length && f("subtasks")) ||
      (task.tags?.length && f("taskTags")) ||
      stamp ||
      inDay ||
      origin
    ),
  );
</script>

<!-- The whole card opens the task in the inspector; the controls inside stop
     the click. It is also the drag handle when the list is reorderable (the
     action tells a 5px drag from a click and swallows that click). -->

<!-- `role="row"` in a `grid` (TaskCards): a card CONTAINS controls, which
     rules out `button`/`option`; `row` is focusable, arrow-navigable and may
     hold controls. The keyboard handler is on the LIST, which knows the order. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<li
  bind:this={row}
  class="task-row"
  role="row"
  class:swipe={gesture !== noAction}
  class:task-row--selected={selected}
  class:task-row--done={task.done}
  class:task-row--arriving={arriving}
  class:task-row--finishing={finishing && !task.done}
  class:task-row--restoring={finishing && task.done}
  class:task-row--origin={!!origin}
  data-card={index}
  tabindex={focusable ? 0 : -1}
  onclick={() => onSelect?.(list, task)}
  onfocusin={() => onFocused?.()}
  use:gesture={swipeOptions}
>
  {#if origin}<span class="theme-origin" style={dotStyle(origin.color)} aria-hidden="true"></span>{/if}
  <!-- What a swipe uncovers: a square in the space the card leaves. Real
       markup, so it draws the app's own icons; CSS reads the direction off the row. -->
  {#if swipeOptions.onLeft}
    <span class="swipe__action swipe__action--delete" aria-hidden="true">
      <Icon name="trash" size="1.125rem" />
    </span>
  {/if}
  {#if swipeOptions.onRight}
    <!-- The same square, two meanings: taking the task out of the day, or
         sending it there. The glyph says which BEFORE the finger lifts; which
         it is belongs to the screen, not the row (TaskCards.svelte). -->
    <span
      class="swipe__action swipe__action--unpull"
      class:swipe__action--pull={swipeOptions.rightAdds}
      aria-hidden="true"
    >
      <Icon name={swipeOptions.rightAdds ? "sun" : "sun-off"} size="1.125rem" />
    </span>
  {/if}
  <input
    bind:this={check}
    class="theme-checkbox theme-checkbox--lg task-row__check"
    type="checkbox"
    checked={task.done}
    onchange={finish}
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
          <!-- Pinned reads as the FILLED bookmark, not a colour. -->
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
        {#if inDay}<span
            class="task-row__sun"
            class:task-row__sun--lit={joined}
            onanimationend={() => (joined = false)}
            ><Icon name="sun" size="0.875rem" /></span
          >{/if}
        {#if task.repeat && f("repeat")}<Icon name="arrow-clockwise" size="0.875rem" />{/if}
        {#if task.remind && f("remind")}<Icon name="alarm" size="0.875rem" />{/if}
        {#if task.due && f("dueDate")}<span
            class="task-row__field"
            class:task-row__field--overdue={overdue}
            >{formatDate(task.due, dateFormat)}</span
          >{/if}
        {#if task.priority && f("priority")}<span
            class="task-row__field task-row__field--priority task-row__field--{priorityClass(task.priority)}"
            >{"!".repeat(Math.max(1, 4 - task.priority))}</span
          >{/if}
        {#each (f("taskTags") ? (task.tags ?? []) : []) as tag}<Badge
            label={`#${tag}`}
            color={origin?.color ?? color}
            class="task-row__tag"
          />{/each}
        <!-- The age sits at the card's outer edge, under the bookmark: about
             the card as a whole, a margin note, not one more field. -->
        {#if stamp}<span
            class="task-row__field task-row__field--age"
            class:task-row__field--forgotten={stamp.band === "forgotten"}
            title={stamp.title}>{stamp.text}</span
          >{/if}
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
