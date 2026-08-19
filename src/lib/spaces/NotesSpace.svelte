<script>
  // The `notes` source: a board of note cards, or a folder tree.
  //
  // Same note in both views — the layout is a preference, never a change to
  // the file (spec 5). Opening a note hands over to the editor; this screen
  // only ever lists.
  //
  // Etapa 1 (2026-08-04): the source owns its arrangement — `sort` + `order`
  // in its `.space.json`, chosen in the ⋮ menu or by dragging a card on the
  // board (the same contract the tasks source keeps).
  //
  // The board redrawn (2026-08-18, wireframes "Notes screen - default",
  // "Space Notes", "Notes Screen - mobile"): a card is its banner, its title on
  // a chip over it and its first lines (components/NoteCard.svelte), and a
  // FOLDER of notes is a card too — a coloured block with the notes it holds
  // drawn small inside. Which is which is `services/noteBoard.js`, so the rule
  // that the inbox is not a folder card is testable without a DOM.
  //
  // The bar above it redrawn (2026-08-19, wireframes "Grid"): the row of
  // buttons is gone and what it did is in two places — the ⋮ (new note, new
  // group, select, sort, layout) and the QUICK NOTE bar, which is the note
  // itself being typed before it exists. A folder card no longer navigates the
  // screen either: it opens over the board, as a popover of its own.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { askConfirm, askName, DELETING } from "../services/dialog.js";
  import { makeAct } from "../services/act.js";
  import { spaceMenu } from "../services/spaceMenu.js";
  import { arrange, pinnedFirst, planReorder } from "../services/spaceOrder.js";
  import { ACCENTS, accentColor, accentStyle } from "../services/accent.js";
  import { board } from "../services/noteBoard.js";
  import { listName } from "../services/paths.js";
  import { reorderable } from "../actions/reorder.js";
  import { measured } from "../actions/measure.js";
  import {
    columnBreaks,
    columnCount,
    weightOfGroup,
    weightOfNote,
  } from "../services/noteColumns.js";
  import { dismissable } from "../actions/dismissable.js";
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import Menu from "../components/Menu.svelte";
  import Icon from "../components/Icon.svelte";
  import NoteCard from "../components/NoteCard.svelte";

  let {
    source,
    readOnly = false,
    notesInbox = "Inbox",
    /// The notebook's root, absolute — an image banner is an address, and this
    /// is what it resolves against (services/assets.js).
    root = null,
    /// Every notes space of the notebook (`{ path, name }`), for "move to".
    /// Empty means the board offers moving inside this space only.
    noteSpaces = [],
    /// Whether the titled row is drawn — the same pact the tasks screen keeps
    /// (spaces/TasksSpace.svelte). The row itself is always there, because the
    /// ⋮ belongs at the top right of every source; `header` only decides
    /// whether the place is NAMED on it. Below 768px it is not: the shell's
    /// header says the name right above (user report, 2026-08-18).
    header = true,
    /// The colour of the PLACE, as a name (services/accent.js) — the dot after
    /// the title. Left `undefined` there is no dot: only a place the user
    /// coloured has one to show.
    dot = undefined,
    onSetSort,
    onSetOrder,
    onChanged,
    onError,
    /// `(path, folder, { fresh })` — `fresh` is a note this screen has just
    /// created empty, so the shell puts the cursor in its body rather than
    /// leaving it in a document nobody has typed into yet.
    onOpenNote,
    reloadKey = 0,
  } = $props();


  // The source's folder is its address for every notes command.
  let folder = $derived(source?.folder ?? null);

  /// What this place is called, and the colour it reads as.
  let title = $derived(source?.name || listName(folder ?? ""));
  let dotStyle = $derived(accentColor(dot) ? `--dot: ${accentColor(dot)}` : "");

  let notes = $state([]);
  let folders = $state([]);
  /// `grid` (cards, Keep-like) or `tree` (by folder).
  ///
  /// The config option picks the starting layout and the user's choice wins
  /// from then on — hence a null-until-chosen override rather than a state
  /// seeded from the prop, which would freeze on the value the source had
  /// when it first rendered.
  let chosenLayout = $state(null);
  let layout = $derived(
    chosenLayout ?? (source?.options?.layout === "tree" ? "tree" : "grid"),
  );
  /// Which folder is being looked at — `null` is the space's own board (its
  /// loose notes and the inbox's). ONE state for both views: "where am I in
  /// the tree" is the same question whether it is asked by a chip or by the
  /// popover a folder card opens.
  let openFolder = $state(null);
  /// Which folder CARD the popover hangs off, on the board. It is not always
  /// `openFolder`: going into a subfolder inside the popover changes what is
  /// shown without moving the panel, which stays anchored to the card that was
  /// clicked. Null closes it.
  let anchorFolder = $state(null);

  $effect(() => {
    folder;
    reloadKey;
    load();
  });

  // Leaving a place leaves its selection behind: the notes that were picked
  // are not on screen any more, and acting on them would act out of sight.
  $effect(() => {
    folder;
    openFolder;
    exitPicking();
  });

  async function load() {
    if (!folder) return;
    try {
      [notes, folders] = await Promise.all([
        api.listNotes(folder, ""),
        api.noteFolders(folder),
      ]);
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

  /// Where a note made right now belongs: the folder being looked at, or the
  /// space's inbox on the board itself (the spec's "loose notes go to
  /// Notes/Inbox").
  let target = $derived(openFolder ?? notesInbox);

  // Naming goes through the app's own dialog — window.prompt is a no-op in
  // WebKitGTK (the widget-creation bug of 2026-07-30).
  const create = () =>
    act(async () => {
      const title = await askName(S.promptNewNote, S.newNoteTitle, {
        confirm: S.create,
      });
      if (!title) return;
      const path = await api.createNote(folder, target, title.trim());
      onOpenNote?.(path, folder);
    });

  const createFolder = () =>
    act(async () => {
      const name = await askName(S.promptNewNoteFolder, "", { confirm: S.create });
      if (!name) return;
      const parent = openFolder ? `${openFolder}/` : "";
      await api.createNoteFolder(folder, `${parent}${name.trim()}`);
    });

  const togglePin = (entry) =>
    act(() => api.setNotePinned(folder, entry.path, !entry.pinned));

  const duplicate = (entry) => act(() => api.duplicateNote(folder, entry.path));

  const deleteNote = (entry) =>
    act(async () => {
      if (!(await askConfirm(S.confirmDeleteNote(entry.title), DELETING))) return;
      await api.deleteNote(folder, entry.path);
    });

  const moveNote = (entry, where) =>
    act(async () => {
      const [space, into] = JSON.parse(where);
      await api.moveNoteToSpace(folder, entry.path, space, into);
    });

  const renameFolder = (path = openFolder) =>
    act(async () => {
      if (!path) return;
      const current = path.split("/").pop();
      const next = await askName(S.promptRenameFolder(current), current);
      if (!next || next.trim() === current) return;
      const moved = await api.renameNoteFolder(folder, path, next.trim());
      // Only the place being LOOKED at follows the rename; renaming a card on
      // the board leaves the board where it is.
      if (openFolder === path) openFolder = moved;
      if (anchorFolder === path) anchorFolder = moved;
    });

  const deleteFolder = (path = openFolder) =>
    act(async () => {
      if (!path) return;
      const name = path.split("/").pop();
      if (!(await askConfirm(S.confirmDeleteFolder(name), DELETING))) return;
      const moved = await api.deleteNoteFolder(folder, path);
      if (anchorFolder === path || openFolder === path) closeGroup();
      if (moved > 0) onError?.({ kind: "info", message: S.folderEmptied(moved, name) });
    });

  // A folder of notes has a colour and a pin of its own since 2026-08-19, and
  // both live in the SPACE's config — a folder is a plain directory and the
  // app writes no marker inside the user's tree (core/src/space.rs).
  const pinFolder = (group) =>
    act(() => api.setNoteFolderPinned(folder, group.path, !group.pinned));

  const colorFolder = (group, color) =>
    act(() => api.setNoteFolderColor(folder, group.path, color || null));

  // ---- the quick note bar (2026-08-19) ----
  //
  // What is typed here is the note's own BODY, not its name: someone jotting
  // something down types the thing, and the app names it (`New note`, and
  // `New note 2` after that — `fsio::free_name`, the same suffix every
  // collision in the notebook takes). Asking for a title first would ask for
  // the one thing the writer does not know yet.
  //
  // Enter files it and leaves the field ready for the next one; Shift+Enter is
  // a new line, which is why this is a textarea. And + on an EMPTY field means
  // the other gesture entirely: make the note and open it, with the cursor in
  // its body — nothing was typed here, so there is nothing to keep the writer
  // in this screen for.
  let draft = $state("");
  let quick = $state(null);

  const quickCreate = () =>
    act(async () => {
      const text = draft;
      const path = await api.createNote(folder, target, S.newNoteTitle);
      if (text.trim()) {
        await api.writeNote(folder, path, text.endsWith("\n") ? text : `${text}\n`);
        draft = "";
        quick?.focus();
      } else {
        onOpenNote?.(path, folder, { fresh: true });
      }
    });

  function quickKey(event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!draft.trim()) return;
    quickCreate();
  }

  // ---- arrangement (Etapa 1) ----
  const accessors = {
    nameOf: (n) => n.title,
    createdOf: (n) => n.created,
    // A note has no completion date; under that sort everything is "missing"
    // and the file order holds — the tolerance arrange() already keeps.
    completedOf: () => undefined,
    keyOf: (n) => n.path,
  };
  let sort = $derived(source?.sort ?? null);

  /// What is at this place: the notes to draw as cards, and the folders to
  /// draw as cards of their own. In the tree view the folder chips already say
  /// where you are, so only the notes of the open folder are drawn.
  let here = $derived(board(notes, folders, "", notesInbox));

  /// The same question asked of the open folder card — what the popover holds.
  let inside = $derived(board(notes, folders, openFolder ?? "", notesInbox));

  /// The folder the popover is SHOWING, as an entry. Not always the card the
  /// panel hangs off: going into a subfolder changes what is shown without
  /// moving the panel, and the ⋮ has to act on what is on screen.
  let openInside = $derived(folders.find((it) => it.path === openFolder) ?? null);

  /// Arranged, with the pinned ones floated to the top: pinning outranks the
  /// sort, exactly as it does on a task list (services/spaceOrder.js).
  const laid = (cards) =>
    pinnedFirst(arrange(cards, sort, source?.order ?? [], accessors));

  let shown = $derived(
    laid(
      layout === "tree" && openFolder !== null
        ? notes.filter((n) => n.folder === openFolder)
        : here.cards,
    ),
  );

  /// Folder cards are the grid's own: the tree view has its chips.
  let groups = $derived(layout === "grid" ? here.groups : []);

  // The same ⋮ every source carries (services/spaceMenu.js), minus the
  // completion date: a note has none, so that sorting would be a dead entry.
  // Creating lives here now: the wireframe's board has a name, a ⋮ and the
  // quick-note bar, and nothing else above the cards.
  let sortMenu = $derived(
    spaceMenu({
      lead: [
        // Creating and picking write; the LAYOUT does not — how the same notes
        // are drawn is a question a read-only notebook answers as happily as
        // any other.
        ...(readOnly
          ? []
          : [
              { label: S.newNote, run: create },
              { label: S.newNoteFolder, run: createFolder },
              { label: S.selectNotes, run: () => (picking = true) },
            ]),
        {
          label: S.layout,
          items: [
            {
              label: S.gridView,
              context: layout === "grid" ? "✓" : undefined,
              run: () => (chosenLayout = "grid"),
            },
            {
              label: S.treeView,
              context: layout === "tree" ? "✓" : undefined,
              run: () => (chosenLayout = "tree"),
            },
          ],
        },
      ],
      sorts: [null, "name", "created", "custom"],
      sort,
      hasOrder: (source?.order ?? []).length > 0,
      onSetSort,
    }),
  );

  /// A folder card's own ⋮ — the same shape a note card's has, because it is
  /// the same gesture on the same board (user call, 2026-08-19). It replaced
  /// the two underlined words that used to hang under the board, which were
  /// reachable only once a folder was already open.
  const groupMenu = (group) =>
    readOnly
      ? []
      : [
          { label: group.pinned ? S.unpin : S.pin, run: () => pinFolder(group) },
          {
            label: S.color,
            items: [
              {
                label: S.defaultAppearance,
                context: group.color ? undefined : "✓",
                run: () => colorFolder(group, null),
              },
              ...ACCENTS.map((name) => ({
                label: S.colorName(name),
                context: group.color === name ? "✓" : undefined,
                run: () => colorFolder(group, name),
              })),
            ],
          },
          { label: S.renameFolder, run: () => renameFolder(group.path) },
          { label: S.deleteFolder, run: () => deleteFolder(group.path) },
        ];

  /// A card's own ⋮. Not built for a read-only notebook: every item writes.
  const cardMenu = (entry) =>
    readOnly
      ? []
      : [
          { label: entry.pinned ? S.unpin : S.pin, run: () => togglePin(entry) },
          {
            label: S.moveTo,
            items: moveTargets.flatMap((group) =>
              group.options.map((option) => ({
                label: option.label,
                context: group.label,
                run: () => moveNote(entry, option.value),
              })),
            ),
          },
          { label: S.duplicateNote, run: () => duplicate(entry) },
          { label: S.deleteNote, run: () => deleteNote(entry) },
        ];

  // ---- bulk selection (the ⋮'s "Select notes…") ----
  // Picked notes are held by ADDRESS, not by object identity: unlike a task,
  // a note has a stable one, and every bulk action names it.
  let picking = $state(false);
  let picked = $state(new Set());

  const togglePick = (entry) => {
    const next = new Set(picked);
    if (!next.delete(entry.path)) next.add(entry.path);
    picked = next;
  };
  function exitPicking() {
    picking = false;
    picked = new Set();
  }

  function closeGroup() {
    openFolder = null;
    anchorFolder = null;
  }

  /// Where picked notes can go: any folder of this space, and every other
  /// notes space of the notebook. A space's own folders are known here; another
  /// space's are not, so it is offered as itself — its inbox is where a note
  /// filed into it belongs anyway.
  let moveTargets = $derived([
    {
      label: title,
      options: [
        { value: JSON.stringify([folder, ""]), label: S.allNotes },
        ...folders.map((it) => ({
          value: JSON.stringify([folder, it.path]),
          label: it.path,
        })),
      ],
    },
    ...noteSpaces
      .filter((sp) => sp.path !== folder)
      .map((sp) => ({
        label: sp.name,
        options: [{ value: JSON.stringify([sp.path, notesInbox]), label: sp.name }],
      })),
  ]);

  const moveSelected = (target) =>
    act(async () => {
      if (!target || picked.size === 0) return;
      const [space, into] = JSON.parse(target);
      for (const path of picked) {
        await api.moveNoteToSpace(folder, path, space, into);
      }
      exitPicking();
    });

  const deleteSelected = () =>
    act(async () => {
      if (picked.size === 0) return;
      for (const path of picked) await api.deleteNote(folder, path);
      exitPicking();
    });

  // ---- the masonry (2026-08-19) ----
  //
  // The board measures itself and decides its own column count, then tells the
  // browser where to cut. Leaving both to `column-fill: balance` is what left a
  // whole column empty whenever the cards were few and one of them was long
  // (reported twice). services/noteColumns.js carries the reasoning; what is
  // here is only the wiring — and the cards stay direct children of the board,
  // which is what keeps the drag working.
  let boardWidth = $state(0);
  /// The board element, so the folder cards inside it can be offered as drop
  /// zones (a note dropped on a folder is filed into it).
  let boardEl = $state(null);
  let columns = $derived(columnCount(boardWidth));
  /// The cards in the order they are drawn: the folder cards, then the notes.
  let laidOut = $derived([...groups, ...shown]);
  let breaks = $derived(
    columnBreaks(
      laidOut.map((it) => (it.notes && it.count !== undefined ? weightOfGroup(it) : weightOfNote(it))),
      columns,
    ),
  );

  // Dragging a card on the board saves what the user built as the custom
  // order (of note paths). Only on the unfiltered board: reordering one folder
  // of the tree would silently rewrite the rest.
  let canDrag = $derived(
    !readOnly && !picking && layout === "grid" && shown.length > 1,
  );

  /// Files a note into a folder of this space — what dropping its card on a
  /// folder card means (user call, 2026-08-19).
  const fileInto = (entry, path) =>
    act(() => api.moveNoteToSpace(folder, entry.path, folder, path));

  /// Two notes dropped one on the other become a FOLDER holding both. The name
  /// is asked for, because a folder made without one would have to be called
  /// something the app invented — and the folder is the user's filing, not the
  /// app's.
  const groupNotes = (a, b) =>
    act(async () => {
      const name = await askName(S.promptNewNoteFolder, "", { confirm: S.create });
      if (!name?.trim()) return;
      const parent = openFolder ? `${openFolder}/` : "";
      const path = `${parent}${name.trim()}`;
      await api.createNoteFolder(folder, path);
      // The one that was dropped ON first, so it keeps the top of the folder.
      await api.moveNoteToSpace(folder, b.path, folder, path);
      await api.moveNoteToSpace(folder, a.path, folder, path);
    });

  async function reorderNotes(from, to) {
    // A note is never pinned into a block of its own here, so only the new
    // arrangement matters out of the plan.
    const { next } = planReorder(shown, from, to, () => false);
    try {
      // The shell persists and refreshes; the new order comes back with the
      // snapshot.
      await onSetOrder?.(next.map((n) => n.path));
    } catch (e) {
      onError?.(e);
    }
  }
</script>

<!-- Opening a note is the shell's business: it becomes a document tab, the
     same as a list. This screen only ever lists. -->
<div class="notes-space">
  <!-- The place's own row: the name centred, the ⋮ at the far right, and an
       invisible twin of the ⋮ on the left so the name is centred on the PANEL
       and not on what is left of the row — the same construction the tasks
       screen uses (2026-08-06, wireframes "Notes screen" and "Space Notes").
       The ⋮ used to sit at the end of the controls bar below, which made the
       screen's own menu read as one more of the board's filters. -->
  <header class="notes-space__head">
    <span class="notes-space__mirror" aria-hidden="true">
      <span class="theme-btn--icon">
        <Icon name="dots-three-vertical" size="1rem" />
      </span>
    </span>
    {#if header && !picking}
      <h3 class="theme-title notes-space__title">
        {title}
        {#if dot !== undefined}
          <span class="theme-dot" style={dotStyle} aria-hidden="true"></span>
        {/if}
      </h3>
    {/if}

    {#if picking}
      <!-- Selection mode: the row turns into the bulk actions, the same shape
           the tasks screen's header takes (spaces/TasksSpace.svelte). -->
      <div class="notes-space__tools">
        <span class="notes-space__picked">{S.selectedCount(picked.size)}</span>
        <select
          class="theme-select theme-select--sm"
          aria-label={S.moveNotesTo}
          disabled={picked.size === 0}
          onchange={(e) => {
            const target = e.currentTarget.value;
            e.currentTarget.value = "";
            moveSelected(target);
          }}
        >
          <option value="" disabled selected>{S.moveNotesTo}</option>
          {#each moveTargets as group (group.label)}
            <optgroup label={group.label}>
              {#each group.options as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </optgroup>
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
    {/if}

    <Menu items={sortMenu} align="end">
      {#snippet trigger({ toggle })}
        <button
          class="theme-btn--icon notes-space__more"
          onclick={toggle}
          aria-label={S.spaceOptions}
          title={S.spaceOptions}
        >
          <Icon name="dots-three-vertical" size="1rem" />
        </button>
      {/snippet}
    </Menu>
  </header>

  {#if !readOnly}
    <!-- The quick note bar (wireframes "Grid"): the note is typed here and
         filed with +, and what was typed is its body. -->
    <div class="quick-note">
      <textarea
        bind:this={quick}
        class="quick-note__field"
        placeholder={S.quickNote}
        aria-label={S.quickNote}
        rows="1"
        bind:value={draft}
        onkeydown={quickKey}
      ></textarea>
      <button
        class="theme-btn theme-btn--primary quick-note__add"
        aria-label={S.addNote}
        title={S.addNote}
        onclick={quickCreate}
      >
        <Icon name="plus" size="1.125rem" />
      </button>
    </div>
  {/if}

  {#if layout === "tree"}
    <nav class="theme-segmented notes-space__folders">
      <button
        class="theme-segmented__item notes-space__folder"
        class:theme-segmented__item--active={openFolder === null}
        class:notes-space__folder--active={openFolder === null}
        onclick={() => (openFolder = null)}>{S.allNotes}</button
      >
      {#each folders as it (it.path)}
        <button
          class="theme-segmented__item notes-space__folder"
          class:theme-segmented__item--active={openFolder === it.path}
          class:notes-space__folder--active={openFolder === it.path}
          onclick={() => (openFolder = it.path)}>{it.path}</button
        >
      {/each}
    </nav>
  {/if}

  {#if shown.length === 0 && groups.length === 0}
    <p class="notes-space__empty">{S.noNotes}</p>
  {:else}
    <ul
      class="notes-space__board"
      class:notes-space__board--tree={layout === "tree"}
      style={layout === "tree" ? "" : `columns: ${columns}`}
      use:measured={(width) => (boardWidth = width)}
      bind:this={boardEl}
      use:reorderable={{
        axis: "grid",
        // A selector that matches nothing disables the drag entirely (no
        // half-drag animation on a filtered board). Folder cards never match
        // it: they are not part of the arrangement being dragged — they are
        // where a note can be dropped INTO instead.
        item: canDrag ? ".notes-space__item" : ".notes-space__never",
        onReorder: reorderNotes,
        dropZones: () => [...(boardEl?.querySelectorAll(".notes-space__group") ?? [])],
        onDropZone: (from, zone) => fileInto(shown[from], zone.dataset.folder),
        onDropInto: (from, to) => groupNotes(shown[from], shown[to]),
      }}
    >
      {#each groups as group, index (group.path)}
        <!-- A folder, as the wireframes draw it: a tinted block with the notes
             it holds shown small inside — titles only, and never a banner,
             because a closed group says what is in it and not what it looks
             like (user call, 2026-08-19). The tint is the PLACE's colour (the
             space's, or the app's accent): a note folder carries no marker
             file of its own, so there is no colour to store on it and none is
             invented.

             It OPENS OVER THE BOARD, in a popover of two columns that behaves
             like the board itself. It used to replace the screen, which meant
             going into a folder was a navigation with no visible way back. -->
        <li
          class="notes-space__group"
          data-folder={group.path}
          style={breaks.has(index) ? "break-after: column" : ""}
        >
          <article
            class="note-group"
            class:note-group--open={anchorFolder === group.path}
            style={accentStyle(group.color ?? dot)}
            use:dismissable={{
              active: anchorFolder === group.path,
              onDismiss: closeGroup,
            }}
          >
            <div class="note-group__bar">
              <button
                class="note-group__head"
                aria-expanded={anchorFolder === group.path}
                onclick={() =>
                  anchorFolder === group.path
                    ? closeGroup()
                    : ((anchorFolder = group.path), (openFolder = group.path))}
                aria-label={S.openFolder(group.name)}
              >
                <Icon name="folder" size="1rem" />
                <span class="note-group__name">{group.name}</span>
                <span class="note-group__count">{S.notesFolderCount(group.count)}</span>
              </button>
              {#if !readOnly}
                <!-- The same two controls a note card carries, for the same
                     reason: a pin is a state and has to be readable off the
                     card, and everything else is the ⋮. -->
                <button
                  class="theme-btn--icon note-card__pin"
                  class:note-card__pin--on={group.pinned}
                  aria-pressed={group.pinned}
                  aria-label={group.pinned ? S.unpin : S.pin}
                  title={group.pinned ? S.unpin : S.pin}
                  onclick={() => pinFolder(group)}
                >
                  <Icon
                    name={group.pinned ? "bookmark-simple-fill" : "bookmark-simple"}
                    size="1rem"
                  />
                </button>
                <Menu items={groupMenu(group)} align="end">
                  {#snippet trigger({ toggle })}
                    <button
                      class="theme-btn--icon note-card__more"
                      onclick={toggle}
                      aria-label={S.folderOptions}
                      title={S.folderOptions}
                    >
                      <Icon name="dots-three" size="1rem" />
                    </button>
                  {/snippet}
                </Menu>
              {/if}
            </div>
            <div class="note-group__notes">
              {#each group.notes as entry (entry.path)}
                <NoteCard
                  {entry}
                  {root}
                  small
                  onOpen={() => onOpenNote?.(entry.path, folder)}
                />
              {/each}
            </div>

            {#if anchorFolder === group.path}
              <!-- The folder, open: the same cards the board draws, in two
                   columns. Anchored to the card, so what it belongs to is
                   never in doubt. -->
              <div
                class="theme-popover note-group__popover"
                data-region="canvas"
                use:keepOnScreen
              >
                <header class="note-group__panel-head">
                  {#if openFolder !== group.path}
                    <button
                      class="theme-btn--icon"
                      aria-label={S.backToBoard}
                      title={S.backToBoard}
                      onclick={() =>
                        (openFolder = inside.parent === "" ? group.path : inside.parent)}
                    >
                      <Icon name="arrow-left" size="0.875rem" />
                    </button>
                  {/if}
                  <span class="note-group__panel-name">{openFolder}</span>
                  {#if !readOnly}
                    <Menu items={groupMenu(openInside ?? group)} align="end">
                      {#snippet trigger({ toggle })}
                        <button
                          class="theme-btn--icon"
                          onclick={toggle}
                          aria-label={S.folderOptions}
                          title={S.folderOptions}
                        >
                          <Icon name="dots-three" size="1rem" />
                        </button>
                      {/snippet}
                    </Menu>
                  {/if}
                  <button
                    class="theme-btn--icon note-group__close"
                    aria-label={S.cancel}
                    title={S.cancel}
                    onclick={closeGroup}
                  >
                    <Icon name="x" size="0.875rem" />
                  </button>
                </header>

                {#if inside.groups.length > 0}
                  <nav class="note-group__subfolders">
                    {#each inside.groups as sub (sub.path)}
                      <button
                        class="theme-btn theme-btn--outline theme-btn--sm"
                        onclick={() => (openFolder = sub.path)}
                      >
                        <Icon name="folder" size="0.875rem" />
                        <span>{sub.name}</span>
                      </button>
                    {/each}
                  </nav>
                {/if}

                {#if inside.cards.length === 0}
                  <p class="notes-space__empty">{S.noNotes}</p>
                {:else}
                  <ul class="notes-space__board notes-space__board--pair">
                    {#each laid(inside.cards) as entry (entry.path)}
                      <li class="notes-space__item">
                        <NoteCard
                          {entry}
                          {root}
                          {picking}
                          selected={picked.has(entry.path)}
                          menu={cardMenu(entry)}
                          onPin={readOnly ? null : () => togglePin(entry)}
                          onOpen={() =>
                            picking ? togglePick(entry) : onOpenNote?.(entry.path, folder)}
                        />
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
          </article>
        </li>
      {/each}

      {#each shown as entry, index (entry.path)}
        <li
          class="notes-space__item"
          style={breaks.has(groups.length + index) ? "break-after: column" : ""}
        >
          <NoteCard
            {entry}
            {root}
            {picking}
            selected={picked.has(entry.path)}
            menu={cardMenu(entry)}
            onPin={readOnly ? null : () => togglePin(entry)}
            onOpen={() =>
              picking ? togglePick(entry) : onOpenNote?.(entry.path, folder)}
          />
        </li>
      {/each}
    </ul>
  {/if}
</div>
