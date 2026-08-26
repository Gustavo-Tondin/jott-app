<script>
  // The fixed Tasks space: the inbox, plus the day and the week.
  //
  // One entry in the sidebar and three buttons inside it, rather than three
  // entries — Today and This Week are *views of the same tasks*, not places
  // of their own, and the sidebar should say so.
  //
  // The choice is state of this screen, not a view of its own: switching
  // between the three is looking around inside one document, so it must not
  // open a tab or fill the back history.
  //
  // All three ARE the tasks screen (2026-08-06). Index hosts the notebook's
  // own Tasks space — the one it creates — so it comes with that folder's
  // "Completed N"; Today and Week host the same screen over a period. The only
  // thing this screen changes is where a new task comes from: not the blue
  // button, but the bar it pins to the bottom (`compose="bar"`).
  import { segmented } from "../actions/segmented.js";
  import { paneSwipe } from "../actions/paneSwipe.js";
  import { S } from "../services/strings.js";
  import { folderOf } from "../services/paths.js";
  import { formatDayMonth, toIso } from "../services/dates.js";
  import PeriodView from "./PeriodView.svelte";
  import TasksSpace from "../spaces/TasksSpace.svelte";

  let {
    /// The Inbox list's address, and the space that owns it.
    inbox,
    inboxSource = null,
    clock,
    lists = [],
    tags = [],
    completedName = "completed",
    /// What is pulled into the Day, so an Inbox card can say it is in today.
    dayRefs = null,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
    /// `(item) => {label, color} | null` — where an item came from, for the
    /// badge a card wears outside its space (services/origin.js). Null when
    /// the screen IS the space, and nothing is said.
    origin = null,
    readOnly = false,
    reloadKey = 0,
    onChanged,
    onError,
    onSelect,
    selectedTask = null,
    dateFormat = "mm/dd/yyyy",
    /// Told which tab is open, so the page header can say `Tasks/Index`.
    onSub,
    /// Told the day (or the week's span) the open tab is looking at. Below
    /// 768px that date is not drawn here at all — it belongs under the title,
    /// in the header (user call, 2026-08-18, and the mobile wireframe "Tasks
    /// Screen"), and only the shell can put it there.
    onSpan,
    /// The narrow shell (shell/compact.js).
    compact = false,
    /// Asks the shell to open the right panel on the period's suggestions.
    onSuggest,
    /// How the Index is arranged, saved into the space that holds it. Without
    /// these the drag played out and the order was dropped on release — the
    /// same hole the fixed Notes screen had (App.svelte says why).
    onSetSort,
    onSetOrder,
  } = $props();

  // Today and Week are My Day and Week; switched off, the tab goes with them.
  let SUBS = $derived([
    { key: "inbox", label: S.inboxTab },
    ...(f("myDay") ? [{ key: "day", label: S.today }] : []),
    ...(f("week") ? [{ key: "week", label: S.week }] : []),
  ]);

  let sub = $state("inbox");
  // A tab that was open when its feature went away falls back to the Index.
  $effect(() => {
    if (!SUBS.some((item) => item.key === sub)) sub = "inbox";
  });

  /// Which side the pane comes in from when the tab changes: a tab further
  /// along the strip slides in from the end, one further back from the start
  /// — the page turns the way the strip reads. `null` for the first paint, so
  /// the screen opens still rather than sliding in from nowhere. Set by
  /// `show()` rather than derived from `sub`, because a derivation cannot see
  /// where it came FROM.
  let enter = $state(null);
  const at = (key) => SUBS.findIndex((item) => item.key === key);
  function show(key) {
    if (key === sub) return;
    enter = at(key) > at(sub) ? "end" : "start";
    sub = key;
  }
  /// The neighbours of the open tab, for the swipe that turns the page.
  let prevSub = $derived(SUBS[at(sub) - 1]?.key ?? null);
  let nextSub = $derived(SUBS[at(sub) + 1]?.key ?? null);

  $effect(() => {
    onSub?.(SUBS.find((item) => item.key === sub)?.label ?? "");
  });

  $effect(() => {
    onSpan?.(span);
  });

  /// The folder holding the Inbox list — `jott.tasks/task-list.md` →
  /// `jott.tasks`. That folder IS a tasks space, so the Index tab hosts it
  /// rather than inventing a second way to show the same list.
  let source = $derived(
    inboxSource ?? { kind: "tasks", folder: folderOf(inbox), name: S.inboxTab },
  );

  /// What the open tab is looking at, drawn beside the strip: the day for
  /// Today, the span for Week (wireframe "Tasks Screen - week"), nothing for
  /// the Index — a list is not a date.
  ///
  /// Day and month only: both ends of a span share the year, so printing it
  /// twice is noise. The week starts on whichever day the notebook calls first.
  let span = $derived.by(() => {
    if (sub === "day") return formatDayMonth(clock?.today ?? "", dateFormat);
    if (sub !== "week") return "";
    const start = clock?.weekStart;
    if (!start) return "";
    const end = new Date(`${start}T00:00:00`);
    if (Number.isNaN(end.getTime())) return "";
    end.setDate(end.getDate() + 6);
    const iso = toIso(end);
    return S.weekRange(
      formatDayMonth(start, dateFormat),
      formatDayMonth(iso, dateFormat),
    );
  });
