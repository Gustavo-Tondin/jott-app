<script>
  // The Home's title row — "Home •" on the left, the month or the chosen day
  // on the right — drawn TWICE on a phone (2026-09-07): once on the chrome,
  // by DayHead.svelte, and once inside the sheet, by App.svelte. The two
  // are pixel for pixel the same box in the same place, and it is the
  // sheet's ground rising between them that swaps one ink for the other
  // (day-head.css says how). One component, so the two cannot drift apart.
  import { S } from "../services/strings.js";
  import { dotStyle as dotStyleOf } from "../services/accent.js";
  import { dayOfMonth, monthOf, weekdayName } from "../services/calendar.js";

  let {
    /// The colour of the place, as a name (services/accent.js).
    dot = null,
    /// `yyyy-mm-dd` — the day whose month, or date, the right side says.
    /// The month may be of another day: the strip can be turned.
    month = "",
    /// `yyyy-mm-dd` — the chosen day.
    selected = "",
    /// The narrow shell: the month and the date share one box.
    compact = false,
    /// Which of the two the right side shows on a phone.
    showsDate = false,
    /// The copy inside the sheet: same box, the canvas's ink, hidden from
    /// assistive tech so the title is not read twice. It still answers a
    /// tap — it is the one under the finger once the sheet is full.
    sheet = false,
    /// The name was tapped: back to today.
    onHome,
    /// The row's element, for the head to measure (`bind:el`).
    el = $bindable(null),
  } = $props();

  let dotStyle = $derived(dotStyleOf(dot));
</script>

<div
  class="day-head__top"
  class:day-head__top--sheet={sheet}
  aria-hidden={sheet || undefined}
  bind:this={el}
>
  <button
    class="day-head__title"
    onclick={() => onHome?.()}
    title={S.backToToday}
    tabindex={sheet ? -1 : undefined}
  >
    <span class="day-head__name">{S.home}</span>
    <span class="theme-dot day-head__dot" style={dotStyle} aria-hidden="true"></span>
  </button>
  <!-- One box, two contents, ONE height (day-head.css sizes it for the
       two-line date): swapping the month for the date must not move the
       row, because the fold and the handle stick under it — a row that
       grew by a line mid-scroll fought the finger (user report on device,
       2026-09-07). -->
  <span class="day-head__aside">
    {#if compact}
      <!-- Both are always in the box, one over the other (a grid cell each,
           day-head.css), and the box is as tall as the taller — so the row
           measures the same whichever is showing. A `min-block-size` guessed
           from font sizes was 6px short on device (2026-09-07). -->
      <span class="day-head__month" class:is-hidden={showsDate} aria-hidden={showsDate}>
        {monthOf(month)}
      </span>
      <span class="day-head__date" class:is-hidden={!showsDate} aria-hidden={!showsDate}>
        <span class="day-head__date-day">{S.shortDay(monthOf(selected), dayOfMonth(selected))}</span>
        <span class="day-head__date-weekday">{weekdayName(selected)}</span>
      </span>
    {:else}
      <span class="day-head__month">{monthOf(month)}</span>
    {/if}
  </span>
</div>
