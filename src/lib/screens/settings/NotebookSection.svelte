<script module>
  import { S } from "../../services/strings.js";

  /// The rows the settings search can find on this page.
  export const index = () => [
    S.notebookPath,
    S.openNotebookFolder,
    S.switchNotebook,
    S.quickNoteFolder,
    S.quickTasksGoTo,
    S.confirmDeletes,
    S.completedRetention,
    S.trashRetention,
  ];
</script>

<script>
  // Notebook: where it is, where the two quick captures land, and what it
  // keeps. Every choice is the notebook's own (`put`).
  import { api } from "../../services/api.js";
  import SettingsSection from "./SettingsSection.svelte";

  let {
    notebook,
    form = $bindable(),
    /// Sends one notebook key. The core keeps everything it was not told about.
    put,
    compact = false,
    readOnly = false,
    /// Where a quick note can go — `{label, value}` rows for the picker
    /// (services/noteTargets.js). Empty means nowhere: the row hides.
    noteTargets = [],
    /// …and where a quick task can (services/taskTargets.js). Same contract.
    taskTargets = [],
    /// Opens the notebook picker — the shell's flow, its second door.
    onSwitchNotebook,
    onReset,
    onError,
  } = $props();

  /// What the notebook holds, read once per visit: the core walks the whole
  /// tree for the size.
  let contents = $state(null);
  api
    .notebookContents()
    .then((read) => (contents = read))
    .catch((e) => onError?.(e));
</script>

<!-- One of the two capture destinations: a select over the targets the
     shell computed, bound to the notebook key it writes. -->
{#snippet targetRow(label, key, targets, hint)}
  <label class="settings__row">
    <span class="settings__label">{label}</span>
    <select
      class="theme-select"
      bind:value={form[key]}
      disabled={readOnly}
      aria-label={label}
      onchange={(e) => put({ [key]: e.currentTarget.value })}
    >
      {#each targets as target (target.value)}
        <option value={target.value}>{target.label}</option>
      {/each}
    </select>
  </label>
  <p class="settings__hint">{hint}</p>
{/snippet}

<SettingsSection title={S.sectionNotebook} {compact} {onReset} resetDisabled={readOnly}>
  <h3 class="settings__subtitle">{S.subLocation}</h3>

  <p class="settings__row">
    <span class="settings__label">{S.notebookPath}</span>
    <code class="settings__path">{notebook?.path}</code>
  </p>

  <div class="settings__row">
    <span class="settings__label">{S.openNotebookFolder}</span>
    <button
      type="button"
      class="theme-btn theme-btn--outline theme-btn--xs"
      onclick={() => api.openInFileManager().catch(onError)}
      >{S.openNotebookFolderAction}</button
    >
  </div>

  <!-- The second door to the picker: the first is the notebook's name at the
       foot of the sidebar, which nobody guesses is a button. -->
  {#if onSwitchNotebook}
    <div class="settings__row">
      <span class="settings__label">{S.switchNotebook}</span>
      <button
        type="button"
        class="theme-btn theme-btn--outline theme-btn--xs"
        onclick={() => onSwitchNotebook()}>{S.switchNotebookAction}</button
      >
    </div>
  {/if}

  <!-- Where a quick note lands names a folder of THIS notebook, so it cannot
       follow Display onto the machine. The choices (services/noteTargets.js)
       keep the capture alive with the fixed space hidden; with nowhere to go
       the row goes too. -->
  {#if noteTargets.length > 0}
    {@render targetRow(S.quickNoteFolder, "quickNoteFolder", noteTargets, S.quickNoteFolderHint)}
  {/if}

  <!-- The tasks mirror: both captures name their landing place side by side. -->
  {#if taskTargets.length > 0}
    {@render targetRow(S.quickTasksGoTo, "quickTaskList", taskTargets, S.quickTasksGoToHint)}
  {/if}

  <h3 class="settings__subtitle">{S.subSafety}</h3>

  <!-- Rescued, like its sibling in Notes: the "don't ask again" of the
       delete dialog wrote it and nothing offered the way back. -->
  <label class="settings__row">
    <span class="settings__label">{S.confirmDeletes}</span>
    <input
      class="theme-checkbox"
      type="checkbox"
      bind:checked={form.confirmDeletes}
      disabled={readOnly}
      aria-label={S.confirmDeletes}
      onchange={(e) => put({ confirmDeletes: e.currentTarget.checked })}
    />
  </label>
  <p class="settings__hint">{S.confirmDeletesHint}</p>

  <h3 class="settings__subtitle">{S.subKeeping}</h3>

  <p class="settings__row">
    <span class="settings__label">{S.notebookContents}</span>
    <span class="settings__value">{contents ? S.notebookContentsLine(contents) : "…"}</span>
  </p>

  <label class="settings__row">
    <span class="settings__label">{S.completedRetention}</span>
    <input
      class="theme-input theme-number"
      type="number"
      min="0"
      bind:value={form.completedRetentionDays}
      disabled={readOnly}
      aria-label={S.completedRetention}
      onchange={(e) =>
        put({ completedRetentionDays: Number(e.currentTarget.value) })}
    />
  </label>
  <p class="settings__hint">{S.completedRetentionHint}</p>

  <label class="settings__row">
    <span class="settings__label">{S.trashRetention}</span>
    <input
      class="theme-input theme-number"
      type="number"
      min="0"
      bind:value={form.trashRetentionDays}
      disabled={readOnly}
      aria-label={S.trashRetention}
      onchange={(e) => put({ trashRetentionDays: Number(e.currentTarget.value) })}
    />
  </label>
  <p class="settings__hint">{S.trashRetentionHint}</p>
</SettingsSection>
