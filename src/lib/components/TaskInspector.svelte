<script>
  // The right-hand panel: everything about one task that the row is too small
  // to show. The row keeps quiet markers; this is where the fields are edited.
  //
  // Three rules shape this file:
  //
  // 1. Opening a task never writes. A task with no id only gets one when the
  //    user actually changes something, so clicking around to look at things
  //    leaves the `.md` byte for byte as it was.
  // 2. There is no save button. An edit that the user has to remember to
  //    confirm is an edit they will lose. Changes are written on their own,
  //    shortly after the typing stops.
  // 3. The task is saved whole, in one call. `set_task_fields` exists for
  //    exactly this, because a half-applied edit is worse than none.
  import { onDestroy } from "svelte";
  import { api } from "../services/api.js";
  import { ensureTaskId } from "../services/taskId.js";
  import { completionBeat } from "../services/pace.js";
  import { S } from "../services/strings.js";
  import { listTitle, splitLabel } from "../services/paths.js";
  import {
    PRIORITIES,
    REPEAT_UNITS,
    cleanTagName,
    repeatText,
  } from "../services/taskFields.js";
  import { tagColors as tagColorMap } from "../services/accent.js";
  import { reorderable } from "../actions/reorder.js";
  import Menu from "./Menu.svelte";
  import Icon from "./Icon.svelte";
  import DatePicker from "./DatePicker.svelte";
  import TagPicker from "./TagPicker.svelte";

  let {
    task,
    list,
    readOnly = false,
    // The lists this task could move to (its folder's siblings, no Completed).
    lists = [],
    // The tag catalogue (name + colour), for the picker and the pill colours.
    tags = [],
    onSaved,
    onError,
    onClose,
    // Told the new list path after a move, so the shell can re-point at it.
    onMoved,
    // How long to wait after the last keystroke. A prop so tests can drop it
    // to zero instead of sleeping — a real user never sets this.
    saveDelay = 500,
    // How the due date is drawn (the notebook's display format).
    dateFormat = "mm/dd/yyyy",
    /// This task is pulled into the Day: the sun lights up, and pressing it
    /// takes it back out. A lit button that does nothing when pressed is a
    /// button that reads as broken (user call, 2026-08-06).
    inDay = false,
    /// `(key) => boolean` — is this part of the app switched on? A field
    /// switched off leaves the PANEL only: the draft still carries it and
    /// `set_task_fields` still writes it back, so nothing is lost while it is
    /// away (2026-08-06).
    f = () => true,
  } = $props();

  let draft = $state(fromTask(null));
  let newSubtask = $state("");
  // The ⌄ chevron folds the SUBTASKS away (only them — the fields stay,
  // user call 2026-08-04). Local to the panel; it writes nothing.
  let collapsed = $state(false);

  // Plain variables, not state: none of this should re-render anything, and a
  // reactive `pending` would make the auto-save effect trigger itself.
  //
  // `slot` is the task the current draft belongs to, together with its id once
  // it has one. It is captured instead of read from the props at write time,
  // because the user can click another task while a write is still on its way
  // — and that write has to land on the task it was typed into.
  let slot = null;
  let baseline = "";
  let pending = null;
  let timer = null;

  // A different task selected means a different draft. Without this, editing
  // one task and clicking another would show the first one's typing.
  $effect(() => {
    task;
    list;
    // Whatever was typed into the previous task goes out now, addressed to
    // that task, before the draft is replaced.
    flush();
    slot = { list, task, id: task?.id ?? null };
    // Stringify the plain object before it becomes the reactive draft.
    // Reading `draft` here would make this effect depend on the state it
    // assigns, and Svelte would loop until it gave up.
    const fresh = fromTask(task);
    baseline = JSON.stringify(fresh);
    draft = fresh;
    newSubtask = "";
  });

  // The auto-save itself. Stringifying the draft subscribes to every field in
  // it; comparing against the baseline is what tells a real edit apart from
  // the effect above having just reloaded the same values.
  $effect(() => {
    const snapshot = JSON.stringify(draft);
    if (readOnly || snapshot === baseline) return;

    // The snapshot rides along with the fields it produced, so that marking
    // the write as done later cannot swallow something typed in between.
    pending = { fields: fields(), snapshot };
    if (timer) clearTimeout(timer);
    timer = setTimeout(write, saveDelay);
  });

  // A pending edit must not die with the panel — closing it is the most
  // natural moment to stop typing.
  onDestroy(() => flush());

  /// Sends whatever is waiting right now, without waiting for the timer.
  function flush() {
    if (!pending) return Promise.resolve();
    if (timer) clearTimeout(timer);
    timer = null;
    return write();
  }

  async function write() {
    // Read synchronously: by the time the first await returns, the user may
    // already have selected another task and replaced both of these.
    const target = slot;
    const job = pending;
    pending = null;
    timer = null;
    if (!target || !job) return;

    try {
      // The id is earned here, on a real change — never on opening the task.
      if (!target.id) target.id = await ensureTaskId(target.list, target.task);
      await api.setTaskFields(target.list, target.id, job.fields);
      // Only after it lands, and only if the panel is still on the same task:
      // a failed write has to be retried by the next edit, not quietly
      // counted as saved.
      if (target === slot) baseline = job.snapshot;
      onSaved?.();
    } catch (e) {
      onError?.(e);
    }
  }

  function fields() {
    return {
      // An emptied name would leave a checkbox with no text; keep the old one.
      text: draft.text.trim() || slot?.task?.text || "",
      // Present-but-null is how a field is cleared — absent would mean
      // "leave alone", and there would be no way to remove a date.
      due: draft.due || null,
      priority: Number(draft.priority) || null,
      tags: draft.tags,
      // Blank lines are dropped: an empty indented line ends the task block
      // in the file, which would cut the description in half on re-read.
      description: draft.description
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      repeat: repeatText(draft),
      subtasks: draft.subtasks.map((s) => ({ text: s.text, done: s.done })),
    };
  }

  function fromTask(t) {
    return {
      text: t?.text ?? "",
      // `<input type="date">` speaks ISO, which is what the file stores too.
      due: t?.due ?? "",
      // As the STRING the shared table offers (services/taskFields.js) — a
      // `<select>` compares its options by string, so a numeric draft would
      // never match its own value and the row would show blank on a task that
      // has a priority. `fields()` sends the number.
      priority: t?.priority ? String(t.priority) : "",
      tags: [...(t?.tags ?? [])],
      description: (t?.description ?? []).join("\n"),
      repeatEvery: t?.repeat?.every ?? 1,
      repeatUnit: t?.repeat?.unit ?? "",
      subtasks: (t?.subtasks ?? []).map((s) => ({ ...s })),
    };
  }

  /// Removing a date needs its own control: the picker can set a day but has no
  /// gesture for "none", so the inspector keeps its own × to clear it.
  function clearDate() {
    draft.due = "";
  }

  // Name → colour, from the catalogue, so a pill shows the user's chosen colour.
  let tagColors = $derived(tagColorMap(tags));

  function addTagName(name) {
    const tag = cleanTagName(name);
    if (tag && !draft.tags.includes(tag)) draft.tags = [...draft.tags, tag];
  }

  /// Create a tag in the catalogue (with its colour) and apply it. The refresh
  /// (onSaved) brings the new colour back into `tags` for the pill.
  async function createTag(name, color) {
    try {
      await api.setTag(name, color);
      addTagName(name);
      onSaved?.();
    } catch (e) {
      onError?.(e);
    }
  }

  const removeTag = (tag) => (draft.tags = draft.tags.filter((t) => t !== tag));

  function addSubtask() {
    const text = newSubtask.trim();
    newSubtask = "";
    if (text) draft.subtasks = [...draft.subtasks, { text, done: false }];
  }

  const removeSubtask = (i) =>
    (draft.subtasks = draft.subtasks.filter((_, at) => at !== i));

  // Reorder by drag (the shared `reorderable` action). Reassigning the array is
  // an edit like any other, so the auto-save writes the new order.
  function reorderSubtasks(from, to) {
    if (readOnly) return;
    const next = [...draft.subtasks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    draft.subtasks = next;
  }

  /// The shape EVERY action of this panel takes, in the order that matters:
  ///
  ///   1. send whatever is being typed, addressed to the task it was typed
  ///      into — completing or moving takes the task to another file, and a
  ///      write still in flight would land in the old one;
  ///   2. earn an id, since opening a task never hands one out;
  ///   3. do the thing, and tell the shell.
  ///
  /// Five actions wrote those three steps out, and each copy had to remember
  /// all three every time one of them changed.
  async function onTask(run, { close = false } = {}) {
    if (readOnly) return;
    await flush();
    const target = slot;
    if (!target) return;
    try {
      if (!target.id) target.id = await ensureTaskId(target.list, target.task);
      await run(target);
      onSaved?.();
      // The task just left this list, so the panel is pointing at nothing.
      if (close) onClose?.();
    } catch (e) {
      onError?.(e);
    }
  }

  /// The sun in the toolbar: into My Day, or back out of it (2026-08-06).
  const myDay = () =>
    onTask((task) =>
      inDay
        ? api.removeFrom("day", task.list, task.id)
        : api.pullInto("day", task.list, task.id),
    );

  /// The footer's list picker: move this task to another list. On success the
  /// shell re-points at the new list.
  const moveList = (to) =>
    to && to !== slot?.list
      ? onTask(async (task) => {
          await api.moveTask(task.list, task.id, to);
          onMoved?.(to);
        })
      : undefined;

  /// The ⋮ menu's "Duplicate task": the core drops a copy right after it. The
  /// panel stays on the original; the copy shows up when the list reloads.
  const duplicate = () => onTask((task) => api.duplicateTask(task.list, task.id));

  // The ⋮ menu items. More (the global field-visibility preference) land here
  // later; for now it is the one honest action.
  let optionsMenu = $derived([
    { label: S.duplicateTask, run: duplicate, disabled: readOnly },
  ]);

  /// The footer's trash: the task goes to the notebook's own trash — never
  /// destroyed — and the panel closes, since it pointed at it.
  const removeTask = () =>
    onTask((task) => api.deleteTask(task.list, task.id), { close: true });

  const complete = () =>
    onTask(
      async (task) => {
        await api.completeTask(task.list, task.id);
        // Let the tick be seen before the list rearranges.
        await completionBeat();
      },
      { close: true },
    );
</script>

<aside class="inspector">
  <!-- Toolbar: collapse the panel, send to My Day, task options. Icon buttons
       are the shared `.theme-btn--icon`. The options menu (duplicate,
       functions) is wired in a later pass; disabled so it is never a dead
       promise. -->
  <div class="inspector__toolbar theme-pane-head">
    <button
      class="theme-btn theme-btn--icon"
      onclick={() => onClose?.()}
      aria-label={S.collapsePanel}
      title={S.collapsePanel}
    >
      <Icon name="sidebar-simple" size="1.125rem" />
    </button>
    <span class="inspector__gap"></span>
    {#if f("myDay")}
    <button
      class="theme-btn theme-btn--icon inspector__myday"
      class:inspector__myday--on={inDay}
      onclick={myDay}
      disabled={readOnly}
      aria-label={inDay ? S.removeFromDay : S.myDay}
      title={inDay ? S.removeFromDay : S.myDay}
    >
      <Icon name="sun" size="1.125rem" />
    </button>
    {/if}
    <Menu items={optionsMenu} align="end">
      {#snippet trigger({ toggle })}
        <button
          class="theme-btn theme-btn--icon"
          onclick={toggle}
          aria-label={S.taskOptions}
          title={S.taskOptions}
        >
          <Icon name="dots-three-vertical" size="1.125rem" />
        </button>
      {/snippet}
    </Menu>
  </div>

  <!-- The scrolling middle, between the pinned head and foot. -->
  <div class="inspector__scroll">
    <!-- Task header: complete, name, and the chevron that folds the detail.
         The name is the shared input, plain variant (borderless, inherits). -->
    <header class="inspector__header">
    <input
      class="theme-checkbox"
      type="checkbox"
      checked={task?.done ?? false}
      disabled={readOnly}
      onchange={complete}
      aria-label={S.complete}
    />
    <input
      class="theme-input theme-input--plain inspector__name"
      bind:value={draft.text}
      disabled={readOnly}
      aria-label={S.taskName}
    />
    {#if f("subtasks")}
    <button
      class="theme-btn theme-btn--icon"
      onclick={() => (collapsed = !collapsed)}
      aria-label={collapsed ? S.expandSubtasks : S.collapseSubtasks}
      title={collapsed ? S.expandSubtasks : S.collapseSubtasks}
    >
      <Icon name={collapsed ? "caret-down" : "caret-up"} size="0.875rem" />
    </button>
    {/if}
  </header>

  {#if !collapsed && f("subtasks")}
    <!-- Subtasks: indented under the task, each on its own surface card. The
         header's chevron folds ONLY this block (user call, 2026-08-04) — the
         rest of the panel stays. Drag by the grip to reorder (the shared
         `reorderable` action); the add-form is excluded from the item set so
         it never counts as a slot. -->
    <div
      class="inspector__subtasks"
      use:reorderable={{
        axis: "y",
        item: ".inspector__subtask:not(.inspector__subtask--add)",
        handle: ".reorder-grip",
        onReorder: reorderSubtasks,
      }}
    >
      {#each draft.subtasks as subtask, i (i)}
        <div class="inspector__subtask" class:inspector__subtask--done={subtask.done}>
          <span class="inspector__subtask-main">
            {#if !readOnly}
              <span class="reorder-grip" aria-hidden="true">
                <Icon name="dots-six-vertical" size="0.875rem" />
              </span>
            {/if}
            <input
              class="theme-checkbox theme-checkbox--sm"
              type="checkbox"
              bind:checked={subtask.done}
              disabled={readOnly}
              aria-label={S.subtaskLabel(subtask.text)}
            />
            <input
              class="theme-input theme-input--plain inspector__subtask-input"
              bind:value={subtask.text}
              disabled={readOnly}
            />
          </span>
          {#if !readOnly}
            <button
              class="theme-btn theme-btn--icon"
              onclick={() => removeSubtask(i)}
              aria-label={S.removeSubtask}
            >
              <Icon name="x" size="0.75rem" />
            </button>
          {/if}
        </div>
      {/each}
      {#if !readOnly}
        <form
          class="inspector__subtask inspector__subtask--add"
          onsubmit={(e) => (e.preventDefault(), addSubtask())}
        >
          <input
            class="theme-input theme-input--plain inspector__subtask-input"
            placeholder={S.newSubtaskPlaceholder}
            bind:value={newSubtask}
          />
        </form>
      {/if}
    </div>
    {/if}
    {#if f("taskTags")}
    <hr class="theme-divider" />

    <!-- Tags: coloured pills (the tag's own colour from the catalogue, via
         --tag-color), plus a picker that adds an existing tag or creates one
         with a colour. Not a free text field anymore (reestruturação
         2026-07-30): a typed tag had no colour and lagged behind. -->
    <div class="inspector__tags">
      {#each draft.tags as tag (tag)}
        <span
          class="inspector__tag"
          style={tagColors[tag] ? `--tag-color: ${tagColors[tag]}` : ""}
        >
          {tag}
          {#if !readOnly}
            <button
              class="inspector__tag-remove"
              onclick={() => removeTag(tag)}
              aria-label={S.removeTag(tag)}
            >
              <Icon name="x" size="0.625rem" />
            </button>
          {/if}
        </span>
      {/each}
      {#if !readOnly}
        <TagPicker
          {tags}
          applied={draft.tags}
          onPick={addTagName}
          onCreate={createTag}
        />
      {/if}
    </div>
    {/if}
    <hr class="theme-divider" />

    <!-- Fields: icon · label · value, each on its own surface card. -->
    <div class="inspector__fields">
      {#if f("dueDate")}
      <div class="inspector__field" class:inspector__field--unset={!draft.due}>
        <span class="inspector__field-label">
          <Icon name="calendar-blank" size="1rem" />
          {S.completeDateLabel}
        </span>
        <span class="inspector__field-value">
          <!-- Our own calendar, not the native picker: it closes on an outside
               click or Escape and pages months without dismissing. It sets a
               whole date only, so there is no half-typed value to guard. -->
          <DatePicker
            value={draft.due}
            {dateFormat}
            disabled={readOnly}
            onChange={(iso) => (draft.due = iso)}
          />
          {#if !readOnly && draft.due}
            <button
              class="inspector__tag-remove"
              onclick={clearDate}
              aria-label={S.clearDate}
              title={S.clearDateHint}
            >
              <Icon name="x" size="0.625rem" />
            </button>
          {/if}
        </span>
      </div>
      {/if}

      {#if f("priority")}
      <!-- Priority: the wireframe omits it, but it is a real field — kept so
           the function is not lost. It can hide behind the global functions
           preference later. -->
      <div class="inspector__field" class:inspector__field--unset={!draft.priority}>
        <span class="inspector__field-label">
          <Icon name="flag" size="1rem" />
          {S.priorityLabel}
        </span>
        <!-- The values are the file's own, from the shared table
             (services/taskFields.js): the draft holds the string a control
             gives, and `fields()` is what turns it into the number the bridge
             takes. -->
        <select
          class="theme-select theme-select--bare"
          bind:value={draft.priority}
          disabled={readOnly}
        >
          {#each PRIORITIES as option (option.value)}
            <option value={option.value}>{option.label()}</option>
          {/each}
        </select>
      </div>
      {/if}

      {#if f("remind")}
      <!-- Reminders have no backend yet: shown, disabled, honest. -->
      <div class="inspector__field inspector__field--muted" title={S.comingSoon}>
        <span class="inspector__field-label">
          <Icon name="clock" size="1rem" />
          {S.remindMeLabel}
        </span>
        <span class="inspector__field-soon">{S.comingSoon}</span>
      </div>
      {/if}

      {#if f("repeat")}
      <div class="inspector__field" class:inspector__field--unset={!draft.repeatUnit}>
        <span class="inspector__field-label">
          <Icon name="arrow-clockwise" size="1rem" />
          {S.repeatLabel}
        </span>
        <span class="inspector__stepper">
          {#if draft.repeatUnit}
            <input
              class="theme-input theme-number theme-input--filled"
              type="number"
              min="1"
              bind:value={draft.repeatEvery}
              disabled={readOnly}
              aria-label={S.repeatEvery}
            />
          {/if}
          <select
            class="theme-select theme-select--bare"
            bind:value={draft.repeatUnit}
            disabled={readOnly}
          >
            {#each REPEAT_UNITS as unit (unit.value)}
              <option value={unit.value}>{unit.label()}</option>
            {/each}
          </select>
        </span>
      </div>
      {/if}
    </div>

    {#if f("description") || f("files")}
    <hr class="theme-divider" />

    <!-- Description + attachments. Attachments have no backend yet: honest. -->
    <div class="inspector__description-block">
      {#if f("description")}
        <textarea
          class="theme-textarea inspector__description"
          bind:value={draft.description}
          disabled={readOnly}
          rows="5"
          placeholder={S.descriptionTitle}
        ></textarea>
      {/if}
      {#if f("files")}
        <div class="inspector__field inspector__field--muted" title={S.comingSoon}>
          <span class="inspector__field-label">
            <Icon name="paperclip" size="1rem" />
            {S.addFilesLabel}
          </span>
        </div>
      {/if}
    </div>
    {/if}
  </div>

  <!-- Foot, pinned at the bottom and always visible: which list the task lives
       in (change it to move the task) and the trash. Shares the pane-foot chrome
       with the sidebar's last row. -->
  <footer class="inspector__footer theme-pane-foot">
    <!-- Where the task lives. A button on its own surface, not a bare select
         (user call 2026-08-05): the footer says the list AND is the way to
         change it, so the affordance has to look like something to press. -->
    {#if readOnly || lists.length <= 1}
      <span class="inspector__origin">
        <Icon name="tray" size="1rem" />
        {listTitle(list)}
      </span>
    {:else}
      <Menu
        align="start"
        items={lists.map((l) => ({
          // The group in grey, the space in ink — `Design/`**Tasks**. Two
          // spaces called Tasks in two groups are a normal thing to have,
          // and the composer's chip says it the same way (services/paths.js).
          context: splitLabel(l).context,
          label: splitLabel(l).name,
          disabled: l.path === list,
          run: () => moveList(l.path),
        }))}
      >
        {#snippet trigger({ toggle })}
          <button
            class="theme-btn theme-btn--sm inspector__origin inspector__origin--button"
            onclick={toggle}
            aria-label={S.moveToList}
            title={S.moveToList}
          >
            <Icon name="tray" size="1rem" />
            <span class="inspector__origin-name">{listTitle(list)}</span>
          </button>
        {/snippet}
      </Menu>
    {/if}
    <button
      class="theme-btn theme-btn--icon"
      onclick={removeTask}
      disabled={readOnly}
      aria-label={S.deleteTask}
      title={S.deleteTask}
    >
      <Icon name="trash" size="1.125rem" />
    </button>
  </footer>
</aside>
