<script>
  // The notices the shell stacks above whatever screen is open: an error,
  // the last undo/redo, sync conflicts, a newer release, and the AppImage's
  // offer to put itself in the applications menu. All state stays in the
  // shell — this only draws it and reports the clicks.
  import Notice from "../components/Notice.svelte";
  import { api } from "../services/api.js";
  import { titleOfList } from "../services/paths.js";
  import { openReleasePage } from "../services/update.js";
  import { S } from "../services/strings.js";

  let {
    error = null,
    onDismissError,
    undoNotice = null,
    onDismissUndo,
    conflicts = [],
    onHideConflicts,
    /// Each takes the copy's root-relative address; the last takes none.
    onDiscardConflict,
    onAdoptConflict,
    onDiscardAllConflicts,
    update = null,
    installing = false,
    onInstall,
    onDismissUpdate,
    menuOffer = null,
    addingToMenu = false,
    onAddToMenu,
    onDismissMenuOffer,
    onError,
  } = $props();

  /// What a copy belongs to, as the user reads it: a list is named the way
  /// every other screen names it (the main list of a space is Inbox, never
  /// `task-list`); a note is its own title.
  function nameOf(conflict) {
    return conflict.kind === "list" ? titleOfList(conflict.list) : conflict.list;
  }

  /// What the two versions of a copy disagree about, in words. The core
  /// looked and said which sentence with what number (`Difference`); the
  /// wording is the interface's.
  function differenceOf({ differs }) {
    if (!differs) return null;
    if (differs.kind === "lines") return S.conflictLinesDiffer(differs.count);
    if (differs.kind === "tasks") return S.conflictTasksDiffer(differs.count, differs.first);
    if (differs.kind === "unseen") return S.conflictUnseen;
    return null;
  }
</script>

{#if error}
  <Notice
    tone="error"
    title={S.errorTitle}
    class="shell__notice"
    onDismiss={onDismissError}
    dismissLabel={S.dismissError}
  >
    <p>{error}</p>
  </Notice>
{/if}

{#if undoNotice}
  <Notice
    tone={undoNotice.tone}
    icon={undoNotice.tone === "success" ? "undo" : null}
    title={undoNotice.text}
    class="shell__notice"
    onDismiss={onDismissUndo}
    dismissLabel={S.dismissError}
  />
{/if}

{#if conflicts.length > 0}
  <!-- What is left after the app merged everything it could: two devices
       changed the same passage, or this one had never seen the file. A row
       per copy, saying WHAT the two versions disagree about, with the two
       ways out (keep this device's, or keep the other's — both through the
       trash, both undoable) and the door to its folder (the core's
       `folder_of` turns the file into the folder around it). "Hide for now"
       is for the session — a NEW conflict brings the box back, because the
       shell keys the hiding on the list of paths. -->
  <Notice
    tone="warning"
    title={S.conflictsTitle(conflicts.length)}
    class="shell__notice"
    onDismiss={onHideConflicts}
    dismissLabel={S.conflictsHide}
  >
    <p>{S.conflictsBody}</p>
    <ul class="shell__conflict-list">
      {#each conflicts as conflict (conflict.path)}
        <li class="shell__conflict">
          <span class="shell__conflict-what">
            {#if conflict.list}<strong>{nameOf(conflict)}</strong>{/if}
            {#if differenceOf(conflict)}<span>{differenceOf(conflict)}</span>{/if}
            <code class="shell__notice-path">{conflict.relative ?? conflict.path}</code>
            {#if !conflict.original}<span class="shell__conflict-gone">({S.conflictOriginalGone})</span>{/if}
          </span>
          {#if conflict.relative}
            <span class="shell__conflict-actions">
              <button
                class="theme-btn theme-btn--primary theme-btn--xs"
                onclick={() => onDiscardConflict?.(conflict.relative)}
                >{S.conflictDiscard}</button
              >
              <button
                class="theme-btn theme-btn--outline theme-btn--xs"
                onclick={() => onAdoptConflict?.(conflict)}
                >{S.conflictAdopt}</button
              >
              <button
                class="theme-btn theme-btn--outline theme-btn--xs"
                onclick={() => api.openInFileManager(conflict.relative).catch(onError)}
                >{S.conflictReveal}</button
              >
            </span>
          {/if}
        </li>
      {/each}
    </ul>
    {#snippet actions()}
      {#if conflicts.length > 1}
        <button class="theme-btn theme-btn--outline theme-btn--xs" onclick={onDiscardAllConflicts}
          >{S.conflictsDiscardAll}</button
        >
      {/if}
    {/snippet}
  </Notice>
{/if}

{#if update}
  <!-- Good news, quietly: one line and two buttons, gone for the session on
       "Later". Which button depends on the install — an AppImage or the
       Windows build can replace itself, a package-manager install gets the
       release page instead. -->
  <Notice tone="success" title={S.updateBanner(update.latest)} class="shell__notice">
    {#snippet actions()}
      {#if update.canInstall}
        <button
          class="theme-btn theme-btn--primary theme-btn--xs"
          disabled={installing}
          onclick={onInstall}
          >{installing ? S.updateInstalling : S.updateInstall}</button
        >
      {:else}
        <button
          class="theme-btn theme-btn--primary theme-btn--xs"
          onclick={() => openReleasePage(update.url).catch(onError)}
          >{S.updateDownload}</button
        >
      {/if}
      <button class="theme-btn theme-btn--outline theme-btn--xs" onclick={onDismissUpdate}
        >{S.updateDismiss}</button
      >
    {/snippet}
  </Notice>
{/if}

{#if menuOffer}
  <!-- The one thing an AppImage cannot do for itself until it is asked: a
       single file installs nothing, so the desktop has no entry and no icon
       to find. Offered once — "No thanks" is remembered on this machine,
       "Add to menu" is not, so moving the file asks again. -->
  <Notice tone="success" icon="info" title={S.menuEntryBanner} class="shell__notice">
    {#snippet actions()}
      <button
        class="theme-btn theme-btn--primary theme-btn--xs"
        disabled={addingToMenu}
        onclick={onAddToMenu}
        >{addingToMenu ? S.menuEntryAdding : S.menuEntryAdd}</button
      >
      <button class="theme-btn theme-btn--outline theme-btn--xs" onclick={onDismissMenuOffer}
        >{S.menuEntryDismiss}</button
      >
    {/snippet}
  </Notice>
{/if}
