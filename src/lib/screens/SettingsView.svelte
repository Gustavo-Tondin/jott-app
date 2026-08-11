<script>
  // The settings screen: every documented key of the notebook, editable.
  //
  // Two rules it follows, both inherited from the core:
  //
  // 1. **Every field is optional on the way in.** `set_notebook_settings`
  //    keeps whatever it is not told about, so this screen can send one key
  //    at a time and never has to hold — or risk overwriting — the rest.
  // 2. **The core normalises.** An offset it cannot parse falls back to the
  //    default rather than being stored wrong, so the UI never has to
  //    validate a second time. What it *does* do is stop a bad value from
  //    being offered at all: modes, week start and date shape are selects.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { FEATURES, on, stored } from "../services/features.js";

  let {
    notebook,
    folders = [],
    notesInbox = "Inbox",
    onChanged,
    onError,
  } = $props();

  /// Which parts of the app are switched on. They travel in the notebook's
  /// layout (every screen needs them on every render), so the screen reads
  /// them from there and writes them with their own command.
  let features = $derived(notebook?.layout?.features ?? {});

  async function setFeature(key, value) {
    try {
      // Back to the default? Then the notebook forgets it, and the file keeps
      // only what differs from how the app ships.
      await api.setFeature(key, stored(key, value));
      onChanged?.();
      saved = true;
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => (saved = false), 1500);
    } catch (e) {
      onError?.(e);
    }
  }

  let settings = $state(null);
  /// What the controls are bound to.
  ///
  /// Separate from `settings` on purpose: a control needs a *bound* variable
  /// to be pushed back by Svelte. With a plain `value=` attribute, a value
  /// the core rejected would stay on screen — the state never changed, only
  /// the DOM did, so nothing would put it back.
  let form = $state({});
  let saved = $state(false);
  let savedTimer = null;

  // Whatever the core says is what the controls show.
  $effect(() => {
    if (settings) form = { ...settings };
  });

  $effect(() => {
    load();
  });

  async function load() {
    try {
      settings = await api.notebookSettings();
    } catch (e) {
      onError?.(e);
    }
  }

  /// Sends one key. The core keeps everything it was not told about.
  async function put(patch) {
    try {
      await api.setNotebookSettings(patch);
      // Re-read rather than trusting what we sent: the core may have
      // normalised the value, and the screen should show what was stored.
      settings = await api.notebookSettings();
      onChanged?.();

      saved = true;
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => (saved = false), 1500);
    } catch (e) {
      onError?.(e);
    }
  }

  // Slash-only, and month-first is the default (user call, 2026-08-06).
  const DATE_SHAPES = ["mm/dd/yyyy", "dd/mm/yyyy", "yyyy/mm/dd"];

  let readOnly = $derived(!!notebook?.readOnly);
</script>

