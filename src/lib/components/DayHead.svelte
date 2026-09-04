<script>
  // The Home's head — the screen of TIME (wireframes "Home Screen Desktop"
  // and "Home Screen Mobile", 2026-09-04): the place's name, the month, a
  // week of days with the chosen one lit, and one line saying how the day
  // stands.
  //
  // Two shapes, one component. On the desktop it is a raised card at the top
  // of the canvas, pinned there as the page scrolls. On a phone it IS the
  // chrome above the rounded canvas: dark, the top bar floating over it, and
  // the summary line folded behind a handle (wireframe "overview") because
  // the phone has no room to say everything at once.
  //
  // It owns nothing but the week on show. Which day is chosen is the shell's
  // (`day`), because the Home's body reads it too; the head only asks.
  //
  // THE STRIP IS A CARROUSEL (user call, 2026-09-04: "mais interativo,
  // mostrando as datas seguintes, não pulando pra próxima sem animação").
  // Three weeks are drawn side by side in a scroller that snaps a week at a
  // time, with the week on show in the middle: a finger, a trackpad or a
  // mouse drag (actions/dragScroll.js) pulls the next days into view, and
  // when the scroller settles on a neighbour, that neighbour becomes the
  // middle and the scroller is put back there without motion — the same
  // days are under the eye, so nothing is seen to move.
  import { tick } from "svelte";
  import { S } from "../services/strings.js";
  import { dotStyle as dotStyleOf } from "../services/accent.js";
  import {
    addDays,
    dayKind,
    dayOfMonth,
    greetingFor,
    monthOf,
    summaryOf,
    weekOf,
    weekdayLetter,
    weekdayName,
  } from "../services/calendar.js";
  import { dragScroll } from "../actions/dragScroll.js";
  import Icon from "./Icon.svelte";

  let {
    /// `yyyy-mm-dd`, the notebook's clock — never `new Date()` here.
    today,
    /// The chosen day, or null for today.
    day = null,
    /// `"monday"` / `"sunday"` — the notebook's `weekStartsOn`.
    weekStartsOn = "monday",
    /// `{done, total}` for the chosen day, or null while unknown.
    summary = null,
    /// The colour of the place, as a name (services/accent.js).
    dot = null,
    /// The narrow shell (shell/compact.js).
    compact = false,
    /// On a phone: whether the summary line is unfolded.
    overview = false,
    /// `(iso) => void` — a day was tapped.
    onPick,
    /// The name was tapped: back to today (user call, 2026-09-04).
    onHome,
    onToggleOverview,
    /// The hour of the day, for the greeting — the machine's, since this is
    /// about the person reading. A prop so a test can pin it.
    hour = new Date().getHours(),
  } = $props();

  let selected = $derived(day ?? today ?? "");
  let kind = $derived(dayKind(selected, today));
  let dotStyle = $derived(dotStyleOf(dot));

  /// How many weeks the strip has been turned away from the chosen day.
  /// Turning shows another week WITHOUT choosing a day in it (user call:
  /// "rola por semana"); choosing a day, or going home, brings the strip
  /// back to it.
  let turned = $state(0);
  $effect(() => {
    selected;
    turned = 0;
  });
  let shown = $derived(addDays(selected, turned * 7));
  /// The week before, the week on show, the week after — the three pages
  /// of the carrousel.
  let weeks = $derived(
    [-7, 0, 7].map((offset) => weekOf(addDays(shown, offset), weekStartsOn)),
  );

  let scroller = $state(null);
  /// One page is the scroller's own width; zero where nothing is laid out
  /// (jsdom), and then the strip turns by state alone.
  const pageWidth = () => scroller?.clientWidth ?? 0;
  const still = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /// Puts the week on show back in the middle, without motion.
  function centre() {
    if (!scroller || !pageWidth()) return;
    if (typeof scroller.scrollTo === "function") {
      scroller.scrollTo({ left: pageWidth(), behavior: "instant" });
    } else scroller.scrollLeft = pageWidth();
  }
  // Every time the week on show changes — a turn settled, a day picked,
  // home — the three pages are redrawn around it and the scroller goes back
  // to the middle. After `tick`, so the new pages exist to scroll to.
  $effect(() => {
    shown;
    tick().then(centre);
  });

  /// Turns the strip by `n` weeks: a smooth scroll to the neighbouring page,
  /// which `settle` then makes the middle. With no width to scroll (a test),
  /// the state turns directly.
  function turn(n) {
    if (!scroller || !pageWidth() || typeof scroller.scrollBy !== "function") {
      turned += n;
      return;
    }
    scroller.scrollBy({ left: n * pageWidth(), behavior: still() ? "instant" : "smooth" });
  }

  /// The scroller stopped on a page: a neighbour becomes the week on show.
  /// Debounced off `scroll` rather than `scrollend`, which not every engine
  /// the app runs on fires.
  let settling = null;
  function scrolled() {
    clearTimeout(settling);
    settling = setTimeout(settle, 120);
  }
  function settle() {
    if (!scroller || !pageWidth()) return;
    const page = Math.round(scroller.scrollLeft / pageWidth());
    if (page !== 1) turned += page - 1;
  }

  let line = $derived(summary ? summaryOf({ kind, ...summary }) : "");
