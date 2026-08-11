<script>
  // Home: the day. Today's tasks on top, today's notes below, with a quick
  // capture box between them — the wireframe's opening screen.
  //
  // It owns nothing. Since 2026-08-06 the tasks half is not even its own
  // markup: it is THE tasks widget, hosted over the day (`period: "day"`), so
  // Home shows exactly what a workspace shows — same header, same blue New
  // task, same cards, same "Completed N" — plus the Suggestions pill the
  // widget adds when its source is a period. The home-grown block it had
  // before was a partial copy, and it kept falling behind.
  //
  // The notes are still a view of the notes inbox filtered by `created`
  // (spec 5), so nothing is moved when the day turns.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { makeAct } from "../services/act.js";
  import TasksWidget from "../widgets/TasksWidget.svelte";
  import Icon from "../components/Icon.svelte";

  let {
    notesFolder,
    notesInbox = "Inbox",
    quickNoteFolder = null,
    folders = [],
    /// Every list of the notebook, for the widget and its composer.
    lists = [],
    tags = [],
    completedName = "Completed",
    /// Where a task created from Home is written before joining the day.
    inbox = null,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
    readOnly = false,
    onChanged,
    onError,
    onOpenNote,
    onSelectTask,
    /// Asks the shell to open the right panel on the day's suggestions.
    onSuggest,
    selectedTask = null,
    reloadKey = 0,
    dateFormat = "mm/dd/yyyy",
    today = null,
  } = $props();

  // The tasks block IS the tasks screen hosted over the day — no source
  // folder of its own, so no arrangement to persist.
  const DAY_WIDGET = { kind: "tasks", folder: null, name: S.todaysTasks };

  let notes = $state([]);
  let capture = $state("");
  /// Null until the user picks it here: the destination comes from the
  /// notebook's `quickNoteFolder`, and a state seeded from the prop would
  /// freeze on whatever it was at first render.
  let chosenFolder = $state(null);
  let captureTo = $derived(chosenFolder ?? quickNoteFolder ?? notesInbox);

  $effect(() => {
    reloadKey;
    notesFolder;
    load();
  });

  async function load() {
    try {
      notes = notesFolder ? await api.notesCreatedToday(notesFolder) : [];
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

  const save = () =>
    act(async () => {
      const text = capture.trim();
      if (!text) return;
      capture = "";
      await api.quickCaptureNote(notesFolder, captureTo, text);
    });

  let captureEl = $state();
</script>

<div class="home">
  <!-- The tasks half IS the day, so it goes with My Day (user call,
       2026-08-06) — there is no day left to show. -->
  {#if f("myDay")}
    <section class="home__block">
      <TasksWidget
        widget={DAY_WIDGET}
        period="day"
        {lists}
        {tags}
        {completedName}
        defaultList={inbox}
        {today}
        {dateFormat}
        {readOnly}
        {reloadKey}
        {selectedTask}
        {onSelectTask}
        {onSuggest}
        {f}
        {onChanged}
        {onError}
      />
    </section>
  {/if}

  {#if f("myDay") && f("notes")}
    <div class="home__divider"><hr /></div>
  {/if}

  {#if f("notes")}
  <section class="home__block">
    <header class="home__block-header">
      <h2 class="theme-title home__block-title">{S.todaysNotes}</h2>
      {#if !readOnly && notesFolder}
        <button
          class="theme-btn theme-btn--primary home__new"
          onclick={() => captureEl?.focus()}
        >
          <span>{S.newNoteAction}</span>
          <Icon name="plus-bold" size="1rem" />
        </button>
      {/if}
    </header>

    {#if !readOnly && notesFolder}
      <form class="home__capture" onsubmit={(e) => (e.preventDefault(), save())}>
        <textarea
          bind:this={captureEl}
          class="theme-textarea home__capture-input"
          rows="2"
          placeholder={S.quickNote}
          aria-label={S.quickNote}
          bind:value={capture}
          onkeydown={(e) => {
            // Enter saves, Shift+Enter is a new line: a quick note is usually
            // one line, and reaching for a button breaks the flow.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
        ></textarea>
        <label class="home__capture-label">
          {S.quickNoteTo}
          <select
            class="theme-select theme-select--sm home__capture-select"
            value={captureTo}
            onchange={(e) => (chosenFolder = e.currentTarget.value)}
            aria-label={S.quickNoteTo}
          >
            <option value={notesInbox}>{notesInbox}</option>
            {#each folders.filter((f) => f !== notesInbox) as name (name)}
              <option value={name}>{name}</option>
            {/each}
          </select>
        </label>
      </form>
    {/if}

    {#if notes.length === 0}
      <p class="theme-empty-card home__empty">{S.noNotesToday}</p>
    {:else}
      <div class="home__notes">
        {#each notes as note (note.path)}
          <button class="home__note" onclick={() => onOpenNote?.(note.path)}>
            <span class="home__note-head">
              <span class="home__note-title">{note.title}</span>
              <Icon name="dots-three" size="1rem" />
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </section>
  {/if}
</div>
