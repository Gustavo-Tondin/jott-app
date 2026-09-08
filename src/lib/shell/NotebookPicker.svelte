<script>
  // The door of the app (wireframes "Notebooks screen"): the notebooks this
  // machine has opened, the folder picker for the other days, and — under
  // them — what only this MACHINE has to say: Android's file permission, the
  // private container it offers when that permission is refused, and the
  // door that would not open. The list itself is screens/NotebooksView; the
  // shell keeps every piece of state and hands it down.
  import Loading from "../components/Loading.svelte";
  import Notice from "../components/Notice.svelte";
  import NotebooksView from "../screens/NotebooksView.svelte";
  import { leafOf } from "../services/paths.js";
  import { S } from "../services/strings.js";

  let {
    /// The path being opened while the disk has not answered, or null.
    opening = null,
    version = "",
    busy = false,
    compact = false,
    /// `"granted"`, `"denied"`, or `"notNeeded"` off Android.
    storage = "notNeeded",
    /// The app's own container — non-null only on Android.
    privateFolder = null,
    /// How many notebooks the list is offering, or null before it has read.
    recentCount = null,
    error = null,
    /// `{path, create, message}` — the door that would not open.
    failedOpen = null,
    onChoose,
    onOpen,
    onOpenAt,
    onPickFolder,
    onListed,
    onClose = null,
    onDismissError,
    onDismissFailed,
    onError,
  } = $props();
</script>

{#if opening}
  <!-- Between the click and the notebook: the disk is reading, and the
       picker with its buttons greyed said nothing about it. -->
  <Loading screen label={S.openingNotebook(leafOf(opening))} />
{:else}
  <NotebooksView
    {version}
    {busy}
    {compact}
    {onChoose}
    {onOpen}
    {onPickFolder}
    {onListed}
    {onClose}
    {onError}
  />
  <!-- Only when it has something to say, and the private-folder offer only on
       a phone with NOTHING to offer above it: `privateFolder` is non-null on
       every Android run, so without the count it kept a paragraph about where
       a notebook could live under a list of notebooks that already do. -->
  {#if storage === "denied" || (privateFolder && recentCount === 0) || error || failedOpen}
    <section class="shell__onboarding">
      {#if storage === "denied"}
        <p class="shell__onboarding-intro">{S.storageIntro}</p>
        <button
          class="theme-btn theme-btn--primary shell__onboarding-action"
          onclick={() => onChoose({ create: true })}
          disabled={busy}>{S.allowFiles}</button
        >
      {/if}
      {#if privateFolder && recentCount === 0}
        <button
          class="theme-btn shell__onboarding-alt"
          onclick={() => onOpenAt(privateFolder, { create: true })}
          disabled={busy}>{S.usePrivateFolder}</button
        >
        <p class="shell__onboarding-note">{S.privateFolderNote}</p>
      {/if}
      {#if failedOpen}
        <!-- Which door, why, and the two ways on — the same door again (a
             drive that was not mounted yet, a permission just granted) or
             another one. -->
        <Notice
          tone="error"
          title={S.openFailedTitle}
          class="shell__notice"
          onDismiss={onDismissFailed}
          dismissLabel={S.dismissError}
        >
          <p><code class="shell__notice-path">{failedOpen.path}</code></p>
          <p>{failedOpen.message}</p>
          {#snippet actions()}
            <button
              class="theme-btn theme-btn--primary theme-btn--xs"
              disabled={busy}
              onclick={() => onOpenAt(failedOpen.path, { create: failedOpen.create })}
              >{S.openFailedRetry}</button
            >
            <button
              class="theme-btn theme-btn--outline theme-btn--xs"
              disabled={busy}
              onclick={() => onChoose({ create: false })}>{S.openFailedOther}</button
            >
          {/snippet}
        </Notice>
      {:else if error}
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
    </section>
  {/if}
{/if}
