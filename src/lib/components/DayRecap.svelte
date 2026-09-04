<script>
  // A day gone by, on the Home (2026-09-04): what the log says happened —
  // tasks created, tasks completed, notes written — as the same three
  // foldable lines the Timeline draws for a month, over ONE day.
  //
  // Nothing here is planned or composed: a past day is a record. A living
  // row still opens (the task in its list, the note in the editor), and
  // "Remove from timeline" is the one write, the user's own.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { makeScreen } from "../services/act.js";
  import { dayGroups } from "../services/timeline.js";
  import TimelineLines from "./TimelineLines.svelte";
  import EmptyState from "./EmptyState.svelte";

  let {
    /// `yyyy-mm-dd` — the day to recap.
    day,
    readOnly = false,
    /// `(item) => {label, color} | null` — the origin badge (services/origin.js).
    origin = null,
    /// `{[spacePath]: colourName}` — what a folded ghost row is coloured by.
    colors = {},
    /// The notebook's `timelineGhostTitles`.
    ghostTitles = false,
    onOpenTask,
    onOpenNote,
    /// `({done}) => void` — how many tasks were ticked that day, for the
    /// head's line.
    onLoaded,
    reloadKey = 0,
    onChanged,
    onError,
  } = $props();

  let items = $state([]);
  let groups = $derived(dayGroups(items, day));
  let empty = $derived(
    groups.created.length + groups.completed.length + groups.notes.length === 0,
  );
  /// Every line starts open: one day is short, and folding it would only
  /// hide what the reader came for.
  let open = $state(new Set());

  const { load, act } = makeScreen({
    read: () => api.timeline(day, day),
    apply: (read) => {
      items = read ?? [];
      open = new Set(["created", "completed", "notes"].map((key) => `${day}:${key}`));
      onLoaded?.({ done: groups.completed.length });
    },
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });

  $effect(() => {
    day;
    reloadKey;
    load();
  });

  function toggle(key) {
    const next = new Set(open);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    open = next;
  }

  const forget = (kind, key) => act(() => api.forgetFromTimeline(kind, key));
</script>

<section class="day-recap">
  {#if empty}
    <EmptyState icon="path" title={S.nothingThatDay} compact />
  {:else}
    <TimelineLines
      {groups}
      prefix={day}
      {open}
      onToggle={toggle}
      {readOnly}
      {origin}
      {colors}
      {ghostTitles}
      {onOpenTask}
      {onOpenNote}
      onForget={forget}
      revealing={false}
    />
  {/if}
</section>
