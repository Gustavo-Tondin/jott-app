<script>
  // A single task list (Inbox, Compras, …).
  //
  // The cards themselves, their actions and the reload loop are the shared
  // ones (components/TaskCards, services/{taskActions,act}) — this screen is
  // the list's own frame: its title, its add-a-task form, and the drag that
  // reorders the FILE rather than a config.
  import { api } from "../services/api.js";
  import { ensureTaskId } from "../services/taskId.js";
  import { listTitle } from "../services/paths.js";
  import { S } from "../services/strings.js";
  import { makeAct } from "../services/act.js";
  import { taskActions, isSelectedTask } from "../services/taskActions.js";
  import { pinnedFirst, planReorder } from "../services/widgetOrder.js";
  import TaskCards from "../components/TaskCards.svelte";

  let {
    list,
    readOnly,
    onChanged,
    onError,
    reloadKey,
    onSelect,
    selectedId = null,
    selectedTask = null,
    dateFormat = "mm/dd/yyyy",
    today = null,
    tagColors = {},
    /// What is pulled into the Day, so a card can say it is in today.
    dayRefs = null,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
  } = $props();

  const inDay = (entry) =>
    !!entry.task.id && !!dayRefs?.has(`${entry.list}#${entry.task.id}`);

  // Swiping a card left deletes it — the same gesture the widget offers, and
  // it has to work in any list, not only the ones a widget draws. No
  // confirmation: it goes to the notebook's own trash, so it is recoverable.
  const swipeDelete = (entry) =>
    act(async () => {
      const id = await ensureTaskId(entry.list, entry.task);
      await api.deleteTask(entry.list, id);
    });

  let tasks = $state([]);
  let newText = $state("");

  // Reloads whenever the list changes or something external touched the disk.
  $effect(() => {
    list;
    reloadKey;
    load();
  });

  async function load() {
    try {
      tasks = await api.listTasks(list);
    } catch (e) {
      onError(e);
    }
  }

  const act = makeAct({
    load,
    // Wrapped, not passed: `act` is built once, and the props may be
    // replaced (services/act.js).
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });
  const { complete, edit, pin, pull } = taskActions(act);

  const add = () => {
    const text = newText.trim();
    if (!text) return;
    newText = "";
    act(() => api.createTask(list, text));
  };

  let shown = $derived(pinnedFirst(tasks));
  let isSelected = $derived((task) => isSelectedTask(task, selectedId, selectedTask));

  // Drag-to-reorder within the list. move_task_to reorders the lines in the
  // file, so the new order is the file's order — no config needed here. The
  // indices the action reports are positions ON SCREEN, which is not the file
  // order once something is pinned: translate through the tasks themselves.
  const reorder = (from, to) =>
    act(async () => {
      const { moved, pinned, pinChanged } = planReorder(shown, from, to);
      const fileFrom = tasks.indexOf(moved);
      const fileTo = tasks.indexOf(shown[to]);
      if (fileFrom < 0 || fileTo < 0) return;
      // Crossing the divider pins or unpins. The id is resolved BEFORE the
      // move: ensureTaskId finds an id-less task by its position in the file.
      if (pinChanged) {
        const id = await ensureTaskId(list, moved);
        await api.setTaskPinned(list, id, pinned);
      }
      await api.moveTaskTo(list, fileFrom, fileTo);
    });
</script>

<div class="list-view">
  <header class="list-view__header">
    <h2 class="theme-title list-view__title">{listTitle(list)}</h2>
  </header>

  {#if tasks.length === 0}
    <p class="list-view__empty">{S.emptyList}</p>
  {:else}
    <TaskCards
      items={shown.map((task) => ({ task, list }))}
      listClass="list-view__list"
      dividerClass="list-view__pin-divider"
      pinned
      onReorder={reorder}
      {isSelected}
      {inDay}
      {f}
      onSwipeDelete={readOnly ? null : swipeDelete}
      {onSelect}
      onComplete={complete}
      onEdit={edit}
      onPin={pin}
      {tagColors}
      {dateFormat}
      {today}
    >
      {#snippet actions(entry)}
        {#if f("myDay")}
          <button
            class="theme-btn theme-btn--outline theme-btn--xs list-view__action"
            onclick={() => pull("day", list, entry.task)}>{S.pullToToday}</button
          >
        {/if}
        {#if f("week")}
          <button
            class="theme-btn theme-btn--outline theme-btn--xs list-view__action"
            onclick={() => pull("week", list, entry.task)}>{S.pullToWeek}</button
          >
        {/if}
      {/snippet}
    </TaskCards>
  {/if}

  <!-- Below the list, not above it: adding is what you do after reading what is
       already there, and a field on top pushes the list down every render. -->
  {#if !readOnly}
    <form class="list-view__form" onsubmit={(e) => (e.preventDefault(), add())}>
      <input
        class="theme-input"
        placeholder={S.newTaskPlaceholder}
        bind:value={newText}
      />
      <button class="theme-btn theme-btn--primary" type="submit"
        >{S.addTask}</button
      >
    </form>
  {/if}
</div>
