<script>
  // The Home's head, the screen of TIME: the place's name, the month, a week
  // of days with the chosen one lit, and one line saying how the day stands.
  // Desktop: a raised card pinned at the top of the canvas. Phone: the chrome
  // above the canvas, the summary folded behind a handle. It owns only the
  // week on show; the chosen day is the shell's (`day`), the head only asks.
  import { tick } from "svelte";
  import { S } from "../services/strings.js";
  import {
    addDays,
    dayKind,
    dayOfMonth,
    greetingFor,
    summaryOf,
    weekOf,
    weekdayLetter,
    weekdayName,
  } from "../services/calendar.js";
  import { dragScroll } from "../actions/dragScroll.js";
  import { flick } from "../actions/flick.js";
  import DayTitle from "./DayTitle.svelte";
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
    /// On a phone: how much of the head is unfolded. `0` is one line — the
    /// name and the date; `1` adds the week; `2` adds the day's summary. The
    /// desktop ignores it and shows everything.
    level = 1,
    /// `(iso) => void` — a day was tapped.
    onPick,
    /// The name was tapped: back to today.
    onHome,
    /// `(level) => void` — the head asks to be unfolded or folded: a drag
    /// down or up on it (actions/flick.js), or a tap on the grip.
    onLevel,
    /// The hour of the day, for the greeting — the machine's, since this is
    /// about the person reading. A prop so a test can pin it.
    hour = new Date().getHours(),
  } = $props();

  let selected = $derived(day ?? today ?? "");
  let kind = $derived(dayKind(selected, today));

  /// How many weeks the strip has been turned away from the chosen day.
  /// Turning shows another week WITHOUT choosing a day in it; choosing a
  /// day, or going home, brings the strip back to it.
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
  // Every time the week on show changes, the three pages are redrawn around
  // it and the scroller goes back to the middle — after `tick`, so the new
  // pages exist. And every time the SCROLLER itself appears: on a phone it is
  // unmounted while folded, and comes back at scrollLeft 0 (the week before).
  $effect(() => {
    shown;
    scroller;
    tick().then(centre);
  });
  // And when the strip gets, or changes, its WIDTH: inside the fold it can
  // mount before it has one, and a scroller centred at width 0 is at page 0.
  $effect(() => {
    if (!scroller || typeof ResizeObserver !== "function") return;
    const watcher = new ResizeObserver(() => centre());
    watcher.observe(scroller);
    return () => watcher.disconnect();
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

  /// The head's height on a phone, clamped to what exists. The desktop shows
  /// everything whatever the prop says.
  const LEVELS = 3;
  let shownLevel = $derived(compact ? Math.max(0, Math.min(LEVELS - 1, level)) : LEVELS - 1);
  let folded = $derived(shownLevel === 0);
  const gripLabelOf = (lvl) => (lvl === 0 ? S.showWeek : lvl === 1 ? S.showOverview : S.hideOverview);
  let gripLabel = $derived(gripLabelOf(shownLevel));

  // ---- the fold ----
  // On a phone the week and the summary sit inside `.day-head__fold`, only as
  // tall as the level says; heights are MEASURED off the content (`heightOf`).
  // A drag moves that height under the finger; letting go snaps to a level.
  let foldEl = $state(null);
  let weekEl = $state(null);
  let summaryEl = $state(null);
  let dragging = $state(false);
  let dragHeight = $state(null);

  /// The fold's height at `lvl`, read off the boxes inside it.
  function heightOf(lvl) {
    if (lvl <= 0 || !weekEl) return 0;
    const weekBottom = weekEl.offsetTop + weekEl.offsetHeight;
    if (lvl === 1 || !summaryEl) return weekBottom;
    return summaryEl.offsetTop + summaryEl.offsetHeight;
  }
  /// The height the fold is drawn at right now: the finger's while dragging,
  /// the level's otherwise. `null` on the desktop — the stylesheet reads it
  /// as `auto`.
  let foldHeight = $derived.by(() => {
    if (!compact) return null;
    if (dragging && dragHeight !== null) return dragHeight;
    // Read the boxes on every change of level or content.
    measured;
    return heightOf(shownLevel);
  });
  /// Bumped when the content that decides the heights may have changed size.
  let measured = $state(0);
  $effect(() => {
    if (!compact || typeof ResizeObserver !== "function" || !foldEl) return;
    const watcher = new ResizeObserver(() => (measured += 1));
    for (const box of [weekEl, summaryEl]) if (box) watcher.observe(box);
    return () => watcher.disconnect();
  });

  const unfold = () => onLevel?.(Math.min(LEVELS - 1, shownLevel + 1));
  const fold = () => onLevel?.(Math.max(0, shownLevel - 1));
  /// The grip: one step up, and from the top back to the week — so a tap
  /// always changes something and never lands on the folded line by surprise.
  const gripTap = () => (shownLevel === LEVELS - 1 ? onLevel?.(1) : unfold());

  /// The finger is on the head: the fold follows it from the level's height.
  function dragMove(dy) {
    if (!compact) return;
    dragging = true;
    const max = heightOf(LEVELS - 1);
    dragHeight = Math.max(0, Math.min(max, heightOf(shownLevel) + dy));
  }
  /// It let go: the nearest level wins, and the transition carries the fold
  /// there. `onUp`/`onDown` are not used — a drag that went far past a level
  /// should land two levels away, not one.
  function dragEnd() {
    if (!dragging) return;
    const at = dragHeight ?? heightOf(shownLevel);
    let nearest = 0;
    for (let lvl = 1; lvl < LEVELS; lvl++) {
      if (Math.abs(heightOf(lvl) - at) < Math.abs(heightOf(nearest) - at)) nearest = lvl;
    }
    dragging = false;
    dragHeight = null;
    if (nearest !== shownLevel) onLevel?.(nearest);
  }

  // ---- the row, and the sheet ----
  // On a phone the top row is STICKY under the floating top bar, and the
  // canvas is a SHEET that rides up over it (shell.css); a copy of the row
  // inside the sheet (DayTitle) is revealed as the sheet's ground rises. No
  // script on scroll: the row's height goes on the scroller as `--row-h` only
  // when it CHANGES. See docs/platform-gotchas.md#webview-e-gestos
  let topEl = $state(null);
  $effect(() => {
    if (!compact || !topEl || typeof ResizeObserver !== "function") return;
    // The nearest ancestor that DECLARES a scroll, not `scrollableAround`
    // (which asks whether there is something to scroll yet, and at mount there
    // often is not). Where no stylesheet says (a test), the section's parent.
    let scroller = topEl.parentElement;
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    scroller ??= topEl.parentElement?.parentElement;
    if (!scroller) return;
    const watcher = new ResizeObserver(() => {
      scroller.style.setProperty("--row-h", `${topEl.offsetHeight}px`);
    });
    watcher.observe(topEl);
    return () => {
      watcher.disconnect();
      scroller.style.removeProperty("--row-h");
    };
  });
  /// The right side of the row on the chrome: the month while the week is
  /// on show, the chosen day when the head is folded to one line — nothing
  /// else on screen says which day is chosen then. The copy in the sheet
  /// always says the day.
  let showsDate = $derived(compact && folded);
</script>

<!-- On a phone the whole head answers a vertical drag (actions/flick.js):
     the fold follows the finger, and letting go lands on a level. The canvas
     below it scrolls; the chrome above it does this instead. -->
<section
  class="day-head"
  class:day-head--compact={compact}
  class:day-head--folded={folded}
  class:day-head--dragging={dragging}
  data-region={compact ? "chrome" : undefined}
  aria-label={S.home}
  style={foldHeight === null ? undefined : `--fold-h: ${foldHeight}px`}
  use:flick={{ enabled: compact, onMove: dragMove, onEnd: dragEnd }}
>
  {#if compact}
    <!-- The page's resting place at its start, chrome open: the snap point
         lives on a box that never moves (a sticky one carries its snap area
         along, and the page would chase it). -->
    <div class="day-head__anchor" aria-hidden="true"></div>
  {/if}
  <DayTitle bind:el={topEl} {dot} month={shown} {selected} {compact} {showsDate} {onHome} />

  <!-- The fold: the week and the summary, clipped to the level's height on a
       phone (`--fold-h`), the whole of it on the desktop. `inert` while
       folded shut, so what is clipped away is not a tab stop either. -->
  <div class="day-head__fold" bind:this={foldEl} inert={compact && folded}>
    <div class="day-head__week" bind:this={weekEl}>
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

    <p class="day-head__summary" bind:this={summaryEl} inert={compact && shownLevel < 2}>
      {#if kind === "today"}
        <span class="day-head__greeting">{greetingFor(hour)} —</span>
      {/if}
      <span class="day-head__check" aria-hidden="true"><Icon name="check-square" size="1.125rem" /></span>
      <span class="day-head__line">{line}</span>
    </p>
  </div>

  {#if compact}
    <!-- The handle that unfolds the head: the same grip the sheets wear. A tap
         is one step; the drag on the whole head is the other way to do it. -->
    <button
      class="day-head__handle"
      aria-expanded={shownLevel > 0}
      aria-label={gripLabel}
      onclick={gripTap}
    >
      <span class="day-head__grip" aria-hidden="true"></span>
    </button>
  {/if}
</section>
