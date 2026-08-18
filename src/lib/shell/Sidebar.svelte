<script>
  // The left panel: fixed spaces on top, the user's lists and spaces
  // in their groups, notebook name and settings pinned to the bottom.
  //
  // Pure skeleton — every decision (what is open, what a click does) comes in
  // as a prop from the shell, and everything visual lives in
  // styles/components/shell.css under the `shell__*` hooks.
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

  let {
    notebook,
    /// `(key) => boolean` — is this part of the app switched on? (App
    /// Functions, 2026-08-06.)
    f = () => true,
    userLists,
    userSpaces,
    counts,
    isOpen,
    onOpen,
    onOpenList,
    onChooseFolder,
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
    // Groups (reestruturação 2026-07-30): folders that hold spaces.
    groups = [],
    onCreateGroup,
    onRenameGroup,
    onSetGroupAppearance,
    onDeleteGroup,
    onMoveSpace,
    // Collapsed to an icon rail? Owned by the shell, toggled by the button here.
    rail = false,
    onToggleRail,
    /// The narrow shell (shell/compact.js): the same sidebar, presented as a
    /// drawer that slides in over the page. Nothing about its CONTENT changes
    /// — the four head controls the wireframe draws are the four it already
    /// had — so this only says which way it is worn.
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
  } = $props();

  // Which space's appearance popup is open (its path, or null). Opened
  // from that space's ⋮ menu.
  let appearanceOpen = $state(null);

  // Groups folded shut by clicking their name. Local to the sidebar, like the
  // rail: it is how the panel is being looked at right now, not a property of
  // the notebook the other machines should inherit.
  let collapsed = $state(new Set());
  const isCollapsed = (folder) => collapsed.has(folder);
  function toggleGroup(folder) {
    const next = new Set(collapsed);
    if (!next.delete(folder)) next.add(folder);
    collapsed = next;
  }

  // Middle click opens in a fresh tab; a plain click navigates the current
  // one, the way links do (same contract as onOpenList).
  function middleOpen(event, view) {
    if (event.button !== 1) return;
    event.preventDefault();
    onOpen?.(view, true);
  }

  // Names that live inside a group — the column itself is built by
  // `sidebarEntries`, which is where "loose or grouped" is decided.
  let groupedNames = $derived(new Set(groups.flatMap((g) => g.spaces)));

  // ---- one ordered column ----
  // Groups and loose spaces used to be two `{#each}` blocks in two
  // containers, which is why a group could not be dragged at all and a
  // space could not be dragged past one (2026-08-06). What the merged
  // order MEANS — and what a drop on another entry means — is decided in
  // services/sidebarOrder.js, so it is testable without a DOM.
  let entries = $derived(sidebarEntries(userSpaces, groups));

  /// A drag inside one level rewrites only that level's run of names — the
  /// whole column is still one flat order (services/sidebarOrder.js).
  const reorderAt = (parent, from, to) =>
    onReorderEntries?.(reorderedAt(entries, parent?.key ?? null, from, to));

  /// An entry dragged clear of its level leaves the group it was in, landing
  /// in whatever holds that group. Joining by drag without a way back out
  /// would be a one-way door (user call, 2026-08-06).
  function leaveLevel(parent, index) {
    const child = parent.children[index];
    if (!child) return;
    // One level up: the root, or the group this one sits in.
    const target = parent.group.parent ?? null;
    if (child.kind === "group") onMoveGroup?.(child.group.folder, target);
    else onMoveSpace?.(child.sp.path, target);
  }

  /// Dropped on a group's head, wherever that group is in the column: the
  /// entry joins it. Moving a list from one group to another used to mean
  /// dragging it out to the root and in again (user call, 2026-08-11).
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
  // The two "+ New …" buttons used to sit at the bottom of the list, where they
  // read as two more spaces. They live here now (user call, 2026-08-06).
  let menuAt = $state(null);
  let menuShown = $state([]);

  /// A row's own menu, at the pointer. The ⋮ is gone from every row (user call,
  /// 2026-08-06): it only appeared on hover, it stole the end of every name,
  /// and it had nothing the right button could not carry.
  function openRowMenu(event, items) {
    if (notebook.readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    menuShown = items;
    menuAt = { x: event.clientX, y: event.clientY };
  }

  function openSidebarMenu(event) {
    if (notebook.readOnly) return;
    // A row has its own ⋮; this menu is for the space between them.
    if (event.target.closest(".shell__nav-item")) return;
    event.preventDefault();
    menuShown = sidebarMenu;
    menuAt = { x: event.clientX, y: event.clientY };
  }

  /// The three things that can be made, in the sidebar's empty space
  /// (`group: null`) or inside a group — where they are made INSIDE it.
  ///
  /// A space has one function, chosen at creation (spec 3.5), and the
  /// menu says which by name: a tasks one is a **list**, a notes one is a
  /// **notepad**. "New space" asked a second question nobody needed to be
  /// asked (user call, 2026-08-11).
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
          label: (spacesSort === "name" ? "  " : "✓ ") + S.sortCustom,
          run: () => onSetSpacesSort?.(""),
        },
        {
          label: (spacesSort === "name" ? "✓ " : "  ") + S.sortByName,
          run: () => onSetSpacesSort?.("name"),
        },
      ],
    },
  ]);

  // The ⋮ menu items for a space, including move-to/remove-from group.
  // A grouped space has no appearance of its own (no icon, and it follows
  // the group's colour — user call 2026-08-04), so the item only shows loose.
  const groupMenu = (group) => [
    // What is made here is made INSIDE this group — including another group
    // (they nest since 2026-08-11).
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

<!-- It DECLARES the chrome, rather than inheriting it. As a column inside the
     window it would inherit it anyway; as a drawer it is rendered outside the
     window (App.svelte), where it sits in no region at all and would get no
     colour role — it came out white on the first build, pills and space
     colours and all. Same trap the modals document, same answer. -->
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
        ...(f("tasks")
          ? [{ label: S.completed, run: () => onOpen?.({ kind: "completed" }) }]
          : []),
        ...(f("taskTags")
          ? [{ label: S.tagsManagement, run: () => onOpen?.({ kind: "tags" }) }]
          : []),
        { label: S.trash, run: () => onOpen?.({ kind: "trash" }) },
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
    <!-- Search and + (user call, 2026-08-17). Both were only reachable by
         shortcut or by right-clicking the empty column — which is nowhere at
         all once the column is full. They keep the hamburger's company on the
         left and, like it, wait for the full sidebar: 3.5rem of rail holds one
         glyph per row, and that row is the expand toggle. -->
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
      <Icon name="sidebar-simple" size="1.125rem" />
    </button>
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="shell__sidebar-scroll"
    role="presentation"
    oncontextmenu={openSidebarMenu}
  >
    <!-- Each group carries a 2px bar at the wall (design PDF). The fixed
         group is neutral; user spaces will each set their own colour
         via --group-color (Fase 13). -->
    <div class="shell__group">
      <button
        class="shell__nav-item"
        class:shell__nav-item--active={isOpen({ kind: "home" })}
        onclick={() => onOpen({ kind: "home" })}
        onauxclick={(e) => middleOpen(e, { kind: "home" })}
      >
        <!-- One glyph, open or not (user call, 2026-08-13): Home was the only
             entry that swapped to its filled variant when selected, so the
             icon changed SHAPE under the pointer while every other row just
             took the accent pill. The pill already says where you are. -->
        <Icon name="house" size="1.125rem" />
        <span class="shell__nav-label">{S.home}</span>
      </button>
      {#if f("tasks")}
        <button
          class="shell__nav-item"
          class:shell__nav-item--active={isOpen({ kind: "tasks" })}
          onclick={() => onOpen({ kind: "tasks" })}
          onauxclick={(e) => middleOpen(e, { kind: "tasks" })}
        >
          <Icon name="check-square" size="1.125rem" />
          <span class="shell__nav-label">{S.tasks}</span>
        </button>
      {/if}
      {#if f("notes")}
        <button
          class="shell__nav-item"
          class:shell__nav-item--active={isOpen({ kind: "notes" })}
          onclick={() => onOpen({ kind: "notes" })}
          onauxclick={(e) => middleOpen(e, { kind: "notes" })}
        >
          <Icon name="note" size="1.125rem" />
          <span class="shell__nav-label">{S.notes}</span>
        </button>
      {/if}
    </div>

    <hr class="theme-divider" />

    <!-- The user's lists reorder by drag (the whole item, like the tabs); the
         action skips the fixed Completed/new-list rows below by matching only
         the --reorderable items. -->
    {#if f("tasks")}
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
          onauxclick={(e) =>
            e.button === 1 && (e.preventDefault(), onOpenList(entry.path, true))}
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

    <!-- Spaces. Each row's whole surface carries the hover and the
         selected highlight (tinted with the space's own colour), with the
         ⋮ inside it. Groups (reestruturação 2026-07-30) render as titled
         sections that hold their member spaces; loose ones sit below. -->

    <!-- One space row: the same .shell__nav-item band the fixed entries
         use, as a DIV so the ⋮ can sit inside the highlight. Grouped members
         (2026-08-04) are the shorter, icon-less variant — they follow the
         GROUP's colour and vanish in the rail. -->
    {#snippet spaceRow(sp, grouped)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="shell__nav-item shell__nav-item--row"
        class:shell__nav-item--member={grouped}
        class:shell__nav-item--active={isOpen({ kind: "space", sp: sp.path })}
        oncontextmenu={(e) => openRowMenu(e, spaceMenu(sp))}
      >
        <button
          class="shell__nav-open"
          onclick={() => onOpen({ kind: "space", sp: sp.path })}
          onauxclick={(e) => middleOpen(e, { kind: "space", sp: sp.path })}
        >
          <!-- A member draws its icon too (user call, 2026-08-06), a size
               down — it keeps the rail usable, where the label is gone and the
               icon is all there is. Untinted: the colour belongs to the group,
               for the whole section. -->
          <Icon name={spaceIcon(sp)} size={grouped ? "1rem" : "1.125rem"} />
          <span class="shell__nav-label">{sp.name}</span>
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

    <!-- Groups and loose entries, in ONE ordered column so a group can be
         dragged between two lists and a list dropped into a group. Dropping
         something on the MIDDLE of another makes a group of the two (the
         reorder action's `onDropInto`); between them, it just reorders.
         Groups hold groups (2026-08-11), so the column is a TREE: one snippet
         that renders itself, each level its own ordered list. That is what
         makes a drag inside a group reorder that group, and a drag out of it
         land one level up. -->
    {#snippet column(list, parent)}
      <div
        class="shell__spaces"
        class:shell__spaces--nested={!!parent}
        use:reorderable={{
          axis: "y",
          item: ".shell__entry",
          // By the NAME row only (user call, 2026-08-06): a group is grabbed
          // by its head, and the colour popup inside the row is left alone.
          // The INNERMOST list owns the gesture (see actions/reorder.js), so
          // grabbing a member drags the member, not the group holding it.
          handle: ".shell__nav-open",
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
              style={accentStyle(entry.group.color, {
                color: "--group-color",
                tint: "--group-tint",
              }) || undefined}
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
                  <!-- The head is a toggle, and nothing said so: it looked like
                       every other row and behaved differently (user call,
                       2026-08-13). The caret points where the members are. -->
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
                 inside a group has neither — the colour is the group's, for
                 the whole section (user call, 2026-08-04). -->
            <div
              class="shell__entry"
              class:shell__group={!parent}
              class:shell__group--space={!parent}
              style={(!parent &&
                accentStyle(entry.sp.color, {
                  color: "--group-color",
                  tint: "--group-tint",
                })) ||
                undefined}
            >
              {@render spaceRow(entry.sp, !!parent)}
            </div>
          {/if}
        {/each}
      </div>
    {/snippet}

    {@render column(entries, null)}

    <!-- An empty column has nothing to right-click, so the first entries still
         have buttons (user call, 2026-08-06). They say what they make: asking
         for "a space" and quietly making a task list was the bug of
         2026-08-11. They go away as soon as there is one entry — from then on
         the menu is where new things are made, and permanent buttons at the
         bottom of the list read as two more entries. -->
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
    <button
      class="shell__notebook"
      title={notebook.path}
      onclick={onChooseFolder}
    >
      <span class="shell__notebook-name">{notebook.name}</span>
      {#if notebook.readOnly}<span class="shell__badge">{S.readOnly}</span>{/if}
    </button>
    <button
      class="theme-btn--icon shell__settings"
      class:shell__settings--active={isOpen({ kind: "settings" })}
      onclick={() => onOpen({ kind: "settings" })}
      aria-label={S.settings}
      title={S.settings}
    >
      <Icon name="gear" size="1.125rem" />
    </button>
  </div>
</nav>
