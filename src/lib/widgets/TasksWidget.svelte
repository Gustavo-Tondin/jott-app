<script>
  // The `tasks` widget — the one block of tasks this app draws, anywhere it
  // draws tasks: inside a workspace, as the Home's "Today tasks", and as each
  // tab of the fixed Tasks screen.
  //
  // Three props are what let the fixed screens host it instead of copying it
  // (2026-08-06):
  //
  //   • `period`  — the source. Without it the widget shows its OWN folder's
  //                 list (spec 3.5: a tasks widget is one list). With it, the
  //                 source is the Day or the Week, which spans lists, has no
  //                 arrangement of its own, and offers suggestions.
  //   • `header`  — whether the titled row is drawn. The Tasks screen has the
  //                 segmented strip above it already saying where you are.
  //   • `compose` — where a new task comes from: the blue button (everywhere
  //                 else) or the bar pinned to the bottom (the Tasks screen).
  //
  // What is NOT here, on purpose: the card list, the shared card actions, the
  // ⋮'s shape, the reload-and-report loop and the composing row. Each is the
  // same in more than one place, so each lives in components/ or services/.
  // Suggestions are not here either — the pill only asks the shell to open the
  // right-hand panel on them (2026-08-06), because that panel outlives this
  // widget and is where a list you act on repeatedly belongs.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { askTask } from "../services/dialog.js";
  import { ensureTaskId } from "../services/taskId.js";
  import { listName, listLabel, taskWidgetPaths } from "../services/paths.js";
  import { makeAct } from "../services/act.js";
  import { taskActions, isSelectedTask } from "../services/taskActions.js";
  import { widgetMenu } from "../services/widgetMenu.js";
  import { tagColors as tagColorMap } from "../services/accent.js";
  import { composeTask } from "../services/taskCompose.js";
  import { arrange, pinnedFirst, planReorder } from "../services/widgetOrder.js";
  import TaskCards from "../components/TaskCards.svelte";
  import TaskComposer from "../components/TaskComposer.svelte";
  import Menu from "../components/Menu.svelte";
  import Icon from "../components/Icon.svelte";

  let {
    widget,
    lists = [],
    tags = [],
    completedName = "completed",
    today = null,
    dateFormat = "mm/dd/yyyy",
    /// `"<list>#<id>"` for everything pulled into the Day, from the snapshot.
    dayRefs = null,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
    readOnly = false,
    reloadKey = 0,
    selectedTask = null,
    onSelectTask,
    /// `"day"` / `"week"` — the source is the period state instead of the
    /// widget's own folder.
    period = null,
    /// Whether to draw the titled header (title + New task + ⋮).
    header = true,
    /// Where the title sits on that row: `"start"` (a block inside a screen
    /// that has other blocks) or `"center"` (the Home, 2026-08-13 — the block
    /// IS the screen there, and a centred heading over a centred column reads
    /// as one thing instead of a label stuck to the left of it).
    align = "start",
    /// Controls the HOST wants on the widget's top row, between the title and
    /// the ⋮ — the Tasks screen's Index/Today/Week strip and week span. They
    /// go in the row rather than above it so the ⋮ stays at the far right of
    /// the same line (user call, 2026-08-06).
    toolbar,
    /// `"button"` (the blue New task), `"bar"` (the pinned composer) or
    /// `"none"` — the Home, where the capture box above the block is where
    /// everything is written and a second New task next to it was two ways to
    /// do one thing (2026-08-13).
    compose = "button",
    /// Where a composed task goes by default when the widget has no list of
    /// its own — the notebook's Inbox, for a period source.
    defaultList = null,
    // Persist the widget's arrangement in its `.workspace.json` (the host binds
    // these to the widget's folder; the widget only reports).
    onSetSort,
    onSetOrder,
    /// Asks the shell to show this period's suggestions in the right panel.
    onSuggest,
    onChanged,
    onError,
  } = $props();

  // The widget's own list, and the Completed file beside it. Both null for a
  // period source, which owns no folder.
  let paths = $derived(taskWidgetPaths(widget, lists, completedName));

  let tagColors = $derived(tagColorMap(tags));

  // Everything below works in ENTRIES — `{ task, list }` — because a period
  // draws tasks from several lists at once and each card has to know which
  // file it came from. A folder source simply stamps its own two paths on.
  let open = $state([]);
  let done = $state([]);
  let showCompleted = $state(false);
  /// A period's arrangement: it has no `.workspace.json`, so the notebook keeps it
  /// (2026-08-06) and the widget reads it with the tasks.
  let periodSort = $state(null);

  $effect(() => {
    reloadKey;
    period;
    paths.list;
    load();
  });

  const asEntry = (listed) => ({ task: listed.task, list: listed.path });

  // The sun marks a card that is in today — but not on a screen that IS the
  // day or the week, where it would be true of everything (user call).
  const inDay = (entry) =>
    !period && !!entry.task.id && !!dayRefs?.has(`${entry.list}#${entry.task.id}`);

  async function load() {
    try {
      if (period) {
        // A completed task keeps its period reference and follows the task
        // into the folder's Completed (2026-08-06), so one call answers both
        // halves of the screen — split by the checkbox.
        const [entries, chosen] = await Promise.all([
          api.periodTasks(period),
          api.periodSort(period),
        ]);
        open = (entries ?? []).filter((e) => !e.task.done).map(asEntry);
        done = (entries ?? []).filter((e) => e.task.done).map(asEntry);
        periodSort = chosen ?? null;
        return;
      }
      if (!paths.list) {
        open = [];
        done = [];
        return;
      }
      const [todo, finished] = await Promise.all([
        api.listTasks(paths.list),
        api.listTasks(paths.completed).catch(() => []),
      ]);
      open = (todo ?? []).map((task) => ({ task, list: paths.list }));
      done = (finished ?? []).map((task) => ({ task, list: paths.completed }));
    } catch (e) {
      onError?.(e);
    }
  }

  const act = makeAct({
    load,
    // Wrapped, not passed: `act` is built once, and the props may be
    // replaced (services/act.js).
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });
  const { complete, edit, pin } = taskActions(act);

  // ---- arrangement (Etapa 1) ----
  // Same shape whatever the source; only where the preference is kept differs.
  // A period's "file order" is the order things were pulled in — the state
  // file's own — and dragging rewrites exactly that, so a period never needs
  // the `custom` ordering the folder widget keeps in its `.workspace.json`.
  const accessors = {
    nameOf: (entry) => entry.task.text,
    createdOf: (entry) => entry.task.created,
    completedOf: (entry) => entry.task.completed,
    keyOf: (entry) => entry.task.id,
  };
  const isPinned = (entry) => !!entry.task.pinned;

  let sort = $derived(period ? periodSort : (widget.sort ?? null));
  let order = $derived(period ? [] : (widget.order ?? []));

  // Pinning outranks the sort: whatever ordering is on, a pinned card is at
  // the top, with a divider under the last one.
  let shown = $derived(pinnedFirst(arrange(open, sort, order, accessors), isPinned));
  let shownCompleted = $derived(arrange(done, sort, order, accessors));

  // A period has no `.workspace.json` and no folder, so it offers neither an
  // arrangement nor a move — `widgetMenu` leaves out what it is not given.
  let sortMenu = $derived(
    widgetMenu({
      lead: [{ label: S.selectTasks, run: () => (picking = true), disabled: readOnly }],
      // `custom` is the folder widget's saved arrangement; a period has none,
      // because dragging it rewrites the state file itself.
      sorts: period
        ? [null, "name", "created", "completed"]
        : [null, "name", "created", "completed", "custom"],
      sort,
      hasOrder: order.length > 0,
      onSetSort: setSort,
    }),
  );

  // ---- composing ----
  // Every list a task may be written into. A widget with a list of its own
  // opens the chip on it; a period opens it on the notebook's Inbox.
  let composeTargets = $derived(lists.filter((entry) => entry.name !== completedName));
  let composeList = $derived(paths.list ?? defaultList ?? null);

  const write = (intent) => act(() => composeTask(intent, { period }));

  const newTask = () =>
    act(async () => {
      const intent = await askTask({
        lists: composeTargets,
        defaultList: composeList,
        dateFormat,
        f,
      });
      if (!intent) return;
      await composeTask(intent, { period });
    });

  // ---- bulk selection (the ⋮'s "Select tasks…") ----
  // Picked entries are held by object identity: the set lives within one load,
  // and both bulk actions resolve real ids before touching anything.
  let picking = $state(false);
  let picked = $state(new Set());

  const togglePick = (task) => {
    const entry = shown.find((candidate) => candidate.task === task);
    if (!entry) return;
    const next = new Set(picked);
    if (next.has(entry)) next.delete(entry);
    else next.add(entry);
    picked = next;
  };
  const exitPicking = () => {
    picking = false;
    picked = new Set();
  };

  // Where a picked task can move — any tasks list of the notebook except this
  // workspace's own and the Completed files.
  let listTargets = $derived(composeTargets.filter((entry) => entry.path !== paths.list));

  // Ids are resolved BEFORE the first move/delete: each mutation shifts the
  // file, and ensureTaskId finds an id-less task by its position in it.
  const withPickedIds = async (each) => {
    const resolved = [];
    for (const entry of picked) {
      resolved.push([entry.list, await ensureTaskId(entry.list, entry.task)]);
    }
    for (const [list, id] of resolved) await each(list, id);
  };

  const moveSelected = (target) =>
    act(async () => {
      if (!target || picked.size === 0) return;
      await withPickedIds((list, id) => api.moveTask(list, id, target));
      exitPicking();
    });

  const deleteSelected = () =>
    act(async () => {
      if (picked.size === 0) return;
      await withPickedIds((list, id) => api.deleteTask(list, id));
      exitPicking();
    });

  const setSort = (next) =>
    period ? act(() => api.setPeriodSort(period, next)) : onSetSort?.(next);

  // Dragging a period rewrites the state file — the day IS that list, so there
  // is nothing to mirror and nothing to fall out of step. Whatever sort was on
  // goes back to the pulled order, because that order is now what was built.
  async function reorderPeriod(from, to) {
    const { next } = planReorder(shown, from, to, isPinned);
    try {
      const refs = next
        .filter((entry) => entry.task.id)
        .map((entry) => ({ path: entry.list, id: entry.task.id }));
      // The completed cards keep their place, so undoing one does not lose it.
      for (const entry of shownCompleted) {
        if (entry.task.id) refs.push({ path: entry.list, id: entry.task.id });
      }
      if (periodSort) await api.setPeriodSort(period, null);
      await api.setPeriodOrder(period, refs);
      await load();
      onChanged?.();
    } catch (e) {
      onError?.(e);
    }
  }

  // Dragging saves the arrangement the user just made as the custom order —
  // whatever sort was active, what they see after the drop is what they built.
  // Crossing the divider is the other way to pin and unpin.
  async function reorderTasks(from, to) {
    const { next, moved, pinned, pinChanged } = planReorder(shown, from, to, isPinned);
    try {
      if (pinChanged) {
        const id = await ensureTaskId(moved.list, moved.task);
        await api.setTaskPinned(moved.list, id, pinned);
      }
      const ids = [];
      for (const entry of next) {
        ids.push(entry.task.id ?? (await ensureTaskId(entry.list, entry.task)));
      }
      // The completed cards keep their place in the saved order, so undoing
      // one later does not lose where it sat.
      for (const entry of shownCompleted) {
        if (entry.task.id) ids.push(entry.task.id);
      }
      await onSetOrder?.(ids);
      // The pin lives in the `.md`, which only a reload brings back.
      await load();
    } catch (e) {
      onError?.(e);
    }
  }

  // In selection mode a click picks the card instead of opening it, and the
  // selection tint marks what is picked.
  let isSelected = $derived(
    picking
      ? (task) => [...picked].some((entry) => entry.task === task)
      : (task) => isSelectedTask(task, selectedTask?.id ?? null, selectedTask),
  );

  const uncomplete = (list, task) => act(() => api.uncompleteTask(list, task.id));

  // The × on a completed card (wireframe): the task leaves for the notebook's
  // trash — recoverable, never destroyed.
  const removeCompleted = (list, task) => act(() => api.deleteTask(list, task.id));

  // A period holds references, so dropping one deletes nothing.
  const removeFromPeriod = (list, id) => act(() => api.removeFrom(period, list, id));

  // ---- the swipes (2026-08-06) ----
  // Left deletes; right takes the card out of the period, and only on a screen
  // that IS one. No confirmation on the delete: it goes to the notebook's own
  // trash, so it is recoverable — and a dialog on every swipe kills the
  // gesture. The id is resolved first, the way every card action does.
  const swipeDelete = (entry) =>
    act(async () => {
      const id = await ensureTaskId(entry.list, entry.task);
      await api.deleteTask(entry.list, id);
    });

  const swipeUnpull = period
    ? (entry) =>
        act(async () => {
          const id = await ensureTaskId(entry.list, entry.task);
          await api.removeFrom(period, entry.list, id);
        })
    : null;

  // Whether the row under the cards is drawn: it carries the Completed toggle
  // and, in a period, the Suggestions pill the wireframe puts on that line.
  let hasCompletedRow = $derived(done.length > 0 || (!!period && shown.length > 0));
