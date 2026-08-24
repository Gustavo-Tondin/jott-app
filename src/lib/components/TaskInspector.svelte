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
    repeatCounts,
    repeatText,
  } from "../services/taskFields.js";
  import { tagColors as tagColorMap } from "../services/accent.js";
  import { movedItem } from "../services/spaceOrder.js";
  import { reorderable } from "../actions/reorder.js";
  import Menu from "./Menu.svelte";
  import Icon from "./Icon.svelte";
  import DatePicker from "./DatePicker.svelte";
  import AssetPicker from "./AssetPicker.svelte";
  import TagPicker from "./TagPicker.svelte";
  import Editor from "./Editor.svelte";

  let {
    task,
    list,
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
    // How long to wait after the last keystroke. A prop so tests can drop it
    // to zero instead of sleeping — a real user never sets this.
    saveDelay = 500,
    // How the due date is drawn (the notebook's display format).
    dateFormat = "mm/dd/yyyy",
    /// This task is pulled into the Day: the sun lights up, and pressing it
    /// takes it back out. A lit button that does nothing when pressed is a
    /// button that reads as broken (user call, 2026-08-06).
    inDay = false,
    /// The notebook's root, absolute — the file picker draws thumbnails of
    /// what it can draw, and an address resolves against it
    /// (services/assets.js).
    root = null,
    /// `(key) => boolean` — is this part of the app switched on? A field
    /// switched off leaves the PANEL only: the draft still carries it and
    /// `set_task_fields` still writes it back, so nothing is lost while it is
    /// away (2026-08-06).
    f = () => true,
    /// `(title) => void` — a `[[note]]` in the description was clicked.
    /// Resolving a title to a note is a question about the whole notebook,
    /// so the shell answers it — the same door the note editor knocks on.
    onOpenNote,
  } = $props();

  let draft = $state(fromTask(null));
  let newSubtask = $state("");
  // The ⌄ chevron folds the SUBTASKS away (only them — the fields stay,
  // user call 2026-08-04). Local to the panel; it writes nothing.
  let collapsed = $state(false);

  // The debounced write with a captured target — the shared engine
  // (services/autosave.js carries the why of each rule). The delay is
  // captured once on purpose: it is a mount-time knob for tests, never
  // changed while the panel lives.
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

  // A different task selected means a different draft. Without this, editing
  // one task and clicking another would show the first one's typing.
  // The panel's own Ctrl+Z (2026-08-24): the fields of THIS task, one step
  // back per edit, apart from the note's history and the app's
  // (services/draftHistory.js says why there are three). It follows the
  // task, not the object: the shell hands a fresh `task` after every save,
  // and that is the same task catching up, not a new one to forget for.
  const history = draftHistory();
  let openKey = null;

  $effect(() => {
    task;
    list;
    // Stringify the plain object before it becomes the reactive draft.
    // Reading `draft` here would make this effect depend on the state it
    // assigns, and Svelte would loop until it gave up.
    const fresh = fromTask(task);
    const snapshot = JSON.stringify(fresh);
    // `open` flushes what was typed into the previous task first, addressed
    // to that task, before the slot is replaced.
    saver.open({ list, task, id: task?.id ?? null }, snapshot);
    // A task without an id earns one on its first save; the target carries
    // it before the next `task` does. Two id-less tasks are told apart by
    // their text, which is all an id-less task has.
    const id = task?.id ?? saver.target()?.id ?? null;
    const key = `${list}|${id ?? ""}|${id ? "" : (task?.text ?? "")}`;
    if (key === openKey) history.settle(snapshot);
    else history.reset(snapshot);
    openKey = key;
    draft = fresh;
    newSubtask = "";
  });

  // The auto-save itself. Stringifying the draft subscribes to every field in
  // it; the dirty check is what tells a real edit apart from the effect above
  // having just reloaded the same values.
  $effect(() => {
    const snapshot = JSON.stringify(draft);
    history.push(snapshot, changedField(history.current(), snapshot));
    if (readOnly || !saver.dirty(snapshot)) return;
    saver.edit(fields(), snapshot);
  });

  /// The panel answers Ctrl+Z / Ctrl+Shift+Z for its own fields — with the
  /// user's chords for `app.undo`/`app.redo`, so a rebinding follows. The
  /// description is a CodeMirror with a history of its own, and a press in
  /// there is its. Answering (`preventDefault`) even with nothing to step
  /// back keeps the panel's key from reaching the shell as an app undo: a
  /// hand that is in the panel means the panel.
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
      // As the STRING the shared table offers (services/taskFields.js) — a
      // `<select>` compares its options by string, so a numeric draft would
      // never match its own value and the row would show blank on a task that
      // has a priority. `fields()` sends the number.
      priority: t?.priority ? String(t.priority) : "",
      tags: [...(t?.tags ?? [])],
      description: (t?.description ?? []).join("\n"),
      repeatEvery: t?.repeat?.every ?? 1,
      repeatUnit: t?.repeat?.unit ?? "",
      files: (t?.files ?? []).map((f) => ({ ...f })),
      subtasks: (t?.subtasks ?? []).map((s) => ({ ...s })),
    };
  }

  // ---- attachments (2026-08-18) ----
  // The task points at a file of the notebook's library; the library screen
  // (and the picker) is where the file itself is managed. Attaching the same
  // file twice is a no-op rather than a second chip: the address IS the
  // attachment, and two links to one file say nothing new.
  let picking = $state(false);

  function attach(address) {
    picking = false;
    if (!address || draft.files.some((f) => f.address === address)) return;
    const label = leafOf(address) || address;
    draft.files = [...draft.files, { label, address }];
  }

  const detach = (address) =>
    (draft.files = draft.files.filter((f) => f.address !== address));

  /// Opens it in whatever the system uses for that kind of file. Detaching is
  /// the × beside it; the FILE is only ever deleted from the library screen,
  /// where deleting is about the file and not about this task.
  const openFile = (address) => api.openAsset(address).catch((e) => onError?.(e));

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
    draft.subtasks = movedItem(draft.subtasks, from, to);
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
    to && to !== saver.target()?.list
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

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<aside class="inspector" onkeydown={onKeydown}>
  <!-- Toolbar: fold the panel away, send to My Day, task options. Icon buttons
       are the shared `.theme-btn--icon`. The options ⋮ carries `optionsMenu`
       above (duplicate, for now); the trash lives in the footer. -->
  <div class="inspector__toolbar theme-pane-head">
    <!-- THE SHEET HAS NO CLOSE BUTTON (user call, 2026-08-18). On the desktop
         the panel is a column that folds away to the side, and the sidebar
         glyph draws exactly that. In the compact shell it is a sheet, and a
         sheet is already dismissed two ways that cost no room — tapping the
         page behind it, and pulling it down by its handle (BottomSheet) — so
         an × here only spends the corner the sun wants.

         What is left then is the sun and the ⋮, and they take an end each:
         the gap moves BETWEEN them rather than sitting ahead of both. -->
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
    {#if f("myDay")}
    <button
      class="theme-btn theme-btn--icon inspector__myday"
      class:inspector__myday--on={inDay}
      onclick={myDay}
      disabled={readOnly}
      aria-label={inDay ? S.removeFromDay : S.myDay}
      title={inDay ? S.removeFromDay : S.myDay}
    >
      <!-- The glyph says what the click DOES: the sun to bring it into the
           day, the struck sun to take it out (2026-08-24). -->
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

      {#if f("repeat")}
      <div class="inspector__field" class:inspector__field--unset={!draft.repeatUnit}>
        <span class="inspector__field-label">
          <Icon name="arrow-clockwise" size="1rem" />
          {S.repeatLabel}
        </span>
        <span class="inspector__stepper">
          {#if draft.repeatUnit}
            <!-- Chosen, never typed — the same call as the composer's, and the
                 same list, so the two rows cannot come to disagree about what
                 "every N" may be. -->
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
    </div>

    {#if f("description") || f("files")}
    <hr class="theme-divider" />

    <!-- Description + attachments. An attachment is a file of the library
         (`assets/`), written as a line of links under the task (2026-08-18);
         the picker and the chips below are the whole of its UI. -->
    <div class="inspector__description-block">
      {#if f("description")}
        <!-- The plain editor rather than a textarea (2026-08-19): the same
             `[[` language the notes speak — autocomplete while typing, and a
             reference drawn as the thing it names — so a task can point at
             the note that explains it. -->
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
        <!-- Attachments. Each one is a plain Markdown link in the `.md`
             (spec 3.2), so what is drawn here is what someone reading the file
             in any editor sees — a name, and the file behind it. -->
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
              {S.addFilesLabel}
            </span>
          </button>
        {/if}
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

<!-- The library, as a question: which file? It is `position: fixed` over the
     whole viewport (controls.css), so it opens out of the panel it was asked
     from rather than inside it. `imagesOnly` is false here: a task attaches a
     PDF as readily as a photo (2026-08-18). -->
{#if picking}
  <AssetPicker
    {root}
    {readOnly}
    onPick={attach}
    onClose={() => (picking = false)}
    {onError}
  />
{/if}
