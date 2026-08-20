<script>
  // The composing row of the wireframes ("New task popup", "Tasks screen -
  // default", "New task mobile"):
  //
  //     ☐ │ Create a task…       │ [📁 Inbox] [📅] [🚩] [⏰] [🔁] │ [＋]
  //
  // The square on the LEFT is drawn, not offered: it is the same unticked box
  // the cards above wear, on the same x, so the bar reads as the next task
  // rather than as a toolbar. Nothing to tick until the task exists.
  //
  // The ＋ on the RIGHT is the submit, and it is the one filled-brand control
  // on the screen (wireframe, 2026-08-20) — the bar is where the screen wants
  // the hand to go, and the blue is what says so.
  //
  // One implementation, two places: the middle of the New task dialog, and the
  // bar pinned to the bottom of the Tasks screen. Only the frame differs.
  //
  // FIVE controls (user call, 2026-08-06): the list it lands in, and the four
  // fields that are one value each. Tags and subtasks were here briefly and
  // came back out — a field with an open number of values needs room to be
  // read back, and the panel is where that room is.
  //
  // In the BAR they appear once the row is engaged and go away when it is let
  // go, so an untouched screen shows one quiet line. In the dialog there is no
  // ambiguity about what the row is for, so they are there from the start.
  //
  // BELOW 768px the same markup wraps into two lines — the five controls on
  // top, the square, the writing and the ＋ under them (user call, 2026-08-18:
  // on one line at 360px the field was down to three characters and the icons
  // had no room to be missed). It is a wrap, not a second row in the markup,
  // so this stays one form with one tab order:
  // styles/components/task-composer.css.
  //
  // It collects an INTENT and hands it over; writing it is `taskCompose`'s job,
  // because the same three bridge calls serve every caller.
  import { S } from "../services/strings.js";
  import { listTitle, splitLabel } from "../services/paths.js";
  import { emptyIntent } from "../services/taskCompose.js";
  import { PRIORITIES, REPEAT_UNITS, repeatCounts } from "../services/taskFields.js";
  import { dismissable } from "../actions/dismissable.js";
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import Icon from "./Icon.svelte";
  import Menu from "./Menu.svelte";
  import DatePicker from "./DatePicker.svelte";

  let {
    /// Where the task can be written — `{ path, name }`, as the snapshot has
    /// them. The first is the default when `defaultList` is not given.
    lists = [],
    defaultList = null,
    dateFormat = "mm/dd/yyyy",
    disabled = false,
    /// `"bar"` (pinned at the bottom) or `"dialog"` (inside the modal).
    variant = "bar",
    autofocus = false,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
    /// Given the intent. Returning a promise is fine — the row clears as soon
    /// as it is handed over, so typing can continue immediately.
    onSubmit,
  } = $props();

  let intent = $state(emptyIntent(null));

  /// The list the task goes to: whatever was chosen here, else the caller's
  /// default, else the first list there is. Chosen separately from the prop so
  /// that a default arriving later does not overwrite the user's pick.
  let target = $derived(intent.list ?? defaultList ?? lists[0]?.path ?? null);

  // The group in grey, the space in ink: `Design/`**Tasks**. The bare
  // name would not tell two "Tasks" apart, and the whole address reads as a
  // file path (services/paths.js).
  let listMenu = $derived(
    lists.map((entry) => ({
      context: splitLabel(entry).context,
      label: splitLabel(entry).name,
      run: () => (intent.list = entry.path),
    })),
  );

  let repeating = $state(false);

  let priorityMenu = $derived(
    PRIORITIES.map((option) => ({
      label: (intent.priority === option.value ? "✓ " : "  ") + option.label(),
      run: () => (intent.priority = option.value),
    })),
  );

  let field = $state(null);
  let form = $state(null);

  /// Is the row being used right now? Focus is the honest test, but it leaves
  /// the form whenever one of the fields opens its panel — those are portaled
  /// to <body> (`keepOnScreen`), so the check has to follow them there, the
  /// same way `dismissable` does.
  let engaged = $state(false);
  let showFields = $derived(variant === "dialog" || engaged || intent.text.trim().length > 0);

  function letGo() {
    // After the browser has settled focus on whatever comes next.
    setTimeout(() => {
      const active = document.activeElement;
      if (form?.contains(active)) return;
      if (active?.closest?.("[data-popout]")) return;
      engaged = false;
    }, 0);
  }

  $effect(() => {
    if (autofocus) queueMicrotask(() => field?.focus());
  });

  function submit() {
    const text = intent.text.trim();
    if (!text || !target || disabled) return;
    onSubmit?.({ ...intent, text, list: target });
    intent = emptyIntent(null);
    repeating = false;
  }
</script>

<form
  bind:this={form}
  class="task-composer task-composer--{variant}"
  onsubmit={(e) => (e.preventDefault(), submit())}
  onfocusin={() => (engaged = true)}
  onfocusout={letGo}
