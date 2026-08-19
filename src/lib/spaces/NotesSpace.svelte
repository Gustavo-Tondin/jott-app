<script>
  // The `notes` source: a board of note cards, or a folder tree, plus search.
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
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { askName } from "../services/dialog.js";
  import { makeAct } from "../services/act.js";
  import { spaceMenu } from "../services/spaceMenu.js";
  import { arrange, planReorder } from "../services/spaceOrder.js";
  import { accentColor, accentStyle } from "../services/accent.js";
  import { board } from "../services/noteBoard.js";
  import { listName } from "../services/paths.js";
  import { reorderable } from "../actions/reorder.js";
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
  let query = $state("");
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
  /// the tree" is the same question whether it is asked by a chip or by a
  /// folder card.
  let openFolder = $state(null);

  $effect(() => {
    folder;
    query;
    reloadKey;
    load();
  });

  // Leaving a place leaves its selection behind: the notes that were picked
  // are not on screen any more, and acting on them would act out of sight.
  $effect(() => {
    folder;
    openFolder;
    query;
    exitPicking();
  });

  async function load() {
    if (!folder) return;
    try {
      [notes, folders] = await Promise.all([
        api.listNotes(folder, query),
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

  // Naming goes through the app's own dialog — window.prompt is a no-op in
  // WebKitGTK (the widget-creation bug of 2026-07-30).
  const create = () =>
    act(async () => {
      const title = await askName(S.promptNewNote, S.newNoteTitle, {
        confirm: S.create,
      });
      if (!title) return;
      // A note created from a folder lands in it; from the board, in the
      // inbox — the spec's "loose notes go to Notes/Inbox".
      const target = openFolder ?? notesInbox;
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

  const deleteNote = (entry) =>
    act(async () => {
      if (!confirm(S.confirmDeleteNote(entry.title))) return;
      await api.deleteNote(folder, entry.path);
    });

  const renameFolder = () =>
    act(async () => {
      if (!openFolder) return;
      const current = openFolder.split("/").pop();
      const next = await askName(S.promptRenameFolder(current), current);
      if (!next || next.trim() === current) return;
      openFolder = await api.renameNoteFolder(folder, openFolder, next.trim());
    });

  const deleteFolder = () =>
    act(async () => {
      if (!openFolder) return;
      const name = openFolder.split("/").pop();
      if (!confirm(S.confirmDeleteFolder(name))) return;
      const moved = await api.deleteNoteFolder(folder, openFolder);
      openFolder = null;
      if (moved > 0) onError?.({ kind: "info", message: S.folderEmptied(moved, name) });
    });

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
  let here = $derived(board(notes, folders, openFolder ?? "", notesInbox));

  let shown = $derived(
    arrange(
      layout === "tree" && openFolder !== null
        ? notes.filter((n) => n.folder === openFolder)
        : here.cards,
      sort,
      source?.order ?? [],
      accessors,
    ),
  );

  /// Folder cards are the grid's own: the tree view has its chips.
  let groups = $derived(layout === "grid" && !query.trim() ? here.groups : []);

  // The same ⋮ every source carries (services/spaceMenu.js), minus the
  // completion date: a note has none, so that sorting would be a dead entry.
  let sortMenu = $derived(
    spaceMenu({
      lead: [{ label: S.selectNotes, run: () => (picking = true), disabled: readOnly }],
      sorts: [null, "name", "created", "custom"],
      sort,
      hasOrder: (source?.order ?? []).length > 0,
      onSetSort,
    }),
  );

  /// A card's own ⋮. Not built for a read-only notebook: every item writes.
  const cardMenu = (entry) =>
    readOnly
      ? []
      : [
          { label: entry.pinned ? S.unpin : S.pin, run: () => togglePin(entry) },
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

  /// Where picked notes can go: any folder of this space, and every other
  /// notes space of the notebook. A space's own folders are known here; another
  /// space's are not, so it is offered as itself — its inbox is where a note
  /// filed into it belongs anyway.
  let moveTargets = $derived([
    {
      label: title,
      options: [
        { value: JSON.stringify([folder, ""]), label: S.allNotes },
        ...folders.map((name) => ({
          value: JSON.stringify([folder, name]),
          label: name,
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

  // Dragging a card on the board saves what the user built as the custom
  // order (of note paths). Only on the unfiltered board: reordering a search
  // result or one folder of the tree would silently rewrite the rest.
  let canDrag = $derived(
    !readOnly && !picking && layout === "grid" && !query.trim() && shown.length > 1,
  );

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

  <div class="notes-space__bar">
    <input
      class="theme-input theme-input--sm theme-input--search notes-space__search"
      placeholder={S.searchNotes}
      aria-label={S.searchNotes}
      bind:value={query}
    />
    <button
      class="theme-btn theme-btn--outline theme-btn--sm notes-space__bar-button"
      class:notes-space__bar-button--active={layout === "grid"}
      onclick={() => (chosenLayout = "grid")}>{S.gridView}</button
    >
    <button
      class="theme-btn theme-btn--outline theme-btn--sm notes-space__bar-button"
      class:notes-space__bar-button--active={layout === "tree"}
      onclick={() => (chosenLayout = "tree")}>{S.treeView}</button
    >
    {#if !readOnly}
      <button class="theme-btn theme-btn--primary theme-btn--sm notes-space__bar-button" onclick={create}>{S.newNote}</button>
      <button class="theme-btn theme-btn--outline theme-btn--sm notes-space__bar-button" onclick={createFolder}
        >{S.newNoteFolder}</button
      >
    {/if}
  </div>

  {#if layout === "tree"}
    <nav class="theme-segmented notes-space__folders">
      <button
        class="theme-segmented__item notes-space__folder"
        class:theme-segmented__item--active={openFolder === null}
        class:notes-space__folder--active={openFolder === null}
        onclick={() => (openFolder = null)}>{S.allNotes}</button
      >
      {#each folders as name (name)}
        <button
          class="theme-segmented__item notes-space__folder"
          class:theme-segmented__item--active={openFolder === name}
          class:notes-space__folder--active={openFolder === name}
          onclick={() => (openFolder = name)}>{name}</button
        >
      {/each}
    </nav>
  {:else if openFolder !== null}
    <!-- Inside a folder card. The way back is one control, on the left of the
         name of the place you are in — a folder card opens IN PLACE, so
         without it there is no way out but the sidebar. -->
    <nav class="notes-space__crumbs">
      <button
        class="theme-btn theme-btn--outline theme-btn--sm"
        onclick={() => (openFolder = here.parent === "" ? null : here.parent)}
      >
        <Icon name="arrow-left" size="0.875rem" />
        <span>{S.backToBoard}</span>
      </button>
      <span class="notes-space__crumb">{openFolder}</span>
    </nav>
  {/if}

  <!-- Folder actions live next to the folder they act on, and only when one is
       open — a folder is not deletable from the board view, where nothing says
       which one you mean. -->
  {#if !readOnly && openFolder}
    <p class="notes-space__folder-actions">
      <button class="notes-space__folder-action" onclick={renameFolder}
        >{S.renameFolder}</button
      >
      <button class="notes-space__folder-action" onclick={deleteFolder}
        >{S.deleteFolder}</button
      >
    </p>
  {/if}

  {#if shown.length === 0 && groups.length === 0}
    <p class="notes-space__empty">{query.trim() ? S.noNotesFound : S.noNotes}</p>
  {:else}
    <ul
      class="notes-space__board"
      class:notes-space__board--tree={layout === "tree"}
      use:reorderable={{
        axis: "grid",
        // A selector that matches nothing disables the drag entirely (no
        // half-drag animation on a filtered board). Folder cards never match
        // it: they are not part of the arrangement being dragged.
        item: canDrag ? ".notes-space__item" : ".notes-space__never",
        onReorder: reorderNotes,
      }}
    >
      {#each groups as group (group.path)}
        <!-- A folder, as the wireframes draw it: a tinted block with the notes
             it holds shown small inside. The tint is the PLACE's colour (the
             space's, or the app's accent) — a note folder carries no marker
             file of its own, so there is no colour to store on it and none is
             invented. The wireframe paints the block saturated; here it is the
             colour's TINT with the name in the colour itself, which is the
             step every other coloured container of the app already stands on
             (the sidebar row, the selected card). -->
        <li class="notes-space__group">
          <article class="note-group" style={accentStyle(dot)}>
            <button
              class="note-group__head"
              onclick={() => (openFolder = group.path)}
              aria-label={S.openFolder(group.name)}
            >
              <Icon name="folder" size="1rem" />
              <span class="note-group__name">{group.name}</span>
              <span class="note-group__count">{S.notesFolderCount(group.count)}</span>
            </button>
            <div class="note-group__notes">
              {#each group.notes as entry (entry.path)}
                <NoteCard {entry} {root} small onOpen={() => onOpenNote?.(entry.path, folder)} />
              {/each}
            </div>
          </article>
        </li>
      {/each}

      {#each shown as entry (entry.path)}
        <li class="notes-space__item">
          <NoteCard
            {entry}
            {root}
            {picking}
            selected={picked.has(entry.path)}
            menu={cardMenu(entry)}
            onOpen={() =>
              picking ? togglePick(entry) : onOpenNote?.(entry.path, folder)}
          />
        </li>
      {/each}
    </ul>
  {/if}
</div>
