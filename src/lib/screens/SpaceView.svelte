<script>
  // A user space: its own screen, chosen by the space's `type`
  // (2026-08-11 — no widget layer, no host in between). The registry answers
  // with the component for the type; an unknown type still renders, as the
  // unsupported card, with the folder left untouched (spec 3.5).
  import { S } from "../services/strings.js";
  import { spaceComponent } from "../spaces/registry.js";
  import { accentStrong } from "../services/accent.js";

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
</script>

<!-- The screen's H1, so the title takes the STRONG step of the colour rather
     than the base — the same emphasis a note's own H1 gets (2026-08-17). -->
<h2
  class="theme-title theme-title--lg space-view__title"
  style={accentStrong(color) ? `color: ${accentStrong(color)}` : ""}
>
  {space.name}
  {#if space.readOnly}<small class="space-view__badge"
      >{S.readOnlySpace}</small
    >{/if}
</h2>

<!-- A space whose TYPE is switched off is simply not drawn (App
     Functions, 2026-08-06) — its folder is left exactly as it is. That is a
     different thing from a type this build does not KNOW, which still gets
     the unsupported card so nobody mistakes it for something the app
     deleted. -->
{#if f(space.kind)}
  <div class="space-view__screen">
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