>
  <span class="theme-checkbox theme-checkbox--lg task-composer__mark" aria-hidden="true"></span>

  <input
    bind:this={field}
    class="theme-input theme-input--plain task-composer__input"
    placeholder={S.createTaskPlaceholder}
    aria-label={S.createTaskPlaceholder}
    bind:value={intent.text}
    {disabled}
  />

  {#if showFields}
    <div class="task-composer__fields">
      <!-- Where it lands. The wireframe shows the folder chip first, because
           it is the one field that always has a value. -->
      <Menu items={listMenu}>
        {#snippet trigger({ toggle })}
          <button
            class="theme-chip task-composer__list"
            type="button"
            onclick={toggle}
            disabled={disabled || listMenu.length === 0}
            aria-label={S.moveToList}
          >
            <Icon name="folder" size="0.875rem" />
            <span>{target ? listTitle(target) : "—"}</span>
          </button>
        {/snippet}
      </Menu>

      {#if f("dueDate")}
      <DatePicker
        value={intent.due}
        {dateFormat}
        {disabled}
        onChange={(iso) => (intent.due = iso)}
      >
        {#snippet trigger({ toggle })}
          <button
            class="theme-btn--icon task-composer__field"
            class:task-composer__field--set={!!intent.due}
            type="button"
            onclick={toggle}
            {disabled}
            aria-label={S.dueDateLabel}
            title={S.dueDateLabel}
          >
            <Icon name="calendar-blank" size="1rem" />
          </button>
        {/snippet}
      </DatePicker>
      {/if}

      {#if f("remind")}
      <!-- Honest placeholders: reminders and attachments have no backend yet,
           so the buttons are there (the panel draws them too) and say so
           instead of pretending. -->
      <button
        class="theme-btn--icon task-composer__field"
        type="button"
        disabled
        aria-label={S.remindMeLabel}
        title={`${S.remindMeLabel} — ${S.comingSoon}`}
      >
        <Icon name="alarm" size="1rem" />
      </button>
      {/if}

      {#if f("priority")}
      <Menu items={priorityMenu}>
        {#snippet trigger({ toggle })}
          <button
            class="theme-btn--icon task-composer__field"
            class:task-composer__field--set={!!intent.priority}
            type="button"
            onclick={toggle}
            {disabled}
            aria-label={S.priorityLabel}
            title={S.priorityLabel}
          >
            <Icon name="flag" size="1rem" />
          </button>
        {/snippet}
      </Menu>
      {/if}

      {#if f("repeat")}
      <span
        class="task-composer__repeat"
        use:dismissable={{ active: repeating, onDismiss: () => (repeating = false) }}
      >
        <button
          class="theme-btn--icon task-composer__field"
          class:task-composer__field--set={!!intent.repeatUnit}
          type="button"
          onclick={() => (repeating = !repeating)}
          {disabled}
          aria-label={S.repeatLabel}
          title={S.repeatLabel}
        >
          <Icon name="arrow-clockwise" size="1rem" />
        </button>

        {#if repeating}
          <div
            class="theme-popover theme-popover--end task-composer__repeat-panel"
            use:keepOnScreen
          >
            <span class="task-composer__repeat-label">{S.repeatEvery}</span>
            {#if intent.repeatUnit}
              <!-- Chosen, never typed (user call, 2026-08-18): on a phone a
                   number field opens the keyboard over the panel it belongs
                   to, and on the desktop it asks for a spinner two pixels
                   tall. The list is `repeatCounts`, which carries whatever
                   this task already says even when that is off the scale. -->
              <select
                class="theme-select theme-select--sm task-composer__repeat-every"
                bind:value={intent.repeatEvery}
                aria-label={S.repeatEvery}
              >
                {#each repeatCounts(intent.repeatEvery) as count (count)}
                  <option value={count}>{count}</option>
                {/each}
              </select>
            {/if}
            <select
              class="theme-select theme-select--sm"
              bind:value={intent.repeatUnit}
              aria-label={S.repeatLabel}
            >
              {#each REPEAT_UNITS as unit (unit.value)}
                <option value={unit.value}>{unit.label()}</option>
              {/each}
            </select>
          </div>
        {/if}
      </span>
      {/if}
    </div>
  {/if}

  <!-- Solid whether or not anything is written (wireframe): the empty bar is
       exactly where the blue is needed, and a washed-out plate would take the
       accent out of the one place the screen is pointing at. `submit` is the
       guard — an empty row hands nothing over. -->
  <button
    class="theme-btn theme-btn--primary task-composer__add"
    type="submit"
    aria-label={S.addTask}
    title={S.addTask}
    {disabled}
  >
    <Icon name="plus" size="1.25rem" />
  </button>
</form>
