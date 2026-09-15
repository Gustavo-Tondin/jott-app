<script>
  // The `notes` source: a board of note cards, or a folder tree. Same note in
  // both views — the layout is a preference, never a change to the file.
  // Opening a note hands over to the editor; this screen only ever lists.
  // A FOLDER is a card too (services/noteBoard.js says which is which), and
  // it opens over the board as a popover of its own.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import EmptyState from "../components/EmptyState.svelte";
  import { askConfirm, askName, DELETING } from "../services/dialog.js";
  import {
    bannerOf,
    noteActions,
    noteCardMenu,
    noteMoveRows,
    noteRing,
  } from "../services/noteActions.js";
  import { popRing } from "../services/actionRing.js";
  import { makeScreen } from "../services/act.js";
  import { spaceMenu } from "../services/spaceMenu.js";
  import { liftSpaceMenu } from "../shell/spaceMenus.js";
  import { arrange, pinnedFirst, planReorder, planReorderMany } from "../services/spaceOrder.js";
  import { ACCENTS, accentStyle, dotStyle as dotStyleOf, accentColor } from "../services/accent.js";
  import { board } from "../services/noteBoard.js";
  import { leafOf, listName } from "../services/paths.js";
  import { reorderable } from "../actions/reorder.js";
  import { measured } from "../actions/measure.js";
  import { columnCount, columnLayout, projectMove } from "../services/noteColumns.js";
  import { dismissable } from "../actions/dismissable.js";
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import Menu from "../components/Menu.svelte";
  import ContextMenu from "../components/ContextMenu.svelte";
  import Icon from "../components/Icon.svelte";
  import BulkBar from "../components/BulkBar.svelte";
  import CaptureFab from "../components/CaptureFab.svelte";
  import NoteCard from "../components/NoteCard.svelte";
  import NoteHeadPanel from "../components/NoteHeadPanel.svelte";

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
    /// Whether the place is NAMED on the row (spaces/TasksSpace.svelte keeps
    /// the same pact). The row itself is always there — the ⋮ belongs at the
    /// top right of every source. Below 768px the shell's header says the name.
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
    /// `(path, folder, { fresh, newTab })` — `fresh` is a note just created
    /// empty, so the shell puts the cursor in its body. `newTab` is the middle
    /// button and the right button's first row: a card is a link.
    onOpenNote,
    reloadKey = 0,
    /// Which parts of the app are on (`services/features.js`): folders off is
    /// a flat board, pins off has no pin, banners off is a title and its text.
    /// Nothing on disk changes either way.
    f = () => true,
    /// How a date is drawn — the notebook's `dateDisplayFormat`, which the
    /// age stamp falls back to once a card stops counting days.
    dateFormat = "mm/dd/yyyy",
    /// The narrow shell (shell/compact.js): no quick note bar, the Home's
    /// round + instead — a note is written in the editor, not over the board.
    compact = false,
    /// `(done) => void` — opens the image picker for a card's banner and
    /// hands `done` the address. Null: a card's banner is colours only.
    onPickImage = null,
  } = $props();


  // The source's folder is its address for every notes command.
  let folder = $derived(source?.folder ?? null);

  /// What this place is called, and the colour it reads as.
  let title = $derived(source?.name || listName(folder ?? ""));
  let dotStyle = $derived(dotStyleOf(dot));

  let notes = $state([]);
  let folders = $state([]);
  /// `grid` (cards) or `tree` (by folder). The choice is the SPACE's — in its
  /// `.space.json`, via `source.noteLayout`; unset follows the notebook's
  /// default. `chosenLayout` is the click before the refresh brings it back,
  /// and the whole answer on a read-only notebook; dropped on a change of place.
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
  // WebKitGTK.
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
  // One panel for the whole board, at the pointer (the sidebar keeps the same
  // pact): a card reports the gesture, the screen owns the menu. Offered on a
  // read-only notebook too: opening a second tab writes nothing.
  let cardMenuAt = $state(null);
  let cardMenuShown = $state([]);

  /// The RIGHT BUTTON opens the ring at the pointer (2026-09-15) — the same
  /// five a finger's rest opens; the card's ⋮ is the whole menu. Where the
  /// ring would be the ⋮ alone (a read-only notebook), the menu opens instead.
  function openRingAt(event, entry) {
    event.preventDefault();
    event.stopPropagation();
    const at = { x: event.clientX, y: event.clientY };
    const slices = ringFor(entry, at);
    if (slices && slices.length > 1) return popRing({ actions: slices, at });
    cardMenuShown = cardMenu(entry, {
      openInNewTab: () => openNote(entry, { newTab: true }),
    });
    cardMenuAt = at;
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

  // A folder's colour and pin live in the SPACE's config — a folder is a plain
  // directory and the app writes no marker inside the user's tree (core/src/space.rs).
  const pinFolder = (group) =>
    act(() => api.setNoteFolderPinned(folder, group.path, !group.pinned));

  const colorFolder = (group, color) =>
    act(() => api.setNoteFolderColor(folder, group.path, color || null));

  // ---- the quick note bar ----
  // What is typed here is the note's BODY, not its name: the app names it
  // (`fsio::free_name`). Enter files it and keeps the field; Shift+Enter is a
  // new line (hence a textarea). + on an EMPTY field makes the note and opens it.
  let draft = $state("");
  let quick = $state(null);

  /// An untitled note where this place files one, opened with the cursor in
  /// its body — the + on an empty field, and the phone's round +.
  const createFresh = () =>
    act(async () => {
      const path = await api.createNote(folder, target, S.newNoteTitle);
      onOpenNote?.(path, folder, { fresh: true });
    });

  const quickCreate = () => {
    const text = draft;
    if (!text.trim()) return createFresh();
    return act(async () => {
      const path = await api.createNote(folder, target, S.newNoteTitle);
      await api.writeNote(folder, path, text.endsWith("\n") ? text : `${text}\n`);
      draft = "";
      quick?.focus();
    });
  };

  // The field grows with what is typed up to the stylesheet's cap, then
  // scrolls. `field-sizing: content` says the same, but WebKitGTK ignores it.
  $effect(() => {
    void draft;
    if (!quick) return;
    quick.style.blockSize = "auto";
    quick.style.blockSize = `${quick.scrollHeight}px`;
  });

  function quickKey(event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!draft.trim()) return;
    quickCreate();
  }

  // ---- arrangement ----
  // The same accessors answer for a FOLDER card, because the board arranges
  // both kinds together (`laidOut`): a folder is titled by `name` and has no
  // date, so under `created` it lands at the end with everything unstamped.
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

  /// **The board is ONE arrangement**: folder cards and notes arranged and
  /// pinned together, in the order the space remembers — a folder's address
  /// rides in the same `order` (no `.md`, so the two never collide). Untouched
  /// it opens folders-first, `board()`'s order. The tree view has chips instead.
  let laidOut = $derived(laid(layout === "grid" ? [...here.groups, ...atHand] : atHand));

  /// Which cards are folders, and which are notes. A folder card carries the
  /// notes it holds; a note does not.
  const isGroup = (card) => Array.isArray(card?.notes);

  // The same ⋮ every source carries (services/spaceMenu.js), minus the
  // completion date: a note has none. Creating lives here too.
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

  // Below 768px the ⋮ lives in the top bar's, not on the canvas.
  const lift = liftSpaceMenu();
  let lifted = $derived(lift.lifted());
  $effect(() => lift.offer(sortMenu));

  /// A folder card's own ⋮ — the same shape a note card's has: the same
  /// gesture on the same board.
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
                // The row shows the colour it names — the region's own
                // step, which is what the folder's card paints with.
                swatch: accentColor(name),
                run: () => colorFolder(group, name),
              })),
            ],
          },
          { label: S.renameFolder, run: () => renameFolder(group.path) },
          { label: S.deleteFolder, run: () => deleteFolder(group.path) },
        ];

  /// A card's own ⋮. Not built for a read-only notebook: every item writes.
  /// `beyondRing` is the ⋮ OF A RING — what the four slices did not carry.
  const cardMenu = (entry, { openInNewTab = null, beyondRing = false } = {}) =>
    noteCardMenu({
      entry,
      actions: cards,
      space: folder,
      canPin: f("pinNotes"),
      moveTargets,
      readOnly,
      openInNewTab,
      canBanner: f("banners"),
      pickImage: onPickImage,
      beyondRing,
    });

  // ---- the action ring (2026-09-14) ----
  // Holding a card opens its actions around the finger. Two slices open a
  // panel of their own: "Edit" the note's head (name and banner, the panel the
  // open note's title carries), and the ⋮ the rest of the menu — both at the
  // point the ring opened on, both through the board's one menu.
  let editing = $state(null);

  const ringFor = (card, at) => {
    if (readOnly || picking || isGroup(card)) return null;
    return noteRing({
      pinned: !!card.pinned,
      onPin: f("pinNotes") ? () => togglePin(card) : null,
      // The same targets the bulk bar offers, as a menu at the card.
      onMove: (_, point) => {
        cardMenuShown = noteMoveRows({ entry: card, actions: cards, space: folder, moveTargets });
        cardMenuAt = point ?? at;
      },
      onEdit: (_, point) => (editing = { entry: card, at: point ?? at }),
      // Into picking with nothing picked yet: a click marks from here, and a
      // hold carries — the only place a note is ever carried.
      onReorder: () => (picking = true),
      onMore: (_, point) => {
        cardMenuShown = cardMenu(card, {
          openInNewTab: () => openNote(card, { newTab: true }),
          beyondRing: true,
        });
        cardMenuAt = point ?? at;
      },
    });
  };

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

  /// Notes dropped, by a free drag, on another notepad in the sidebar: they
  /// go into that space's Inbox folder — the same move the picker makes.
  /// The pile leaves the board, so it leaves the selection too.
  const moveCardsTo = (pile, space) =>
    act(async () => {
      if (!space || space === folder) return;
      for (const card of pile) await api.moveNoteToSpace(folder, card.path, space, notesInbox);
      unpick(pile);
    });
  const unpick = (pile) => {
    const next = new Set(picked);
    for (const card of pile) next.delete(card.path);
    picked = next;
  };

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

  // ---- the masonry (services/noteColumns.js) ----
  // The cards stay direct children of the board, which is what keeps the drag
  // working — and reorder.js counts DOM slots, so its indices go through
  // `columned.order` (or `shown`) before they mean a card. Tree view: one column.
  let boardWidth = $state(0);
  /// The board element, so the folder cards inside it can be offered as drop
  /// zones (a note dropped on a folder is filed into it).
  let boardEl = $state(null);
  let columns = $derived(columnCount(boardWidth));
  let columned = $derived(columnLayout(laidOut.length, layout === "tree" ? 1 : columns));
  /// The cards in DOM order — what a reorder.js index points at.
  let shown = $derived(columned.order.map((i) => laidOut[i]));

  // A NOTE IS ONLY CARRIED WHILE PICKING (the ring's "Reorder"): outside it a
  // hold opens the ring and a mouse opens the note, on a desktop too. Dragging
  // saves what the user built as the custom order. Only on the unfiltered
  // board: reordering one folder of the tree would rewrite the rest.
  let canDrag = $derived(
    !readOnly && picking && layout === "grid" && laidOut.length > 1,
  );

  /// THE PILE a DOM slot carries (actions/reorder.js, `carried`): every
  /// picked card when the held one is picked, in the order they stand;
  /// otherwise the held one alone.
  const carriedWith = (from) => {
    const card = shown[from];
    if (!card || !picked.has(card.path)) return [from];
    return shown.flatMap((c, i) => (picked.has(c.path) ? [i] : []));
  };
  /// The cards of what the action reports — one slot, or a pile of them.
  const pileOf = (what) => (Array.isArray(what) ? what : [what]).map((i) => shown[i]);

  /// Files notes into a folder of this space — their cards dropped on a
  /// folder card. Filed away, they leave the selection.
  const fileInto = (pile, path) =>
    act(async () => {
      for (const card of pile) await api.moveNoteToSpace(folder, card.path, folder, path);
      unpick(pile);
    });

  /// NOTES dropped on another note become a FOLDER holding them all; the name
  /// is asked for. Notes only: nesting a folder in another is a MOVE the
  /// core does not offer for a folder of notes, so `canDropInto` refuses it.
  const groupNotes = (pile, target) =>
    act(async () => {
      const name = await askName(S.promptNewNoteFolder, "", { confirm: S.create });
      if (!name?.trim()) return;
      const parent = openFolder ? `${openFolder}/` : "";
      const path = `${parent}${name.trim()}`;
      await api.createNoteFolder(folder, path);
      // The one that was dropped ON first, so it keeps the top of the folder;
      // the pile follows in the order it stood.
      await api.moveNoteToSpace(folder, target.path, folder, path);
      for (const card of pile) await api.moveNoteToSpace(folder, card.path, folder, path);
      unpick(pile);
    });

  /// The arrangement a drop asks for, saved as the custom order. A card is
  /// never pinned into a block of its own here, so only the new arrangement
  /// matters out of the plan; the shell persists and refreshes, and the new
  /// order comes back with the snapshot.
  const saveOrder = async (next) => {
    try {
      await onSetOrder?.(next.map((n) => n.path));
    } catch (e) {
      onError?.(e);
    }
  };
  const reorderCards = (from, to) =>
    saveOrder(planReorder(laidOut, columned.order[from], columned.order[to], () => false).next);
  const reorderPile = (froms, to) =>
    saveOrder(
      planReorderMany(
        laidOut,
        froms.map((i) => columned.order[i]),
        columned.order[to],
        () => false,
      ).next,
    );
