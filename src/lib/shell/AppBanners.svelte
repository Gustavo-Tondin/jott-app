<script>
  // The notices the shell stacks above whatever screen is open: an error,
  // the last undo/redo, sync conflicts, a newer release, and the AppImage's
  // offer to put itself in the applications menu. All state stays in the
  // shell — this only draws it and reports the clicks.
  import Notice from "../components/Notice.svelte";
  import { formatDate } from "../services/dates.js";
  import { leafOf, titleOfList } from "../services/paths.js";
  import { opensInFilesApp, revealFolder } from "../services/reveal.js";
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
    dateFormat = "mm/dd/yyyy",
  } = $props();

  /// What a copy belongs to, as the user reads it: a list is named the way
  /// every other screen names it (the main list of a space is Inbox, never
  /// `task-list`); a note is its own title.
  function nameOf(conflict) {
    if (conflict.kind === "list") return titleOfList(conflict.list);
    if (conflict.kind === "settings") return S.conflictSettings;
    if (conflict.kind === "tags") return S.conflictTags;
    if (conflict.kind === "trash") return S.conflictTrash;
    return conflict.list ?? leafOf(conflict.relative ?? conflict.path);
  }

  /// One version as the person choosing reads it: when, and how big.
  function factsOf(version) {
    const when = version.modified
      ? `${formatDate(version.modified.slice(0, 10), dateFormat)} ${version.modified.slice(11, 16)}`
      : null;
    return S.conflictVersionFacts(when, S.fileSize(version.bytes));
  }

  /// Which of the two was written last — `"kept"`, `"copy"`, or null when
  /// either date is unknown or they tie.
  function newerOf({ kept, copy }) {
    if (!kept?.modified || !copy?.modified || kept.modified === copy.modified) return null;
    return kept.modified > copy.modified ? "kept" : "copy";
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
       per copy, saying WHAT the two versions disagree about, and each
       version with when it was written and its size — the facts to choose
       by — beside its own Keep (both through the trash, both undoable), and
       the door to its folder. "Hide for now"
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
        {@const name = nameOf(conflict)}
        {@const newer = newerOf(conflict)}
        <li class="shell__conflict">
          <span class="shell__conflict-what">
            <strong>{name}</strong>
            {#if differenceOf(conflict)}<span>{differenceOf(conflict)}</span>{/if}
          </span>
          {#if conflict.relative}
            <ul class="shell__conflict-versions">
              <li class="shell__conflict-version">
                <span class="shell__conflict-label">
                  {S.conflictInUse}
                  {#if newer === "kept"}<span class="theme-badge">{S.conflictNewer}</span>{/if}
                </span>
                <span class="shell__conflict-facts"
                  >{conflict.kept ? factsOf(conflict.kept) : S.conflictInUseGone}</span
                >
                <button
                  class="theme-btn theme-btn--primary theme-btn--xs"
                  aria-label={S.conflictKeepInUse(name)}
                  onclick={() => onDiscardConflict?.(conflict.relative)}>{S.conflictKeep}</button
                >
              </li>
              <li class="shell__conflict-version">
                <span class="shell__conflict-label">
                  {S.conflictOther}
                  {#if newer === "copy"}<span class="theme-badge">{S.conflictNewer}</span>{/if}
                </span>
                {#if conflict.copy}
                  <span class="shell__conflict-facts">{factsOf(conflict.copy)}</span>
                {/if}
                <button
                  class="theme-btn theme-btn--outline theme-btn--xs"
                  aria-label={S.conflictKeepOther(name)}
                  onclick={() => onAdoptConflict?.(conflict, name)}>{S.conflictKeep}</button
                >
              </li>
            </ul>
            <span class="shell__conflict-where">
              <code class="shell__notice-path">{conflict.relative}</code>
              <button
                class="theme-btn theme-btn--outline theme-btn--xs"
                onclick={() => revealFolder(conflict.relative).catch(onError)}
                >{S.conflictReveal}</button
              >
              {#if opensInFilesApp() && conflict.relative.startsWith(".")}
                <span class="shell__conflict-facts">{S.revealHiddenHint}</span>
              {/if}
            </span>
          {:else}
            <code class="shell__notice-path">{conflict.path}</code>
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
