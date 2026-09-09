<script>
  // The screen the active tab shows, one branch per `view.kind`. All state
  // stays in the shell; nothing here is decided. Props are handed ONE AT A
  // TIME, on purpose: spreading one `$derived` object makes every prop a
  // getter over that object, so a screen's `$effect(() => { list; reloadKey;
  // load(); })` re-runs on any change in it. See docs/historico.md
  import HomeView from "../screens/HomeView.svelte";
  import TasksView from "../screens/TasksView.svelte";
  import ListView from "../screens/ListView.svelte";
  import CompletedView from "../screens/CompletedView.svelte";
  import TimelineView from "../screens/TimelineView.svelte";
  import TagsView from "../screens/TagsView.svelte";
  import TrashView from "../screens/TrashView.svelte";
  import AssetsView from "../screens/AssetsView.svelte";
  import SpaceView from "../screens/SpaceView.svelte";
  import SettingsView from "../screens/SettingsView.svelte";
  import NotesSpace from "../spaces/NotesSpace.svelte";
  import { sourceOf } from "../spaces/registry.js";
  import NoteBanner from "../components/NoteBanner.svelte";
  import NoteEditor from "../components/NoteEditor.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";

  let {
    // what the shell holds
    view,
    notebook,
    layout,
    clock = null,
    compact = false,
    mobile = false,
    f,
    reloadKey = 0,
    /// Bumped only when the notebook's LIBRARY changed. The open note's
    /// pictures hang off it; `reloadKey` would refetch them on every save.
    libraryKey = 0,
    /// Bumped when the open note's own file was written by somebody else.
    noteRevision = 0,
    tags = [],
    dayRefs = new Set(),
    spColors = {},
    noteSpaces = [],
    userSpaces = [],
    notesSpace = null,
    inboxSource = null,
    quickTargets = [],
    quickTaskChoices = [],
    quickTaskTo = null,
    userThemes = [],
    wornTheme = null,
    wornThemeBlocked = 0,
    zoom = 1,
    openNote,
    selected = null,
    // the shell's readings of a view
    origin,
    colorOf,
    titleOf,
    // the shell's answers
    onChanged,
    onChangedAll,
    onError,
    onOpenNote,
    onOpenTask,
    onSelectTask,
    onSuggest,
    onShowNote,
    onSearchTag,
    // Home
    composing = false,
    onCloseCompose,
    homeDay = null,
    onPickDay,
    onSummary,
    homeView = $bindable(null),
    // the arrangements (shell/notebookWrites.js)
    tasksArrangement,
    notesArrangement,
    spaceArrangement,
    // the open note
    noteEditor = $bindable(null),
    onSetBanner,
    onChooseImage,
    onRenameNote,
    onSetTags,
    onCreateTag,
    onFiles,
    onOpenNoteByTitle,
    onZoomImage,
    onSelection,
    onTable,
    onNoteLoaded,
    onRemoteImage,
    // Settings
    onZoom,
    onSwitchNotebook,
    onNewTheme,
    onSection,
  } = $props();
</script>

