<script>
  // The composing row: ☐ │ Create a task… │ [📁 Inbox] [📅] [🚩] [⏰] [🔁] │ [＋]
  // The square is drawn, not offered (the row reads as the next task); the ＋
  // is the submit. One implementation, two frames: the New task dialog and the
  // bar of the Tasks screen. Below 768px the markup WRAPS (task-composer.css),
  // one form, one tab order. It collects an INTENT; `taskCompose` writes it.
  import { S } from "../services/strings.js";
  import { listTitle, splitLabel } from "../services/paths.js";
  import { emptyIntent } from "../services/taskCompose.js";
  import { PRIORITIES, PRIORITY_SWATCH, REPEAT_UNITS, priorityClass, repeatCounts } from "../services/taskFields.js";
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
    /// The bar was OPENED and can be put away (the Home's, on a phone): it
    /// grows the panels' grab handle — pull down or tap to close — and a task
    /// created with the keyboard already closed calls it too.
    onDismiss = null,
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

  /// The levels, each with the colour it paints with before the word — the
  /// status colour of the level, the same the card draws (services/taskFields).
  let priorityMenu = $derived(
    PRIORITIES.map((option) => ({
      label: option.label(),
      checked: intent.priority === option.value,
      swatch: PRIORITY_SWATCH[priorityClass(option.value)],
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

  /// When the field last let go of the caret. Submitting from the ＋ moves
  /// focus to the button BEFORE the click lands, so "is the keyboard up?" at
  /// submit time is really "was the field focused a moment ago". Anything
  /// within this window counts as still typing.
  let typedUntil = 0;
  const TYPING_GRACE = 400;

  /// The drag that puts the bar away, exactly the sheet's (BottomSheet.svelte
  /// says why a handle that cannot be grabbed would be a lie): pull down past
  /// a third of the bar's height and it goes, short of that it springs back.
  let pulled = $state(0);
  let pullFrom = 0;
  const DISMISS_AT = 1 / 3;

  function onPullDown(event) {
    if (event.button !== 0) return;
    pullFrom = event.clientY;
    pulled = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPullMove(event) {
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
    pulled = Math.max(0, event.clientY - pullFrom);
  }

  function onPullUp(event) {
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const height = form?.offsetHeight ?? 0;
    const far = height > 0 && pulled > height * DISMISS_AT;
    pulled = 0;
    if (far) putAway();
  }

  /// Escape puts the bar away when it has the focus. Swallowed, so the
  /// shell's own Escape does not also close what is behind it — an open field
  /// menu wears `dismissable` and already took the press before it got here.
  function onKey(event) {
    if (event.key !== "Escape" || !onDismiss) return;
    event.preventDefault();
    event.stopPropagation();
    putAway();
  }

  /// A SIDEWAYS drag on the bar's own body puts it away too — the desktop's
  /// gesture, where the handle is not drawn. It starts only on the bar itself
  /// (never on a field, a button or the input) and is decided by direction.
  let slid = $state(0);
  let slideFrom = null;
  const SLIDE_AWAY = 96;
  const CLAIMED = "input, button, select, textarea, [role='menu'], .theme-popover";

  function onSlideDown(event) {
    if (!onDismiss || event.button !== 0 || event.pointerType === "touch") return;
    if (event.target.closest(CLAIMED)) return;
    slideFrom = { x: event.clientX, y: event.clientY, id: event.pointerId };
    slid = 0;
  }

  function onSlideMove(event) {
    if (!slideFrom || event.pointerId !== slideFrom.id) return;
    const dx = event.clientX - slideFrom.x;
    const dy = event.clientY - slideFrom.y;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      form?.setPointerCapture?.(slideFrom.id);
      slid = dx;
    }
  }

  function onSlideUp(event) {
    if (!slideFrom || event.pointerId !== slideFrom.id) return;
    form?.releasePointerCapture?.(slideFrom.id);
    slideFrom = null;
    const far = Math.abs(slid) >= SLIDE_AWAY;
    slid = 0;
    if (far) putAway();
  }

  /// The bar leaves, and the keyboard leaves WITH it: whatever of ours holds
  /// the focus lets go before the bar goes.
  function putAway() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && (form?.contains(active) || active === field)) {
      active.blur();
    }
    onDismiss?.();
  }

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
    // THE CURSOR GOES BACK when the keyboard was up, so the next task can be
    // typed at once; tapping ＋ focuses the BUTTON, and on Android that closes
    // the keyboard — hence `typedUntil`. Keyboard already CLOSED: a dismissable
    // bar goes away with the task it made. Not in the dialog: it closes on submit.
    if (variant === "dialog") return;
    const typing = document.activeElement === field || Date.now() < typedUntil;
    if (typing || !onDismiss) field?.focus();
    else putAway();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
  bind:this={form}
  class="task-composer task-composer--{variant}"
  class:task-composer--dragging={pulled > 0 || slid !== 0}
  style={onDismiss ? `--composer-pulled: ${pulled}px; --composer-slid: ${slid}px` : undefined}
  onsubmit={(e) => (e.preventDefault(), submit())}
  onfocusin={() => (engaged = true)}
  onfocusout={letGo}
  onkeydown={onKey}
  onpointerdown={onSlideDown}
  onpointermove={onSlideMove}
  onpointerup={onSlideUp}
  onpointercancel={onSlideUp}
>
  {#if onDismiss}
    <!-- The panels' own gesture on the bar that can be put away: a drag is
         not reachable from a keyboard or a screen reader, so the handle is
         also a button and tapping it closes (the sheet's exact pact). -->
    <button
      type="button"
      class="task-composer__handle"
      aria-label={S.closeComposer}
      onpointerdown={onPullDown}
      onpointermove={onPullMove}
      onpointerup={onPullUp}
      onpointercancel={onPullUp}
      onclick={putAway}
    >
      <span class="task-composer__grip" aria-hidden="true"></span>
    </button>
  {/if}

  <span class="theme-checkbox theme-checkbox--lg task-composer__mark" aria-hidden="true"></span>

  <input
    bind:this={field}
    class="theme-input theme-input--plain task-composer__input"
    placeholder={S.createTaskPlaceholder}
    aria-label={S.createTaskPlaceholder}
    bind:value={intent.text}
    onblur={() => (typedUntil = Date.now() + TYPING_GRACE)}
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

      {#if f("priority")}
      <Menu items={priorityMenu}>
        {#snippet trigger({ toggle })}
          <button
            class="theme-btn--icon task-composer__field task-composer__field--{priorityClass(intent.priority)}"
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
              <!-- Chosen, never typed: on a phone a number field opens the
                   keyboard over its own panel. `repeatCounts` carries whatever
                   this task already says, even off the scale. -->
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

  <!-- Solid whether or not anything is written: the empty bar is where the
       blue is needed. `submit` is the guard — an empty row hands nothing over. -->
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
