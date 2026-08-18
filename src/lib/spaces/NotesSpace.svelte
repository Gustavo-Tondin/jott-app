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
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { askName } from "../services/dialog.js";
  import { makeAct } from "../services/act.js";
  import { spaceMenu } from "../services/spaceMenu.js";
  import { arrange, planReorder } from "../services/spaceOrder.js";
  import { accentColor } from "../services/accent.js";
  import { listName } from "../services/paths.js";
  import { reorderable } from "../actions/reorder.js";
  import Menu from "../components/Menu.svelte";
  import Icon from "../components/Icon.svelte";

  let {
    source,
    readOnly = false,
    notesInbox = "Inbox",
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
  let openFolder = $state(null);

  $effect(() => {
    folder;
    query;
    reloadKey;
    load();
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

  // In the tree view, only the notes of the folder being looked at.
  let shown = $derived(
    arrange(
      layout === "tree" && openFolder !== null
        ? notes.filter((n) => n.folder === openFolder)
        : notes,
      sort,
      source?.order ?? [],
      accessors,
    ),
  );

  // The same ⋮ every source carries (services/spaceMenu.js), minus the
  // completion date: a note has none, so that sorting would be a dead entry.
  let sortMenu = $derived(
    spaceMenu({
      sorts: [null, "name", "created", "custom"],
      sort,
      hasOrder: (source?.order ?? []).length > 0,
      onSetSort,
    }),
  );

  // Dragging a card on the board saves what the user built as the custom
  // order (of note paths). Only on the unfiltered board: reordering a search
  // result or one folder of the tree would silently rewrite the rest.
  let canDrag = $derived(
    !readOnly && layout === "grid" && !query.trim() && shown.length > 1,
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
    {#if header}
      <h3 class="theme-title notes-space__title">
        {title}
        {#if dot !== undefined}
          <span class="theme-dot" style={dotStyle} aria-hidden="true"></span>
        {/if}
      </h3>
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

    <!-- Folder actions live next to the folder they act on, and only when
         one is open — a folder is not deletable from the board view, where
         nothing says which one you mean. -->
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
  {/if}

  {#if shown.length === 0}
    <p class="notes-space__empty">{query.trim() ? S.noNotesFound : S.noNotes}</p>
  {:else}
    <ul
      class="notes-space__board"
      class:notes-space__board--tree={layout === "tree"}
      use:reorderable={{
        axis: "grid",
        // A selector that matches nothing disables the drag entirely (no
        // half-drag animation on a filtered board).
        item: canDrag ? ".notes-space__item" : ".notes-space__never",
        onReorder: reorderNotes,
      }}
    >
      {#each shown as entry (entry.path)}
        <li
          class="notes-space__item"
          class:notes-space__item--pinned={entry.pinned}
        >
          <button
            class="notes-space__card"
            onclick={() => onOpenNote?.(entry.path, folder)}
          >
            <strong class="notes-space__card-title">{entry.title}</strong>
            <span class="notes-space__preview">{entry.preview || S.emptyNote}</span>
            <small class="notes-space__meta">
              {entry.folder}
              {#if entry.pinned}· {S.pinned}{/if}
            </small>
          </button>
          {#if !readOnly}
            <button
              class="notes-space__pin"
              onclick={() => togglePin(entry)}
              aria-label={entry.pinned ? S.unpin : S.pin}>★</button
            >
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
