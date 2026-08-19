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
  import { makeAct, makeLoad } from "../services/act.js";
  import { S } from "../services/strings.js";
  import { FEATURES, on, stored } from "../services/features.js";
  import { DEFAULT_ACCENT } from "../services/accent.js";
  import {
    THEMES,
    DEFAULT_THEME,
    HEADING_COLORS,
    DEFAULT_HEADING_COLOR,
    NOTE_FONT_SIZES,
    DEFAULT_NOTE_FONT_SIZE,
  } from "../services/themes.js";
  import AccentPicker from "../components/AccentPicker.svelte";
  import ShortcutRow from "../components/ShortcutRow.svelte";
  import { SCOPES, commandsIn } from "../services/commands.js";
  import { bound } from "../services/shortcuts.js";
  import { installUpdate, manualCheck, openReleasePage } from "../services/update.js";

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

  // Back to the default? Then the notebook forgets it, and the file keeps
  // only what differs from how the app ships.
  const setFeature = (key, value) =>
    act(() => api.setFeature(key, stored(key, value)), flash);

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

  /// The "Saved" that blinks after a write — it was pasted into three
  /// handlers before it had a name.
  function flash() {
    saved = true;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (saved = false), 1500);
  }

  // Whatever the core says is what the controls show.
  $effect(() => {
    if (settings) form = { ...settings };
  });

  // Re-read rather than trusting what was sent: the core may have normalised
  // the value, and the screen should show what was stored.
  const load = makeLoad({
    read: () => api.notebookSettings(),
    apply: (read) => (settings = read),
    onError: (e) => onError?.(e),
  });

  const act = makeAct({
    load,
    // Wrapped, not passed: `act` is built once, and the props may be
    // replaced (services/act.js).
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });

  // A plain call, not an $effect: it reads no reactive value, and an effect
  // here would silently start re-running the day someone reads state inside.
  load();

  /// Sends one key. The core keeps everything it was not told about.
  const put = (patch) => act(() => api.setNotebookSettings(patch), flash);

  // Slash-only, and month-first is the default (user call, 2026-08-06).
  const DATE_SHAPES = ["mm/dd/yyyy", "dd/mm/yyyy", "yyyy/mm/dd"];

  /// Records a chord for a command, or clears it with `null`.
  ///
  /// It goes to the notebook and comes back through the layout, the way every
  /// other setting on this screen does — nothing here holds a local copy of
  /// the bindings, so the table, the keymap and the tooltips can never
  /// disagree about what is bound.
  const bindShortcut = (id, chord) => act(() => api.setShortcut(id, chord), flash);

  const resetShortcuts = () => act(() => api.resetShortcuts());

  let readOnly = $derived(!!notebook?.readOnly);

  // ---- updates (2026-08-19) ----
  // Machine preferences, not notebook ones: the same notebook synced to a
  // phone and a desktop is served by two binaries, each updated its own way.
  // That is why none of this goes through `put` or minds `readOnly`.
  let version = $state("");
  let updateAuto = $state(true);
  let checking = $state(false);
  let installing = $state(false);
  /// The answer to the last click on "Check now" — null until one happens.
  let checked = $state(null);

  api.appVersion().then((v) => (version = v ?? "")).catch(() => {});
  api.autoUpdateCheck().then((on) => (updateAuto = on ?? true)).catch(() => {});

  const setUpdateAuto = (on) => {
    updateAuto = on;
    api.rememberAutoUpdateCheck(on).catch(onError);
  };

  async function checkNow() {
    checking = true;
    checked = null;
    try {
      checked = await manualCheck();
    } catch (e) {
      onError?.(e);
    } finally {
      checking = false;
    }
  }

  async function installNow() {
    installing = true;
    try {
      await installUpdate();
    } catch (e) {
      onError?.(e);
    } finally {
      installing = false;
    }
  }
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

    <label class="settings__row">
      <span class="settings__label">{S.datedTasksJoinPeriod}</span>
      <input
        class="theme-checkbox"
        type="checkbox"
        bind:checked={form.datedTasksJoinPeriod}
        disabled={readOnly}
        aria-label={S.datedTasksJoinPeriod}
        onchange={(e) => put({ datedTasksJoinPeriod: e.currentTarget.checked })}
      />
    </label>
    <p class="settings__hint">{S.datedTasksJoinPeriodHint}</p>
  </section>

  <section class="settings__section">
    <h2 class="settings__section-title">{S.sectionDisplay}</h2>

    <!-- The theme leads the section: it decides the ground everything else is
         drawn on, including which half of the accent shows. A segmented group
         rather than a select — there are three, and each is a look you want to
         see the name of side by side. -->
    <div class="settings__row">
      <span class="settings__label">{S.theme}</span>
      <div class="theme-segmented" role="group" aria-label={S.theme}>
        {#each THEMES as option (option.key)}
          <button
            type="button"
            class="theme-segmented__item"
            class:theme-segmented__item--active={(form.theme || DEFAULT_THEME) ===
              option.key}
            aria-pressed={(form.theme || DEFAULT_THEME) === option.key}
            title={option.hint()}
            disabled={readOnly}
            onclick={() => put({ theme: option.key })}>{option.label()}</button
          >
        {/each}
      </div>
    </div>

    <!-- Not a <label>: the picker is a group of buttons, and a label wrapping
         them would claim the first one for its own click. -->
    <div class="settings__row">
      <span class="settings__label">{S.accentColor}</span>
      <AccentPicker
        value={form.accentColor || DEFAULT_ACCENT}
        clearable={false}
        label={S.accentColor}
        disabled={readOnly}
        onPick={(c) => put({ accentColor: c })}
      />
    </div>
    <p class="settings__hint">{S.accentColorHint}</p>

    <!-- Two answers, both right depending on what the notebook is for, which
         is why this is a setting and not a theme: a note titled in the colour
         of its space is the app's face, and a reader who wants a document to
         read as a document turns it off. -->
    <div class="settings__row">
      <span class="settings__label">{S.headingColor}</span>
      <div class="theme-segmented" role="group" aria-label={S.headingColor}>
        {#each HEADING_COLORS as option (option.key)}
          <button
            type="button"
            class="theme-segmented__item"
            class:theme-segmented__item--active={(form.headingColor ||
              DEFAULT_HEADING_COLOR) === option.key}
            aria-pressed={(form.headingColor || DEFAULT_HEADING_COLOR) ===
              option.key}
            title={option.hint()}
            disabled={readOnly}
            onclick={() => put({ headingColor: option.key })}
            >{option.label()}</button
          >
        {/each}
      </div>
    </div>

    <!-- How big a note reads. A notebook setting, not a machine one: it is
         reading taste and should follow the writer to another screen. The
         interface's own zoom is the other question, and lives on the keyboard
         (Ctrl +/-) and in this machine's preferences. -->
    <div class="settings__row">
      <span class="settings__label">{S.noteFontSizeLabel}</span>
      <div class="theme-segmented" role="group" aria-label={S.noteFontSizeLabel}>
        {#each NOTE_FONT_SIZES as option (option.key)}
          <button
            type="button"
            class="theme-segmented__item"
            class:theme-segmented__item--active={(form.noteFontSize ||
              DEFAULT_NOTE_FONT_SIZE) === option.key}
            aria-pressed={(form.noteFontSize || DEFAULT_NOTE_FONT_SIZE) === option.key}
            disabled={readOnly}
            onclick={() => put({ noteFontSize: option.key })}>{option.label()}</button
          >
        {/each}
      </div>
    </div>
    <p class="settings__hint">{S.noteFontSizeHint}</p>

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
  <section class="settings__section">
    <h2 class="settings__section-title">{S.sectionShortcuts}</h2>
    <p class="settings__hint">{S.sectionShortcutsHint}</p>

    <!-- Grouped by SCOPE, because a scope is what decides whether two commands
         may share a chord: two that can never both answer (a task list and a
         text cursor are not focused at once) legitimately can. The groups are
         named for what the user is doing, not for the word the code uses. -->
    {#each SCOPES as scope (scope)}
      <h3 class="settings__subtitle">{S.shortcutScope(scope)}</h3>
      {#each commandsIn(scope) as command (command.id)}
        <ShortcutRow
          {command}
          chord={$bound.get(command.id) ?? null}
          bound={$bound}
          disabled={readOnly}
          onBind={(chord) => bindShortcut(command.id, chord)}
        />
      {/each}
    {/each}

    <div class="settings__row">
      <span class="settings__label"></span>
      <button
        type="button"
        class="theme-btn theme-btn--outline theme-btn--xs"
        disabled={readOnly}
        onclick={resetShortcuts}>{S.resetShortcuts}</button
      >
    </div>
  </section>

  <!-- The modifier is what scopes the sub-feature indent and the row
       hairlines in settings.css — it sat on the Shortcuts section for a
       while, where none of those rules had anything to catch. -->
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

  <section class="settings__section">
    <h2 class="settings__section-title">{S.sectionUpdates}</h2>

    <p class="settings__row">
      <span class="settings__label">{S.updateVersion}</span>
      <code class="settings__path">Jott {version}</code>
    </p>

    <label class="settings__row">
      <span class="settings__label">{S.updateAutoCheck}</span>
      <input
        class="theme-switch"
        type="checkbox"
        checked={updateAuto}
        aria-label={S.updateAutoCheck}
        onchange={(e) => setUpdateAuto(e.currentTarget.checked)}
      />
    </label>
    <p class="settings__hint">{S.updateAutoCheckHint}</p>

    <div class="settings__row">
      <span class="settings__label">{S.updateCheckNow}</span>
      <button
        type="button"
        class="theme-btn theme-btn--outline theme-btn--xs"
        disabled={checking}
        onclick={checkNow}>{checking ? S.updateChecking : S.updateCheckNow}</button
      >
    </div>
    {#if checked}
      <p class="settings__notice">
        {#if checked.newer}
          {S.updateAvailable(checked.latest)}
          {#if checked.canInstall}
            <button
              type="button"
              class="theme-btn theme-btn--primary theme-btn--xs"
              disabled={installing}
              onclick={installNow}
              >{installing ? S.updateInstalling : S.updateInstall}</button
            >
          {:else}
            <button
              type="button"
              class="theme-btn theme-btn--primary theme-btn--xs"
              onclick={() => openReleasePage(checked.url).catch(onError)}
              >{S.updateDownload}</button
            >
          {/if}
        {:else}
          {S.updateUpToDate}
        {/if}
      </p>
    {/if}
  </section>

  {#if saved}<p class="settings__saved">{S.settingsSaved}</p>{/if}
{/if}
