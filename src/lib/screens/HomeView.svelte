<script>
  // Home: the screen of TIME. A week of days across the top, and below it
  // the chosen day — today's tasks and notes, a day ahead's planned tasks,
  // or a day gone by as the log's record (DayRecap). The tasks half IS the
  // tasks screen hosted over a day; which day is chosen is the SHELL's
  // (`day`, `onPickDay`), because on a phone the head sits in the chrome.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { makeScreen } from "../services/act.js";
  import { dotStyle as dotStyleOf } from "../services/accent.js";
  import { formatDayMonth } from "../services/dates.js";
  import { dayKind, dayOfMonth, monthOf, weekdayName } from "../services/calendar.js";
  import TasksSpace from "../spaces/TasksSpace.svelte";
  import DayHead from "../components/DayHead.svelte";
  import DayRecap from "../components/DayRecap.svelte";
  import Menu from "../components/Menu.svelte";
  import ContextMenu from "../components/ContextMenu.svelte";
  import Icon from "../components/Icon.svelte";
  import NoteCard from "../components/NoteCard.svelte";
  import { measured } from "../actions/measure.js";
  import { columnCount, columnLayout } from "../services/noteColumns.js";
  import { quickNoteTarget } from "../services/noteTargets.js";
  import { noteActions, noteCardMenu } from "../services/noteActions.js";
  import { liftSpaceMenu } from "../shell/spaceMenus.js";

  let {
    notesFolder,
    /// The notebook's root, absolute — what an image banner's address resolves
    /// against (services/assets.js).
    root = null,
    quickNoteFolder = null,
    /// The list a task composed here writes to, already resolved
    /// (services/taskTargets.js) — `{list, label, value}` or null for none.
    quickTask = null,
    /// Where a note of the day can be moved, and where the sidebar's + files
    /// one — the fixed space's folders and the user's note spaces
    /// (services/noteTargets.js).
    noteTargets = [],
    /// Every list of the notebook, for the screen and its composer.
    lists = [],
    tags = [],
    completedName = "completed",
    /// Where a task created from Home is written before joining the day.
    inbox = null,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
    /// `(item) => {label, color} | null` — where an item came from, for the
    /// badge a card wears outside its space (services/origin.js).
    origin = null,
    /// The colour of the notes space the cards come from (a name).
    notesColor = null,
    /// `{[spacePath]: colourName}` — what a folded ghost row of a day gone
    /// by is coloured by.
    colors = {},
    /// The notebook's `timelineGhostTasks` / `timelineGhostNotes`, for the same recap.
    ghostTasks = false,
    ghostNotes = false,
    readOnly = false,
    onChanged,
    onError,
    /// `(path, folder, { newTab }) => void` — a card of the day opens the note
    /// it draws, in this tab or beside it (the middle button, and the right
    /// button's one row). A row of the recap opens the same way.
    onOpenNote,
    /// `(path, id) => void` — a task of a day gone by, from the recap.
    onOpenTask,
    onSelectTask,
    /// Asks the shell to open the right panel on the day's suggestions.
    onSuggest,
    selectedTask = null,
    reloadKey = 0,
    dateFormat = "mm/dd/yyyy",
    /// `yyyy-mm-dd`, the notebook's clock.
    today = null,
    /// The notebook's `weekStartsOn`.
    weekStartsOn = "monday",
    /// The chosen day, or null for today — the shell's state.
    day = null,
    /// `(iso | null) => void` — a day was picked (null: back to today).
    onPickDay,
    /// `({done, total} | null) => void` — how the chosen day stands, for the
    /// head the shell draws on a phone.
    onSummary,
    /// The colour of this place, as a NAME (services/accent.js).
    dot = null,
    /// The narrow shell (shell/compact.js). There the head is the shell's
    /// (it sits on the chrome, above this canvas), and this screen draws only
    /// the bar that takes its place once it has scrolled away.
    compact = false,
    /// The + asked for a task: the day's composer bar opens, focused, above
    /// the keyboard. It is the SAME bar the tasks screens carry — the task
    /// lands in the inbox and is pulled into the chosen day.
    composing = false,
    /// The way the bar is put away — its pull-down handle, and a task created
    /// with the keyboard already closed (TaskComposer.svelte).
    onCloseCompose = null,
    /// `(done) => void` — the image picker, for a card's banner.
    onPickImage = null,
  } = $props();

  let selected = $derived(day ?? today ?? "");
  let kind = $derived(dayKind(selected, today));
  let dotStyle = $derived(dotStyleOf(dot));

  /// The tasks block IS the tasks screen hosted over the day — no source
  /// folder of its own, so no arrangement to persist. Named for the day.
  let dayLabel = $derived(formatDayMonth(selected, dateFormat));
  let tasksSource = $derived({
    kind: "tasks",
    folder: null,
    name: kind === "today" ? S.todaysTasks : S.dayTasks(dayLabel),
  });

  /// How the chosen day stands — counted off what the blocks read, never
  /// read a second time. Cleared when the day changes so the head does not
  /// show yesterday's count over today's name for a beat.
  let summary = $state(null);
  $effect(() => {
    selected;
    summary = null;
    onSummary?.(null);
  });
  const counted = (next) => {
    summary = next;
    onSummary?.(next);
  };

  /// `{folder, note}` — the note and the notes SPACE holding it, straight
  /// from the bridge (`ListedNote`). Every action here names that space: the
  /// Home looks into spaces it does not live in, and now into several.
  let notes = $state([]);
  /// Where the sidebar's + files a note. Null until the user picks in the
  /// notes ⋮ — a state seeded from `quickNoteFolder` would freeze at first
  /// render. Resolved against the offered targets, so a stale choice falls back.
  let chosenTarget = $state(null);
  let captureTarget = $derived(
    quickNoteTarget(chosenTarget ?? quickNoteFolder, noteTargets),
  );

  // The masonry, measured — the same two questions the notes board asks
  // (services/noteColumns.js): how many columns fit, and which card goes where.
  let boardWidth = $state(0);
  let columns = $derived(columnCount(boardWidth));
  let board = $derived(columnLayout(notes.length, columns));

  $effect(() => {
    reloadKey;
    kind;
    load();
  });

  const { load, act } = makeScreen({
    // Only today has notes to show on this half: a day gone by reads them
    // from the log (the recap), a day ahead has none yet. EVERY notes space
    // answers — a note written today was written today wherever it was
    // filed — so each row carries the space that holds it.
    read: () => (kind === "today" ? api.notesCreatedToday() : []),
    // `?? []`: the bridge answering with nothing is not a list of notes.
    apply: (read) => (notes = read ?? []),
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });

  /// The + asked for a NOTE: an untitled note in the capture target, opened
  /// with the cursor in the body (`fresh`) — the same door as the board's
  /// quick field and the sidebar's +.
  export function createNote() {
    const target = captureTarget;
    if (!target || readOnly) return;
    act(async () => {
      const path = await api.createNote(target.space, target.folder, S.newNoteTitle);
      onOpenNote?.(path, target.space, { fresh: true });
    });
  }

  /// Home only ever LOOKS at a notes space, so it names the space the ROW
  /// came from rather than letting the shell guess one.
  const openNote = (row, { newTab = false } = {}) =>
    onOpenNote?.(row.note.path, row.folder, { newTab });

  /// What a card of the day offers: the board's rows (services/noteActions.js),
  /// so the same card means the same thing on both screens.
  const cards = noteActions(act);

  /// Where a note of the day can be moved (services/noteTargets.js). One
  /// group, because from here they are one list.
  let moveTargets = $derived(
    noteTargets.length === 0
      ? []
      : [
          {
            label: S.moveTo,
            options: noteTargets.map((target) => ({
              label: target.label,
              value: JSON.stringify([target.space, target.folder]),
            })),
          },
        ],
  );

  const cardMenu = (row, { openInNewTab = null } = {}) =>
    noteCardMenu({
      entry: row.note,
      actions: cards,
      space: row.folder,
      canPin: f("pinNotes"),
      moveTargets,
      readOnly,
      openInNewTab,
      canBanner: f("banners"),
      pickImage: onPickImage,
    });

  /// Where the right button's panel opens is this screen's, the same pact the
  /// board and the sidebar keep: one `ContextMenu` per panel, at the pointer.
  let cardMenuAt = $state(null);
  let cardMenuShown = $state([]);

  function openCardMenu(event, row) {
    event.preventDefault();
    event.stopPropagation();
    cardMenuShown = cardMenu(row, {
      openInNewTab: () => openNote(row, { newTab: true }),
    });
    cardMenuAt = { x: event.clientX, y: event.clientY };
  }

  /// The notes block's ⋮: where a quick note is filed. The rows are the same
  /// targets Settings offers — the fixed space's folders and the user's
  /// note spaces.
  let notesMenu = $derived(
    noteTargets.length === 0
      ? []
      : [
          { label: S.quickNoteTo, disabled: true },
          ...noteTargets.map((target) => ({
            label: target.label,
            checked: captureTarget?.value === target.value,
            run: () => (chosenTarget = target.value),
          })),
        ],
  );

  // Below 768px the notes block's ⋮ joins the top bar's, UNDER the tasks
  // block's (rank 1): the order the two blocks are drawn in. Folded under a
  // row that names it — "to" alone means nothing away from the block.
  const liftNotes = liftSpaceMenu({ rank: 1 });
  let notesLifted = $derived(liftNotes.lifted());
  $effect(() =>
    liftNotes.offer(
      readOnly || notesMenu.length === 0
        ? []
        : [{ label: S.quickNotesGoTo, items: notesMenu.slice(1) }],
    ),
  );

