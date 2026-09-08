<script>
  // The left panel: fixed spaces, the user's lists and spaces in their
  // groups, notebook name and settings pinned to the bottom. Pure skeleton —
  // every decision comes in as a prop from the shell, and everything visual
  // lives in styles/components/shell.css under the `shell__*` hooks.
  import Icon from "../components/Icon.svelte";
  import Menu from "../components/Menu.svelte";
  import SpaceAppearance from "../components/SpaceAppearance.svelte";
  import { S } from "../services/strings.js";
  import ContextMenu from "../components/ContextMenu.svelte";
  import {
    sidebarEntries,
    reorderedAt,
    dropMeaning,
  } from "../services/sidebarOrder.js";
  import { reorderable } from "../actions/reorder.js";
  import { spaceIcon } from "../services/spaceIcon.js";
  import { accentStyle } from "../services/accent.js";
  import { openIn } from "../services/counts.js";
  import { notebookRows } from "../services/notebookMenu.js";

  let {
    notebook,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
    userLists,
    userSpaces,
    counts,
    isOpen,
    /// `(view) => boolean` — does this place hold the open view without being
    /// it? It wears the same pill: a note read from inside Notes is "in Notes".
    holds = () => false,
    onOpen,
    onOpenList,
    /// `() => void` — the notebooks screen (the folder picker is one of its doors).
    onNotebooks,
    /// `() => Promise<RecentNotebook[]>` — what the footer's menu lists: the
    /// notebooks this machine has opened. Asked when the menu OPENS, never
    /// before — answering it is a walk of every folder.
    onListNotebooks = null,
    /// `(path, newWindow) => void` — a row of that menu: this window becomes
    /// that notebook, or (the middle button) a new window does.
    onSwitchNotebook = null,
    // Drag-to-reorder handlers (the shared action reports from→to). The shell
    // persists the order in the config.
    onReorderLists,
    /// The sidebar's whole running order, groups and loose spaces alike,
    /// as a flat list of names. One list because they share one column: a
    /// group has to be draggable between two spaces and back.
    onReorderEntries,
    /// Two entries to become a group — the shell asks for the name.
    onGroupWith,
    /// A group moved into another group, or back out (`null`).
    onMoveGroup,
    /// `""` (the dragged order) or `"name"`.
    spacesSort = "",
    onSetSpacesSort,
    // Space management (create / rename / appearance / delete).
    onCreateSpace,
    onRenameSpace,
    onSetSpaceAppearance,
    onDeleteSpace,
    // Groups: folders that hold spaces.
    groups = [],
    onCreateGroup,
    onRenameGroup,
    onSetGroupAppearance,
    onDeleteGroup,
    onMoveSpace,
    // Collapsed to an icon rail? Owned by the shell, toggled by the button here.
    rail = false,
    onToggleRail,
    /// The narrow shell (shell/compact.js): the same sidebar, worn as a drawer
    /// that slides in over the page. Nothing about its CONTENT changes.
    compact = false,
    /// Whether the drawer is showing. Ignored outside the compact shell, where
    /// the sidebar is a column and is always there.
    open = false,
    /// A finger is carrying the drawer right now (actions/drawerSwipe.js): it
    /// sits wherever the drag has got to, with its own transition off.
    sliding = false,
    /// Opens the notebook-wide search box (the shell owns the dialog, because
    /// it opens over whatever screen is showing).
    onSearch,
    /// What a space / a group READS as (services/spaceColors.js) — the
    /// group's colour for a member, and a dealt one when the notebook asked
    /// for the rainbow. The rows draw these, never `sp.color` straight: the
    /// stored colour is what the appearance popup edits, not what is shown.
    spaceColor = (path) => userSpaces.find((sp) => sp.path === path)?.color ?? null,
    groupColor = (folder) => groups.find((g) => g.folder === folder)?.color ?? null,
  } = $props();


  // Which space's appearance popup is open (its path, or null). Opened
  // from that space's ⋮ menu.
  let appearanceOpen = $state(null);

  // Groups folded shut by clicking their name. Local, like the rail: how the
  // panel is being looked at, not a property of the notebook.
  let collapsed = $state(new Set());
  const isCollapsed = (folder) => collapsed.has(folder);
  function toggleGroup(folder) {
    const next = new Set(collapsed);
    if (!next.delete(folder)) next.add(folder);
    collapsed = next;
  }

  // Middle click opens in a fresh tab, the way links do. `run` is what
  // opening in a new tab IS for that row — `onOpen(view, true)` or
  // `onOpenList(path, true)`.
  function middleOpen(event, run) {
    if (event.button !== 1) return;
    event.preventDefault();
    run();
  }

  // ---- the footer's notebook menu ----
  // The name in the footer opens the list of notebooks this machine knows,
  // the open one ticked; the last row is the screen that manages them. The
  // list is fetched on open.
  let recentNotebooks = $state([]);
  function openNotebookMenu(toggle) {
    toggle();
    onListNotebooks?.().then((list) => (recentNotebooks = list ?? []));
  }
  let notebookMenu = $derived(
    notebookRows(recentNotebooks, notebook?.path, {
      onSwitch: onSwitchNotebook,
      onManage: onNotebooks,
    }),
  );

  // ---- one ordered column ----
  // Groups and loose spaces share ONE list, so a group drags between spaces
  // and a space drags past a group. What the merged order MEANS, and what a
  // drop on another entry means, is decided in services/sidebarOrder.js.
  let entries = $derived(sidebarEntries(userSpaces, groups));

  /// A drag inside one level rewrites only that level's run of names — the
  /// whole column is still one flat order (services/sidebarOrder.js).
  const reorderAt = (parent, from, to) =>
    onReorderEntries?.(reorderedAt(entries, parent?.key ?? null, from, to));

  /// An entry dragged clear of its level leaves the group it was in, landing
  /// in whatever holds that group — joining by drag has a way back out.
  function leaveLevel(parent, index) {
    const child = parent.children[index];
    if (!child) return;
    // One level up: the root, or the group this one sits in.
    const target = parent.group.parent ?? null;
    if (child.kind === "group") onMoveGroup?.(child.group.folder, target);
    else onMoveSpace?.(child.sp.path, target);
  }

  /// Dropped on a group's head, wherever that group is in the column: the
  /// entry joins it (one drag moves a list between two groups).
  function dropOnGroup(list, from, zone) {
    const entry = list[from];
    const folder = zone.dataset.groupDrop;
    if (!entry || !folder) return;
    if (entry.kind === "group") onMoveGroup?.(entry.group.folder, folder);
    else onMoveSpace?.(entry.sp.path, folder);
  }

  function dropAt(list, from, into) {
    const meaning = dropMeaning(list, from, into);
    if (!meaning) return;
    if (meaning.kind === "intoGroup") {
      onMoveSpace?.(meaning.space.path, meaning.group.folder);
    } else if (meaning.kind === "groupIntoGroup") {
      onMoveGroup?.(meaning.moving.folder, meaning.group.folder);
    } else {
      onGroupWith?.(meaning.host, meaning.space);
    }
  }

  // ---- the right-click menu on empty space ----
  let menuAt = $state(null);
  let menuShown = $state([]);

  /// A row's own menu, at the pointer. Rows carry no ⋮: the right button
  /// carries everything it would.
  function openRowMenu(event, items) {
    if (notebook.readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    menuShown = items;
    menuAt = { x: event.clientX, y: event.clientY };
  }

  function openSidebarMenu(event) {
    if (notebook.readOnly) return;
    // A row has its own menu; this one is for the space between them.
    if (event.target.closest(".shell__nav-item")) return;
    event.preventDefault();
    menuShown = sidebarMenu;
    menuAt = { x: event.clientX, y: event.clientY };
  }

  /// The three things that can be made, in the empty space (`group: null`)
  /// or INSIDE a group. A space has one function, chosen at creation (spec
  /// 3.5), and the menu names it: a tasks one is a **list**, a notes one a
  /// **notepad**.
  const createMenu = (group = null) => [
    { label: S.newGroup, run: () => onCreateGroup?.(group) },
    { label: S.newList, run: () => onCreateSpace?.("tasks", group) },
    { label: S.newNotepad, run: () => onCreateSpace?.("notes", group) },
  ];

  let sidebarMenu = $derived([
    ...createMenu(null),
    {
      label: S.sortTasks,
      items: [
        {
          label: S.sortCustom,
          checked: spacesSort !== "name" && spacesSort !== "type",
          run: () => onSetSpacesSort?.(""),
        },
        {
          label: S.sortByName,
          checked: spacesSort === "name",
          run: () => onSetSpacesSort?.("name"),
        },
        {
          label: S.sortByType,
          checked: spacesSort === "type",
          run: () => onSetSpacesSort?.("type"),
        },
      ],
    },
  ]);

  // The menu of a group's head.
  const groupMenu = (group) => [
    // What is made here is made INSIDE this group — including another group.
    ...createMenu(group.folder),
    { label: S.renameGroup, run: () => onRenameGroup?.(group.folder, group.name) },
    {
      label: S.spaceAppearance,
      run: () => (appearanceOpen = `group:${group.folder}`),
    },
    ...(group.parent
      ? [{ label: S.removeFromGroup, run: () => onMoveGroup?.(group.folder, null) }]
      : []),
    { label: S.deleteGroup, run: () => onDeleteGroup?.(group.folder, group.name) },
  ];

  /// The group holding a space, if one does.
  const groupOf = (name) => groups.find((group) => group.spaces.includes(name)) ?? null;

  function spaceMenu(sp) {
    const holder = groupOf(sp.path);
    const items = [
      { label: S.renameSpace, run: () => onRenameSpace?.(sp.path, sp.name) },
    ];
    // A member picks its ICON but not its colour: the colour is the group's.
    items.push({
      label: holder ? S.iconOnly : S.spaceAppearance,
      run: () => (appearanceOpen = sp.path),
    });
    if (holder) {
      // Out to whatever holds the group — one level up, not all the way to the
      // root: with groups nesting, "out" means out of THIS one.
      items.push({
        label: S.removeFromGroup,
        run: () => onMoveSpace?.(sp.path, holder.parent ?? null),
      });
    }
    for (const g of groups) {
      if (!g.spaces.includes(sp.path)) {
        items.push({
          label: `${S.moveToGroup}: ${g.name}`,
          run: () => onMoveSpace?.(sp.path, g.folder),
        });
      }
    }
    items.push({ label: S.deleteSpace, run: () => onDeleteSpace?.(sp.path, sp.name) });
    return items;
  }
</script>

<!-- It DECLARES the chrome rather than inheriting it: as a drawer it is
     rendered outside the window (App.svelte), in no region at all, and would
     get no colour role — white, pills and space colours and all. -->
<nav
  data-region="chrome"
  class="shell__sidebar"
  class:shell__sidebar--rail={rail}
  class:shell__sidebar--drawer={compact}
  class:shell__sidebar--open={compact && open}
  class:is-sliding={compact && sliding}
  inert={compact && !open && !sliding}
>
  <!-- Head: the hamburger to the lesser pages (Completed, Tags, Trash) on the
       left, the rail collapse toggle on the right. -->
  <div class="shell__sidebar-head theme-pane-head">
    <Menu
      align="start"
      items={[
        // Each row is a screen, so each takes the middle button too: the
        // `gesture` a row is run with says whether to open in a new tab
        // (components/MenuItems.svelte).
        ...(f("tasks") && f("tasksSpace")
          ? [{ label: S.completed, run: (g) => onOpen?.({ kind: "completed" }, !!g?.newTab) }]
          : []),
        ...(f("taskTags")
          ? [{ label: S.tagsManagement, run: (g) => onOpen?.({ kind: "tags" }, !!g?.newTab) }]
          : []),
        // The notebook's images: they belong to the NOTEBOOK, not to any one
        // space, so no space's menu could own them.
        ...(f("notes")
          ? [{ label: S.assetsTitle, run: (g) => onOpen?.({ kind: "assets" }, !!g?.newTab) }]
          : []),
        { label: S.trash, run: (g) => onOpen?.({ kind: "trash" }, !!g?.newTab) },
      ]}
    >
      {#snippet trigger({ toggle })}
        <button
          class="theme-btn--icon shell__menu"
          onclick={toggle}
          aria-label={S.menu}
          title={S.menu}
        >
          <Icon name="list" size="1.125rem" />
        </button>
      {/snippet}
    </Menu>
    <!-- The Timeline: the one screen of the time axis, reached from here and
         nowhere else — the notebook's, like the search beside it. -->
    {#if f("timeline")}
      <button
        class="theme-btn--icon shell__head-action"
        class:shell__head-action--active={isOpen({ kind: "timeline" })}
        onclick={() => onOpen?.({ kind: "timeline" })}
        onauxclick={(e) => middleOpen(e, () => onOpen?.({ kind: "timeline" }, true))}
        aria-label={S.timeline}
        title={S.timeline}
      >
        <Icon name="path" size="1.125rem" />
      </button>
    {/if}
    <!-- Search and +: the right-click on the empty column is nowhere once the
         column is full. Like the hamburger they wait for the full sidebar:
         3.5rem of rail holds one glyph per row, and that row is the expand toggle. -->
    <button
      class="theme-btn--icon shell__head-action"
      onclick={() => onSearch?.()}
      aria-label={S.search}
      title={S.findTitle}
    >
      <Icon name="magnifying-glass" size="1.125rem" />
    </button>
    {#if !notebook.readOnly}
      <Menu align="start" items={createMenu(null)}>
        {#snippet trigger({ toggle })}
          <button
            class="theme-btn--icon shell__head-action"
            onclick={toggle}
            aria-label={S.newEntry}
            title={S.newEntry}
          >
            <Icon name="plus" size="1.125rem" />
          </button>
        {/snippet}
      </Menu>
    {/if}
    <button
      class="theme-btn--icon shell__collapse"
      onclick={() => onToggleRail?.()}
      aria-label={compact ? S.closeSheet : rail ? S.expandSidebar : S.collapseSidebar}
      title={compact ? S.closeSheet : rail ? S.expandSidebar : S.collapseSidebar}
    >
      <!-- Same rule as the inspector's: as a column it folds to the side, as a
           drawer over the page it simply closes. -->
      <Icon name={compact ? "x" : "sidebar-simple"} size="1.125rem" />
    </button>
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="shell__sidebar-scroll"
    role="presentation"
    oncontextmenu={openSidebarMenu}
  >
    <!-- One fixed row: a view, glyph, label and — for the one holding tasks —
         how many are open. `drop`: what a FREE drag (Ctrl) may land here —
         `data-space-drop` + `data-space-kind` for a space (a task into its
         Inbox, a note into its Inbox folder), `data-day-drop` for the Home. -->
    {#snippet fixedRow(view, icon, label, count = 0, drop = {})}
      <button
        class="shell__nav-item"
        class:shell__nav-item--active={isOpen(view) || holds(view)}
        {...drop}
        onclick={() => onOpen(view)}
        onauxclick={(e) => middleOpen(e, () => onOpen?.(view, true))}
      >
        <Icon name={icon} size="1.125rem" />
        <span class="shell__nav-label">{label}</span>
        {#if count}
          <span class="shell__count">{count}</span>
        {/if}
      </button>
    {/snippet}
    <!-- With every fixed row hidden the whole group goes, divider included —
         an empty group would leave a stray second line at the top. -->
    {#if f("homeSpace") || (f("tasks") && f("tasksSpace")) || (f("notes") && f("notesSpace"))}
      <div class="shell__group">
        <!-- One glyph, open or not: the pill already says where you are. Each
             fixed row also answers to its own switch (Fixed spaces): hiding one
             takes the shortcut and the screen — the folders and the function stay. -->
        {#if f("homeSpace")}
          {@render fixedRow({ kind: "home" }, "house", S.home, 0, { "data-day-drop": "" })}
        {/if}
        {#if f("tasks") && f("tasksSpace")}
          <!-- A row that holds tasks says how many are open; this one holds the
               Inbox and every list beside it. -->
          {@render fixedRow(
            { kind: "tasks" },
            "check-square",
            S.tasks,
            openIn(counts, notebook?.layout?.tasksFolder),
            { "data-space-drop": notebook?.layout?.tasksFolder, "data-space-kind": "tasks" },
          )}
        {/if}
        {#if f("notes") && f("notesSpace")}
          {@render fixedRow({ kind: "notes" }, "note", S.notes, 0, {
            "data-space-drop": notebook?.layout?.notesFolder,
            "data-space-kind": "notes",
          })}
        {/if}
      </div>

      <hr class="theme-divider" />
    {/if}

    <!-- The user's lists reorder by drag; the action matches only the
         --reorderable items. They are files of the fixed Tasks space, so they
         go with it. -->
    {#if f("tasks") && f("tasksSpace")}
    <div
      class="shell__group"
      use:reorderable={{
        axis: "y",
        item: ".shell__nav-item--reorderable",
        onReorder: onReorderLists,
      }}
    >
      {#each userLists as entry (entry.path)}
        <button
          class="shell__nav-item shell__nav-item--reorderable"
          class:shell__nav-item--active={isOpen({ kind: "list", list: entry.path })}
          onclick={() => onOpenList(entry.path)}
          onauxclick={(e) => middleOpen(e, () => onOpenList(entry.path, true))}
          title={S.openInNewTab}
        >
          <Icon name="list-bullets" size="1.125rem" />
          <span class="shell__nav-label">{entry.name}</span>
          {#if counts[entry.path]}<span class="shell__count"
              >{counts[entry.path]}</span
            >{/if}
        </button>
      {/each}
    </div>
    {/if}

    <!-- Spaces. Each row's whole surface carries the hover and the selected
         highlight (tinted with the space's colour). Groups render as titled
         sections holding their members; loose ones sit below. -->

    <!-- One space row: the same .shell__nav-item band the fixed entries use,
         as a DIV so a popup can sit inside the highlight. Grouped members are
         the shorter variant — they follow the GROUP's colour and vanish in the rail. -->
    {#snippet spaceRow(sp, grouped)}
      <!-- A space of tasks counts what is open in it. A notepad has nothing
           to count, and an unknown type is not guessed at. -->
      {@const open = sp.kind === "tasks" ? openIn(counts, sp.path) : 0}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="shell__nav-item shell__nav-item--row"
        class:shell__nav-item--member={grouped}
        class:shell__nav-item--active={isOpen({ kind: "space", sp: sp.path }) ||
          holds({ kind: "space", sp: sp.path })}
        data-space-drop={sp.path}
        data-space-kind={sp.kind}
        oncontextmenu={(e) => openRowMenu(e, spaceMenu(sp))}
      >
        <button
          class="shell__nav-open"
          onclick={() => onOpen({ kind: "space", sp: sp.path })}
          onauxclick={(e) => middleOpen(e, () => onOpen?.({ kind: "space", sp: sp.path }, true))}
        >
          <!-- A member draws its icon too, a size down — it keeps the rail
               usable, where the icon is all there is. Untinted: the colour
               belongs to the group. -->
          <Icon name={spaceIcon(sp)} size={grouped ? "1rem" : "1.125rem"} />
          <span class="shell__nav-label">{sp.name}</span>
          {#if open}
            <span class="shell__count">{open}</span>
          {/if}
        </button>
        <!-- The colour/icon popup still needs somewhere to hang; it is only in
             the DOM while it is open, so nothing marks the row otherwise. -->
        {#if appearanceOpen === sp.path}
          <span class="shell__ws-tools shell__ws-tools--open">
            <SpaceAppearance
              open
              colors={!grouped}
              color={sp.color}
              icon={sp.icon}
              onClose={() => (appearanceOpen = null)}
              onColor={(c) => onSetSpaceAppearance?.(sp.path, c, sp.icon)}
              onIcon={(i) => onSetSpaceAppearance?.(sp.path, sp.color, i)}
            />
          </span>
        {/if}
      </div>
    {/snippet}

    <!-- Groups and loose entries in ONE ordered column: a group drags between
         two lists, a list drops into a group. A drop on the MIDDLE of another
         entry makes a group of the two (`onDropInto`); between them, it reorders.
         Groups nest, so the column is a TREE — one snippet rendering itself per level. -->
    {#snippet column(list, parent)}
      <div
        class="shell__spaces"
        class:shell__spaces--nested={!!parent}
        use:reorderable={{
          axis: "y",
          item: ".shell__entry",
          // By the NAME row only: a group is grabbed by its head, and the colour
          // popup inside the row is left alone. The INNERMOST list owns the
          // gesture (actions/reorder.js), so grabbing a member drags the member.
          handle: ".shell__nav-open",
          // The handle is also the button that OPENS the space, so a finger on
          // it proves nothing — it rests first, like everywhere else.
          hold: true,
          onReorder: (from, to) => reorderAt(parent, from, to),
          onDropInto: (from, into) => dropAt(list, from, into),
          onDragOut: parent ? (index) => leaveLevel(parent, index) : undefined,
          // Every group head in the column, at any depth: that is what makes
          // one drag enough to move between two groups.
          dropZones: () => document.querySelectorAll("[data-group-drop]"),
          onDropZone: (from, zone) => dropOnGroup(list, from, zone),
        }}
      >
        {#each list as entry (entry.key)}
          {#if entry.kind === "group"}
            <div
              class="shell__entry shell__group shell__group--space"
              style={accentStyle(groupColor(entry.group.folder), {
                color: "--group-color",
                tint: null,
              })}
            >
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="shell__nav-item shell__nav-item--row shell__nav-item--head"
                data-group-drop={entry.group.folder}
                oncontextmenu={(e) => openRowMenu(e, groupMenu(entry.group))}
              >
                <button
                  class="shell__nav-open"
                  onclick={() => toggleGroup(entry.group.folder)}
                  aria-expanded={!isCollapsed(entry.group.folder)}
                  title={isCollapsed(entry.group.folder) ? S.expandGroup : S.collapseGroup}
                >
                  <Icon name={entry.group.icon || "folders"} size="1.125rem" />
                  <span class="shell__nav-label">{entry.group.name}</span>
                  <!-- The head is a toggle; the caret says so, and points where
                       the members are. -->
                  <span class="shell__group-caret">
                    <Icon
                      name={isCollapsed(entry.group.folder) ? "caret-right" : "caret-down"}
                      size="0.875rem"
                    />
                  </span>
                </button>
                {#if appearanceOpen === `group:${entry.group.folder}`}
                  <span class="shell__ws-tools shell__ws-tools--open">
                    <SpaceAppearance
                      open
                      color={entry.group.color}
                      icon={entry.group.icon}
                      onClose={() => (appearanceOpen = null)}
                      onColor={(c) =>
                        onSetGroupAppearance?.(entry.group.folder, c, entry.group.icon)}
                      onIcon={(i) =>
                        onSetGroupAppearance?.(entry.group.folder, entry.group.color, i)}
                    />
                  </span>
                {/if}
              </div>
              {#if !isCollapsed(entry.group.folder)}
                {@render column(entry.children, entry)}
              {/if}
            </div>
          {:else}
            <!-- A loose entry carries the section bar and its own colour; one
                 inside a group has neither — the colour is the group's. -->
            <div
              class="shell__entry"
              class:shell__group={!parent}
              class:shell__group--space={!parent}
              style={!parent
                ? accentStyle(spaceColor(entry.sp.path), {
                    color: "--group-color",
                    tint: null,
                  })
                : undefined}
            >
              {@render spaceRow(entry.sp, !!parent)}
            </div>
          {/if}
        {/each}
      </div>
    {/snippet}

    {@render column(entries, null)}

    <!-- An empty column has nothing to right-click, so the first entries still
         have buttons, saying what they make. They go away with the first entry:
         permanent buttons at the bottom of the list read as two more entries. -->
    {#if !notebook.readOnly && entries.length === 0}
      <button
        class="shell__nav-item shell__nav-item--secondary"
        onclick={() => onCreateSpace?.("tasks", null)}
      >
        <Icon name="plus" size="1rem" />
        <span class="shell__nav-label">{S.newList}</span>
      </button>
      <button
        class="shell__nav-item shell__nav-item--secondary"
        onclick={() => onCreateSpace?.("notes", null)}
      >
        <Icon name="plus" size="1rem" />
        <span class="shell__nav-label">{S.newNotepad}</span>
      </button>
    {/if}
  </div>

  <ContextMenu at={menuAt} items={menuShown} onClose={() => (menuAt = null)} />

  <div class="shell__sidebar-footer theme-pane-foot">
    <Menu align="start" items={notebookMenu}>
      {#snippet trigger({ toggle })}
        <button
          class="shell__notebook"
          title={notebook.path}
          aria-label={S.notebookMenu}
          onclick={() => openNotebookMenu(toggle)}
        >
          <span class="shell__notebook-name">{notebook.name}</span>
          {#if notebook.readOnly}<span class="shell__badge">{S.readOnly}</span>{/if}
          <Icon name="caret-up" size="0.75rem" />
        </button>
      {/snippet}
    </Menu>
    <button
      class="theme-btn--icon shell__settings"
      class:shell__settings--active={isOpen({ kind: "settings" })}
      onclick={() => onOpen({ kind: "settings" })}
      onauxclick={(e) => middleOpen(e, () => onOpen?.({ kind: "settings" }, true))}
      aria-label={S.settings}
      title={S.settings}
    >
      <Icon name="gear" size="1.125rem" />
    </button>
  </div>
</nav>
