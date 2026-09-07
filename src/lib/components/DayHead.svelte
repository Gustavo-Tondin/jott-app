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
  import { flick } from "../actions/flick.js";
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
    /// On a phone: how much of the head is unfolded (2026-09-07). `0` is
    /// one line — the name and the date; `1` adds the week; `2` adds the
    /// day's summary (the "overview" wireframe). The desktop ignores it and
    /// shows everything.
    level = 1,
    /// `(iso) => void` — a day was tapped.
    onPick,
    /// The name was tapped: back to today (user call, 2026-09-04).
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
  //
  // And every time the SCROLLER itself appears: on a phone the strip is
  // unmounted while the head is folded (2026-09-07), and a scroller that
  // comes back mounts at scrollLeft 0 — the week before, not the week on
  // show (measured on device: unfolding showed Aug 30–Sep 5 under a chosen
  // Sep 7). `shown` had not changed, so nothing else would re-centre it.
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

  // ---- the fold (2026-09-07) ----
  // On a phone the week and the summary sit inside `.day-head__fold`, a box
  // that is always mounted and only as tall as the level says: 0, the week,
  // or the week and the summary. The heights are MEASURED off the content
  // (`heightOf`), never restated, so a longer summary line or a bigger type
  // size changes nothing here. A drag on the head moves that height under
  // the finger (user call: "animado junto com o gesto do dedo, não pulando");
  // letting go snaps it to a level, and the transition in day-head.css does
  // the rest. The desktop never folds: `fold` stays `auto`.
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

  // ---- the row that stays (2026-09-07) ----
  // On a phone the top row — the name and, once scrolled, the day — is
  // STICKY under the floating top bar, with no ground of its own: the rest of
  // the head scrolls away beneath it and the canvas comes up behind it. When
  // the canvas is what is behind it, the row says so with the canvas's own
  // ink (`data-region`), which is the wireframe "Scrolled Down": the title
  // enters the canvas rather than being covered by it (user call: "o canvas
  // não cobre o título home e a data, com eles entrando no canvas e mudando
  // pra cor do ink do canvas"). Whether the canvas is behind it is read off
  // the handle — the last piece of chrome — having scrolled above the row's
  // bottom edge.
  let topEl = $state(null);
  let handleEl = $state(null);
  let overCanvas = $state(false);
  /// The row's own height, for the fold and the handle to stick UNDER it
  /// (day-head.css reads `--row-h`).
  let rowHeight = $state(0);
  $effect(() => {
    if (!compact || !topEl || typeof ResizeObserver !== "function") return;
    const watcher = new ResizeObserver(() => (rowHeight = topEl.offsetHeight));
    watcher.observe(topEl);
    return () => watcher.disconnect();
  });
  $effect(() => {
    if (!compact || !topEl) return;
    // The nearest ancestor that DECLARES a scroll, not `scrollableAround`:
    // that one asks whether there is something to scroll yet, and at mount
    // the page is often still shorter than the screen — the listener would
    // never be installed (measured on device, 2026-09-07).
    let scroller = topEl.parentElement;
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    if (!scroller) return;
    // The canvas has reached the row once the page has scrolled by everything
    // that sits between them — the fold and the handle, which stick in place
    // and let the canvas ride up over them (the reference the user sent,
    // 2026-09-07: the sheet slides up over the dark head and the title flips
    // to the sheet's ink the moment it gets there).
    const read = () => {
      const chrome = heightOf(shownLevel) + (handleEl?.offsetHeight ?? 0);
      overCanvas = scroller.scrollTop >= chrome - 1;
    };
    read();
    scroller.addEventListener("scroll", read, { passive: true });
    return () => scroller.removeEventListener("scroll", read);
  });
  /// The right side of the row: the month while the week is on show, the
  /// chosen day when it is not — folded, or scrolled away under the row.
  let showsDate = $derived(compact && (folded || overCanvas));
</script>

<!-- On a phone the whole head answers a vertical drag (actions/flick.js):
     the fold follows the finger, and letting go lands on a level. The canvas
     below it scrolls; the chrome above it does this instead — two surfaces,
     two gestures (user call, 2026-09-07). -->
<section
  class="day-head"
  class:day-head--compact={compact}
  class:day-head--folded={folded}
  class:day-head--dragging={dragging}
  data-region={compact ? "chrome" : undefined}
  aria-label={S.home}
  style={foldHeight === null ? undefined : `--fold-h: ${foldHeight}px; --row-h: ${rowHeight}px`}
  use:flick={{ enabled: compact, onMove: dragMove, onEnd: dragEnd }}
>
  <div
    class="day-head__top"
    class:day-head__top--over={overCanvas}
    data-region={compact ? (overCanvas ? "canvas" : "chrome") : undefined}
    bind:this={topEl}
  >
    <button class="day-head__title" onclick={() => onHome?.()} title={S.backToToday}>
      <span class="day-head__name">{S.home}</span>
      <span class="theme-dot day-head__dot" style={dotStyle} aria-hidden="true"></span>
    </button>
    {#if showsDate}
      <!-- With the week out of sight the month gives way to the day itself:
           nothing else on screen says which day is chosen. -->
      <span class="day-head__date">
        <span class="day-head__date-day">{S.shortDay(monthOf(selected), dayOfMonth(selected))}</span>
        <span class="day-head__date-weekday">{weekdayName(selected)}</span>
      </span>
    {:else}
      <span class="day-head__month">{monthOf(shown)}</span>
    {/if}
  </div>

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
    <!-- The handle that unfolds the head (wireframe "overview"): the same
         grip the sheets wear, because it does the same thing. A tap is one
         step; the drag on the whole head is the other way to do it. -->
    <button
      class="day-head__handle"
      aria-expanded={shownLevel > 0}
      aria-label={gripLabel}
      onclick={gripTap}
      bind:this={handleEl}
    >
      <span class="day-head__grip" aria-hidden="true"></span>
    </button>
  {/if}
</section>
