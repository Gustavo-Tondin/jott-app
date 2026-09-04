<script>
  // The three foldable lines of a stretch of the log — tasks created, tasks
  // completed, notes created — and the rows each opens onto.
  //
  // Born inside TimelineView (2026-08-27) as one month's lines; the Home's
  // recap of a day gone by (2026-09-04) draws exactly the same thing over
  // ONE day, so the lines moved here and both screens read them. A living
  // row opens (task → its list and inspector, note → the editor), a
  // completed one is struck through, and a deleted one is only counted, per
  // space, in the space's colour (`services/timeline.js` says why).
  //
  // The fold state is the HOST's (`open` + `onToggle`): the Timeline keeps
  // one set across every month it draws, and the recap opens everything at
  // once — neither is this component's call.
  import { S } from "../services/strings.js";
  import { askConfirm } from "../services/dialog.js";
  import { dotStyle } from "../services/accent.js";
  import { ghostLabel, rowsOf } from "../services/timeline.js";
  import { reveal } from "../actions/reveal.js";
  import Icon from "./Icon.svelte";
  import Menu from "./Menu.svelte";

  let {
    /// `{created: [], completed: [], notes: []}` — flat items from the core.
    groups,
    /// What the fold keys are prefixed with (`"2026-08"`, a day) so two
    /// stretches on one screen keep separate folds.
    prefix,
    /// `Set` of `"<prefix>:<line>"` — which lines are open.
    open = new Set(),
    /// `(key) => void` — a line head was clicked.
    onToggle,
    readOnly = false,
    /// `(item) => {label, color} | null` — the origin badge (services/origin.js).
    origin = null,
    /// `{[spacePath]: colourName}` — what a folded ghost row is coloured by.
    colors = {},
    /// The notebook's `timelineGhostTitles`.
    ghostTitles = false,
    /// `(path, id) => void` — a living task; `(inside, space) => void` — a
    /// note, addressed inside its space.
    onOpenTask,
    onOpenNote,
    /// `(kind, key) => Promise` — "Remove from timeline", already confirmed.
    onForget,
    /// Whether the lines arrive as they scroll into view (the Timeline) or
    /// are simply there (the recap, which is one short block).
    revealing = true,
  } = $props();

  const LINES = [
    { key: "created", icon: "check-square", label: (n) => S.tasksCreated(n) },
    { key: "completed", icon: "checks", label: (n) => S.tasksCompleted(n) },
    { key: "notes", icon: "notepad", label: (n) => S.notesCreated(n) },
  ];

  const lineKey = (line) => `${prefix}:${line.key}`;
  const isOpen = (line) => open.has(lineKey(line));

  function openRow(row) {
    if (row.ghost || row.deleted) return;
    if (row.kind === "note") {
      // The log's address is root-relative; the editor wants the path
      // INSIDE the space (the shell puts the two back together).
      const inside =
        row.space && row.path.startsWith(`${row.space}/`)
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

  const rowTitle = (row) => row.title || (row.kind === "note" ? S.deletedNote : S.deletedTask);

  function rowMenu(row) {
    if (readOnly || !onForget) return [];
    return [
      {
        label: S.removeFromTimeline,
        run: async () => {
          const yes = await askConfirm(S.removeFromTimeline, {
            detail: S.removeFromTimelineDetail,
            danger: S.removeFromTimeline,
          });
          if (!yes) return;
          await onForget(row.kind, row.kind === "note" ? row.path : row.id);
        },
      },
    ];
  }
</script>

<ul class="timeline-lines">
  {#each LINES as line, i (line.key)}
    {@const list = groups[line.key] ?? []}
    {@const shown = isOpen(line)}
    <li
      class="timeline-lines__line"
      class:is-visible={!revealing}
      use:reveal={{ enabled: revealing }}
      style={`--reveal-index: ${i}`}
    >
      <button
        class="timeline-lines__line-head"
        aria-expanded={shown}
        aria-controls={`${prefix}-${line.key}`}
        disabled={list.length === 0}
        onclick={() => onToggle?.(lineKey(line))}
      >
        <span class="timeline-lines__line-icon" aria-hidden="true"><Icon name={line.icon} size="1.125rem" /></span>
        <span class="timeline-lines__line-label">{line.label(list.length)}</span>
      </button>
      <div class="timeline-lines__fold" class:is-open={shown && list.length > 0}>
        <ul class="timeline-lines__rows" id={`${prefix}-${line.key}`} hidden={!shown || list.length === 0}>
          {#each rowsOf(list, { ghostTitles }) as row, j (row.ghost ? `ghost:${row.kind}:${row.space}` : `${row.kind}:${row.id ?? row.path}#${j}`)}
            {@const color = colorOf(row)}
            <li
              class="timeline-lines__row"
              class:timeline-lines__row--done={line.key === "completed" || !!row.deleted}
              class:timeline-lines__row--ghost={row.ghost || !!row.deleted}
            >
              <span class="theme-dot timeline-lines__row-dot" style={dotStyle(color)} aria-hidden="true"></span>
              {#if row.ghost}
                <span class="timeline-lines__row-text">{ghostLabel(row)}</span>
              {:else}
                <button class="timeline-lines__row-open" disabled={!!row.deleted} onclick={() => openRow(row)}>
                  {rowTitle(row)}
                </button>
                <!-- A repeating task folded into one row (the same chore,
                     written once per occurrence). The count sits beside the
                     title and not inside the button: it is a fact about the
                     row, not part of what is opened. -->
                {#if row.count > 1}
                  <span class="timeline-lines__row-count" title={S.timelineOccurrences(row.count)}>
                    {S.timelineTimes(row.count)}
                  </span>
                {/if}
                {#if !readOnly && onForget}
                  <Menu items={rowMenu(row)}>
                    {#snippet trigger({ toggle })}
                      <button
                        class="theme-btn--icon timeline-lines__row-menu"
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