</script>

<!-- One note on the board — the same card whether it sits loose in a column
     or inside a folder's own pair of columns. While picking, a click picks.
     NO ⋮ ON A PHONE: holding the card opens the very same actions, and a
     button that only repeats a gesture costs the card a corner. -->
{#snippet noteItem(entry)}
  <NoteCard
    {entry}
    {root}
    banners={f("banners")}
    noteTags={f("noteTags")}
    tagColor={dot}
    showAge={f("time")}
    {dateFormat}
    {picking}
    selected={picked.has(entry.path)}
    menu={compact || picking ? [] : cardMenu(entry)}
    onPin={readOnly || !f("pinNotes") ? null : () => togglePin(entry)}
    onOpen={(_, opts) => (picking ? togglePick(entry) : openNote(entry, opts))}
    onContextMenu={openRingAt}
  />
{/snippet}

<!-- Opening a note is the shell's business: it becomes a document tab, the
     same as a list. This screen only ever lists. -->
<div class="notes-space">
  <!-- The place's own row: the name centred, the ⋮ at the far right, and an
       invisible twin of the ⋮ on the left so the name is centred on the PANEL
       (the tasks screen uses the same construction). With the ⋮ lifted into
       the shell's (compact) and no name to show, there is no row at all. -->
  {#if !lifted || (header && !picking)}
    <header class="notes-space__head">
      {#if !lifted}
        <span class="theme-mirror notes-space__mirror" aria-hidden="true">
          <span class="theme-btn--icon">
            <Icon name="dots-three-vertical" size="1rem" />
          </span>
        </span>
      {/if}
      {#if header && !picking}
        <h3 class="theme-title notes-space__title">
          {title}
          {#if dot !== undefined}
            <span class="theme-dot" style={dotStyle} aria-hidden="true"></span>
          {/if}
        </h3>
      {/if}
      {#if !lifted}
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
      {/if}
    </header>
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

  {#if !readOnly && compact && !picking}
    <!-- The phone's way in: the Home's round +, one tap, straight into the
         editor with the cursor in the body. -->
    <div class="space-fab">
      <CaptureFab canTask={false} onPick={createFresh} />
    </div>
  {:else if !readOnly && !compact}
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
        item: readOnly ? ".notes-space__never" : ".notes-space__item, .notes-space__group",
        // Carried only while picking; the rest of the time a finger's rest
        // still opens the ring (`canCarry`).
        canCarry: () => canDrag,
        onReorder: reorderCards,
        carried: carriedWith,
        onReorderMany: reorderPile,
        // The preview is the drop: the board re-read by rows, columns
        // restacked (services/noteColumns.js) — never a chain of cards each
        // taking a neighbour's slot, which on columns of unequal heights
        // reads as pieces jumping.
        project: (from, to, rects) => projectMove(rects, columned.order, columns, from, to),
        // A folder card is where NOTES are filed. A pile with a folder in it
        // has no zone at all: a folder is only ever put somewhere in the order.
        dropZones: (from) =>
          pileOf(carriedWith(from)).some(isGroup)
            ? []
            : [...(boardEl?.querySelectorAll(".notes-space__group") ?? [])],
        onDropZone: (what, zone) =>
          zone.dataset.spaceDrop != null
            ? moveCardsTo(pileOf(what), zone.dataset.spaceDrop)
            : fileInto(pileOf(what), zone.dataset.folder),
        // The free drag (Ctrl): NOTES carried to a notepad in the sidebar go
        // into its Inbox folder. A folder card offers none.
        free: readOnly ? null : (e) => e.ctrlKey || e.metaKey,
        freeZones: (from) =>
          pileOf(carriedWith(from)).some(isGroup)
            ? []
            : [...document.querySelectorAll('[data-space-drop][data-space-kind="notes"]')],
        canDropInto: (from, to) =>
          !pileOf(carriedWith(from)).some(isGroup) && !isGroup(shown[to]),
        onDropInto: (what, to) => groupNotes(pileOf(what), shown[to]),
        // A folder card has no ring — what it offers is its own head's ⋮.
        ring: (from) => ringFor(shown[from]),
      }}
    >
      <!-- ONE loop, because the board is one arrangement: a folder card and a
           note card sit side by side wherever the order puts them, and either
           can be carried. See `laidOut`. -->
      {#each columned.order as index (laidOut[index].path)}
        {@const card = laidOut[index]}
        {#if isGroup(card)}
          {@const group = card}
          <!-- A folder: a tinted block with the notes it holds shown small
               inside — titles only, never a banner. The tint is the PLACE's
               colour: a note folder carries no marker file, so none is stored.
               It OPENS OVER THE BOARD, in a popover that behaves like the board. -->
          <li
            class="notes-space__group"
            data-folder={group.path}
            class:theme-note-board__break={columned.breaks.has(index)}
          >
            <article
              class="note-group"
              class:note-group--open={anchorFolder === group.path}
              class:note-group--pinned={group.pinned}
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
                    onContextMenu={openRingAt}
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
                    {@const cards = laid(inside.cards)}
                    {@const pair = columnLayout(cards.length, 2)}
                    <ul class="theme-note-board notes-space__board notes-space__board--pair">
                      {#each pair.order as i (cards[i].path)}
                        <li
                          class="notes-space__item"
                          class:theme-note-board__break={pair.breaks.has(i)}
                        >
                          {@render noteItem(cards[i])}
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
            class:theme-note-board__break={columned.breaks.has(index)}
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

<!-- The ring's "Edit": the note's name and banner over the card, the very
     panel the open note's title carries (components/NoteHeadPanel.svelte). -->
{#if editing}
  <NoteHeadPanel
    title={editing.entry.title}
    banner={bannerOf(editing.entry.banner)}
    at={editing.at}
    onRename={(name) => cards.renameTo(folder, editing.entry, name)}
    onSet={f("banners") ? (value) => cards.banner(folder, editing.entry, value) : null}
    onChooseImage={f("banners") && onPickImage
      ? () => onPickImage((value) => cards.banner(folder, editing.entry, value))
      : null}
    onClose={() => (editing = null)}
  />
{/if}
