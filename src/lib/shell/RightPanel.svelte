<script>
  // RIGHT: one panel, one thing in it — the task inspector, the day's
  // suggestions, or an open note's formatting. `tenant` says which
  // (`"suggestions"` / `"task"` / `"format"` / null), decided by the shell
  // once, so the handle, the column and the sheet never disagree about
  // whether there is a panel. All state stays in the shell — this draws it
  // and reports the clicks.
  //
  // The wrapper is a flex column whose width slides on open/close — the same
  // width animation the left rail uses, so both side panels move the same way
  // (no grid flicker, since the shell is flex). The inner panel keeps a fixed
  // width so its content is clipped, not reflowed, while it slides.
  import { slide } from "svelte/transition";
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
    noteFolder = "",
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
      where={leafOf(noteFolder) || S.allNotes}
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
      {onError}
      onClose={onCloseTask}
      onMoved={onMovedTask}
      {onOpenNote}
    />
  {/if}
{/snippet}

{#if tenant}
  {#if compact}
    <!-- 72% of the screen, from the wireframe: tall enough for the
         inspector's form, short enough that the list it belongs to is
         still visible behind it. -->
    <BottomSheet
      label={tenant === "suggestions" ? S.suggestionsTitle : S.taskName}
      onClose={tenant === "suggestions" ? onCloseSuggestions : onCloseTask}
    >
      {@render content()}
    </BottomSheet>
  {:else}
    <div class="shell__panel" transition:slide={{ axis: "x", duration: 200 }}>
      {@render content()}
    </div>
  {/if}
{/if}