{#if settings && form}
  {#if readOnly}
    <p class="settings__notice">{S.readOnlyNotice}</p>
  {/if}

  <section class="settings__section">
    <h2 class="settings__section-title">{S.sectionDay}</h2>

    <label class="settings__row">
      <span class="settings__label">{S.rolloverDaily}</span>
      <input
        class="theme-input"
        bind:value={form.dailyAt}
        disabled={readOnly}
        aria-label={S.rolloverDaily}
        onchange={(e) => put({ dailyAt: e.currentTarget.value })}
      />
    </label>
    <p class="settings__hint">{S.rolloverAtHint}</p>

    <label class="settings__row">
      <span class="settings__label">{S.rolloverMode}</span>
      <select
        class="theme-select"
        bind:value={form.dailyMode}
        disabled={readOnly}
        aria-label={`${S.rolloverDaily} — ${S.rolloverMode}`}
        onchange={(e) => put({ dailyMode: e.currentTarget.value })}
      >
        <option value="reset">{S.rolloverModeReset}</option>
        <option value="carry">{S.rolloverModeCarry}</option>
      </select>
    </label>

    <label class="settings__row">
      <span class="settings__label">{S.rolloverWeekly}</span>
      <input
        class="theme-input"
        bind:value={form.weeklyAt}
        disabled={readOnly}
        aria-label={S.rolloverWeekly}
        onchange={(e) => put({ weeklyAt: e.currentTarget.value })}
      />
    </label>

    <label class="settings__row">
      <span class="settings__label">{S.rolloverMode}</span>
      <select
        class="theme-select"
        bind:value={form.weeklyMode}
        disabled={readOnly}
        aria-label={`${S.rolloverWeekly} — ${S.rolloverMode}`}
        onchange={(e) => put({ weeklyMode: e.currentTarget.value })}
      >
        <option value="reset">{S.rolloverModeReset}</option>
        <option value="carry">{S.rolloverModeCarry}</option>
      </select>
    </label>

    <label class="settings__row">
      <span class="settings__label">{S.weekStartsOn}</span>
      <select
        class="theme-select"
        bind:value={form.weekStartsOn}
        disabled={readOnly}
        aria-label={S.weekStartsOn}
        onchange={(e) => put({ weekStartsOn: e.currentTarget.value })}
      >
        <option value="monday">{S.monday}</option>
        <option value="sunday">{S.sunday}</option>
      </select>
    </label>
  </section>

  <section class="settings__section">
    <h2 class="settings__section-title">{S.sectionDisplay}</h2>

    <label class="settings__row">
      <span class="settings__label">{S.dateFormat}</span>
      <select
        class="theme-select"
        bind:value={form.dateDisplayFormat}
        disabled={readOnly}
        aria-label={S.dateFormat}
        onchange={(e) => put({ dateDisplayFormat: e.currentTarget.value })}
      >
        {#each DATE_SHAPES as shape (shape)}
          <option value={shape}>{shape}</option>
        {/each}
      </select>
    </label>

    <label class="settings__row">
      <span class="settings__label">{S.showListCounts}</span>
      <input
        class="theme-checkbox"
        type="checkbox"
        bind:checked={form.showListCounts}
        disabled={readOnly}
        aria-label={S.showListCounts}
        onchange={(e) => put({ showListCounts: e.currentTarget.checked })}
      />
    </label>

    <label class="settings__row">
      <span class="settings__label">{S.restoreLastScreen}</span>
      <input
        class="theme-checkbox"
        type="checkbox"
        bind:checked={form.restoreLastScreen}
        disabled={readOnly}
        aria-label={S.restoreLastScreen}
        onchange={(e) => put({ restoreLastScreen: e.currentTarget.checked })}
      />
    </label>
    <p class="settings__hint">{S.restoreLastScreenHint}</p>

    <label class="settings__row">
      <span class="settings__label">{S.autoUrgentByDate}</span>
      <input
        class="theme-checkbox"
        type="checkbox"
        bind:checked={form.autoUrgentByDate}
        disabled={readOnly}
        aria-label={S.autoUrgentByDate}
        onchange={(e) => put({ autoUrgentByDate: e.currentTarget.checked })}
      />
    </label>
    <p class="settings__hint">{S.autoUrgentByDateHint}</p>

    <label class="settings__row">
      <span class="settings__label">{S.closeOnClickAway}</span>
      <input
        class="theme-checkbox"
        type="checkbox"
        bind:checked={form.closeInspectorOnClickAway}
        disabled={readOnly}
        aria-label={S.closeOnClickAway}
        onchange={(e) =>
          put({ closeInspectorOnClickAway: e.currentTarget.checked })}
      />
    </label>
    <p class="settings__hint">{S.closeOnClickAwayHint}</p>

    <label class="settings__row">
      <span class="settings__label">{S.quickNoteFolder}</span>
      <select
        class="theme-select"
        bind:value={form.quickNoteFolder}
        disabled={readOnly}
        aria-label={S.quickNoteFolder}
        onchange={(e) => put({ quickNoteFolder: e.currentTarget.value })}
      >
        <option value={notesInbox}>{notesInbox}</option>
        {#each folders.filter((f) => f !== notesInbox) as name (name)}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </label>
  </section>

  <!-- App functions: built FROM the declared list, so a new switch is one
       entry in services/features.js and nothing here. A sub-option is indented
       under its parent and goes dead with it. -->
  <section class="settings__section settings__section--features">
    <h2 class="settings__section-title">{S.sectionFeatures}</h2>
    <p class="settings__hint">{S.sectionFeaturesHint}</p>

    {#each FEATURES as feature (feature.key)}
      <label
        class="settings__row"
        class:settings__row--sub={!!feature.parent}
      >
        <span class="settings__label">{feature.label()}</span>
        <input
          class="theme-switch"
          type="checkbox"
          checked={on(features, feature.key)}
          disabled={readOnly || (!!feature.parent && !on(features, feature.parent))}
          aria-label={feature.label()}
          onchange={(e) => setFeature(feature.key, e.currentTarget.checked)}
        />
      </label>
    {/each}
  </section>

  <section class="settings__section">
    <h2 class="settings__section-title">{S.sectionNotebook}</h2>

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

    <p class="settings__row">
      <span class="settings__label">{S.notebookPath}</span>
      <code class="settings__path">{notebook?.path}</code>
    </p>
  </section>

  {#if saved}<p class="settings__saved">{S.settingsSaved}</p>{/if}
{/if}
