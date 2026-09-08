<script>
  // The notices the shell stacks above whatever screen is open: an error,
  // the last undo/redo, sync conflicts, a newer release, and the AppImage's
  // offer to put itself in the applications menu. All state stays in the
  // shell — this only draws it and reports the clicks.
  import Notice from "../components/Notice.svelte";
  import { api } from "../services/api.js";
  import { openReleasePage } from "../services/update.js";
  import { S } from "../services/strings.js";

  let {
    error = null,
    onDismissError,
    undoNotice = null,
    onDismissUndo,
    conflicts = [],
    onHideConflicts,
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
  <!-- The one case where the user can silently lose work: two devices edited
       the same file and the sync tool kept both. A row per copy, each with
       the door to its folder (the core's `folder_of` turns the file into the
       folder around it), and "hide for now" for the session — a NEW conflict
       brings the box back, because the shell keys the hiding on the list of
       paths. -->
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
            {#if conflict.list}<strong>{conflict.list}</strong>{/if}
            <code class="shell__notice-path">{conflict.relative ?? conflict.path}</code>
            {#if !conflict.original}<span class="shell__conflict-gone">({S.conflictOriginalGone})</span>{/if}
          </span>
          {#if conflict.relative}
            <button
              class="theme-btn theme-btn--outline theme-btn--xs"
              onclick={() => api.openInFileManager(conflict.relative).catch(onError)}
              >{S.conflictReveal}</button
            >
          {/if}
        </li>
      {/each}
    </ul>
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
