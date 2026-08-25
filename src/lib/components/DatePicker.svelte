<script>
  // A self-contained calendar, replacing the native `<input type="date">`.
  //
  // The WebKitGTK native picker misbehaved in two ways the user hit: it did not
  // close when clicking elsewhere in the app, and paging the month dismissed it
  // (so moving more than one month meant reopening). This owns its own popup, so
  // it closes on an outside click or Escape, and paging months keeps it open.
  //
  // It speaks the same contract the field always spoke: `value` is an ISO string
  // (or ""), and `onChange(iso)` fires when a day is chosen. Clearing stays the
  // caller's job (the inspector keeps its own × for that).
  import { formatDate, toIso } from "../services/dates.js";
  import { S } from "../services/strings.js";
  import Icon from "./Icon.svelte";
  import { dismissable } from "../actions/dismissable.js";
  import { keepOnScreen } from "../actions/keepOnScreen.js";

  let {
    value = "",
    disabled = false,
    dateFormat = "mm/dd/yyyy",
    onChange,
    /// What the pill is called to a screen reader. The due date's by
    /// default; the reminder's calendar names itself, so two pickers in one
    /// panel are two things.
    label = S.dueDateLabel,
    /// What opens the calendar. Omitted, it is the pill showing the date —
    /// the inspector's field. The composer passes an icon button instead, the
    /// same way `Menu` lets its caller own the trigger.
    trigger,
  } = $props();

  let open = $state(false);

  // The month the calendar is showing (0-11). Seeded from the value, or today.
  let viewYear = $state(0);
  let viewMonth = $state(0);

  function parseIso(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const isoOf = (y, m, d) => toIso(new Date(y, m, d));

  function seed() {
    const base = value ? parseIso(value) : new Date();
    viewYear = base.getFullYear();
    viewMonth = base.getMonth();
  }

  function toggle() {
    if (disabled) return;
    if (!open) seed();
    open = !open;
  }
  const close = () => (open = false);

  function prevMonth() {
    if (viewMonth === 0) (viewMonth = 11), (viewYear -= 1);
    else viewMonth -= 1;
  }
  function nextMonth() {
    if (viewMonth === 11) (viewMonth = 0), (viewYear += 1);
    else viewMonth += 1;
  }

  function choose(day) {
    onChange?.(isoOf(viewYear, viewMonth, day));
    close();
  }

  // Leading blanks for the weekday the 1st falls on, then the month's days.
  let cells = $derived.by(() => {
    const lead = new Date(viewYear, viewMonth, 1).getDay();
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    const out = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(d);
    return out;
  });

  const now = new Date();
  const isToday = (d) =>
    d &&
    viewYear === now.getFullYear() &&
    viewMonth === now.getMonth() &&
    d === now.getDate();
  const isSelected = (d) => d && value === isoOf(viewYear, viewMonth, d);

</script>

<span
  class="date-picker"
  use:dismissable={{ active: open, onDismiss: close, preventDefault: true }}
>
  {#if trigger}
    {@render trigger({ open, toggle, disabled })}
  {:else}
    <button
      class="theme-input theme-input--filled date-picker__value"
      type="button"
      onclick={toggle}
      {disabled}
      aria-label={label}
    >
      {value ? formatDate(value, dateFormat) : S.pickDate}
    </button>
  {/if}

  {#if open}
    <div class="theme-popover theme-popover--end date-picker__pop" use:keepOnScreen>
      <div class="date-picker__head">
        <button
          class="theme-btn theme-btn--icon"
          type="button"
          onclick={prevMonth}
          aria-label={S.prevMonth}
        >
          <Icon name="caret-left" size="0.875rem" />
        </button>
        <span class="date-picker__month">{S.months[viewMonth]} {viewYear}</span>
        <button
          class="theme-btn theme-btn--icon"
          type="button"
          onclick={nextMonth}
          aria-label={S.nextMonth}
        >
          <Icon name="caret-right" size="0.875rem" />
        </button>
        <button
          class="theme-btn theme-btn--icon date-picker__close"
          type="button"
          onclick={close}
          aria-label={S.closeDatePicker}
        >
          <Icon name="x" size="0.75rem" />
        </button>
      </div>

      <div class="date-picker__grid">
        {#each S.weekdaysShort as wd}
          <span class="date-picker__weekday">{wd}</span>
        {/each}
        {#each cells as day}
          {#if day}
            <button
              class="date-picker__day"
              class:date-picker__day--today={isToday(day)}
              class:date-picker__day--selected={isSelected(day)}
              type="button"
              onclick={() => choose(day)}
            >
              {day}
            </button>
          {:else}
            <span class="date-picker__day date-picker__day--empty"></span>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</span>
