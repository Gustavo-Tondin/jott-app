<script>
  // A user space: its own screen, chosen by the space's `type`
  // (2026-08-11 — no widget layer, no host in between). The registry answers
  // with the component for the type; an unknown type still renders, as the
  // unsupported card, with the folder left untouched (spec 3.5).
  import { S } from "../services/strings.js";
  import { spaceComponent } from "../spaces/registry.js";
  import { accentColor } from "../services/accent.js";

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
  // the space's own root-relative path.
  let source = $derived({
    kind: space.kind,
    known: space.known,
    folder: space.path,
    name: null,
    sort: space.sort ?? null,
    order: space.order ?? [],
  });

  let Screen = $derived(spaceComponent(space.kind));

  /// The place's colour as CSS; unset falls back to the app's accent in the
  /// class itself (services/accent.js).
  let dotStyle = $derived(accentColor(color) ? `--dot: ${accentColor(color)}` : "");
</script>

<!-- The name in INK, and the colour of the place said once, by the dot beside
     it (user call, 2026-08-18) — the same pair the Home card and the compact
     header draw. The title used to BE the colour, at its strong step, and a
     heading dark enough to read was too dark to still look like the colour it
     was naming.

     ONLY ON THE DESKTOP. Below 768px the header carries the name and the dot
     itself, right above this, and the canvas repeating them was the same word
     twice on a screen that has no room for it (user report, 2026-08-18). What
     the compact shell must NOT lose with it is the read-only badge — it is the
     only thing on screen saying the space cannot be written to. -->
{#if !compact}
  <h2 class="theme-title theme-title--lg space-view__title">
    {space.name}
    <span class="theme-dot" style={dotStyle} aria-hidden="true"></span>
    {#if space.readOnly}<small class="space-view__badge"
        >{S.readOnlySpace}</small
      >{/if}
  </h2>
{:else if space.readOnly}
  <p class="space-view__title space-view__note">
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
    <!-- `header` is the block's own titled row. It says the space's name too,
         which below 768px would be that name a THIRD time; the row itself
         stays either way, because it is where the ⋮ lives. -->
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
