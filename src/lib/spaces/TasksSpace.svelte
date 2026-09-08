<script>
  // The `tasks` source — the one block of tasks the app draws anywhere: inside
  // a space, as a DAY on the Home (`day`), and as every open task (`all`).
  // `header` and `compose` are what let the fixed screens host it instead of
  // copying it. The card list, the actions, the ⋮ and the composer live in
  // components/ and services/; suggestions only ask the shell for its panel.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { askConfirm, askTask, DELETING } from "../services/dialog.js";
  import { ensureTaskId } from "../services/taskId.js";
  import { listName, listLabel, taskSpacePaths } from "../services/paths.js";
  import { makeScreen } from "../services/act.js";
  import { tracker, HELD } from "../services/recent.js";
  import { taskActions, isSelectedTask } from "../services/taskActions.js";
  import { dotStyle as dotStyleOf } from "../services/accent.js";
  import { spaceMenu } from "../services/spaceMenu.js";
  import { composeTask } from "../services/taskCompose.js";
  import {
    arrange,
    arrangeCompleted,
    pinnedFirst,
    planReorder,
    planReorderMany,
  } from "../services/spaceOrder.js";
  import BulkBar from "../components/BulkBar.svelte";
  import TaskCards from "../components/TaskCards.svelte";
  import TaskComposer from "../components/TaskComposer.svelte";
  import Menu from "../components/Menu.svelte";
  import Icon from "../components/Icon.svelte";

  let {
    source,
    lists = [],
    tags = [],
    completedName = "completed",
    today = null,
    dateFormat = "mm/dd/yyyy",
    /// `"<list>#<id>"` for everything pulled into the Day, from the snapshot.
    dayRefs = null,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
    /// `(item) => {label, color} | null` — where an item came from, for the
    /// badge a card wears outside its space (services/origin.js). Null when
    /// the screen IS the space, and nothing is said.
    origin = null,
    readOnly = false,
    reloadKey = 0,
    selectedTask = null,
    onSelectTask,
    /// The source is a day instead of the source's own folder: `null` is
    /// today, an ISO day is one ahead. Left `undefined`, the folder answers.
    day = undefined,
    /// Every open task of the notebook, arranged by space (the fixed Tasks
    /// screen's `tasksShowAll`). Nothing is dragged across lists.
    all = false,
    /// Whether to draw the titled header (title + New task + ⋮).
    header = true,
    /// Where the title sits on that row: `"start"` (a block inside a screen
    /// with other blocks) or `"center"` (the Home and a space, where the block
    /// IS the screen).
    align = "start",
    /// The colour of the PLACE, as a name (services/accent.js). Left
    /// `undefined` there is no dot: a block ("Today tasks") is not a place.
    /// `null` is a space with no colour of its own: the app's accent.
    dot = undefined,
    /// Controls the HOST wants on the top row, between the title and the ⋮ —
    /// in the row so the ⋮ stays at the far right of the same line.
    toolbar,
    /// `"button"` (the blue New task), `"bar"` (the pinned composer) or
    /// `"none"` (the Home, whose capture box is where everything is written).
    compose = "button",
    /// Put the cursor in the composer as soon as it appears. For the bar that
    /// opens on demand (Home's + on a phone): a composer that was ASKED for
    /// and then waits to be tapped again has answered half the request.
    composeAutofocus = false,
    /// For the same on-demand bar: how it is put away. Handed to the composer
    /// as its `onDismiss`; the permanent bars leave it unset.
    composeDismiss = null,
    /// Where a composed task goes by default when the source has no list of
    /// its own — the notebook's Inbox, for a day.
    defaultList = null,
    // Persist the source's arrangement in its `.space.json` (the host binds
    // these to the source's folder; the source only reports).
    onSetSort,
    onSetOrder,
    /// Asks the shell to show this day's suggestions in the right panel.
    onSuggest,
    /// `({open, done}) => void` — how many the source holds, each read. The
    /// Home's head counts the day off it instead of reading it a second time.
    onLoaded,
    onChanged,
    onError,
  } = $props();

  /// Whether the source is a day at all — `null` is a day too (today).
  let isDay = $derived(day !== undefined);

  // The source's own list, and the Completed file beside it. Both null for a
  // day, which owns no folder.
  let paths = $derived(taskSpacePaths(source, lists, completedName));


  /// The place's colour as CSS; unset leaves the class's own fallback (the
  /// app's accent) to answer.
  let dotStyle = $derived(dotStyleOf(dot));

  // Everything below works in ENTRIES — `{ task, list }` — because a day
  // draws tasks from several lists at once and each card has to know which
  // file it came from. A folder source simply stamps its own two paths on.
  let open = $state([]);
  let done = $state([]);
  let showCompleted = $state(false);
  /// A day's arrangement: it has no `.space.json`, so the notebook keeps it
  /// and the source reads it with the tasks.
  let daySort = $state(null);

  $effect(() => {
    reloadKey;
    day;
    all;
    paths.list;
    load();
  });

  const asEntry = (listed) => ({ task: listed.task, list: listed.path });

  // The sun marks a card that is in today — not on a screen that IS a day,
  // where it would be true of everything.
  const inDay = (entry) =>
    !isDay && !!entry.task.id && !!dayRefs?.has(`${entry.list}#${entry.task.id}`);

  async function read() {
    if (isDay) {
      // A completed task keeps its day reference and follows the task into
      // the folder's Completed, so one call answers both halves — split by
      // the checkbox.
      const [entries, chosen] = await Promise.all([api.dayTasks(day), api.daySort()]);
      return {
        open: (entries ?? []).filter((e) => !e.task.done).map(asEntry),
        done: (entries ?? []).filter((e) => e.task.done).map(asEntry),
        sort: chosen ?? null,
      };
    }
    if (all) {
      // Every open task, already arranged by space; nothing done — the
      // Completed screen is where finished work is read.
      return { open: ((await api.allTasks()) ?? []).map(asEntry), done: [] };
    }
    if (!paths.list) return { open: [], done: [] };
    const [todo, finished] = await Promise.all([
      api.listTasks(paths.list),
      api.listTasks(paths.completed).catch(() => []),
    ]);
    return {
      open: (todo ?? []).map((task) => ({ task, list: paths.list })),
      done: (finished ?? []).map((task) => ({ task, list: paths.completed })),
    };
  }

  // ---- what has just landed ----
  // Two marks, both from services/recent.js and both living for a MOMENT
  // rather than for one read (the watcher's reload arrives a few frames after
  // the write, rebuilding the list's nodes): a card new to THIS list rises
  // into place, and a task new to the DAY lights its sun (task-row.css).
  const keyOf = (entry) => (entry.task.id ? `${entry.list}#${entry.task.id}` : "");
  /// What the cards are a reading OF. Changing day, or the list underneath,
  /// is a new list rather than a list of arrivals.
  let sourceKey = $derived(`${String(day)}|${all}|${paths.list ?? ""}`);

  const siftArrivals = tracker();
  let arrivals = $state(new Set());
  const sift = (entries) =>
    (arrivals = siftArrivals(sourceKey, entries.map(keyOf).filter(Boolean)));
  const arrived = (entry) => arrivals.has(keyOf(entry));

  // The day is the NOTEBOOK's answer (`dayRefs`), not this screen's read: a
  // task joins it from here, from the panel beside it, or from another window.
  const siftJoined = tracker();
  let joinedDay = $state(new Set());
  $effect(() => {
    joinedDay = siftJoined("day", dayRefs ?? new Set());
  });
  const joined = (entry) => !isDay && joinedDay.has(keyOf(entry));

  // A mark nobody reads again would stay on the card: the sets are fed by
  // reads, and the last read of a burst is not followed by another.
  $effect(() => {
    if (arrivals.size === 0) return;
    const forget = setTimeout(() => (arrivals = new Set()), HELD);
    return () => clearTimeout(forget);
  });
  $effect(() => {
    if (joinedDay.size === 0) return;
    const forget = setTimeout(() => (joinedDay = new Set()), HELD);
    return () => clearTimeout(forget);
  });

  const { load, act } = makeScreen({
    read,
    apply: (r) => {
      sift(r.open);
      open = r.open;
      done = r.done;
      // Only a day carries an arrangement of its own; a space's sort
      // lives in its `.space.json` and arrives with the source.
      if (r.sort !== undefined) daySort = r.sort;
      onLoaded?.({ open: r.open.length, done: r.done.length });
    },
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });
  const { complete, edit, pin, remove, duplicate } = taskActions(act);

  // ---- arrangement ----
  // Same shape whatever the source; only where the preference is kept differs.
  // A day's "file order" is the day's file's own, and dragging rewrites exactly
  // that, so a day never needs the folder source's `custom` ordering.
  const accessors = {
    nameOf: (entry) => entry.task.text,
    createdOf: (entry) => entry.task.created,
    completedOf: (entry) => entry.task.completed,
    keyOf: (entry) => entry.task.id,
  };
  const isPinned = (entry) => !!entry.task.pinned;

  let sort = $derived(isDay ? daySort : (source.sort ?? null));
  let order = $derived(isDay || all ? [] : (source.order ?? []));

  // Pinning outranks the sort: whatever ordering is on, a pinned card is at
  // the top, with a divider under the last one.
  let shown = $derived(pinnedFirst(arrange(open, sort, order, accessors), isPinned));
  let shownCompleted = $derived(arrangeCompleted(done, sort, accessors));

  // A day has no `.space.json` and no folder, so it offers neither an
  // arrangement nor a move — `spaceMenu` leaves out what it is not given.
  let sortMenu = $derived(
    spaceMenu({
      lead: [{ label: S.selectTasks, run: () => (picking = true), disabled: readOnly }],
      // `custom` is the folder source's saved arrangement; a day has none,
      // because dragging it rewrites the day's file itself — and "every
      // list" has none either, since nothing is dragged across lists.
      sorts:
        isDay || all
          ? [null, "name", "created", "completed"]
          : [null, "name", "created", "completed", "custom"],
      sort,
      hasOrder: order.length > 0,
      onSetSort: setSort,
    }),
  );

  // ---- composing ----
  // Every list a task may be written into. A source with a list of its own
  // opens the chip on it; a day opens it on the notebook's Inbox.
  let composeTargets = $derived(lists.filter((entry) => entry.name !== completedName));
  let composeList = $derived(paths.list ?? defaultList ?? null);

  /// What `composeTask` is told: a day joins the fresh task to itself,
  /// anything else leaves it in its list.
  let joining = $derived(isDay ? { into: day } : {});

  const write = (intent) => act(() => composeTask(intent, joining));

  const newTask = () =>
    act(async () => {
      const intent = await askTask({
        lists: composeTargets,
        defaultList: composeList,
        dateFormat,
        f,
      });
      if (!intent) return;
      await composeTask(intent, joining);
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

  // THE LONG PRESS is the other door into selection mode: it marks the card
  // and turns the screen over to picking. Resting on a card ALREADY picked is
  // not answered — the reorder action then carries the whole pile. Matched by
  // the TASK, never by the entry object: `shown` is rebuilt on every arrangement.
  const entryOf = (entry) => shown.find((candidate) => candidate.task === entry.task);
  function holdCard(held) {
    if (readOnly) return false;
    const entry = entryOf(held);
    if (!entry) return false;
    if (!picking) {
      picking = true;
      picked = new Set([entry]);
      return true;
    }
    if (!picked.has(entry)) picked = new Set([...picked, entry]);
    return false;
  }
  const carriedWith = (held) => {
    const entry = entryOf(held);
    return picking && entry && picked.has(entry) ? [...picked] : [];
  };

  // Where a picked task can move — any tasks list of the notebook except this
  // space's own and the Completed files.
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

  const deleteSelected = async () => {
    if (picked.size === 0) return;
    // The same question a single delete asks — deleting twelve without it
    // while deleting one asked was an accident, not a policy.
    if (!(await askConfirm(S.confirmDeleteTasks(picked.size), DELETING))) return;
    act(async () => {
      await withPickedIds((list, id) => api.deleteTask(list, id));
      exitPicking();
    });
  };

  const setSort = (next) => (isDay ? act(() => api.setDaySort(next)) : onSetSort?.(next));

  // Dragging a day rewrites the day's file — the day IS that list, so there
  // is nothing to mirror and nothing to fall out of step. Whatever sort was on
  // goes back to the pulled order, because that order is now what was built.
  function reorderDay(from, to) {
    const { next } = planReorder(shown, from, to, isPinned);
    return act(async () => {
      const refs = next
        .filter((entry) => entry.task.id)
        .map((entry) => ({ path: entry.list, id: entry.task.id }));
      // The completed cards keep their place, so undoing one does not lose it
      // — their FILE order, never the reading (`arrangeCompleted` reverses).
      for (const entry of done) {
        if (entry.task.id) refs.push({ path: entry.list, id: entry.task.id });
      }
      if (daySort) await api.setDaySort(null);
      await api.setDayOrder(day, refs);
    });
  }

  /// The pile dropped: the same two writes `reorderTasks` makes, for a block.
  function reorderDayMany(froms, to) {
    const { next } = planReorderMany(shown, froms, to, isPinned);
    return act(async () => {
      const refs = next
        .filter((entry) => entry.task.id)
        .map((entry) => ({ path: entry.list, id: entry.task.id }));
      for (const entry of done) {
        if (entry.task.id) refs.push({ path: entry.list, id: entry.task.id });
      }
      if (daySort) await api.setDaySort(null);
      await api.setDayOrder(day, refs);
      exitPicking();
    });
  }
  async function reorderTasksMany(froms, to) {
    const { next, pinned, pinChanged } = planReorderMany(shown, froms, to, isPinned);
    try {
      for (const entry of pinChanged) {
        const id = await ensureTaskId(entry.list, entry.task);
        await api.setTaskPinned(entry.list, id, pinned);
      }
      const ids = [];
      for (const entry of next) {
        ids.push(entry.task.id ?? (await ensureTaskId(entry.list, entry.task)));
      }
      for (const entry of done) {
        if (entry.task.id) ids.push(entry.task.id);
      }
      await onSetOrder?.(ids);
      exitPicking();
      await load();
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
      // one later does not lose where it sat — their FILE order, not the
      // reading (`arrangeCompleted` reverses it).
      for (const entry of done) {
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

  // ---- the swipes ----
  // Left deletes (no confirmation: it goes to the trash, and a dialog on every
  // swipe kills the gesture); right takes the card out of the day, only on a
  // screen that IS one. The Delete key asks for the same thing.
  const deleteEntry = (entry) => remove(entry.list, entry.task);

  /// Cards dropped by a FREE drag (Ctrl held) on a space of tasks in the
  /// sidebar, or on the Home: a space takes them into its Inbox (the same
  /// move as "Move to", so the id survives and Ctrl+Z brings it back); the
  /// Home pulls them into the day.
  const moveTo = $derived(
    readOnly
      ? null
      : (entries, zone) =>
          act(async () => {
            const toDay = zone.dataset.dayDrop != null;
            const target = toDay
              ? null
              : taskSpacePaths({ folder: zone.dataset.spaceDrop }, lists, completedName).list;
            for (const entry of entries) {
              const id = await ensureTaskId(entry.list, entry.task);
              if (toDay) {
                if (!inDay(entry)) await api.pullInto(null, entry.list, id);
              } else if (target && target !== entry.list) {
                await api.moveTask(entry.list, id, target);
              }
            }
          }),
  );

  /// What a rightward swipe means for one card: `{ adds, run }`. Derived: the
  /// same instance serves a day and a plain list. IT GOES BOTH WAYS — on a day
  /// the card is taken OUT; anywhere else it is a toggle into/out of today.
  /// `adds` is what the revealed square draws before the finger is lifted.
  const daySwipe = $derived(
    readOnly
      ? null
      : (entry) => {
          if (isDay) {
            return {
              adds: false,
              run: () =>
                act(async () => {
                  const id = await ensureTaskId(entry.list, entry.task);
                  await api.removeFrom(day, entry.list, id);
                }),
            };
          }
          // A task with no id was never pulled anywhere, so it is always the
          // adding half — which is also what `inDay` answers for one.
          const there = inDay(entry);
          return {
            adds: !there,
            run: () =>
              act(async () => {
                const id = await ensureTaskId(entry.list, entry.task);
                if (there) await api.removeFrom(null, entry.list, id);
                else await api.pullInto(null, entry.list, id);
              }),
          };
        },
  );

  // Whether the row under the cards is drawn: it carries the Completed toggle
  // and, on a day, the Suggestions pill the wireframe puts on that line.
  let hasCompletedRow = $derived(done.length > 0 || (isDay && shown.length > 0));
</script>

<!-- The pill shows up twice (inside the empty card, and on the Completed row),
     so it is a snippet rather than the same six lines written out again. -->
{#snippet suggestPill()}
  <button class="theme-chip suggestions-pill" onclick={() => onSuggest?.(day)}>
    <span>{S.suggestionsTitle}</span>
    <Icon name="lightbulb" size="1rem" />
  </button>
{/snippet}

<section class="tasks-space">
  {#if !isDay && !all && !source.folder}
    <p class="tasks-space__note tasks-space__note--warn">{S.spaceNoLists}</p>
  {:else}
    <!-- The header row is ALWAYS drawn, because the ⋮ belongs in the top right
         of every source — `header` only decides whether the block is titled. -->
      <header
        class="tasks-space__header"
        class:tasks-space__header--center={align === "center"}
      >
        {#if toolbar || align === "center"}
          <!-- An invisible twin of the ⋮, so whatever is centred on this row is
               centred on the PANEL and not on what is left of it. A hidden copy
               rather than a guessed width: the two sides stay equal. -->
          <span class="theme-mirror tasks-space__mirror" aria-hidden="true">
            <span class="theme-btn--icon">
              <Icon name="dots-three-vertical" size="1rem" />
            </span>
          </span>
        {/if}
        {#if header}
          <h3 class="theme-title tasks-space__title" class:theme-title--sm={align !== "center"}>
            {source.name || listName(source.folder)}
            {#if dot !== undefined}
              <span class="theme-dot" style={dotStyle} aria-hidden="true"></span>
            {/if}
          </h3>
        {/if}
        {#if toolbar}{@render toolbar()}{/if}
        <!-- Selection mode: the bulk actions float over the bottom of the
             screen (components/BulkBar.svelte), not in this header — a
             phone-width header has no room for a picker and two buttons. -->
        {#if !picking}
          <div class="tasks-space__tools">
            {#if !readOnly && compose === "button"}
              <button class="theme-btn theme-btn--primary tasks-space__new" onclick={newTask}>
                <span>{S.newTask}</span>
                <Icon name="plus-bold" size="1rem" />
              </button>
            {/if}
            <Menu items={sortMenu}>
              {#snippet trigger({ toggle })}
                <button
                  class="theme-btn--icon tasks-space__more"
                  onclick={toggle}
                  aria-label={S.spaceOptions}
                  title={S.spaceOptions}
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
      <div class="theme-empty-card tasks-space__empty">
        <span>{S.noTasksYet}</span>
        {#if isDay && !readOnly}{@render suggestPill()}{/if}
      </div>
    {:else}
      <!-- NO per-card × on a day: it read as "delete" on a card that is merely
           borrowed. Taking a card out is the rightward swipe and the inspector's sun. -->
      <TaskCards
        items={shown}
        listClass="tasks-space__list"
        dividerClass="tasks-space__pin-divider"
        pinned={!isDay}
        origin={isDay || all ? origin : null}
        color={dot}
        onMoveTo={moveTo}
        {inDay}
        {arrived}
        {joined}
        {f}
        onDelete={readOnly ? null : deleteEntry}
        onDuplicate={readOnly ? null : (entry) => duplicate(entry.list, entry.task)}
        {daySwipe}
        onReorder={readOnly || all ? null : isDay ? reorderDay : reorderTasks}
        onHold={readOnly ? null : holdCard}
        carried={carriedWith}
        onReorderMany={readOnly || all ? null : isDay ? reorderDayMany : reorderTasksMany}
        {isSelected}
        onSelect={picking ? (_, task) => togglePick(task) : onSelectTask}
        onComplete={complete}
        onEdit={edit}
        onPin={readOnly || isDay ? undefined : pin}
        {dateFormat}
        {today}
      />
    {/if}

    {#if hasCompletedRow}
      <div class="tasks-space__completed-row">
        {#if done.length > 0}
          <button
            class="theme-chip tasks-space__completed-toggle"
            onclick={() => (showCompleted = !showCompleted)}
          >
            <Icon name={showCompleted ? "caret-down" : "caret-right"} size="0.875rem" />
            <span>{S.completedCount(done.length)}</span>
          </button>
        {/if}
        {#if isDay && !readOnly}{@render suggestPill()}{/if}
      </div>
    {/if}

    {#if showCompleted && done.length > 0}
      <TaskCards
        items={shownCompleted}
        listClass="tasks-space__list tasks-space__list--completed"
        origin={isDay ? origin : null}
        color={dot}
        onMoveTo={moveTo}
        {f}
        {isSelected}
        onSelect={onSelectTask}
        onComplete={(list, task) => uncomplete(list, task)}
        onEdit={edit}
        onDelete={readOnly ? null : (entry) => removeCompleted(entry.list, entry.task)}
        {dateFormat}
        {today}
      >
        {#snippet actions(entry)}
          {#if !readOnly && entry.task.id}
            <button
              class="theme-btn--icon tasks-space__remove"
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

    {#if picking}
      <BulkBar count={picked.size} onClose={exitPicking}>
        <select
          class="theme-select theme-select--sm tasks-space__move"
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
            <!-- The space's readable address, like the other two pickers
                 (services/paths.js). A <select> cannot show the group and the
                 space in different greys, but it can at least stop reading
                 like a file path. -->
            <option value={target.path}>{listLabel(target)}</option>
          {/each}
        </select>
        <button
          class="theme-btn theme-btn--danger theme-btn--sm"
          disabled={picked.size === 0}
          onclick={deleteSelected}>{S.deleteSelected}</button
        >
      </BulkBar>
    {/if}
    <!-- The composing bar steps aside while the bulk bar is up: two bars on
         the same edge would sit on top of each other. -->
    {#if !readOnly && compose === "bar" && !picking}
      <TaskComposer
        lists={composeTargets}
        defaultList={composeList}
        autofocus={composeAutofocus}
        {dateFormat}
        {f}
        onSubmit={write}
        onDismiss={composeDismiss}
      />
    {/if}
  {/if}
</section>
