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
  import Icon from "../components/Icon.svelte";
  import ShortcutRow from "../components/ShortcutRow.svelte";
  import { onBack } from "../services/back.js";
  import { SCOPES, commandsIn } from "../services/commands.js";
  import { bound } from "../services/shortcuts.js";
  import { installUpdate, manualCheck, openReleasePage } from "../services/update.js";

  let {
    notebook,
    folders = [],
    notesInbox = "Inbox",
    /// The narrow shape (shell/compact.js). Not a width this screen measures:
    /// the shell measures once and tells everyone, the way the header and the
    /// top bar agree about which of them holds the arrows.
    compact = false,
    /// The open section's name, reported up so the compact header can draw it.
    /// The same handshake the Tasks screen has for its tabs (`onSub`): the
    /// header belongs to the shell, and only the screen knows what it opened.
    onSection,
    onChanged,
    onError,
  } = $props();

  /// The menu, in the order it is read (wireframe "Settings", 2026-08-20).
  ///
  /// One entry per section of this screen — the split is what already exists
  /// here, not a new one, so a section gains a row by being written and
  /// nothing else. The icon names what the section is ABOUT rather than the
  /// word it uses, and the label is a function for the same reason every
  /// other string is: it is read at render time, so translating later adds a
  /// file and not a second list.
  const SECTIONS = [
    { key: "display", icon: "monitor", label: () => S.sectionDisplay },
    { key: "day", icon: "calendar-blank", label: () => S.sectionDay },
    { key: "notebook", icon: "notebook", label: () => S.sectionNotebook },
    {
      key: "shortcuts",
      icon: "keyboard",
      label: () => S.sectionShortcuts,
      // A chord is a keyboard's, and a phone has none to press one on (user
      // call, 2026-08-20): the section would be a table of rows nobody can
      // record. The bindings are untouched — they travel with the notebook
      // and keep answering wherever there are keys.
      desktopOnly: true,
    },
    {
      key: "features",
      icon: "sliders-horizontal",
      label: () => S.sectionFeatures,
    },
    { key: "updates", icon: "download-simple", label: () => S.sectionUpdates },
  ];

  /// What the menu offers on THIS shape of screen.
  let menu = $derived(SECTIONS.filter((entry) => !(compact && entry.desktopOnly)));

  /// What the user last opened, and `null` for the menu itself.
  let chosen = $state(null);

  /// Which section is DRAWN. Derived rather than stored, so the two things
  /// that can invalidate a choice need no handler of their own:
  ///
  ///   - the arrangement changes under it (a window resized past 768px, a
  ///     phone rotated) — side by side something always has to be open beside
  ///     the menu, on the phone the menu is a screen and nothing is;
  ///   - what was open leaves the menu (Shortcuts, on a phone) — it falls back
  ///     to whichever of the two above applies.
  let section = $derived(
    (menu.some((entry) => entry.key === chosen) ? chosen : null) ??
      (compact ? null : menu[0].key),
  );

  let sectionLabel = $derived(
    SECTIONS.find((entry) => entry.key === section)?.label() ?? "",
  );

  // The compact header names the section you went INTO — the mobile wireframe
  // titles that screen "Display", not "Settings". Reported and not guessed:
  // the header is the shell's, and this is the only place that knows.
  $effect(() => {
    onSection?.(compact && section ? sectionLabel : "");
    return () => onSection?.("");
  });

  // Android's back gesture — and the mouse's fourth button — return to the
  // menu before they leave Settings (services/back.js). Registered only while
  // a section is open on the narrow shell: that is the one arrangement where
  // "back" has somewhere of its own to go.
  $effect(() => {
    if (!compact || !section) return;
    return onBack(() => ((chosen = null), true));
  });

  /// Whether a section is drawn at all. Side by side that is the one the menu
  /// has selected; on the phone the section IS the screen, and the menu is
  /// the other one.
  const shows = (key) => section === key;

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

  /// Sends one Display choice, which answers to THIS MACHINE and not to the
  /// notebook (2026-08-20, user call: "no meu celular quero usar tema escuro e
  /// no desktop tema Jott").
  ///
  /// The same one-key-at-a-time pact as `put`, to a different drawer — and it
  /// is why none of the Display controls mind `readOnly`: a notebook open for
  /// reading still does not get to decide what this screen looks like. The
  /// reading side needs nothing: `notebook_settings` already answers with the
  /// value in force, this machine's over the notebook's.
  const putDisplay = (patch) => act(() => api.setMachineDisplay(patch), flash);

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
{#snippet sectionTitle(text)}
  <!-- The section's name, ONCE. Side by side it is the panel's own heading,
       which is what says which of the menu's rows you are reading. On the
       phone you went INTO the section and the header above already carries
       its name (shell/PageHeader.svelte) — repeating it here would be the
       "nome dito duas vezes" the space screens were fixed for. -->
  {#if !compact}
    <h2 class="settings__section-title">{text}</h2>
  {/if}
{/snippet}

<!-- Two arrangements of one screen (wireframes "Settings", 2026-08-20):

       desktop  the menu hugs its rows on the left, the section fills what is
                left of a 900px column;
       phone    the menu IS the screen, and a row takes you into the section.

     Which one is drawn is `compact` — the shell's measurement, not a second
     media query that could disagree with it. -->
<div class="settings" class:settings--compact={compact}>
  {#if readOnly}
    <p class="settings__notice">{S.readOnlyNotice}</p>
  {/if}

  <!-- The menu. On the phone it is only there while no section is open; side
       by side it never leaves. -->
  {#if !compact || !section}
    <nav class="settings__nav" aria-label={S.settingsSections}>
      <p class="settings__nav-title">{S.settingsSections}</p>
      <ul class="settings__nav-list">
        {#each menu as entry (entry.key)}
          <li>
            <button
              type="button"
              class="settings__nav-item"
              class:settings__nav-item--active={!compact && shows(entry.key)}
              aria-current={!compact && shows(entry.key) ? "page" : null}
              onclick={() => (chosen = entry.key)}
            >
              <Icon name={entry.icon} size="1.125rem" />
              <span class="settings__nav-label">{entry.label()}</span>
              <!-- The caret is the phone's alone: it promises a screen to go
                   into, and side by side there is nowhere to go — the section
                   is already open next to the row. -->
              {#if compact}
                <Icon name="caret-right" size="1rem" />
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </nav>
  {/if}

  {#if !compact || section}
    <div class="settings__panel">
      <!-- The way back to the menu, drawn rather than left to the gesture: the
           top bar's arrow is the TAB's history and would leave Settings
           altogether, and a window merely narrowed past 768px has no back
           gesture at all. -->
      {#if compact}
        <button
          type="button"
          class="settings__back"
          onclick={() => (chosen = null)}
        >
          <Icon name="caret-left" size="1rem" />
          <span>{S.settingsBackToMenu}</span>
        </button>
      {/if}

      {#if shows("day")}
        <section class="settings__section">
          {@render sectionTitle(S.sectionDay)}

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

          <!-- Its sibling: both are about a DATE deciding something on its own,
               which is the one rule of this screen the day reads (it moved here
               from Display on 2026-08-20 — a rule about tasks is the notebook's,
               and Display is now this machine's). -->
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
        </section>
      {/if}

      {#if shows("display")}
        <section class="settings__section">
          {@render sectionTitle(S.sectionDisplay)}
          <p class="settings__hint">{S.sectionDisplayHint}</p>

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
                  onclick={() => putDisplay({ theme: option.key })}>{option.label()}</button
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
              onPick={(c) => putDisplay({ accentColor: c })}
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
                  onclick={() => putDisplay({ headingColor: option.key })}
                  >{option.label()}</button
                >
              {/each}
            </div>
          </div>

          <!-- How big a note reads. This machine's, like everything in this
               section: a phone held at arm's length and a monitor at a desk do
               not agree about it, and the notebook is the same notebook. The
               interface's own zoom is the other half of the question, and lives
               on the keyboard (Ctrl +/-) and in this machine's preferences. -->
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
                  onclick={() => putDisplay({ noteFontSize: option.key })}>{option.label()}</button
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
              aria-label={S.dateFormat}
              onchange={(e) => putDisplay({ dateDisplayFormat: e.currentTarget.value })}
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
              aria-label={S.showListCounts}
              onchange={(e) => putDisplay({ showListCounts: e.currentTarget.checked })}
            />
          </label>

          <label class="settings__row">
            <span class="settings__label">{S.restoreLastScreen}</span>
            <input
              class="theme-checkbox"
              type="checkbox"
              bind:checked={form.restoreLastScreen}
              aria-label={S.restoreLastScreen}
              onchange={(e) => putDisplay({ restoreLastScreen: e.currentTarget.checked })}
            />
          </label>
          <p class="settings__hint">{S.restoreLastScreenHint}</p>

          <label class="settings__row">
            <span class="settings__label">{S.closeOnClickAway}</span>
            <input
              class="theme-checkbox"
              type="checkbox"
              bind:checked={form.closeInspectorOnClickAway}
              aria-label={S.closeOnClickAway}
              onchange={(e) =>
                putDisplay({ closeInspectorOnClickAway: e.currentTarget.checked })}
            />
          </label>
          <p class="settings__hint">{S.closeOnClickAwayHint}</p>
        </section>
      {/if}

      {#if shows("shortcuts")}
        <section class="settings__section">
          {@render sectionTitle(S.sectionShortcuts)}
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
      {/if}

      {#if shows("features")}
        <section class="settings__section settings__section--features">
          {@render sectionTitle(S.sectionFeatures)}
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
      {/if}

      {#if shows("notebook")}
        <section class="settings__section">
          {@render sectionTitle(S.sectionNotebook)}

          <!-- Where a quick note lands names a folder of THIS notebook, so it
               could not follow Display onto the machine (2026-08-20): machine
               preferences are one file for every notebook the app opens, and
               a folder name from one would be nonsense in the next. -->
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
      {/if}

      {#if shows("updates")}
        <section class="settings__section">
          {@render sectionTitle(S.sectionUpdates)}

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
      {/if}
    </div>
  {/if}

  {#if saved}<p class="settings__saved">{S.settingsSaved}</p>{/if}
</div>
{/if}