{#if view.kind === "home"}
  <HomeView
    bind:this={homeView}
    {compact}
    {origin}
    notesColor={spColors[layout.notesFolder] ?? null}
    colors={spColors}
    ghostTasks={layout.timelineGhostTasks ?? false}
    ghostNotes={layout.timelineGhostNotes ?? false}
    root={notebook.path}
    dot={colorOf(view)}
    {composing}
    {onCloseCompose}
    dateFormat={layout.dateDisplayFormat}
    quickNoteFolder={layout.quickNoteFolder}
    quickTask={quickTaskTo}
    notesFolder={layout.notesFolder}
    noteTargets={quickTargets}
    lists={notebook.lists}
    {tags}
    completedName={layout.completedName}
    inbox={layout.inbox}
    readOnly={notebook.readOnly}
    {reloadKey}
    {onChanged}
    {onError}
    {onOpenNote}
    {onOpenTask}
    {onSelectTask}
    {onSuggest}
    selectedTask={selected?.task ?? null}
    today={clock?.today}
    weekStartsOn={clock?.weekStartsOn ?? "monday"}
    day={homeDay}
    {onPickDay}
    {onSummary}
    {f}
  />
{:else if view.kind === "tasks"}
  <TasksView
    dateFormat={layout.dateDisplayFormat}
    {origin}
    inbox={layout.inbox}
    {inboxSource}
    showAll={layout.tasksShowAll ?? false}
    lists={notebook.lists}
    {tags}
    completedName={layout.completedName}
    today={clock?.today}
    readOnly={notebook.readOnly}
    {onChanged}
    {onError}
    {reloadKey}
    onSelect={onSelectTask}
    selectedTask={selected?.task ?? null}
    {dayRefs}
    onSetSort={tasksArrangement.setSort}
    onSetOrder={tasksArrangement.setOrder}
    {f}
  />
{:else if view.kind === "list"}
  <ListView
    dateFormat={layout.dateDisplayFormat}
    list={view.list}
    readOnly={notebook.readOnly}
    {onChanged}
    {onError}
    {reloadKey}
    onSelect={onSelectTask}
    selectedId={selected?.task?.id ?? null}
    selectedTask={selected?.task ?? null}
    today={clock?.today}
    {dayRefs}
    {f}
  />
{:else if view.kind === "notes"}
  <NotesSpace
    {f}
    dateFormat={layout.dateDisplayFormat}
    source={sourceOf(
      // The arrangement comes from the space's own config — without it the
      // ⋮ could not tick the sorting in force and dragging had nowhere to be
      // saved. The folder falls back to the layout's, so the screen still opens.
      {
        kind: "notes",
        known: true,
        path: notesSpace?.path ?? layout.notesFolder,
        sort: notesSpace?.sort,
        order: notesSpace?.order,
        noteLayout: notesSpace?.noteLayout,
      },
      // The screen names itself, and what it is called is what the app calls
      // this place everywhere else — the sidebar entry, the tab, the header.
      { name: titleOf(view) },
    )}
    onSetSort={notesArrangement.setSort}
    onSetOrder={notesArrangement.setOrder}
    onSetLayout={notesArrangement.setNoteLayout}
    defaultLayout={layout.noteLayout}
    header={!compact}
    dot={colorOf(view)}
    readOnly={notebook.readOnly}
    notesInbox={layout.notesInbox}
    root={notebook.path}
    {noteSpaces}
    {reloadKey}
    {onChanged}
    {onError}
    {onOpenNote}
  />
{:else if view.kind === "note"}
  <!-- The note's head: its banner and its title. Without a banner the block
       has no colour and no height, and the title stays where it was. -->
  <NoteBanner
    enabled={f("banners")}
    banner={openNote.banner}
    title={openNote.title}
    root={notebook.path}
    readOnly={notebook.readOnly}
    {compact}
    onSet={onSetBanner}
    {onChooseImage}
    onRename={notebook.readOnly ? null : onRenameNote}
    created={openNote.created ?? null}
    tags={openNote.tags ?? []}
    catalogue={tags}
    dateFormat={layout.dateDisplayFormat}
    tagsEnabled={f("noteTags")}
    color={colorOf(view)}
    {onSetTags}
    {onCreateTag}
  />
  <!-- No `onSaved`: a note's body reaches nothing the shell draws (counts,
       spaces, tags all live elsewhere), and refreshing the notebook on every
       pause in typing was five round trips on the thread that draws. -->
  <NoteEditor
    bind:this={noteEditor}
    folder={view.folder}
    path={view.path}
    readOnly={notebook.readOnly}
    {onError}
    {onFiles}
    onOpenFile={(address) => api.openAsset(address).catch(onError)}
    onOpenNote={onOpenNoteByTitle}
    {onZoomImage}
    {onSelection}
    {onTable}
    version={libraryKey}
    externalRevision={noteRevision}
    onConflictKept={onChanged}
    wikiLinks={f("wikiLinks")}
    embeds={f("embeds")}
    tables={f("tables")}
    tableLayout={layout.tableLayout}
    root={notebook.path}
    onLoaded={onNoteLoaded}
  />
{:else if view.kind === "settings"}
  <SettingsView
    open={view.section ?? null}
    {compact}
    {mobile}
    {notebook}
    {zoom}
    {onZoom}
    {onSwitchNotebook}
    noteTargets={quickTargets}
    taskTargets={quickTaskChoices}
    {userThemes}
    {wornTheme}
    {onNewTheme}
    blockedInTheme={wornThemeBlocked}
    {onSection}
    {onChanged}
    {onError}
  />
{:else if view.kind === "space"}
  {@const current = userSpaces.find((w) => w.path === view.sp)}
  {#if current}
    <SpaceView
      {compact}
      space={current}
      color={spColors[current.path] ?? null}
      lists={notebook.lists}
      {tags}
      completedName={layout.completedName}
      notesInbox={layout.notesInbox}
      root={notebook.path}
      {noteSpaces}
      today={clock?.today}
      dateFormat={layout.dateDisplayFormat}
      {dayRefs}
      {f}
      readOnly={notebook.readOnly}
      {reloadKey}
      selectedTask={selected?.task ?? null}
      {onSelectTask}
      {onOpenNote}
      onSetSpaceSort={spaceArrangement.setSort}
      onSetSpaceOrder={spaceArrangement.setOrder}
      onSetSpaceNoteLayout={spaceArrangement.setNoteLayout}
      noteLayout={layout.noteLayout}
      {onChanged}
      {onError}
    />
  {:else}
    <EmptyState icon="folder" title={S.missingSpace} />
  {/if}
{:else if view.kind === "tags"}
  <TagsView {tags} onSearch={onSearchTag} {onChanged} {onError} />
{:else if view.kind === "assets"}
  <AssetsView
    root={notebook.path}
    readOnly={notebook.readOnly}
    onChanged={onChangedAll}
    {onError}
    onOpenNote={(path, folder, opts) => onShowNote(path, folder, opts?.newTab)}
    {onOpenTask}
    {onRemoteImage}
    {reloadKey}
  />
{:else if view.kind === "timeline"}
  <TimelineView
    readOnly={notebook.readOnly}
    today={clock?.today}
    dateFormat={layout.dateDisplayFormat}
    {origin}
    colors={spColors}
    ghostTasks={layout.timelineGhostTasks}
    ghostNotes={layout.timelineGhostNotes}
    {onOpenTask}
    onOpenNote={(path, folder) => onShowNote(path, folder)}
    {onChanged}
    {onError}
    {reloadKey}
  />
{:else if view.kind === "trash"}
  <TrashView
    {onChanged}
    {onError}
    {reloadKey}
    dateFormat={layout.dateDisplayFormat}
    readOnly={notebook?.readOnly ?? false}
  />
{:else}
  <CompletedView readOnly={notebook.readOnly} {origin} {onChanged} {onError} {reloadKey} />
{/if}
