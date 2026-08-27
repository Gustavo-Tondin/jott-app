<script>
  // The Timeline — the log of everything the notebook has held, drawn as
  // MONTHS (wireframe "Timeline Screen", desktop + mobile, 2026-08-27).
  //
  // Each month is three foldable lines: tasks created, tasks completed,
  // notes created. The line opens onto its items — a living one opens
  // (task → its list and inspector, note → the editor), a completed one is
  // struck through, and a deleted one is only counted, per space, in the
  // space's colour (`services/timeline.js` says why). The current month
  // starts open; the rest starts folded.
  //
  // One YEAR at a time (the log is one file per year): the current year is
  // read on open, the previous one when the reader reaches the end of the
  // column. The year pills stay pinned in the top corner and the active one
  // follows the month under the reader's eye; clicking one scrolls to it,
  // reading it first if it has not come yet.
  //
  // Motion: rows arrive as they scroll into view (`actions/reveal.js`), the
  // month head is sticky, and a line folds open by height — all of it spelt
  // in `--app-duration-*` in `timeline.css`, so reduced motion turns it off
  // without this file knowing.
  import { tick } from "svelte";
  import { api } from "../services/api.js";
  import { makeScreen } from "../services/act.js";
  import { S } from "../services/strings.js";
  import { askConfirm } from "../services/dialog.js";
  import { dotStyle } from "../services/accent.js";
  import { formatDate } from "../services/dates.js";
  import {
    ghostLabel,
    monthName,
    monthStats,
    monthsOf,
    rowsOf,
    yearRange,
  } from "../services/timeline.js";
  import { reveal } from "../actions/reveal.js";
  import Icon from "../components/Icon.svelte";
  import Menu from "../components/Menu.svelte";
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
    /// The notebook's `timelineGhostTitles`.
    ghostTitles = false,
    /// `(path, id) => void` — a living task; `(path, folder) => void` — a note.
    onOpenTask,
    onOpenNote,
  } = $props();

  const LINES = [
    { key: "created", icon: "check-square", label: (n) => S.tasksCreated(n) },
    { key: "completed", icon: "checks", label: (n) => S.tasksCompleted(n) },
    { key: "notes", icon: "notepad", label: (n) => S.notesCreated(n) },
  ];

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
        open = new Set(LINES.map((line) => `${current}:${line.key}`));
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

  const lineKey = (month, line) => `${month.key}:${line.key}`;
  const isOpen = (month, line) => open.has(lineKey(month, line));
  function toggle(month, line) {
    const key = lineKey(month, line);
    const next = new Set(open);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    open = next;
  }

  function openRow(row) {
    if (row.ghost || row.deleted) return;
    if (row.kind === "note") {
      // The log's address is root-relative; the editor wants the path
      // INSIDE the space (the shell puts the two back together).
      const inside = row.space && row.path.startsWith(`${row.space}/`)
        ? row.path.slice(row.space.length + 1)
        : row.path;
      onOpenNote?.(inside, row.space);
    } else onOpenTask?.(row.path, row.id);
  }

  /// The colour a row wears: its space's, through the origin badge for a
  /// living thing (the badge also knows the readable name), the colour map
  /// for a folded ghost that has only a space path.
  const colorOf = (row) =>
    row.ghost ? (colors[row.space] ?? null) : (origin?.(row)?.color ?? colors[row.space] ?? null);

  const rowTitle = (row) =>
    row.title || (row.kind === "note" ? S.deletedNote : S.deletedTask);

  function rowMenu(row) {
    if (readOnly) return [];
    return [
      {
        label: S.removeFromTimeline,
        run: async () => {
          const yes = await askConfirm(S.removeFromTimeline, {
            detail: S.removeFromTimelineDetail,
            danger: S.removeFromTimeline,
          });
          if (!yes) return;
          const key = row.kind === "note" ? row.path : row.id;
          await act(() => api.forgetFromTimeline(row.kind, key));
        },
      },
    ];
  }
</script>

<div class="timeline" bind:this={column}>
  {#if years.length > 0 && activeYear !== null}
    <!-- The pills: one per year the log has, pinned at the canvas's own
         corner — outside the centred column, so they sit at the edge of the
         panel whatever its width (user call, 2026-08-27). Only the active
         one shows, and the next covers it as the column scrolls on; each is
         a real button, and a year not read yet is read on the way. -->
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
          <ul class="timeline__lines">
            {#each LINES as line, i (line.key)}
              {@const list = month[line.key]}
              {@const shown = isOpen(month, line)}
              <li class="timeline__line" use:reveal style={`--reveal-index: ${i}`}>
                <button
                  class="timeline__line-head"
                  aria-expanded={shown}
                  aria-controls={`${month.key}-${line.key}`}
                  disabled={list.length === 0}
                  onclick={() => toggle(month, line)}
                >
                  <span class="timeline__line-icon" aria-hidden="true"><Icon name={line.icon} size="1.125rem" /></span>
                  <span class="timeline__line-label">{line.label(list.length)}</span>
                </button>
                <div class="timeline__fold" class:is-open={shown && list.length > 0}>
                  <ul class="timeline__rows" id={`${month.key}-${line.key}`} hidden={!shown || list.length === 0}>
                    {#each rowsOf(list, { ghostTitles }) as row, j (row.ghost ? `ghost:${row.kind}:${row.space}` : `${row.kind}:${row.id ?? row.path}#${j}`)}
                      {@const color = colorOf(row)}
                      <li
                        class="timeline__row"
                        class:timeline__row--done={line.key === "completed" || !!row.deleted}
                        class:timeline__row--ghost={row.ghost || !!row.deleted}
                      >
                        <span class="theme-dot timeline__row-dot" style={dotStyle(color)} aria-hidden="true"></span>
                        {#if row.ghost}
                          <span class="timeline__row-text">{ghostLabel(row)}</span>
                        {:else}
                          <button class="timeline__row-open" disabled={!!row.deleted} onclick={() => openRow(row)}>
                            {rowTitle(row)}
                          </button>
                          {#if !readOnly}
                            <Menu items={rowMenu(row)}>
                              {#snippet trigger({ toggle })}
                                <button
                                  class="theme-btn--icon timeline__row-menu"
                                  onclick={toggle}
                                  aria-label={S.timelineOptions}
                                  title={S.timelineOptions}
                                >
                                  <Icon name="dots-three" size="1rem" />
                                </button>
                              {/snippet}
                            </Menu>
                          {/if}
                        {/if}
                      </li>
                    {/each}
                  </ul>
                </div>
              </li>
            {/each}
          </ul>
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