</script>

<!-- The page turns with a swipe below 768px (actions/paneSwipe.js): the pane
     follows the finger and, let go far enough, the next tab comes in from the
     side the finger was pushing towards. Only in the compact shell — on a
     desktop a sideways drag over a list is how a card is moved to the trash. -->
<div
  class="tasks-view"
  use:paneSwipe={{
    enabled: compact,
    canPrev: !!prevSub,
    canNext: !!nextSub,
    onPrev: () => show(prevSub),
    onNext: () => show(nextSub),
  }}
>
  <!-- The strip rides on the SCREEN's top row (2026-08-06), so the ⋮ ends up at
       the far right of the same line, with the day or the week's span just
       before it — instead of a bar of its own with the ⋮ orphaned below. -->
  {#snippet toolbar()}
    <div class="tasks-view__bar">
      <nav class="theme-segmented tasks-view__subs" use:segmented>
        {#each SUBS as item (item.key)}
          <button
            class="theme-segmented__item tasks-view__sub"
            class:theme-segmented__item--active={sub === item.key}
            class:tasks-view__sub--active={sub === item.key}
            onclick={() => show(item.key)}
          >
            {item.label}
          </button>
        {/each}
      </nav>
      <!-- The date rides beside the strip on the desktop and NOWHERE here in
           the compact shell: there it is the header's second line, under the
           screen's name, which is the one place a phone has room for it. -->
      {#if span && !compact}
        <span class="tasks-view__range">{span}</span>
      {/if}
    </div>
  {/snippet}

  <!-- Keyed on the tab, so the pane is a NEW element each time — that is what
       lets a plain CSS animation (tasks-view.css) slide it in, without a
       transition engine to keep the old one around. -->
  {#key sub}
  <div class="tasks-view__pane" data-enter={enter}>
  {#if sub === "inbox"}
    <TasksSpace
      {source}
      {toolbar}
      header={false}
      compose="bar"
      {onSetSort}
      {onSetOrder}
      {lists}
      {tags}
      {completedName}
      {dayRefs}
      {readOnly}
      {reloadKey}
      {selectedTask}
      onSelectTask={onSelect}
      {onChanged}
      {onError}
      {dateFormat}
      today={clock?.today}
      {f}
    />
  {:else}
    <PeriodView
      period={sub}
      {origin}
      {toolbar}
      header={false}
      compose="bar"
      {clock}
      {lists}
      {tags}
      {completedName}
      {inbox}
      {readOnly}
      {reloadKey}
      {onChanged}
      {onError}
      {onSelect}
      {selectedTask}
      {dateFormat}
      {onSuggest}
      {f}
    />
  {/if}
  </div>
  {/key}
</div>
