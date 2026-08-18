<script>
  // A user space: its own screen, chosen by the space's `type`
  // (2026-08-11 — no widget layer, no host in between). The registry answers
  // with the component for the type; an unknown type still renders, as the
  // unsupported card, with the folder left untouched (spec 3.5).
  import { S } from "../services/strings.js";
  import { spaceComponent } from "../spaces/registry.js";

  let {
    space,
    // The colour the space READS as — its own, or its group's when it is
    // in one (services/spaceColors.js). Never `space.color` directly.
    color = null,
    lists = [],
    counts = {},
    tags = [],
    completedName = "completed",
    notesInbox = "Inbox",
    today = null,
    dateFormat = "mm/dd/yyyy",
    /// What is pulled into the Day, so a card can say it is in today.
    dayRefs = null,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
    /// The narrow shell (shell/compact.js). There the screen does NOT say its
    /// own name: the header above it already does, and the two were reading as
    /// the same word printed twice (user report, 2026-08-18).
    compact = false,
    readOnly = false,
    reloadKey = 0,
    selectedTask = null,
    onOpenList,
    onOpenNote,
    onSelectTask,
    // Persist the space's arrangement in its own `.space.json`.
    onSetSpaceSort,
    onSetSpaceOrder,
    onChanged,
    onError,
  } = $props();

  // The space, in the shape the tasks/notes screens read: the folder is
  // the space's own root-relative path, and the NAME is the space's own — the
  // screen titles itself with it (2026-08-18), so the row that names the place
  // and the row that carries its ⋮ are one row, as the wireframes draw them.
  let source = $derived({
    kind: space.kind,
    known: space.known,
    folder: space.path,
    name: space.name,
    sort: space.sort ?? null,
    order: space.order ?? [],
  });

  let Screen = $derived(spaceComponent(space.kind));

</script>

<!-- THIS SCREEN NO LONGER TITLES ITSELF (user call, 2026-08-18: a user space
     should look like the fixed Tasks and Notes screens, and those are the
     screen alone). It had a heading of its own on top of the one the block
     below already draws, so a space said its name twice on the desktop and
     three times on a phone. The name — in ink, with the dot of the place
     beside it — moved INTO that row, where the ⋮ already was.

     What stays here is the read-only badge: it is the only thing on screen
     saying the space cannot be written to, and it belongs to the space rather
     than to the screen inside it. -->
{#if space.readOnly}
  <p class="space-view__note">
    <small class="space-view__badge">{S.readOnlySpace}</small>
  </p>
{/if}

<!-- A space whose TYPE is switched off is simply not drawn (App
     Functions, 2026-08-06) — its folder is left exactly as it is. That is a
     different thing from a type this build does not KNOW, which still gets
     the unsupported card so nobody mistakes it for something the app
     deleted. -->
{#if f(space.kind)}
  <div class="space-view__screen">
    <!-- The screen IS the space here, so it takes the shape the fixed Tasks
         and Notes screens have (user call, 2026-08-18): the name centred on
         its own row with the ⋮ at the far end, and — for tasks — the composer
         pinned to the bottom rather than a "New task" button in the corner.
         `header` is that row's TITLE: below 768px the shell's header says the
         name already, so only the ⋮ is left. `dot` is the colour of the place,
         null when it has none of its own (the app's accent answers). -->
    <Screen
      {source}
      {lists}
      {counts}
      {tags}
      {completedName}
      {notesInbox}
      {today}
      {dateFormat}
      {dayRefs}
      {f}
      header={!compact}
      dot={color}
      align="center"
      compose="bar"
      readOnly={readOnly || space.readOnly}
      {reloadKey}
      {selectedTask}
      {onOpenList}
      {onOpenNote}
      {onSelectTask}
      onSetSort={onSetSpaceSort}
      onSetOrder={onSetSpaceOrder}
      {onChanged}
      {onError}
    />
  </div>
{/if}
