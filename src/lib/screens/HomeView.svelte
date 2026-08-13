<script>
  // Home: the day. A capture box on top, today's tasks under it, today's notes
  // below — the wireframe's opening screen ("Home screen - default", 2026-08-13).
  //
  // It owns almost nothing. Since 2026-08-06 the tasks half is not even its own
  // markup: it is THE tasks widget, hosted over the day (`period: "day"`), so
  // Home shows exactly what a workspace shows — same cards, same "Completed N"
  // — plus the Suggestions pill the widget adds when its source is a period.
  // The home-grown block it had before was a partial copy, and it kept falling
  // behind.
  //
  // What CHANGED with the new layout: Home no longer offers two ways to write.
  // The tasks block's blue "New task" and the notes block's quick textarea both
  // went into one CaptureBox at the top, which asks once and routes by its
  // Task/Note segment. Both block headings are centred with their ⋮ at the far
  // right, so the two halves read as the same kind of thing.
  //
  // The notes are still a view of the notes inbox filtered by `created`
  // (spec 5), so nothing is moved when the day turns.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { makeAct } from "../services/act.js";
  import { composeTask } from "../services/taskCompose.js";
  import TasksWidget from "../widgets/TasksWidget.svelte";
  import CaptureBox from "../components/CaptureBox.svelte";
  import Menu from "../components/Menu.svelte";
  import Icon from "../components/Icon.svelte";

  let {
    notesFolder,
    notesInbox = "Inbox",
    quickNoteFolder = null,
    folders = [],
    /// Every list of the notebook, for the widget and its composer.
    lists = [],
    tags = [],
    completedName = "completed",
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
    /// The day, already formatted for reading — the capture box shows it.
    todayLabel = "",
  } = $props();

  // The tasks block IS the tasks screen hosted over the day — no source
  // folder of its own, so no arrangement to persist.
  const DAY_WIDGET = { kind: "tasks", folder: null, name: S.todaysTasks };

  let notes = $state([]);
  /// Where the capture box's notes land. Null until the user picks it in the
  /// notes ⋮: the destination comes from the notebook's `quickNoteFolder`, and
  /// a state seeded from the prop would freeze on whatever it was at first
  /// render.
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

  /// The capture box's one output. A note is written where the notes ⋮ points;
  /// a task goes to the notebook's inbox AND is pulled into the day, because a
  /// task captured from the day's screen that did not appear on it would read
  /// as the box having swallowed it (the same call the widget's own composer
  /// makes — services/taskCompose.js).
  const capture = ({ kind, text }) =>
    act(async () => {
      if (kind === "note") {
        await api.quickCaptureNote(notesFolder, captureTo, text);
        return;
      }
      await composeTask({ text, list: inbox }, { period: "day" });
    });

  /// The notes block's ⋮: where a captured note is filed. It was a select
  /// living inside the old quick-note form; with the form gone it belongs
  /// with the block it describes.
  let notesMenu = $derived(
    (folders ?? []).length === 0
      ? []
      : [
          { label: S.quickNoteTo, disabled: true },
          ...[notesInbox, ...folders.filter((name) => name !== notesInbox)].map((name) => ({
            label: name,
            checked: captureTo === name,
            run: () => (chosenFolder = name),
          })),
        ],
  );
</script>

<div class="home">
  {#if !readOnly && (f("myDay") || f("notes"))}
    <CaptureBox
      date={todayLabel}
      canTask={f("myDay") && !!inbox}
      canNote={f("notes") && !!notesFolder}
      onSubmit={capture}
    />
  {/if}

  <!-- The tasks half IS the day, so it goes with My Day (user call,
       2026-08-06) — there is no day left to show. -->
  {#if f("myDay")}
    <section class="home__block">
      <TasksWidget
        widget={DAY_WIDGET}
        period="day"
        align="center"
        compose="none"
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
        <!-- The mirrored ⋮ that balances the real one, so the heading is
             centred on the panel and not on what is left of the row — the same
             trick the tasks block uses (widgets/TasksWidget.svelte). -->
        <span class="home__mirror" aria-hidden="true">
          <span class="theme-btn--icon">
            <Icon name="dots-three-vertical" size="1rem" />
          </span>
        </span>
        <h2 class="theme-title home__block-title">{S.todaysNotes}</h2>
        {#if !readOnly && notesFolder && notesMenu.length > 0}
          <Menu items={notesMenu}>
            {#snippet trigger({ toggle })}
              <button
                class="theme-btn--icon"
                onclick={toggle}
                aria-label={S.notesOptions}
                title={S.notesOptions}
              >
                <Icon name="dots-three-vertical" size="1rem" />
              </button>
            {/snippet}
          </Menu>
        {/if}
      </header>

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
