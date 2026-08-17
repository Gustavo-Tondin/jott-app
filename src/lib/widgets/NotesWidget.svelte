<script>
  // The `notes` widget: a board of note cards, or a folder tree, plus search.
  //
  // Same note in both views — the layout is a preference, never a change to
  // the file (spec 5). Opening a note hands over to the editor; this screen
  // only ever lists.
  //
  // Etapa 1 (2026-08-04): the widget owns its arrangement — `sort` + `order`
  // in its `.space.json`, chosen in the ⋮ menu or by dragging a card on the
  // board (the same contract the tasks widget keeps).
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { askName } from "../services/dialog.js";
  import { makeAct } from "../services/act.js";
  import { widgetMenu } from "../services/widgetMenu.js";
  import { arrange, planReorder } from "../services/widgetOrder.js";
  import { reorderable } from "../actions/reorder.js";
  import Menu from "../components/Menu.svelte";
  import Icon from "../components/Icon.svelte";

  let {
    widget,
    readOnly = false,
    notesInbox = "Inbox",
    onSetSort,
    onSetOrder,
    onChanged,
    onError,
    onOpenNote,
    reloadKey = 0,
  } = $props();

  // The widget's folder is its address for every notes command.
  let folder = $derived(widget?.folder ?? null);

  let notes = $state([]);
  let folders = $state([]);
  let query = $state("");
  /// `grid` (cards, Keep-like) or `tree` (by folder).
  ///
  /// The config option picks the starting layout and the user's choice wins
  /// from then on — hence a null-until-chosen override rather than a state
  /// seeded from the prop, which would freeze on the value the widget had
  /// when it first rendered.
  let chosenLayout = $state(null);
  let layout = $derived(
    chosenLayout ?? (widget?.options?.layout === "tree" ? "tree" : "grid"),
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
  let sort = $derived(widget?.sort ?? null);

  // In the tree view, only the notes of the folder being looked at.
  let shown = $derived(
    arrange(
      layout === "tree" && openFolder !== null
        ? notes.filter((n) => n.folder === openFolder)
        : notes,
      sort,
      widget?.order ?? [],
      accessors,
    ),
  );

  // The same ⋮ every widget carries (services/widgetMenu.js), minus the
  // completion date: a note has none, so that sorting would be a dead entry.
  let sortMenu = $derived(
    widgetMenu({
      sorts: [null, "name", "created", "custom"],
      sort,
      hasOrder: (widget?.order ?? []).length > 0,
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
<div class="notes-widget">
  <div class="notes-widget__bar">
    <input
      class="theme-input theme-input--sm theme-input--search notes-widget__search"
      placeholder={S.searchNotes}
      aria-label={S.searchNotes}
      bind:value={query}
    />
    <button
      class="theme-btn theme-btn--outline theme-btn--sm notes-widget__bar-button"
      class:notes-widget__bar-button--active={layout === "grid"}
      onclick={() => (chosenLayout = "grid")}>{S.gridView}</button
    >
    <button
      class="theme-btn theme-btn--outline theme-btn--sm notes-widget__bar-button"
      class:notes-widget__bar-button--active={layout === "tree"}
      onclick={() => (chosenLayout = "tree")}>{S.treeView}</button
    >
    {#if !readOnly}
      <button class="theme-btn theme-btn--primary theme-btn--sm notes-widget__bar-button" onclick={create}>{S.newNote}</button>
      <button class="theme-btn theme-btn--outline theme-btn--sm notes-widget__bar-button" onclick={createFolder}
        >{S.newNoteFolder}</button
      >
    {/if}
    <Menu items={sortMenu}>
      {#snippet trigger({ toggle })}
        <button
          class="theme-btn--icon notes-widget__more"
          onclick={toggle}
          aria-label={S.widgetOptions}
          title={S.widgetOptions}
        >
          <Icon name="dots-three-vertical" size="1rem" />
        </button>
      {/snippet}
    </Menu>
  </div>

  {#if layout === "tree"}
    <nav class="theme-segmented notes-widget__folders">
      <button
        class="theme-segmented__item notes-widget__folder"
        class:theme-segmented__item--active={openFolder === null}
        class:notes-widget__folder--active={openFolder === null}
        onclick={() => (openFolder = null)}>{S.allNotes}</button
      >
      {#each folders as name (name)}
        <button
          class="theme-segmented__item notes-widget__folder"
          class:theme-segmented__item--active={openFolder === name}
          class:notes-widget__folder--active={openFolder === name}
          onclick={() => (openFolder = name)}>{name}</button
        >
      {/each}
    </nav>

    <!-- Folder actions live next to the folder they act on, and only when
         one is open — a folder is not deletable from the board view, where
         nothing says which one you mean. -->
    {#if !readOnly && openFolder}
      <p class="notes-widget__folder-actions">
        <button class="notes-widget__folder-action" onclick={renameFolder}
          >{S.renameFolder}</button
        >
        <button class="notes-widget__folder-action" onclick={deleteFolder}
          >{S.deleteFolder}</button
        >
      </p>
    {/if}
  {/if}

  {#if shown.length === 0}
    <p class="notes-widget__empty">{query.trim() ? S.noNotesFound : S.noNotes}</p>
  {:else}
    <ul
      class="notes-widget__board"
      class:notes-widget__board--tree={layout === "tree"}
      use:reorderable={{
        axis: "grid",
        // A selector that matches nothing disables the drag entirely (no
        // half-drag animation on a filtered board).
        item: canDrag ? ".notes-widget__item" : ".notes-widget__never",
        onReorder: reorderNotes,
      }}
    >
      {#each shown as entry (entry.path)}
        <li
          class="notes-widget__item"
          class:notes-widget__item--pinned={entry.pinned}
        >
          <button
            class="notes-widget__card"
            onclick={() => onOpenNote?.(entry.path, folder)}
          >
            <strong class="notes-widget__card-title">{entry.title}</strong>
            <span class="notes-widget__preview">{entry.preview || S.emptyNote}</span>
            <small class="notes-widget__meta">
              {entry.folder}
              {#if entry.pinned}· {S.pinned}{/if}
            </small>
          </button>
          {#if !readOnly}
            <button
              class="notes-widget__pin"
              onclick={() => togglePin(entry)}
              aria-label={entry.pinned ? S.unpin : S.pin}>★</button
            >
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
