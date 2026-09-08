<script>
  // The right-hand panel: the fields of one task, edited in place.
  // Opening a task never writes (an id-less task earns its id on the first
  // real change); there is no save button — edits are written shortly after
  // typing stops; the task is saved whole, in one `set_task_fields` call.
  import { onDestroy } from "svelte";
  import { api } from "../services/api.js";
  import { autosave } from "../services/autosave.js";
  import { changedField, draftHistory } from "../services/draftHistory.js";
  import { ask } from "../services/shortcuts.js";
  import { ensureTaskId } from "../services/taskId.js";
  import { completionBeat } from "../services/pace.js";
  import { S } from "../services/strings.js";
  import { leafOf, listTitle, splitLabel } from "../services/paths.js";
  import {
    PRIORITIES,
    REPEAT_UNITS,
    cleanTagName,
    priorityClass,
    repeatCounted,
    repeatCounts,
    repeatText,
  } from "../services/taskFields.js";
  import { badgeStyle } from "../services/accent.js";
  import { childrenIn } from "../services/features.js";
  import { movedItem } from "../services/spaceOrder.js";
  import { reorderable } from "../actions/reorder.js";
  import Menu from "./Menu.svelte";
  import { formatAt, joinAt, normalizeAt, presets, splitAt } from "../services/reminders.js";
  import { formatDate, toIso } from "../services/dates.js";
  import Icon from "./Icon.svelte";
  import Notice from "./Notice.svelte";
  import DatePicker from "./DatePicker.svelte";
  import AssetPicker from "./AssetPicker.svelte";
  import TagPicker from "./TagPicker.svelte";
  import Editor from "./Editor.svelte";

  let {
    task,
    list,
    /// The colour of the task's space (a name) — what its tags wear.
    color = null,
    readOnly = false,
    /// The narrow shell (shell/compact.js): this panel is a bottom sheet
    /// rather than a column, and a sheet closes by itself — see the toolbar.
    compact = false,
    // The lists this task could move to (its folder's siblings, no Completed).
    lists = [],
    // The tag catalogue (name + colour), for the picker and the pill colours.
    tags = [],
    onSaved,
    onError,
    onClose,
    // Told the new list path after a move, so the shell can re-point at it.
    onMoved,
    /// Whether to offer the task fields that are off (`offerTaskFields`,
    /// Settings › Tasks), and where the card's button goes.
    offerFields = false,
    onMoreFields,
    // How long to wait after the last keystroke. A prop so tests can drop it
    // to zero instead of sleeping — a real user never sets this.
    saveDelay = 500,
    // How the due date is drawn (the notebook's display format).
    dateFormat = "mm/dd/yyyy",
    /// `HH:MM` — the notebook's reminder time, where the reminder presets
    /// land ("tomorrow" is tomorrow at this hour).
    reminderTime = "09:00",
    /// Pulled into the Day: the sun is lit, and pressing it takes it back out.
    inDay = false,
    /// The notebook's root, absolute — the file picker draws thumbnails and
    /// an address resolves against it (services/assets.js).
    root = null,
    /// `(key) => boolean` — is this part of the app switched on? A field
    /// switched off leaves the PANEL only: the draft still carries it and
    /// `set_task_fields` still writes it back.
    f = () => true,
    /// `(title) => void` — a `[[note]]` in the description was clicked; the
    /// shell resolves the title, as it does for the note editor.
    onOpenNote,
  } = $props();

  let draft = $state(fromTask(null));
  let newSubtask = $state("");
  // The ⌄ chevron folds the SUBTASKS only. Local to the panel; writes nothing.
  let collapsed = $state(false);

  // The debounced write (services/autosave.js). The delay is captured once
  // on purpose: a mount-time knob for tests, never changed while the panel lives.
  // svelte-ignore state_referenced_locally
  const saver = autosave({
    delay: saveDelay,
    write: async (target, fields) => {
      // The id is earned here, on a real change — never on opening the task.
      if (!target.id) target.id = await ensureTaskId(target.list, target.task);
      await api.setTaskFields(target.list, target.id, fields);
      onSaved?.();
    },
    onError: (e) => onError?.(e),
  });

  // A different task means a different draft. The panel's own Ctrl+Z steps
  // THIS task's fields (services/draftHistory.js); it follows the task, not
  // the object — the shell hands a fresh `task` after every save.
  const history = draftHistory();
  let openKey = null;

  $effect(() => {
    task;
    list;
    // Stringify the plain object before it becomes the reactive draft: reading
    // `draft` here would make the effect depend on what it assigns, and loop.
    const fresh = fromTask(task);
    const snapshot = JSON.stringify(fresh);
    // `open` flushes what was typed into the previous task first, addressed
    // to that task, before the slot is replaced.
    saver.open({ list, task, id: task?.id ?? null }, snapshot);
    // A task without an id earns one on its first save; the target carries
    // it before the next `task` does. Id-less tasks are told apart by text.
    const id = task?.id ?? saver.target()?.id ?? null;
    const key = `${list}|${id ?? ""}|${id ? "" : (task?.text ?? "")}`;
    if (key === openKey) history.settle(snapshot);
    else history.reset(snapshot);
    openKey = key;
    draft = fresh;
    newSubtask = "";
    pickingReminder = false;
  });

  // ---- the reminder ----
  // Presets (services/reminders.js) and, behind "Pick date and time…", a
  // calendar plus a time field that write the draft as soon as both have a
  // value; the autosave is the "done".
  let pickingReminder = $state(false);

  const PRESET_LABELS = {
    laterToday: () => S.remindLaterToday,
    tomorrow: () => S.remindTomorrow,
    nextWeek: () => S.remindNextWeek,
    onDue: () => S.remindOnDue,
  };

  let reminderMenu = $derived([
    ...presets({ due: draft.due, time: reminderTime }).map((p) => ({
      label: PRESET_LABELS[p.id](),
      run: () => {
        pickingReminder = false;
        draft.remind = p.at;
      },
    })),
    { label: S.remindPick, run: startPickingReminder },
  ]);

  /// Opens the two controls, seeded with what the field has — or the due
  /// date (else today) at the reminder time, so the field is never blank
  /// while the calendar waits for a click.
  function startPickingReminder() {
    const { date, time } = splitAt(draft.remind);
    draft.remind = joinAt(date || draft.due || toIso(new Date()), time || reminderTime);
    pickingReminder = true;
  }

  const setReminderDate = (iso) => (draft.remind = joinAt(iso, splitAt(draft.remind).time));
  const setReminderTime = (time) =>
    (draft.remind = joinAt(splitAt(draft.remind).date, time || reminderTime));

  function clearReminder() {
    pickingReminder = false;
    draft.remind = "";
  }

  // The auto-save itself. Stringifying the draft subscribes to every field in
  // it; the dirty check is what tells a real edit apart from the effect above
  // having just reloaded the same values.
  $effect(() => {
    const snapshot = JSON.stringify(draft);
    history.push(snapshot, changedField(history.current(), snapshot));
    if (readOnly || !saver.dirty(snapshot)) return;
    saver.edit(fields(), snapshot);
  });

  /// Ctrl+Z / Ctrl+Shift+Z for the panel's own fields, via the user's chords
  /// for `app.undo`/`app.redo`. A press inside the CodeMirror description is
  /// its own. `preventDefault` even with nothing to step back: the key must
  /// not reach the shell as an app undo.
  function onKeydown(event) {
    if (event.target?.closest?.(".cm-editor")) return;
    const id = $ask(event, "global");
    if (id !== "app.undo" && id !== "app.redo") return;
    event.preventDefault();
    if (readOnly) return;
    const snapshot = id === "app.undo" ? history.undo() : history.redo();
    if (snapshot !== null) draft = JSON.parse(snapshot);
  }

  // A pending edit must not die with the panel — closing it is the most
  // natural moment to stop typing.
  onDestroy(() => saver.flush());

  function fields() {
    return {
      // An emptied name would leave a checkbox with no text; keep the old one.
      text: draft.text.trim() || saver.target()?.task?.text || "",
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
      // The moment as the file writes it (`2026-07-25T09:00`); null clears.
      remind: draft.remind || null,
      // Whole, and as `{label, address}`: a label someone wrote by hand in the
      // `.md` has to survive an add or a remove made here (core/src/task.rs).
      files: draft.files.map((f) => ({ label: f.label, address: f.address })),
      subtasks: draft.subtasks.map((s) => ({ text: s.text, done: s.done })),
    };
  }

  function fromTask(t) {
    return {
      text: t?.text ?? "",
      // `<input type="date">` speaks ISO, which is what the file stores too.
      due: t?.due ?? "",
      // As the STRING of the shared table (services/taskFields.js): a `<select>`
      // compares options by string, so a numeric draft would never match and
      // show blank. `fields()` sends the number.
      priority: t?.priority ? String(t.priority) : "",
      tags: [...(t?.tags ?? [])],
      description: (t?.description ?? []).join("\n"),
      repeatEvery: t?.repeat?.every ?? 1,
      repeatUnit: t?.repeat?.unit ?? "",
      // The bridge sends the task's own moment with seconds; the draft keeps
      // the minute form the file and the controls speak.
      remind: normalizeAt(t?.remind ?? ""),
      files: (t?.files ?? []).map((f) => ({ ...f })),
      subtasks: (t?.subtasks ?? []).map((s) => ({ ...s })),
    };
  }

  // ---- attachments ----
  // The task points at a file of the library; the library screen and the
  // picker manage the file itself. Attaching the same address twice is a
  // no-op: the address IS the attachment.
  let picking = $state(false);

  function attach(address) {
    picking = false;
    if (!address || draft.files.some((f) => f.address === address)) return;
    const label = leafOf(address) || address;
    draft.files = [...draft.files, { label, address }];
  }

  const detach = (address) =>
    (draft.files = draft.files.filter((f) => f.address !== address));

  /// Opens it with the system handler. The × beside it detaches; the FILE is
  /// only ever deleted from the library screen.
  const openFile = (address) => api.openAsset(address).catch((e) => onError?.(e));

  /// Removing a date needs its own control: the picker can set a day but has no
  /// gesture for "none", so the inspector keeps its own × to clear it.
  function clearDate() {
    draft.due = "";
  }

  function addTagName(name) {
    const tag = cleanTagName(name);
    if (tag && !draft.tags.includes(tag)) draft.tags = [...draft.tags, tag];
  }

  /// Create a tag in the catalogue and apply it. The refresh (onSaved) brings
  /// the new name back into `tags` for the picker.
  async function createTag(name) {
    try {
      await api.setTag(name, null);
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
    draft.subtasks = movedItem(draft.subtasks, from, to);
  }

  /// The shape EVERY action of this panel takes, in order: flush what is
  /// being typed, addressed to the task it was typed into (completing or
  /// moving takes the task to another file, and an in-flight write would land
  /// in the old one); earn an id; do the thing, and tell the shell.
  async function onTask(run, { close = false } = {}) {
    if (readOnly) return;
    await saver.flush();
    const target = saver.target();
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

  /// The sun in the toolbar: into My Day, or back out of it.
  const myDay = () =>
    onTask((task) =>
      inDay
        ? api.removeFrom(null, task.list, task.id)
        : api.pullInto(null, task.list, task.id),
    );

  /// Where the task lives, as the FOOT says it: the name the picker gives the
  /// same list — the space, since every space's main list is called Inbox and
  /// "Inbox" alone never says which one. Falls back to the file's own title
  /// while the list of targets has not arrived.
  let here = $derived(
    splitLabel(lists.find((l) => l.path === list) ?? {}).name || listTitle(list),
  );

  /// The footer's list picker: move this task to another list. On success the
  /// shell re-points at the new list.
  const moveList = (to) =>
    to && to !== saver.target()?.list
      ? onTask(async (task) => {
          await api.moveTask(task.list, task.id, to);
          onMoved?.(to);
        })
      : undefined;

  /// The ⋮ menu's "Duplicate task": the core drops a copy right after it. The
  /// panel stays on the original; the copy shows up when the list reloads.
  const duplicate = () => onTask((task) => api.duplicateTask(task.list, task.id));

  /// How old the open task is, stamped by the core on the listing this panel
  /// was opened from (`core/age.rs`). Behind the time axis's own switch, and
  /// absent on a task written outside the app with no date in it.
  let age = $derived(f("time") && task?.created ? (task.age ?? null) : null);

  // The ⋮ menu items.
  let optionsMenu = $derived([
    { label: S.duplicateTask, run: duplicate, disabled: readOnly },
  ]);

  /// The fields Settings › Tasks could switch on, and whether to say so:
  /// only while there is one, and only where "Not now" can be written.
  let offFields = $derived(childrenIn("tasks", "fields").filter((field) => !f(field.key)));
  let offering = $derived(offerFields && !readOnly && offFields.length > 0);

  /// "Not now" is written to the notebook, so it is asked once — and the
  /// Settings row is the way back (an option that only switches off is a
  /// defect).
  const dismissOffer = () =>
    api
      .setNotebookSettings({ offerTaskFields: false })
      .then(() => onSaved?.())
      .catch(onError);

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

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<aside class="inspector" onkeydown={onKeydown}>
  <!-- Toolbar: fold the panel away, send to My Day, task options (`optionsMenu`);
       the trash lives in the footer. -->
  <div class="inspector__toolbar theme-pane-head">
    <!-- The sheet has NO close button: in the compact shell it is dismissed by
         tapping the page behind it or pulling it down by its handle
         (BottomSheet); on the desktop the sidebar glyph folds the column away.
         The sun and the ⋮ take an end each, with the gap BETWEEN them. -->
    {#if !compact}
      <button
        class="theme-btn theme-btn--icon"
        onclick={() => onClose?.()}
        aria-label={S.collapsePanel}
        title={S.collapsePanel}
      >
        <Icon name="sidebar-simple" size="1.125rem" />
      </button>
      <span class="inspector__gap"></span>
    {/if}
    {#if f("homeSpace")}
    <button
      class="theme-btn theme-btn--icon inspector__myday"
      class:inspector__myday--on={inDay}
      onclick={myDay}
      disabled={readOnly}
      aria-label={inDay ? S.removeFromDay : S.myDay}
      title={inDay ? S.removeFromDay : S.myDay}
    >
      <!-- The glyph says what the click DOES: sun to bring it into the day,
           struck sun to take it out. -->
      <Icon name={inDay ? "sun-off" : "sun"} size="1.125rem" />
    </button>
    {/if}
    {#if compact}<span class="inspector__gap"></span>{/if}
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
    <!-- Task header: complete, name, and the chevron that folds the subtasks. -->
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
    <!-- Subtasks. The header's chevron folds ONLY this block. Drag by the grip
         to reorder (`reorderable`); the add-form is excluded from the item set
         so it never counts as a slot. -->
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

    <!-- Tags: neutral `#tag` badges (a tag is a subject, not a colour), plus a
         picker that adds an existing tag or creates one — never free text, so
         the catalogue and the card stay in step. -->
    <div class="inspector__tags">
      {#each draft.tags as tag (tag)}
        <span class="theme-badge inspector__tag" style={badgeStyle(color)}>
          #{tag}
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
          <span class="inspector__field-word">{S.completeDateLabel}</span>
        </span>
        <span class="inspector__field-value">
          <!-- Our own calendar, not the native picker: closes on an outside click
               or Escape, pages months without dismissing, sets a whole date only. -->
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
      <div class="inspector__field" class:inspector__field--unset={!draft.priority}>
        <span class="inspector__field-label inspector__field-label--{priorityClass(draft.priority)}">
          <Icon name="flag" size="1rem" />
          <span class="inspector__field-word">{S.priorityLabel}</span>
        </span>
        <!-- The values are the file's own (services/taskFields.js): the draft
             holds the control's string, `fields()` turns it into the number. -->
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

      {#if f("repeat")}
      <div class="inspector__field" class:inspector__field--unset={!draft.repeatUnit}>
        <span class="inspector__field-label">
          <Icon name="arrow-clockwise" size="1rem" />
          <span class="inspector__field-word">{S.repeatLabel}</span>
        </span>
        <span class="inspector__stepper">
          {#if repeatCounted(draft.repeatUnit)}
            <!-- Chosen, never typed — the same list as the composer's, so the two
                 cannot disagree about what "every N" may be. -->
            <select
              class="theme-select theme-select--bare inspector__repeat-every"
              bind:value={draft.repeatEvery}
              disabled={readOnly}
              aria-label={S.repeatEvery}
            >
              {#each repeatCounts(draft.repeatEvery) as count (count)}
                <option value={count}>{count}</option>
              {/each}
            </select>
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

      {#if f("remind")}
      <div class="inspector__field" class:inspector__field--unset={!draft.remind}>
        <span class="inspector__field-label">
          <Icon name="alarm" size="1rem" />
          <span class="inspector__field-word">{S.remindLabel}</span>
        </span>
        <span class="inspector__field-value inspector__reminder">
          {#if pickingReminder}
            <DatePicker
              value={splitAt(draft.remind).date}
              {dateFormat}
              label={S.remindDateLabel}
              disabled={readOnly}
              onChange={setReminderDate}
            />
            <input
              class="theme-input theme-input--filled inspector__time"
              type="time"
              value={splitAt(draft.remind).time}
              disabled={readOnly}
              aria-label={S.remindTimeLabel}
              onchange={(e) => setReminderTime(e.currentTarget.value)}
            />
          {:else}
            <Menu items={reminderMenu} align="end">
              {#snippet trigger({ toggle })}
                <button
                  class="theme-input theme-input--filled inspector__reminder-value"
                  type="button"
                  onclick={toggle}
                  disabled={readOnly}
                  aria-label={S.remindLabel}
                >
                  {draft.remind ? formatAt(draft.remind, dateFormat) : S.addReminder}
                </button>
              {/snippet}
            </Menu>
          {/if}
          {#if !readOnly && draft.remind}
            <button
              class="inspector__tag-remove"
              onclick={clearReminder}
              aria-label={S.clearReminder}
              title={S.clearReminderHint}
            >
              <Icon name="x" size="0.625rem" />
            </button>
          {/if}
        </span>
      </div>
      {/if}

    </div>

    {#if f("description") || f("files")}
    <hr class="theme-divider" />

    <!-- Description + attachments. An attachment is a file of the library
         (`assets/`), written as a line of links under the task. -->
    <div class="inspector__description-block">
      {#if f("description")}
        <!-- The plain editor rather than a textarea: the same `[[` language the
             notes speak, so a task can point at the note that explains it. -->
        <div class="inspector__description">
          <Editor
            plain
            value={draft.description}
            {readOnly}
            placeholder={S.descriptionTitle}
            {root}
            onChange={(text) => (draft.description = text)}
            onOpenFile={openFile}
            {onOpenNote}
          />
        </div>
      {/if}
      {#if f("files")}
        <!-- Each attachment is a plain Markdown link in the `.md` (spec 3.2):
             a name, and the file behind it. -->
        {#each draft.files as file (file.address)}
          <div class="inspector__field inspector__file">
            <button
              class="inspector__file-open"
              onclick={() => openFile(file.address)}
              title={S.openFile}
            >
              <Icon name="paperclip" size="1rem" />
              <span class="inspector__file-name">{file.label}</span>
            </button>
            {#if !readOnly}
              <button
                class="theme-btn--icon"
                onclick={() => detach(file.address)}
                aria-label={S.removeAttachment}
                title={S.removeAttachment}
              >
                <Icon name="x" size="0.875rem" />
              </button>
            {/if}
          </div>
        {/each}
        {#if !readOnly}
          <button class="inspector__field inspector__add-file" onclick={() => (picking = true)}>
            <span class="inspector__field-label">
              <Icon name="paperclip" size="1rem" />
              <span class="inspector__field-word">{S.addFilesLabel}</span>
            </span>
          </button>
        {/if}
      {/if}
    </div>
    {/if}

    {#if offering}
      <!-- While a task field is off, the panel says so once, at its end;
           Settings › Tasks is where it is switched on. -->
      <Notice
        tone="info"
        icon="sliders-horizontal"
        title={S.moreFieldsTitle}
        class="inspector__offer"
        stacked
        onDismiss={dismissOffer}
        dismissLabel={S.moreFieldsDismiss}
      >
        <p>{S.moreFieldsBody(offFields.map((field) => field.label()).join(", "))}</p>
        {#snippet actions()}
          <button class="theme-btn theme-btn--primary theme-btn--xs" onclick={onMoreFields}
            >{S.moreFieldsOpen}</button
          >
        {/snippet}
      </Notice>
    {/if}
  </div>

  {#if age}
    <!-- When the task was written (spec 3.6): a fact about the task, not a
         field of it, so it stands apart from the controls, just over the foot.
         The date alone; the warning ink still says "forgotten". -->
    <p
      class="inspector__created"
      class:inspector__created--forgotten={age.band === "forgotten"}
      title={S.createdLabel}
    >
      <Icon name="clock" size="0.75rem" />
      <time datetime={task.created}>{formatDate(task.created, dateFormat)}</time>
    </p>
  {/if}

  <!-- Foot, pinned and always visible: the list the task lives in (change it
       to move the task) and the trash. Shares the pane-foot chrome with the sidebar. -->
  <footer class="inspector__footer theme-pane-foot">
    <!-- A button on its own surface, not a bare select: the footer says the
         list AND is the way to change it. -->
    {#if readOnly || lists.length <= 1}
      <span class="inspector__origin">
        <Icon name="tray" size="1rem" />
        {here}
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
            <span class="inspector__origin-name">{here}</span>
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

<!-- The library, as a question: which file? `position: fixed` over the whole
     viewport (controls/overlays.css), so it opens out of the panel. `imagesOnly`
     is false: a task attaches a PDF as readily as a photo. -->
{#if picking}
  <AssetPicker
    {root}
    {readOnly}
    onPick={attach}
    onClose={() => (picking = false)}
    {onError}
  />
{/if}
