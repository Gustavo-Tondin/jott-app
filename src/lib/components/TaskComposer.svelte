<script>
  // The composing row of the wireframes ("New task popup", "Tasks Screen
  // Writing"):
  //
  //     ＋ │ Create a task…       │ [📁 Inbox] [📅] [🚩] [⏰] [🔁]
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
  // It collects an INTENT and hands it over; writing it is `taskCompose`'s job,
  // because the same three bridge calls serve every caller.
  import { S } from "../services/strings.js";
  import { listName } from "../services/paths.js";
  import { emptyIntent } from "../services/taskCompose.js";
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

  // Workspace in grey, list in ink: `Tasks/`**Inbox**. The bare name would not
  // tell two "Inbox" apart, and the whole address reads as a file path.
  let listMenu = $derived(
    lists.map((entry) => ({
      context: entry.workspace,
      label: listName(entry.path),
      run: () => (intent.list = entry.path),
    })),
  );

  let repeating = $state(false);

  const PRIORITIES = [
    { value: "", label: S.priorityNone },
    { value: "3", label: S.priorityLow },
    { value: "2", label: S.priorityMedium },
    { value: "1", label: S.priorityHigh },
  ];
  let priorityMenu = $derived(
    PRIORITIES.map((option) => ({
      label: (intent.priority === option.value ? "✓ " : "  ") + option.label,
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
  <button
    class="theme-btn--icon task-composer__add"
    type="submit"
    aria-label={S.addTask}
    title={S.addTask}
    disabled={disabled || !intent.text.trim()}
  >
    <Icon name="plus" size="1.25rem" />
  </button>

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
            <span>{target ? listName(target) : "—"}</span>
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
              <input
                class="theme-input theme-input--sm theme-number task-composer__repeat-every"
                type="number"
                min="1"
                bind:value={intent.repeatEvery}
                aria-label={S.repeatEvery}
              />
            {/if}
            <select
              class="theme-select theme-select--sm"
              bind:value={intent.repeatUnit}
              aria-label={S.repeatLabel}
            >
              <option value="">{S.noRepeat}</option>
              <option value="day">{S.repeatDays}</option>
              <option value="week">{S.repeatWeeks}</option>
              <option value="month">{S.repeatMonths}</option>
            </select>
          </div>
        {/if}
      </span>
      {/if}
    </div>
  {/if}
</form>
