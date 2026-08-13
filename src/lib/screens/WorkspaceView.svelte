<script>
  // A user workspace: its own screen, chosen by the workspace's `type`
  // (2026-08-11 — no widget layer, no host in between). The registry answers
  // with the component for the type; an unknown type still renders, as the
  // unsupported card, with the folder left untouched (spec 3.5).
  import { S } from "../services/strings.js";
  import { widgetComponent } from "../widgets/registry.js";
  import { accentColor } from "../services/accent.js";

  let {
    workspace,
    // The colour the workspace READS as — its own, or its group's when it is
    // in one (services/workspaceColors.js). Never `workspace.color` directly.
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
    // Persist the workspace's arrangement in its own `.workspace.json`.
    onSetWorkspaceSort,
    onSetWorkspaceOrder,
    onChanged,
    onError,
  } = $props();

  // The workspace, in the shape the tasks/notes screens read: the folder is
  // the workspace's own root-relative path.
  let source = $derived({
    kind: workspace.kind,
    known: workspace.known,
    folder: workspace.path,
    name: null,
    sort: workspace.sort ?? null,
    order: workspace.order ?? [],
  });

  let Screen = $derived(widgetComponent(workspace.kind));
</script>

<h2
  class="theme-title theme-title--lg workspace-view__title"
  style={accentColor(color) ? `color: ${accentColor(color)}` : ""}
>
  {workspace.name}
  {#if workspace.readOnly}<small class="workspace-view__badge"
      >{S.readOnlyWorkspace}</small
    >{/if}
</h2>

<!-- A workspace whose TYPE is switched off is simply not drawn (App
     Functions, 2026-08-06) — its folder is left exactly as it is. That is a
     different thing from a type this build does not KNOW, which still gets
     the unsupported card so nobody mistakes it for something the app
     deleted. -->
{#if f(workspace.kind)}
  <div class="workspace-view__widget">
    <Screen
      widget={source}
      {lists}
      {counts}
      {tags}
      {completedName}
      {notesInbox}
      {today}
      {dateFormat}
      {dayRefs}
      {f}
      readOnly={readOnly || workspace.readOnly}
      {reloadKey}
      {selectedTask}
      {onOpenList}
      {onOpenNote}
      {onSelectTask}
      onSetSort={onSetWorkspaceSort}
      onSetOrder={onSetWorkspaceOrder}
      {onChanged}
      {onError}
    />
  </div>
{/if}