</script>

<!-- The pill shows up twice (inside the empty card, and on the Completed row),
     so it is a snippet rather than the same six lines written out again. -->
{#snippet suggestPill()}
  <button class="suggestions-pill" onclick={() => onSuggest?.(period)}>
    <span>{S.suggestionsTitle}</span>
    <Icon name="lightbulb" size="1rem" />
  </button>
{/snippet}

<section class="tasks-widget">
  {#if !period && !widget.folder}
    <p class="tasks-widget__note tasks-widget__note--warn">{S.widgetNoLists}</p>
  {:else}
    <!-- The header row is ALWAYS drawn, because the ⋮ belongs in the top right
         of every widget (user call, 2026-08-06) — `header` only decides whether
         the block is titled. On the Tasks screen the strip above already names
         the place, so the row carries the ⋮ alone. -->
      <header
        class="tasks-widget__header"
        class:tasks-widget__header--center={align === "center"}
      >
        {#if toolbar || align === "center"}
          <!-- An invisible twin of the ⋮, so whatever is centred on this row —
               the host's controls, or the title itself — is centred on the
               PANEL and not on what is left of the row. A hidden copy rather
               than a guessed width: whatever the tools grow into, the two
               sides stay equal (user call, 2026-08-06). -->
          <span class="tasks-widget__mirror" aria-hidden="true">
            <span class="theme-btn--icon">
              <Icon name="dots-three-vertical" size="1rem" />
            </span>
          </span>
        {/if}
        {#if header}
          <h3 class="theme-title tasks-widget__title" class:theme-title--sm={align !== "center"}>
            {widget.name || listName(widget.folder)}
          </h3>
        {/if}
        {#if toolbar}{@render toolbar()}{/if}
        {#if picking}
          <!-- Selection mode: the header turns into the bulk actions. -->
          <div class="tasks-widget__tools">
            <span class="tasks-widget__picked">{S.selectedCount(picked.size)}</span>
            <select
              class="theme-select theme-select--sm tasks-widget__move"
              aria-label={S.moveTo}
              disabled={picked.size === 0}
              onchange={(e) => {
                const target = e.currentTarget.value;
                e.currentTarget.value = "";
                moveSelected(target);
              }}
            >
              <option value="" disabled selected>{S.moveTo}</option>
              {#each listTargets as target (target.path)}
                <!-- The workspace's readable address, like the other two
                     pickers (services/paths.js). A <select> cannot show the
                     group and the workspace in different greys, but it can at
                     least stop reading like a file path. -->
                <option value={target.path}>{listLabel(target)}</option>
              {/each}
            </select>
            <button
              class="theme-btn theme-btn--danger theme-btn--sm"
              disabled={picked.size === 0}
              onclick={deleteSelected}>{S.deleteSelected}</button
            >
            <button
              class="theme-btn--icon"
              aria-label={S.cancel}
              title={S.cancel}
              onclick={exitPicking}
            >
              <Icon name="x" size="1rem" />
            </button>
          </div>
        {:else}
          <div class="tasks-widget__tools">
            {#if !readOnly && compose === "button"}
              <button class="theme-btn theme-btn--primary tasks-widget__new" onclick={newTask}>
                <span>{S.newTask}</span>
                <Icon name="plus-bold" size="1rem" />
              </button>
            {/if}
            <Menu items={sortMenu}>
              {#snippet trigger({ toggle })}
                <button
                  class="theme-btn--icon tasks-widget__more"
                  onclick={toggle}
                  aria-label={S.widgetOptions}
                  title={S.widgetOptions}
                >
                  <Icon name="dots-three-vertical" size="1rem" />
                </button>
              {/snippet}
            </Menu>
          </div>
        {/if}
      </header>

    {#if shown.length === 0}
      <!-- The wireframe's empty card holds the Suggestions pill, so an empty
           day offers a way forward instead of only saying it is empty. -->
      <div class="theme-empty-card tasks-widget__empty">
        <span>{S.noTasksYet}</span>
        {#if period && !readOnly}{@render suggestPill()}{/if}
      </div>
    {:else}
      <TaskCards
        items={shown}
        listClass="tasks-widget__list"
        dividerClass="tasks-widget__pin-divider"
        pinned={!period}
        showList={!!period}
        {inDay}
        {f}
        onSwipeDelete={readOnly ? null : swipeDelete}
        onSwipeUnpull={readOnly ? null : swipeUnpull}
        onReorder={readOnly ? null : period ? reorderPeriod : reorderTasks}
        {isSelected}
        onSelect={picking ? (_, task) => togglePick(task) : onSelectTask}
        onComplete={complete}
        onEdit={edit}
        onPin={readOnly || period ? undefined : pin}
        {tagColors}
        {dateFormat}
        {today}
      >
        {#snippet actions(entry)}
          {#if period && !readOnly && entry.task.id}
            <!-- An × for now. The right glyph is a struck-through sun ("take
                 this out of my day"), which has to be drawn — see the roadmap. -->
            <button
              class="theme-btn--icon tasks-widget__unpull"
              aria-label={S.removeFromPeriod}
              title={S.removeFromPeriod}
              onclick={() => removeFromPeriod(entry.list, entry.task.id)}
            >
              <Icon name="x" size="0.875rem" />
            </button>
          {/if}
        {/snippet}
      </TaskCards>
    {/if}

    {#if hasCompletedRow}
      <div class="tasks-widget__completed-row">
        {#if done.length > 0}
          <button
            class="tasks-widget__completed-toggle"
            onclick={() => (showCompleted = !showCompleted)}
          >
            <Icon name={showCompleted ? "caret-down" : "caret-right"} size="0.875rem" />
            <span>{S.completedCount(done.length)}</span>
          </button>
        {/if}
        {#if period && !readOnly}{@render suggestPill()}{/if}
      </div>
    {/if}

    {#if showCompleted && done.length > 0}
      <TaskCards
        items={shownCompleted}
        listClass="tasks-widget__list tasks-widget__list--completed"
        showList={!!period}
        {f}
        {isSelected}
        onSelect={onSelectTask}
        onComplete={(list, task) => uncomplete(list, task)}
        onEdit={edit}
        {tagColors}
        {dateFormat}
        {today}
      >
        {#snippet actions(entry)}
          {#if !readOnly && entry.task.id}
            <button
              class="theme-btn--icon tasks-widget__remove"
              aria-label={S.deleteTask}
              title={S.deleteTask}
              onclick={() => removeCompleted(entry.list, entry.task)}
            >
              <Icon name="x" size="0.875rem" />
            </button>
          {/if}
        {/snippet}
      </TaskCards>
    {/if}

    {#if !readOnly && compose === "bar"}
      <TaskComposer
        lists={composeTargets}
        defaultList={composeList}
        {dateFormat}
        {f}
        onSubmit={write}
      />
    {/if}
  {/if}
</section>
