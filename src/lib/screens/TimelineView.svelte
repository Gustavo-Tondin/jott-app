<script>
  // The Timeline — the log of everything the notebook has held, drawn as
  // MONTHS of three foldable lines (TimelineLines). One YEAR at a time: the
  // current year is read on open, the previous when the reader reaches the
  // end of the column; the year pills stay pinned and follow the month under
  // the eye. Motion lives in `--app-duration-*` (timeline.css), not here.
  import { tick } from "svelte";
  import { api } from "../services/api.js";
  import { makeScreen } from "../services/act.js";
  import { S } from "../services/strings.js";
  import { formatDate } from "../services/dates.js";
  import { monthName, monthStats, monthsOf, yearRange } from "../services/timeline.js";
  import Icon from "../components/Icon.svelte";
  import TimelineLines from "../components/TimelineLines.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import Loading from "../components/Loading.svelte";

  let {
    readOnly = false,
    onChanged,
    onError,
    reloadKey,
    /// `yyyy-mm-dd`, the notebook's clock — never `new Date()` here.
    today,
    dateFormat = "mm/dd/yyyy",
    /// `(item) => {label, color} | null` — the origin badge (services/origin.js).
    origin = null,
    /// `{[spacePath]: colourName}` — what a folded ghost row is coloured by.
    colors = {},
    /// The notebook's `timelineGhostTasks` / `timelineGhostNotes`.
    ghostTasks = false,
    ghostNotes = false,
    /// `(path, id) => void` — a living task; `(path, folder) => void` — a note.
    onOpenTask,
    onOpenNote,
  } = $props();

  /// The three lines a month has, for the keys of the folds that start open.
  const LINE_KEYS = ["created", "completed", "notes"];

  /// The years the log has, newest first — the pills.
  let years = $state([]);
  /// Items by year, in the order they were read (newest first).
  let loaded = $state({});
  /// The year being read right now, if any.
  let reading = $state(null);
  /// Which lines are open: `"2026-08:completed"`.
  let open = $state(new Set());
  /// The year under the reader's eye — the pill that shows.
  let activeYear = $state(null);

  let column = $state(null);
  let sentinel = $state(null);

  const thisYear = $derived(Number(today?.slice(0, 4)));
  const items = $derived(Object.values(loaded).flat());
  const months = $derived(monthsOf(items));
  const stats = $derived(monthStats(items, today));
  /// The next year to read when the column runs out — the newest one not
  /// loaded yet, since the pills are newest first.
  const nextYear = $derived(years.find((y) => !(y in loaded)) ?? null);
  const empty = $derived(years.length === 0 && reading === null);

  const { load, act } = makeScreen({
    read: async () => {
      const list = await api.timelineYears();
      const want = list.includes(thisYear) ? thisYear : (list[0] ?? null);
      const first = want === null ? [] : await api.timeline(...boundsOf(want));
      return { list, want, first };
    },
    apply: ({ list, want, first }) => {
      years = list;
      // Re-read what was already on screen, so a change lands in every year
      // shown — the first year is fresh; the others are read again below.
      const shown = Object.keys(loaded).map(Number).filter((y) => y !== want);
      loaded = want === null ? {} : { [want]: first };
      if (activeYear === null || !list.includes(activeYear)) activeYear = want;
      if (open.size === 0 && want !== null) {
        const current = today.slice(0, 7);
        open = new Set(LINE_KEYS.map((key) => `${current}:${key}`));
      }
      for (const year of shown) readYear(year);
    },
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });

  $effect(() => {
    reloadKey;
    load();
  });

  const boundsOf = (year) => {
    const { from, to } = yearRange(year);
    return [from, to];
  };

  async function readYear(year) {
    if (year === null || year in loaded || reading === year) return;
    reading = year;
    try {
      const got = await api.timeline(...boundsOf(year));
      loaded = { ...loaded, [year]: got };
    } catch (e) {
      onError?.(e);
    } finally {
      reading = null;
    }
  }

  // The end of the column asks for the next year. One observer for the
  // sentinel's whole life; jsdom has none, and there the screen simply
  // waits for a pill to be clicked.
  $effect(() => {
    if (!sentinel || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) readYear(nextYear);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  // The month head under the reader's eye names the active year.
  $effect(() => {
    if (!column || typeof IntersectionObserver !== "function") return;
    months.length;
    const heads = column.querySelectorAll("[data-year]");
    const observer = new IntersectionObserver(
      (entries) => {
        const shown = entries.filter((entry) => entry.isIntersecting);
        if (shown.length === 0) return;
        activeYear = Number(shown[0].target.dataset.year);
      },
      { rootMargin: "-10% 0px -80% 0px" },
    );
    heads.forEach((head) => observer.observe(head));
    return () => observer.disconnect();
  });

  async function goToYear(year) {
    await readYear(year);
    await tick();
    activeYear = year;
    column?.querySelector(`[data-year="${year}"]`)?.scrollIntoView?.({ block: "start" });
  }

  function toggle(key) {
    const next = new Set(open);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    open = next;
  }

  /// "Remove from timeline", once the row's menu has asked.
  const forget = (kind, key) => act(() => api.forgetFromTimeline(kind, key));
</script>

<div class="timeline" bind:this={column}>
  {#if years.length > 0 && activeYear !== null}
    <!-- The pills: one per year, pinned at the canvas's own corner outside
         the centred column. Only the active one shows; each is a real button,
         and a year not read yet is read on the way. -->
    <nav class="timeline__years" aria-label={S.timeline}>
      {#each years as year (year)}
        <button
          class="timeline__year"
          class:is-active={year === activeYear}
          aria-current={year === activeYear ? "true" : undefined}
          aria-label={S.goToYear(year)}
          onclick={() => goToYear(year)}
        >
          {year}
        </button>
      {/each}
    </nav>
  {/if}
  <div class="timeline__column">
  <header class="timeline__header">
    <div class="timeline__heading">
      <h2 class="theme-title timeline__title">
        {S.myTimeline}<span class="theme-dot timeline__title-dot" aria-hidden="true"></span>
      </h2>
      <p class="timeline__today">{formatDate(today, dateFormat)}</p>
    </div>
    <ul class="timeline__stats" aria-label={S.thisMonth}>
      {#each [["notes", S.statNotes, "notepad"], ["created", S.statTasks, "check-square"], ["completed", S.statCompleted, "checks"]] as [key, label, icon] (key)}
        <li class="timeline__stat">
          <span class="timeline__stat-line">
            <span class="timeline__stat-number">{stats[key]}</span>
            <span class="timeline__stat-label">{label}</span>
          </span>
          <span class="timeline__stat-when">{S.thisMonth}</span>
          <span class="timeline__stat-icon" aria-hidden="true"><Icon name={icon} size="1.125rem" /></span>
        </li>
      {/each}
    </ul>
  </header>

  {#if empty}
    <EmptyState icon="path" title={S.nothingInTimeline} hint={S.nothingInTimelineHint} />
  {:else}
    <ol class="timeline__months">
      {#each months as month (month.key)}
        <li class="timeline__month">
          <h3 class="timeline__month-head" data-year={month.year} id={`timeline-${month.key}`}>
            <span class="timeline__month-name">{monthName(month.month)}</span>
            <span class="timeline__month-year">{month.year}</span>
            <span class="timeline__month-rule" aria-hidden="true"></span>
          </h3>
          <TimelineLines
            groups={month}
            prefix={month.key}
            {open}
            onToggle={toggle}
            {readOnly}
            {origin}
            {colors}
            {ghostTasks}
            {ghostNotes}
            {onOpenTask}
            {onOpenNote}
            onForget={forget}
          />
        </li>
      {/each}
    </ol>
    <div class="timeline__end" bind:this={sentinel}>
      {#if reading !== null}
        <Loading label={S.timelineLoadingYear(reading)} />
      {/if}
    </div>
  {/if}
  </div>
</div>
