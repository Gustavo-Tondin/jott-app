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
  import EmptyState from "../components/EmptyState.svelte";
  import { askConfirm, askName, DELETING } from "../services/dialog.js";
  import { noteActions, noteCardMenu } from "../services/noteActions.js";
  import { makeScreen } from "../services/act.js";
  import { spaceMenu } from "../services/spaceMenu.js";
  import { arrange, pinnedFirst, planReorder } from "../services/spaceOrder.js";
  import { ACCENTS, accentStyle, dotStyle as dotStyleOf } from "../services/accent.js";
  import { board } from "../services/noteBoard.js";
  import { leafOf, listName } from "../services/paths.js";
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
  import ContextMenu from "../components/ContextMenu.svelte";
  import Icon from "../components/Icon.svelte";
  import BulkBar from "../components/BulkBar.svelte";
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
    /// `(layout)` — persists `grid` / `tree` in the space's own `.space.json`.
    onSetLayout,
    /// The notebook's default for a space that never chose (Settings → Notes
    /// → Board). Anything that is not `tree` draws the grid.
    defaultLayout = "grid",
    onChanged,
    onError,
    /// `(path, folder, { fresh, newTab })` — `fresh` is a note this screen has
    /// just created empty, so the shell puts the cursor in its body rather than
    /// leaving it in a document nobody has typed into yet. `newTab` is the
    /// middle button and the right button's first row: a card is a link, and a
    /// link opens beside what you are reading without taking it away.
    onOpenNote,
    reloadKey = 0,
    /// Which parts of the app are on (`services/features.js`). Notes gained
    /// sub-functions on 2026-08-20, the way tasks always had them: a board
    /// with folders off is flat, one with pins off has no pin, and a note with
    /// banners off is a title and its text. Nothing on disk changes either
    /// way — a folder that exists still holds its notes, and its notes are
    /// still listed.
    f = () => true,
  } = $props();


  // The source's folder is its address for every notes command.
  let folder = $derived(source?.folder ?? null);

  /// What this place is called, and the colour it reads as.
  let title = $derived(source?.name || listName(folder ?? ""));
  let dotStyle = $derived(dotStyleOf(dot));

  let notes = $state([]);
  let folders = $state([]);
  /// `grid` (cards, Keep-like) or `tree` (by folder).
  ///
  /// The choice is the SPACE's (2026-08-21): it lives in its `.space.json`
  /// next to `sort`, arrives through `source.noteLayout`, and a space that
  /// never chose follows the notebook's default. It used to be session state
  /// and was forgotten on every screen change (proposta §9-A).
  ///
  /// `chosenLayout` is the click before the refresh brings it back — and the
  /// whole answer on a read-only notebook, where nothing can be written and
  /// the choice is as session-local as it always was. It is dropped when the
  /// source changes place: a choice made in one space is not the next one's.
  let chosenLayout = $state(null);
  $effect(() => {
    void folder;
    chosenLayout = null;
  });
  const layoutName = (value) => (value === "tree" ? "tree" : "grid");
  /// With folders switched off there is no tree to draw — the view is the one
  /// arrangement the space still has.
  let layout = $derived(
    f("noteFolders")
      ? layoutName(chosenLayout ?? source?.noteLayout ?? defaultLayout)
      : "grid",
  );
  function chooseLayout(value) {
    chosenLayout = value;
    if (!readOnly) onSetLayout?.(value);
  }
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

  const { load, act } = makeScreen({
    // No folder yet: nothing to read, and what is on screen stays.
    read: () =>
      folder && Promise.all([api.listNotes(folder, ""), api.noteFolders(folder)]),
    apply: (read) => {
      if (read) [notes, folders] = read;
    },
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

  /// Going to a note. `newTab` is the middle button and the right button's
  /// first row; where the tab comes from is the shell's business, this only
  /// says which door was used.
  const openNote = (entry, { newTab = false } = {}) =>
    onOpenNote?.(entry.path, folder, { newTab });

  // ---- the right button on a card ----
  // One panel for the whole board, at the pointer — the same pact the sidebar
  // keeps (shell/Sidebar.svelte): a card reports the gesture, the screen owns
  // where the menu goes. It carries the card's own ⋮ items under the one row
  // the right button exists for here, and it is offered on a read-only
  // notebook too: opening a second tab writes nothing.
  let cardMenuAt = $state(null);
  let cardMenuShown = $state([]);

  function openCardMenu(event, entry) {
    event.preventDefault();
    event.stopPropagation();
    cardMenuShown = cardMenu(entry, {
      openInNewTab: () => openNote(entry, { newTab: true }),
    });
    cardMenuAt = { x: event.clientX, y: event.clientY };
  }

  /// The four a card offers, shared with the Home (services/noteActions.js).
  const cards = noteActions(act);
  const togglePin = (entry) => cards.pin(folder, entry);

  const renameFolder = (path = openFolder) =>
    act(async () => {
      if (!path) return;
      const current = leafOf(path);
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
      const name = leafOf(path);
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
  //
  // The same accessors answer for a FOLDER card, because the board arranges
  // the two kinds together (see `laidOut`): a folder is titled by its `name`,
  // and it has no date of its own — under `created` it lands with everything
  // else that carries no stamp, at the end, which is the tolerance arrange()
  // already keeps rather than a rule of its own.
  const accessors = {
    nameOf: (n) => n.title ?? n.name,
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
  let here = $derived(
    board(notes, folders, "", notesInbox, { flat: !f("noteFolders") }),
  );

  /// The same question asked of the open folder card — what the popover holds.
  let inside = $derived(board(notes, folders, openFolder ?? "", notesInbox));

  /// The folder the popover is SHOWING, as an entry. Not always the card the
  /// panel hangs off: going into a subfolder changes what is shown without
  /// moving the panel, and the ⋮ has to act on what is on screen.
  let openInside = $derived(folders.find((it) => it.path === openFolder) ?? null);

  /// Arranged, with the pinned ones floated to the top: pinning outranks the
  /// sort, exactly as it does on a task list (services/spaceOrder.js).
  const laid = (cards) =>
    f("pinNotes")
      ? pinnedFirst(arrange(cards, sort, source?.order ?? [], accessors))
      : arrange(cards, sort, source?.order ?? [], accessors);

  /// The notes of this place, before the folder cards join them.
  let atHand = $derived(
    layout === "tree" && openFolder !== null
      ? notes.filter((n) => n.folder === openFolder)
      : here.cards,
  );

  /// **The board is ONE arrangement** (2026-08-19): the folder cards and the
  /// notes, arranged and pinned together, in the order the space remembers.
  ///
  /// They used to be two blocks — every folder first, every note after — and
  /// that is the whole reason a folder card could not be dragged at all (user
  /// report): the drag was told to pick up `.notes-space__item` only, the
  /// order it saved held note addresses only, and the folders never went
  /// through `arrange()`, so an order that named one would have been thrown
  /// away on the next read anyway. Now a folder is a card like the others:
  /// dragged, it stays where it was dropped, and its address rides in the same
  /// `order` (a folder's has no `.md`, so the two never collide).
  ///
  /// Untouched, the board still opens folders-first: that is the order
  /// `board()` hands them over in, and the file order is what `sort: null`
  /// means. Folder cards are the grid's own: the tree view has its chips.
  let laidOut = $derived(laid(layout === "grid" ? [...here.groups, ...atHand] : atHand));

  /// Which cards are folders, and which are notes. A folder card carries the
  /// notes it holds; a note does not.
  const isGroup = (card) => Array.isArray(card?.notes);

  // The same ⋮ every source carries (services/spaceMenu.js), minus the
  // completion date: a note has none, so that sorting would be a dead entry.
  // Creating lives here now: the wireframe's board has a name, a ⋮ and the
  // quick-note bar, and nothing else above the cards.
  let sortMenu = $derived(
    spaceMenu({
      lead: [
        // Creating and picking write; the LAYOUT is offered either way — on
        // a read-only notebook it is not saved, and how the same notes are
        // drawn is a question that notebook answers as happily as any other.
        ...(readOnly
          ? []
          : [
              { label: S.newNote, run: create },
              ...(f("noteFolders")
                ? [{ label: S.newNoteFolder, run: createFolder }]
                : []),
              { label: S.selectNotes, run: () => (picking = true) },
            ]),
        ...(f("noteFolders")
          ? [
              {
                label: S.layout,
                items: [
                  {
                    label: S.gridView,
                    checked: layout === "grid",
                    run: () => chooseLayout("grid"),
                  },
                  {
                    label: S.treeView,
                    checked: layout === "tree",
                    run: () => chooseLayout("tree"),
                  },
                ],
              },
            ]
          : []),
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
          ...(f("pinNotes")
            ? [{ label: group.pinned ? S.unpin : S.pin, run: () => pinFolder(group) }]
            : []),
          {
            label: S.color,
            items: [
              {
                label: S.defaultAppearance,
                checked: !group.color,
                run: () => colorFolder(group, null),
              },
              ...ACCENTS.map((name) => ({
                label: S.colorName(name),
                checked: group.color === name,
                run: () => colorFolder(group, name),
              })),
            ],
          },
          { label: S.renameFolder, run: () => renameFolder(group.path) },
          { label: S.deleteFolder, run: () => deleteFolder(group.path) },
        ];

  /// A card's own ⋮. Not built for a read-only notebook: every item writes.
  const cardMenu = (entry, { openInNewTab = null } = {}) =>
    noteCardMenu({
      entry,
      actions: cards,
      space: folder,
      canPin: f("pinNotes"),
      moveTargets,
      readOnly,
      openInNewTab,
    });

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
        ...(f("noteFolders")
          ? folders.map((it) => ({
              value: JSON.stringify([folder, it.path]),
              label: it.path,
            }))
          : []),
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

  const deleteSelected = async () => {
    if (picked.size === 0) return;
    // The same question a single delete asks — deleting twelve without it
    // while deleting one asked was an accident, not a policy.
    if (!(await askConfirm(S.confirmDeleteNotes(picked.size), DELETING))) return;
    act(async () => {
      for (const path of picked) await api.deleteNote(folder, path);
      exitPicking();
    });
  };

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
  let breaks = $derived(
    columnBreaks(
      laidOut.map((it) => (isGroup(it) ? weightOfGroup(it) : weightOfNote(it))),
      columns,
    ),
  );

  // Dragging a card on the board saves what the user built as the custom
  // order (of card addresses — a folder's among them since 2026-08-19). Only
  // on the unfiltered board: reordering one folder of the tree would silently
  // rewrite the rest.
  let canDrag = $derived(
    !readOnly && !picking && layout === "grid" && laidOut.length > 1,
  );

  /// Files a note into a folder of this space — what dropping its card on a
  /// folder card means (user call, 2026-08-19).
  const fileInto = (entry, path) =>
    act(() => api.moveNoteToSpace(folder, entry.path, folder, path));

  /// Two NOTES dropped one on the other become a FOLDER holding both. The name
  /// is asked for, because a folder made without one would have to be called
  /// something the app invented — and the folder is the user's filing, not the
  /// app's.
  ///
  /// Only two notes: a folder card dropped on anything is only ever being put
  /// somewhere in the order (`canDropInto` below keeps the ring from lighting
  /// up around a target that would do nothing). Nesting a folder inside
  /// another is a MOVE, which the core does not offer for a folder of notes —
  /// so it is not pretended here.
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

  async function reorderCards(from, to) {
    // A card is never pinned into a block of its own here, so only the new
    // arrangement matters out of the plan.
    const { next } = planReorder(laidOut, from, to, () => false);
    try {
      // The shell persists and refreshes; the new order comes back with the
      // snapshot.
      await onSetOrder?.(next.map((n) => n.path));
    } catch (e) {
      onError?.(e);
    }
  }
</script>

<!-- One note on the board — the same card whether it sits loose in a column
     or inside a folder's own pair of columns. While picking, a click picks. -->
{#snippet noteItem(entry)}
  <NoteCard
    {entry}
    {root}
    banners={f("banners")}
    {picking}
    selected={picked.has(entry.path)}
    menu={cardMenu(entry)}
    onPin={readOnly || !f("pinNotes") ? null : () => togglePin(entry)}
    onOpen={(_, opts) => (picking ? togglePick(entry) : openNote(entry, opts))}
    onContextMenu={openCardMenu}
  />
{/snippet}

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
    <span class="theme-mirror notes-space__mirror" aria-hidden="true">
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
      <!-- Selection mode: the bulk actions float over the bottom of the
           screen (components/BulkBar.svelte), the same bar the tasks screen
           raises. -->
      <BulkBar count={picked.size} onClose={exitPicking}>
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
      </BulkBar>
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

  {#if laidOut.length === 0}
    <EmptyState icon="note" title={S.noNotes} />
  {:else}
    <ul
      class="theme-note-board notes-space__board"
      class:notes-space__board--tree={layout === "tree"}
      style="--columns: {columns}"
      use:measured={(width) => (boardWidth = width)}
      bind:this={boardEl}
      use:reorderable={{
        axis: "grid",
        // A selector that matches nothing disables the drag entirely (no
        // half-drag animation on a filtered board). BOTH kinds of card match
        // it: the board is one arrangement, and a folder card is carried the
        // same way a note is (see `laidOut`).
        item: canDrag ? ".notes-space__item, .notes-space__group" : ".notes-space__never",
        onReorder: reorderCards,
        // A folder card is where a NOTE is filed. Carrying a folder there is
        // no zone at all: it is only being put somewhere in the order.
        dropZones: (from) =>
          isGroup(laidOut[from])
            ? []
            : [...(boardEl?.querySelectorAll(".notes-space__group") ?? [])],
        onDropZone: (from, zone) => fileInto(laidOut[from], zone.dataset.folder),
        canDropInto: (from, to) => !isGroup(laidOut[from]) && !isGroup(laidOut[to]),
        onDropInto: (from, to) => groupNotes(laidOut[from], laidOut[to]),
      }}
    >
      <!-- ONE loop, because the board is one arrangement: a folder card and a
           note card sit side by side wherever the order puts them, and either
           can be carried. See `laidOut`. -->
      {#each laidOut as card, index (card.path)}
        {#if isGroup(card)}
          {@const group = card}
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
            class:theme-note-board__break={breaks.has(index)}
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
                  {#if f("pinNotes")}
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
                  {/if}
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
                    banners={f("banners")}
                    small
                    onOpen={(_, opts) => openNote(entry, opts)}
                    onContextMenu={openCardMenu}
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
                    <ul class="theme-note-board notes-space__board notes-space__board--pair">
                      {#each laid(inside.cards) as entry (entry.path)}
                        <li class="notes-space__item">
                          {@render noteItem(entry)}
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </div>
              {/if}
            </article>
          </li>
        {:else}
          <li
            class="notes-space__item"
            class:theme-note-board__break={breaks.has(index)}
          >
            {@render noteItem(card)}
          </li>
        {/if}
      {/each}
    </ul>
  {/if}
</div>

<!-- A card's own right-click menu. Last in the markup and fixed to the
     viewport (styles/components/menu.css), so the panel is never clipped by
     the board it was opened over — nor by the folder popover, which sits at
     the same layer and would otherwise cover it. -->
<ContextMenu
  at={cardMenuAt}
  items={cardMenuShown}
  onClose={() => (cardMenuAt = null)}
/>