</script>

<div class="home" class:home--compact={compact}>
  {#if !compact}
    <!-- The head scrolls away with the page; the wrapper is what is left of
         the band it carried while pinned — see home.css. -->
    <div class="home__head">
      <DayHead
        {today}
        {day}
        {weekStartsOn}
        {summary}
        {dot}
        onPick={(iso) => onPickDay?.(iso)}
        onHome={() => onPickDay?.(null)}
      />
    </div>
  {/if}

  {#if !f("tasks")}
    <!-- With tasks off the Home is the notes written today, and nothing of
         the day's tasks — the calendar still turns, since notes have a day. -->
  {:else if kind === "past"}
    <!-- A day gone by is a record: the log's three lines, read. -->
    <section class="home__block home__block--recap">
      <header class="home__block-header">
        <span class="theme-mirror home__mirror" aria-hidden="true">
          <span class="theme-btn--icon">
            <Icon name="dots-three-vertical" size="1rem" />
          </span>
        </span>
        <h2 class="theme-title home__block-title">{S.dayTasks(dayLabel)}</h2>
        <span class="theme-mirror home__mirror" aria-hidden="true">
          <span class="theme-btn--icon">
            <Icon name="dots-three-vertical" size="1rem" />
          </span>
        </span>
      </header>
      <DayRecap
        day={selected}
        {readOnly}
        {origin}
        {colors}
        {ghostTasks}
        {ghostNotes}
        {onOpenTask}
        onOpenNote={(inside, space) => onOpenNote?.(inside, space, {})}
        onLoaded={(counts) => counted(counts)}
        {reloadKey}
        {onChanged}
        {onError}
      />
    </section>
  {:else}
    <!-- The tasks half IS the day: today, or the one ahead the calendar has
         open. -->
    <section class="home__block">
      <TasksSpace
        source={tasksSource}
        day={kind === "today" ? null : selected}
        {origin}
        align="center"
        compose={composing ? "bar" : "none"}
        composeAutofocus={composing}
        composeDismiss={onCloseCompose}
        {lists}
        {tags}
        {completedName}
        defaultList={quickTask?.list ?? inbox}
        {today}
        {dateFormat}
        {readOnly}
        {reloadKey}
        {selectedTask}
        {onSelectTask}
        {onSuggest}
        onLoaded={({ open, done }) => counted({ done, total: open + done })}
        {f}
        {onChanged}
        {onError}
      />
    </section>

  {/if}

  {#if kind === "today" && f("notes")}
    {#if f("tasks")}
      <div class="home__divider"><hr /></div>
    {/if}

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
          {#if !readOnly && notesMenu.length > 0 && !notesLifted}
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
          {:else}
            <span class="theme-mirror home__mirror" aria-hidden="true">
              <span class="theme-btn--icon">
                <Icon name="dots-three-vertical" size="1rem" />
              </span>
            </span>
          {/if}
        </header>

        {#if notes.length === 0}
          <p class="theme-empty-card home__empty">{S.noNotesToday}</p>
        {:else}
          <!-- The board's card, drawn by the board's own component, with the
               card's own actions. -->
          <ul
            class="theme-note-board home__notes"
            style="--columns: {columns}"
            use:measured={(width) => (boardWidth = width)}
          >
            <!-- Keyed by SPACE and address: two spaces may hold the same
                 `Inbox/Ideia.md`, and the day shows both. -->
            {#each board.order as index (`${notes[index].folder}/${notes[index].note.path}`)}
              {@const row = notes[index]}
              <li
                class="home__note"
                class:theme-note-board__break={board.breaks.has(index)}
              >
                <NoteCard
                  entry={row.note}
                  {root}
                  banners={f("banners")}
                  noteTags={f("noteTags")}
                  tagColor={colors[row.folder] ?? notesColor}
                  origin={origin?.({ kind: "note", folder: row.folder, path: row.note.path })}
                  showAge={f("time")}
                  {dateFormat}
                  menu={cardMenu(row)}
                  onPin={readOnly || !f("pinNotes") ? null : () => cards.pin(row.folder, row.note)}
                  onOpen={(_, opts) => openNote(row, opts)}
                  onContextMenu={(event) => openCardMenu(event, row)}
                />
              </li>
            {/each}
          </ul>
        {/if}
      </section>
  {/if}
</div>

<!-- The right button over a card of the day: the ⋮'s rows, plus opening in a
     new tab — the one row that is not a write, so a read-only notebook keeps
     it (services/noteActions.js). -->
<ContextMenu at={cardMenuAt} items={cardMenuShown} onClose={() => (cardMenuAt = null)} />
