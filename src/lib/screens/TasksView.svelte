<script>
  // The fixed Tasks workspace: the inbox, plus the day and the week.
  //
  // One entry in the sidebar and three buttons inside it, rather than three
  // entries — Today and This Week are *views of the same tasks*, not places
  // of their own, and the sidebar should say so.
  //
  // The choice is state of this screen, not a view of its own: switching
  // between the three is looking around inside one document, so it must not
  // open a tab or fill the back history.
  //
  // All three ARE the tasks widget (2026-08-06). Index hosts the real widget
  // of `Tasks/Inbox` — the one the notebook creates — so it comes with that
  // folder's "Completed N"; Today and Week host the same widget over a period.
  // The only thing this screen changes is where a new task comes from: not the
  // blue button, but the bar the widget pins to the bottom (`compose="bar"`).
  import { S } from "../services/strings.js";
  import { formatDayMonth } from "../services/dates.js";
  import PeriodView from "./PeriodView.svelte";
  import TasksWidget from "../widgets/TasksWidget.svelte";

  let {
    /// The Inbox list's address, and the widget that owns it.
    inbox,
    inboxWidget = null,
    clock,
    lists = [],
    tags = [],
    completedName = "completed",
    /// What is pulled into the Day, so an Inbox card can say it is in today.
    dayRefs = null,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
    readOnly = false,
    reloadKey = 0,
    onChanged,
    onError,
    onSelect,
    selectedTask = null,
    dateFormat = "mm/dd/yyyy",
    /// Told which tab is open, so the page header can say `Tasks/Index`.
    onSub,
    /// Asks the shell to open the right panel on the period's suggestions.
    onSuggest,
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

  $effect(() => {
    onSub?.(SUBS.find((item) => item.key === sub)?.label ?? "");
  });

  /// The folder holding the Inbox list — `Tasks/Inbox/Inbox.md` → `Tasks/Inbox`.
  /// That folder IS a tasks widget, so the Index tab hosts it rather than
  /// inventing a second way to show the same list.
  let inboxFolder = $derived((inbox ?? "").slice(0, (inbox ?? "").lastIndexOf("/")));
  let widget = $derived(
    inboxWidget ?? { kind: "tasks", folder: inboxFolder, name: S.inboxTab },
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
    const pad = (n) => String(n).padStart(2, "0");
    const iso = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
    return S.weekRange(
      formatDayMonth(start, dateFormat),
      formatDayMonth(iso, dateFormat),
    );
  });
</script>

<div class="tasks-view">
  <!-- The strip rides on the WIDGET's top row (2026-08-06), so the ⋮ ends up at
       the far right of the same line, with the day or the week's span just
       before it — instead of a bar of its own with the ⋮ orphaned below. -->
  {#snippet toolbar()}
    <div class="tasks-view__bar">
      <nav class="theme-segmented tasks-view__subs">
        {#each SUBS as item (item.key)}
          <button
            class="theme-segmented__item tasks-view__sub"
            class:theme-segmented__item--active={sub === item.key}
            class:tasks-view__sub--active={sub === item.key}
            onclick={() => (sub = item.key)}
          >
            {item.label}
          </button>
        {/each}
      </nav>
      {#if span}
        <span class="tasks-view__range">{span}</span>
      {/if}
    </div>
  {/snippet}

  {#if sub === "inbox"}
    <TasksWidget
      {widget}
      {toolbar}
      header={false}
      compose="bar"
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
