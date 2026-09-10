<script>
  // A user space: its own screen, chosen by the space's `type` through the
  // registry. An unknown type still renders, as the unsupported card, with
  // the folder left untouched.
  import { S } from "../services/strings.js";
  import { sourceOf, spaceComponent } from "../spaces/registry.js";

  let {
    space,
    // The colour the space READS as — its own, or its group's when it is
    // in one (services/spaceColors.js). Never `space.color` directly.
    color = null,
    lists = [],
    tags = [],
    completedName = "completed",
    notesInbox = "Inbox",
    /// The notebook's root, and every notes space of it — what a notes screen
    /// needs and a tasks screen ignores: an image address resolves against the
    /// root (services/assets.js), and "move notes to" needs somewhere to go.
    root = null,
    noteSpaces = [],
    today = null,
    dateFormat = "mm/dd/yyyy",
    /// What is pulled into the Day, so a card can say it is in today.
    dayRefs = null,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
    /// The narrow shell (shell/compact.js). There the screen does NOT say its
    /// own name: the header above it already does.
    compact = false,
    readOnly = false,
    reloadKey = 0,
    selectedTask = null,
    onOpenNote,
    onSelectTask,
    // Persist the space's arrangement in its own `.space.json`.
    onSetSpaceSort,
    onSetSpaceOrder,
    onSetSpaceNoteLayout,
    /// The notebook's default board layout for a notes space that never
    /// chose (`layout.noteLayout`); a tasks screen ignores it.
    noteLayout = "grid",
    /// `(done) => void` — the image picker, for a note card's banner.
    onPickImage = null,
    onChanged,
    onError,
  } = $props();

  // The space, in the shape the tasks/notes screens read. The NAME is the
  // space's own — the screen titles itself with it, on the row with its ⋮.
  let source = $derived(sourceOf(space));

  let Screen = $derived(spaceComponent(space.kind));

</script>

<!-- This screen does not title itself: the block below names the space, on
     the row with the ⋮. What stays is the read-only badge — the one thing
     saying the space cannot be written to, and it belongs to the space. -->
{#if space.readOnly}
  <p class="space-view__note">
    <small class="space-view__badge">{S.readOnlySpace}</small>
  </p>
{/if}

<!-- A space whose TYPE is switched off is simply not drawn (App Functions);
     its folder is left as it is. A type this build does not KNOW still gets
     the unsupported card, so nobody mistakes it for something deleted. -->
{#if f(space.kind)}
  <div class="space-view__screen">
    <!-- `header` is the title row's TITLE: below 768px the shell's header
         says the name already, so only the ⋮ is left. `dot` is the colour of
         the place, null when it has none of its own (the app's accent answers). -->
    <Screen
      {source}
      {lists}
      {tags}
      {completedName}
      {notesInbox}
      {root}
      {noteSpaces}
      {today}
      {dateFormat}
      {dayRefs}
      {f}
      header={!compact}
      dot={color}
      align="center"
      compose={compact ? "fab" : "bar"}
      {compact}
      {onPickImage}
      readOnly={readOnly || space.readOnly}
      {reloadKey}
      {selectedTask}
      {onOpenNote}
      {onSelectTask}
      onSetSort={onSetSpaceSort}
      onSetOrder={onSetSpaceOrder}
      onSetLayout={onSetSpaceNoteLayout}
      defaultLayout={noteLayout}
      {onChanged}
      {onError}
    />
  </div>
{/if}
