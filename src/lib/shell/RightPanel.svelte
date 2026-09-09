<script>
  // RIGHT: one panel, one tenant — the task inspector, the day's suggestions
  // or an open note's formatting. `tenant` (`"suggestions"` / `"task"` /
  // `"format"` / null) is the shell's call, made once, so handle, column and
  // sheet never disagree. The wrapper's width slides like the left rail's;
  // the inner panel keeps a fixed width so content is clipped, not reflowed.
  import { slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import PanelResizer from "./PanelResizer.svelte";
  import { PANEL } from "./sidebarWidth.js";
  import BottomSheet from "../components/BottomSheet.svelte";
  import SuggestionsPane from "../components/SuggestionsPane.svelte";
  import NotePanel from "../components/NotePanel.svelte";
  import TaskInspector from "../components/TaskInspector.svelte";
  import { folderOf, leafOf } from "../services/paths.js";
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";

  let {
    tenant = null,
    compact = false,
    // the column's width, and its handle
    width = null,
    onWidth,
    onResizing,
    // shared by the tenants
    f,
    readOnly = false,
    dateFormat,
    reloadKey = 0,
    onChanged,
    // the inspector's auto-save (a field of the selected task landed)
    onEdited,
    onError,
    onOpenNote,
    // suggestions
    suggesting = null,
    origin,
    onCloseSuggestions,
    // the open note's formatting
    onRun,
    hiddenFormats = [],
    inactiveFormats = [],
    noteMenu = [],
    // where the open note is filed: the space it lives in, and the folder
    // inside it (`""` at the space's root)
    noteFolder = "",
    noteSpace = "",
    noteTargets = [],
    onDeleteNote,
    onUndock,
    // the task inspector
    selected = null,
    spColors = {},
    moveTargets = [],
    tags = [],
    root = "",
    reminderTime = "09:00",
    dayRefs = new Set(),
    offerFields = false,
    onMoreFields,
    onCloseTask,
    onMovedTask,
  } = $props();
</script>

<!-- Its own handle, on the side the panel opens from: the same separator
     the sidebar's edge is, mirrored (`sign`). Only while there is a panel to
     resize. -->
{#if tenant && !compact}
  <PanelResizer
    limits={PANEL}
    sign={-1}
    {width}
    label={S.resizePanel}
    {onWidth}
    onCommit={(w) => api.rememberPanelWidth(w).catch(() => {})}
    {onResizing}
  />
{/if}

<!-- What the right panel is holding, written ONCE and framed twice: a
     sliding column on the desktop, a bottom sheet below 768px, where
     there is no "right" left to open into. The props are the panel's
     contract and must not fork with the frame. -->
{#snippet content()}
  {#if tenant === "suggestions"}
    <SuggestionsPane
      day={suggesting.day}
      {origin}
      {dateFormat}
      {compact}
      {reloadKey}
      {onChanged}
      {onError}
      onClose={onCloseSuggestions}
      {f}
    />
  {:else if tenant === "format"}
    <NotePanel
      {onRun}
      hidden={hiddenFormats}
      inactive={inactiveFormats}
      menu={noteMenu}
      where={[noteSpace, leafOf(noteFolder)].filter(Boolean).join("/") || S.allNotes}
      targets={noteTargets}
      onDelete={onDeleteNote}
      onClose={onUndock}
      {readOnly}
    />
  {:else if tenant === "task"}
    <TaskInspector
      task={selected.task}
      list={selected.list}
      color={spColors[folderOf(selected.list)] ?? null}
      lists={moveTargets}
      {tags}
      {compact}
      {root}
      {readOnly}
      {dateFormat}
      {reminderTime}
      inDay={!!selected.task?.id && dayRefs.has(`${selected.list}#${selected.task.id}`)}
      {f}
      onSaved={onChanged}
      {onEdited}
      {onError}
      onClose={onCloseTask}
      onMoved={onMovedTask}
      {onOpenNote}
      {offerFields}
      {onMoreFields}
    />
  {/if}
{/snippet}

{#if tenant}
  {#if compact}
    <!-- 72% of the screen: tall enough for the inspector's form, short
         enough that the list behind it is still visible. -->
    <BottomSheet
      label={tenant === "suggestions" ? S.suggestionsTitle : S.taskName}
      onClose={tenant === "suggestions" ? onCloseSuggestions : onCloseTask}
    >
      {@render content()}
    </BottomSheet>
  {:else}
    <!-- `|global` is load-bearing: a local transition runs only when its OWN
         block is created or destroyed, and what goes when the panel closes is
         the `{#if tenant}` above — an ancestor. Without it the column vanished
         in one frame. The width slides the left rail's own way, so the two
         edges of the window move alike: `--app-duration-medium` and the
         ease-out curve, spelled here because a JS transition cannot read a
         CSS token. -->
    <div
      class="shell__panel"
      transition:slide|global={{ axis: "x", duration: 250, easing: cubicOut }}
    >
      {@render content()}
    </div>
  {/if}
{/if}