</script>

<section
  class="day-head"
  class:day-head--compact={compact}
  data-region={compact ? "chrome" : undefined}
  aria-label={S.home}
>
  <div class="day-head__top">
    <button class="day-head__title" onclick={() => onHome?.()} title={S.backToToday}>
      <span class="day-head__name">{S.home}</span>
      <span class="theme-dot day-head__dot" style={dotStyle} aria-hidden="true"></span>
    </button>
    <span class="day-head__month">{monthOf(shown)}</span>
  </div>

  <div class="day-head__week">
    <button
      class="theme-btn--icon day-head__turn day-head__turn--prev"
      aria-label={S.previousWeek}
      title={S.previousWeek}
      onclick={() => turn(-1)}
    >
      <Icon name="caret-left" size="1rem" />
    </button>
    <!-- The carrousel: three pages a week wide, snapping one at a time. The
         neighbours are real days — dragging shows what is coming, and a day
         in them can be picked before the strip has settled. -->
    <div class="day-head__scroller" bind:this={scroller} onscroll={scrolled} use:dragScroll>
      <ol class="day-head__track">
        {#each weeks as week, w (week[0] ?? w)}
          <li class="day-head__page" class:is-current={w === 1}>
            <ol class="day-head__days">
              {#each week as iso (iso)}
                <li class="day-head__slot">
                  <button
                    class="day-head__day"
                    class:is-selected={iso === selected}
                    class:is-today={iso === today}
                    aria-pressed={iso === selected}
                    aria-label={`${weekdayName(iso)} ${dayOfMonth(iso)}`}
                    onclick={() => onPick?.(iso)}
                  >
                    <span class="day-head__weekday" aria-hidden="true">{weekdayLetter(iso)}</span>
                    <span class="day-head__number" aria-hidden="true">{dayOfMonth(iso)}</span>
                  </button>
                </li>
              {/each}
            </ol>
          </li>
        {/each}
      </ol>
    </div>
    <button
      class="theme-btn--icon day-head__turn day-head__turn--next"
      aria-label={S.nextWeek}
      title={S.nextWeek}
      onclick={() => turn(1)}
    >
      <Icon name="caret-right" size="1rem" />
    </button>
  </div>

  {#if !compact || overview}
    <p class="day-head__summary">
      {#if kind === "today"}
        <span class="day-head__greeting">{greetingFor(hour)} —</span>
      {/if}
      <span class="day-head__check" aria-hidden="true"><Icon name="check-square" size="1.125rem" /></span>
      <span class="day-head__line">{line}</span>
    </p>
  {/if}

  {#if compact}
    <!-- The handle that unfolds the summary (wireframe "overview"): the
         same grip the sheets wear, because it does the same thing. -->
    <button
      class="day-head__handle"
      aria-expanded={overview}
      aria-label={overview ? S.hideOverview : S.showOverview}
      onclick={() => onToggleOverview?.()}
    >
      <span class="day-head__grip" aria-hidden="true"></span>
    </button>
  {/if}
</section>
