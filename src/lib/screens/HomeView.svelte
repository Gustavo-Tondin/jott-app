<script>
  // Home: the day. A capture box on top, today's tasks under it, today's notes
  // below — the wireframe's opening screen ("Home screen - default", 2026-08-13).
  //
  // It owns almost nothing. Since 2026-08-06 the tasks half is not even its own
  // markup: it is THE tasks screen, hosted over the day (`period: "day"`), so
  // Home shows exactly what a space shows — same cards, same "Completed N"
  // — plus the Suggestions pill it adds when its source is a period.
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
  //
  // And since 2026-08-19 they are drawn by the SAME card the notes board draws
  // — banner, title on its chip, first lines — in the same measured masonry
  // (services/noteColumns.js). Home had a card of its own, a title on a step
  // of surface, which is what it looked like before a note had a banner at
  // all: two drawings of one thing, and the day's half of Home kept falling
  // behind the other. Only the drawing is shared — there is no arrangement to
  // drag here, because what is on this screen is a QUESTION (what did I write
  // today?) and not a place with an order of its own.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { makeScreen } from "../services/act.js";
  import { composeTask } from "../services/taskCompose.js";
  import TasksSpace from "../spaces/TasksSpace.svelte";
  import CaptureBox from "../components/CaptureBox.svelte";
  import Menu from "../components/Menu.svelte";
  import ContextMenu from "../components/ContextMenu.svelte";
  import Icon from "../components/Icon.svelte";
  import NoteCard from "../components/NoteCard.svelte";
  import { measured } from "../actions/measure.js";
  import { columnBreaks, columnCount, weightOfNote } from "../services/noteColumns.js";

  let {
    notesFolder,
    notesInbox = "Inbox",
    /// The notebook's root, absolute — what an image banner's address resolves
    /// against (services/assets.js).
    root = null,
    quickNoteFolder = null,
    folders = [],
    /// Every list of the notebook, for the screen and its composer.
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
    /// `(path, folder, { newTab }) => void` — a card of the day opens the note
    /// it draws, in this tab or beside it (the middle button, and the right
    /// button's one row).
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
    /// The colour of this place, as a NAME (services/accent.js) — the capture
    /// card draws the same dot the compact header does beside its title.
    dot = null,
    /// The narrow shell (shell/compact.js). There the capture box is not a
    /// fixture at the top of the screen: it opens from the header's +, because
    /// 112px of permanent composer is most of what a phone can show at once.
    compact = false,
    /// The header's + asked for a task (mobile wireframe "New task"): the
    /// day's own composer bar opens, focused, and rides above the keyboard.
    /// It is the SAME bar the tasks screens carry — nothing new is built for
    /// the phone, and a task captured here still lands in the inbox and gets
    /// pulled into the day.
    composing = false,
    /// The way the bar is put away — its pull-down handle, and a task created
    /// with the keyboard already closed (TaskComposer.svelte, 2026-08-24).
    onCloseCompose = null,
  } = $props();

  // The tasks block IS the tasks screen hosted over the day — no source
  // folder of its own, so no arrangement to persist.
  const DAY_SOURCE = { kind: "tasks", folder: null, name: S.todaysTasks };

  let notes = $state([]);
  /// Where the capture box's notes land. Null until the user picks it in the
  /// notes ⋮: the destination comes from the notebook's `quickNoteFolder`, and
  /// a state seeded from the prop would freeze on whatever it was at first
  /// render.
  let chosenFolder = $state(null);
  let captureTo = $derived(chosenFolder ?? quickNoteFolder ?? notesInbox);

  // The masonry, measured — the same two questions the notes board asks
  // (services/noteColumns.js): how many columns fit, and where to cut them.
  // Left to `column-fill: balance` the browser empties one whenever the cards
  // are few and one of them is long, which is the layout Home would show most
  // days.
  let boardWidth = $state(0);
  let columns = $derived(columnCount(boardWidth));
  let breaks = $derived(columnBreaks(notes.map(weightOfNote), columns));

  $effect(() => {
    reloadKey;
    notesFolder;
    load();
  });

  const { load, act } = makeScreen({
    read: () => (notesFolder ? api.notesCreatedToday(notesFolder) : []),
    // `?? []`: the bridge answering with nothing is not a list of notes.
    apply: (read) => (notes = read ?? []),
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });

  /// The capture box's one output. A note is written where the notes ⋮ points;
  /// a task goes to the notebook's inbox AND is pulled into the day, because a
  /// task captured from the day's screen that did not appear on it would read
  /// as the box having swallowed it (the same call the screen's own composer
  /// makes — services/taskCompose.js).
  const capture = ({ kind, text }) =>
    act(async () => {
      if (kind === "note") {
        await api.quickCaptureNote(notesFolder, captureTo, text);
        return;
      }
      await composeTask({ text, list: inbox }, { period: "day" });
    });

  /// Going to a note of the day. Home only ever LOOKS at the notes space, so
  /// it names the space it was given rather than letting the shell guess one
  /// — the address is the whole answer either way.
  const openNote = (note, { newTab = false } = {}) =>
    onOpenNote?.(note.path, notesFolder, { newTab });

  /// The right button on a card. Only the one row: what a note IS belongs
  /// where the note lives, and Home is the day looking in (the same reason
  /// these cards carry no ⋮ and no pin). Where it opens is this screen's, the
  /// same pact the board and the sidebar keep.
  let cardMenuAt = $state(null);
  let cardMenuFor = $state(null);

  function openCardMenu(event, note) {
    event.preventDefault();
    event.stopPropagation();
    cardMenuFor = note;
    cardMenuAt = { x: event.clientX, y: event.clientY };
  }

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
  <!-- A quick note can only land inside the fixed Notes space, so with that
       space hidden (Fixed spaces, 2026-08-24) the note half of the capture
       goes too — writing into a place with no door would lose the note. -->
  {#if !readOnly && !compact && (f("myDay") || (f("notes") && f("notesSpace")))}
    <CaptureBox
      date={todayLabel}
      {dot}
      canTask={f("myDay") && !!inbox}
      canNote={f("notes") && f("notesSpace") && !!notesFolder}
      onSubmit={capture}
    />
  {/if}


  <!-- The tasks half IS the day, so it goes with My Day (user call,
       2026-08-06) — there is no day left to show. -->
  {#if f("myDay")}
    <section class="home__block">
      <TasksSpace
        source={DAY_SOURCE}
        period="day"
        align="center"
        compose={composing ? "bar" : "none"}
        composeAutofocus={composing}
        composeDismiss={onCloseCompose}
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
             trick the tasks block uses (spaces/TasksSpace.svelte). -->
        <span class="theme-mirror home__mirror" aria-hidden="true">
          <span class="theme-btn--icon">
            <Icon name="dots-three-vertical" size="1rem" />
          </span>
        </span>
        <h2 class="theme-title home__block-title">{S.todaysNotes}</h2>
        {#if !readOnly && notesFolder && f("notesSpace") && notesMenu.length > 0}
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
        <!-- The board's card, drawn by the board's own component. No ⋮ and no
             pin: what a note IS lives where the note lives, and Home is the
             day looking in. -->
        <ul
          class="theme-note-board home__notes"
          style="--columns: {columns}"
          use:measured={(width) => (boardWidth = width)}
        >
          {#each notes as note, index (note.path)}
            <li
              class="home__note"
              class:theme-note-board__break={breaks.has(index)}
            >
              <NoteCard
                entry={note}
                {root}
                banners={f("banners")}
                onOpen={(_, opts) => openNote(note, opts)}
                onContextMenu={openCardMenu}
              />
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<!-- The one row the right button offers over a card of the day. -->
<ContextMenu
  at={cardMenuAt}
  items={cardMenuFor
    ? [
        {
          label: S.openInNewTabItem,
          run: () => openNote(cardMenuFor, { newTab: true }),
        },
      ]
    : []}
  onClose={() => (cardMenuAt = null)}
/>
