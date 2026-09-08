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
  import { makeScreen } from "../services/act.js";
  import { S } from "../services/strings.js";
  import { askConfirm } from "../services/dialog.js";
  import {
    FUNCTIONS,
    childrenIn,
    childrenOf,
    hasPage,
    on,
    stored,
  } from "../services/features.js";
  import { TYPE_ICONS } from "../services/spaceIcon.js";

  /// The glyph a function's menu entry wears: the space types' own, plus the
  /// functions that are not a space type.
  const FUNCTION_ICONS = { ...TYPE_ICONS, time: "path" };
  import Modal from "../components/Modal.svelte";
  import Icon from "../components/Icon.svelte";
  import AboutSection from "./settings/AboutSection.svelte";
  import DisplaySection from "./settings/DisplaySection.svelte";
  import DatesSection from "./settings/DatesSection.svelte";
  import ShortcutsSection from "./settings/ShortcutsSection.svelte";
  import NotebookSection from "./settings/NotebookSection.svelte";
  import { onBack } from "../services/back.js";
  import { plain } from "../services/plain.js";

  let {
    notebook,
    /// Where a quick note can go — `{label, value}` rows for the picker
    /// (services/noteTargets.js). Empty means nowhere: the row hides.
    noteTargets = [],
    /// …and where a quick task can (services/taskTargets.js). Same contract.
    taskTargets = [],
    /// The rows of the two "Home shows" pickers (2026-08-24): the block's
    /// default first, then every space of the right kind.
    /// The narrow shape (shell/compact.js). Not a width this screen measures:
    /// the shell measures once and tells everyone, the way the header and the
    /// top bar agree about which of them holds the arrows.
    compact = false,
    /// Android (shell/platform.js): no tray and no session to start with, so
    /// the two rows about them are not drawn — a switch that cannot do
    /// anything is worse than none.
    mobile = false,
    /// The interface's own zoom, and the way to change it. It belongs to the
    /// shell (it is a `font-size` on the root, applied there), so this screen
    /// asks rather than writes — the same handshake the notebook picker has.
    zoom = 1,
    onZoom,
    /// Opens the notebook picker. It is the shell's flow — the same one the
    /// sidebar's foot has always had; this is its second door (2026-08-20).
    onSwitchNotebook,
    /// The themes the notebook carries (`.jott/themes/`, 2026-08-25) — the
    /// shell reads them, because it is the shell that wears one. Empty means
    /// the notebook has none, and the whole block is absent rather than an
    /// empty list with an explanation nobody asked for.
    userThemes = [],
    /// Which of them is actually in the document. A name in `userThemes` that
    /// is not this one is a theme that failed to load — worth saying, because
    /// the app is then wearing the default while the setting says otherwise.
    wornTheme = null,
    /// How many remote references were neutralised in it.
    blockedInTheme = 0,
    /// Writes a new theme into the notebook, seeded with the look in use, and
    /// answers with it. The shell's, because the shell is what knows which
    /// stylesheet is on (App.svelte → newThemeFrom).
    onNewTheme,
    /// The open section's name, reported up so the compact header can draw it.
    /// The same handshake the Tasks screen has for its tabs (`onSub`): the
    /// header belongs to the shell, and only the screen knows what it opened.
    onSection,
    onChanged,
    onError,
  } = $props();

  /// The menu's first block: how the app is SET UP (wireframe "Settings
  /// screen mobile", 2026-08-20).
  ///
  /// One entry per section — the split is what already exists here, so a
  /// section gains a row by being written and nothing else. The icon names
  /// what the section is ABOUT rather than the word it uses, and the label is
  /// a function for the same reason every other string is: it is read at
  /// render time, so translating later adds a file and not a second list.
  const SETUP = [
    { key: "about", icon: "info", label: () => S.sectionAbout },
    { key: "display", icon: "monitor", label: () => S.sectionDisplay },
    { key: "dates", icon: "calendar-blank", label: () => S.sectionDates },
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
  ];

  /// The menu's second block: what the app can DO.
  ///
  /// `Native Functions` is the list of every function with its switch; under
  /// it, indented, sit the pages of the functions that are ON and have
  /// sub-functions of their own. Both facts are read from `services/features.js`
  /// rather than written here, so a function that gains a child gains a page,
  /// and one switched off takes its page out of the menu.
  ///
  /// `Expansions` — what the community writes — is the same shape and is not
  /// built yet; the block exists so it has somewhere to land.
  const NATIVE = { key: "native", label: () => S.sectionNative, group: true };

  let functionPages = $derived(
    // An inline group (the fixed spaces) has children but no page: its rows
    // are drawn on Native Functions itself, so a menu entry would be a door
    // to nowhere (user report, 2026-08-24).
    FUNCTIONS.filter((fn) => hasPage(fn.key) && !fn.inline && on(features, fn.key)).map((fn) => ({
      key: `fn:${fn.key}`,
      feature: fn.key,
      icon: FUNCTION_ICONS[fn.key] ?? "sliders-horizontal",
      label: fn.label,
      nested: true,
    })),
  );

  /// What the menu offers on THIS shape of screen, in reading order — the list
  /// the arrow keys and the fallbacks below walk.
  let setup = $derived(SETUP.filter((entry) => !(compact && entry.desktopOnly)));
  let menu = $derived([...setup, NATIVE, ...functionPages]);

  /// What the user last opened, and `null` for the menu itself.
  let chosen = $state(null);

  /// Which function's help is open — the ? beside an inline group's label
  /// (the fixed spaces). Null when none is.
  let helpFor = $state(null);

  /// What opens beside the menu when nothing has been chosen yet. NOT the
  /// first row: the wireframe lists About first and draws DISPLAY as the
  /// selected one, which is the honest default — nobody opens Settings to read
  /// a version number.
  const LANDING = "display";

  /// Which section is DRAWN. Derived rather than stored, so the things that
  /// can invalidate a choice need no handler of their own:
  ///
  ///   - the arrangement changes under it (a window resized past 768px, a
  ///     phone rotated) — side by side something always has to be open beside
  ///     the menu, on the phone the menu is a screen and nothing is;
  ///   - what was open leaves the menu (Shortcuts on a phone; the Notes page
  ///     the moment Notes is switched off) — it falls back to whichever of
  ///     the two above applies.
  let section = $derived(
    (menu.some((entry) => entry.key === chosen) ? chosen : null) ??
      (compact ? null : LANDING),
  );

  let sectionLabel = $derived(
    menu.find((entry) => entry.key === section)?.label() ?? "",
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
  const { load, act } = makeScreen({
    read: () => api.notebookSettings(),
    apply: (read) => (settings = read),
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

  /// Records a chord for a command, or clears it with `null`.
  ///
  /// It goes to the notebook and comes back through the layout, the way every
  /// other setting on this screen does — nothing here holds a local copy of
  /// the bindings, so the table, the keymap and the tooltips can never
  /// disagree about what is bound.
  const bindShortcut = (id, chord) => act(() => api.setShortcut(id, chord), flash);

  const resetShortcuts = () => act(() => api.resetShortcuts());

  /// "Reset this section" (2026-08-24): every option on the page goes back
  /// to what the app ships with — the core's defaults for a notebook page,
  /// and this machine going quiet for Display. Asked first, always: the
  /// button is deliberately small and far from the options, but a wrong
  /// click here undoes a page of choices at once.
  async function resetSection(section) {
    const ok = await askConfirm(S.resetSectionTitle, {
      detail: S.resetSectionDetail,
      danger: S.resetSectionAction,
    });
    if (!ok) return;
    act(
      () => (section === "display" ? api.resetMachineDisplay() : api.resetSettings(section)),
      flash,
    );
  }

  let readOnly = $derived(!!notebook?.readOnly);

  // ---- the search over every row (2026-08-20) ----
  //
  // A menu of eight rows hides nothing, but the ROWS inside them are ~50 and
  // only the open section draws any of them. So the search indexes them
  // directly and answers "which page is this on?", which is the question
  // somebody actually has.
  //
  // The index has two halves, and the split is the whole point (2026-08-21):
  // what is already DATA is derived from its own table, and only what exists
  // solely as markup is written out by hand. A hand-written row that names a
  // switch would be the drift this guards against — the switch would then have
  // two labels to keep in step, and `SETUP_INDEX` never mentions one.

  /// The half the search can only know by being TOLD.
  ///
  /// These rows are markup — one `<label>` at a time inside the sections
  /// below — and the search has to answer before any of them is rendered, so
  /// there is nothing to read them off. Nothing derives them and nothing will:
  /// the day a section is built from a table of its own, its entry here goes
  /// the way the functions' did.
  ///
  /// A row missing here is invisible to the search and still perfectly
  /// reachable — the failure is a search miss, never a broken screen.
  const SETUP_INDEX = () => [
    ["about", [S.updateVersion, S.updateAutoCheck, S.closeToTray, S.autostart, S.quitApp, S.updateCheckNow, S.yourFiles,
      S.menuEntryLabel, S.reportIssue]],
    [
      "display",
      [
        S.mode,
        S.theme,
        S.accentColor,
        S.headingColor,
        S.interfaceZoom,
        S.noteFontSizeLabel,
        S.interfaceFontLabel,
        S.noteFontLabel,
        S.monoFontLabel,
        S.formatBarLabel,
        S.formatBarSideLabel,
        S.showListCounts,
        S.autoSpaceColors,
        S.restoreLastScreen,
        S.closeOnClickAway,
        S.dateFormat,
      ],
    ],
    [
      "dates",
      [
        S.rolloverMode,
        S.weekStartsOn,
        S.datedTasksJoinPeriod,
        // The page's OTHER name. It is titled "Date preferences" and what it
        // decides is the day and the calendar, so both find it.
        S.sectionDay,
      ],
    ],
    [
      "notebook",
      [
        S.notebookPath,
        S.openNotebookFolder,
        S.switchNotebook,
        S.quickNoteFolder,
        S.quickTasksGoTo,
        S.confirmDeletes,
        S.completedRetention,
        S.trashRetention,
      ],
    ],
    // The ~50 commands are deliberately NOT here: the Shortcuts page carries a
    // filter of its own over `commands.js`, and pouring them into a search for
    // settings would bury the eight pages under them. What is indexed is the
    // door — the page, by both its names.
    ["shortcuts", [S.sectionShortcuts, S.resetShortcuts]],
  ];

  /// The rows on a function's page that are NOT one of its switches.
  ///
  /// They are notebook settings that belong to a function rather than to a
  /// section — where a dated task gets its colour is about Priority, and the
  /// download prompt is about Notes — so they are drawn one page in, and the
  /// search has to be told which page. Keyed by function so that a function
  /// with none simply has no entry, instead of the `fn.key === "tasks" ? …`
  /// chain this replaced.
  const FUNCTION_EXTRAS = () => ({
    tasks: [S.autoUrgentByDate, S.newTasksGoTo, S.autoRemind, S.reminderTime, S.tasksShowAll],
    notes: [S.noteLayout, S.tableLayout, S.confirmImageDownloads],
    time: [S.timelineGhostTitles],
  });

  /// Every page the search can look up. The functions' half is DERIVED — the
  /// switches from `features.js`, whatever group each was filed under — so a
  /// switch added there is findable the same day, without a second line here.
  const INDEX = () => [
    ...SETUP_INDEX(),
    [
      "native",
      [
        ...FUNCTIONS.map((fn) => fn.label()),
        // An inline group's children live on THIS page, so the search sends
        // the reader here and not to a page that does not exist.
        ...FUNCTIONS.filter((fn) => fn.inline).flatMap((fn) =>
          childrenOf(fn.key).map((c) => c.label()),
        ),
      ],
    ],
    ...FUNCTIONS.filter((fn) => hasPage(fn.key) && !fn.inline).map((fn) => [
      `fn:${fn.key}`,
      [
        ...childrenOf(fn.key).map((c) => c.label()),
        ...(FUNCTION_EXTRAS()[fn.key] ?? []),
      ],
    ]),
  ];

  let query = $state("");

  let hits = $derived.by(() => {
    const needle = plain(query.trim());
    if (!needle) return [];
    const reachable = new Set(menu.map((entry) => entry.key));
    const found = [];
    for (const [key, labels] of INDEX()) {
      if (!reachable.has(key)) continue;
      const where = menu.find((entry) => entry.key === key);
      // The section's own name counts as a row of it, so "display" finds the
      // page even when no row inside happens to carry the word.
      const all = [where?.label() ?? "", ...labels];
      for (const label of all) {
        if (plain(label).includes(needle)) found.push({ key, label, where });
      }
    }
    return found;
  });

  /// Opens a page from a search hit, and clears the query — the search asked a
  /// question and the page is the answer; leaving the field full would leave
  /// the menu showing results for a page already open.
  function goTo(key) {
    chosen = key;
    query = "";
  }


</script>

{#if settings && form}
{#snippet resetFooter(section)}
  <!-- Set apart and quiet on purpose: it is the one control on the page
       that undoes the others, so it must not be where a finger lands. -->
  <div class="settings__reset">
    <button
      type="button"
      class="theme-btn theme-btn--outline theme-btn--xs settings__reset-btn"
      disabled={section !== "display" && readOnly}
      onclick={() => resetSection(section)}>{S.resetSection}</button
    >
  </div>
{/snippet}

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

{#snippet menuRow(entry)}
  <li>
    <button
      type="button"
      class="settings__nav-item"
      class:settings__nav-item--group={!!entry.group}
      class:settings__nav-item--active={!compact && shows(entry.key)}
      aria-current={!compact && shows(entry.key) ? "page" : null}
      onclick={() => (chosen = entry.key)}
    >
      {#if entry.icon}
        <Icon name={entry.icon} size="1.125rem" />
      {/if}
      <span class="settings__nav-label">{entry.label()}</span>
      <!-- The caret promises a page to go into. On the phone that is every
           row; side by side only a row that is not already open beside the
           menu — and the two group rows keep theirs either way, because what
           they lead to is a LIST and the arrow is what says so. -->
      {#if compact || entry.group}
        <Icon name="caret-right" size="1rem" />
      {/if}
    </button>
  </li>
{/snippet}

{#snippet featureRow(feature)}
  <label class="settings__row">
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
      <div class="theme-filter settings__search">
        <Icon name="magnifying-glass" size="1rem" />
        <input
          class="theme-filter__field settings__search-field"
          type="search"
          bind:value={query}
          placeholder={S.settingsSearch}
          aria-label={S.settingsSearch}
        />
      </div>

      {#if query.trim()}
        <!-- A hit says the row AND the page it is on: the answer to "where is
             this?" is a place, not a jump that leaves you somewhere unnamed. -->
        <ul class="settings__nav-list">
          {#each hits as hit, i (`${hit.key}:${hit.label}:${i}`)}
            <li>
              <button
                type="button"
                class="settings__nav-item settings__hit"
                onclick={() => goTo(hit.key)}
              >
                <span class="settings__nav-label">{hit.label}</span>
                <span class="settings__hit-where"
                  >{S.settingsSearchIn(hit.where?.label() ?? "")}</span
                >
              </button>
            </li>
          {/each}
        </ul>
        {#if hits.length === 0}
          <p class="settings__hint settings__hit-empty">{S.settingsSearchEmpty}</p>
        {/if}
      {:else}
        <p class="settings__nav-title">{S.settingsSections}</p>
        <ul class="settings__nav-list">
          {#each setup as entry (entry.key)}
            {@render menuRow(entry)}
          {/each}
        </ul>

        <!-- The second block. The rule the wireframe fixes: the rows above
             carry an icon because each is a SUBJECT; `Native Functions` does
             not, because it is the door to a group. -->
        <p class="settings__nav-title settings__nav-title--split">
          {S.settingsFunctions}
        </p>
        <ul class="settings__nav-list">
          {@render menuRow(NATIVE)}
          {#if functionPages.length > 0}
            <li>
              <ul class="settings__nav-list settings__nav-nest">
                {#each functionPages as entry (entry.key)}
                  {@render menuRow(entry)}
                {/each}
              </ul>
            </li>
          {/if}
        </ul>
      {/if}
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

      {#if shows("about")}
        <AboutSection {compact} {mobile} {onError} />
      {/if}

      {#if shows("display")}
        <DisplaySection
          bind:form
          {putDisplay}
          {compact}
          {readOnly}
          {zoom}
          {onZoom}
          {userThemes}
          {wornTheme}
          {blockedInTheme}
          {onNewTheme}
          onReset={() => resetSection("display")}
          {onError}
        />
      {/if}

      {#if shows("dates")}
        <DatesSection
          bind:form
          {put}
          {compact}
          {readOnly}
          onReset={() => resetSection("dates")}
        />
      {/if}

      {#if shows("shortcuts")}
        <ShortcutsSection
          {compact}
          {readOnly}
          onBind={bindShortcut}
          onResetAll={resetShortcuts}
        />
      {/if}

      {#if shows("native")}
        <!-- Native Functions: every function of the app, with its switch and
             the door to its own page. What a function HAS — a task's fields, a
             note's banners — is not here; it is one page in (2026-08-20). -->
        <section class="settings__section settings__section--features">
          {@render sectionTitle(S.sectionNative)}
          <p class="settings__hint">{S.sectionNativeHint}</p>

          {#each FUNCTIONS as fn (fn.key)}
            <!-- An `inline` group (the fixed spaces) draws its children right
                 here, indented under their master switch and set apart by a
                 divider, instead of behind a page of its own (user call,
                 2026-08-24). -->
            {#if fn.inline}
              <hr class="theme-divider settings__functions-break" />
            {/if}
            <div class="settings__row settings__function">
              <input
                class="theme-switch"
                type="checkbox"
                checked={on(features, fn.key)}
                disabled={readOnly}
                aria-label={fn.label()}
                onchange={(e) => setFeature(fn.key, e.currentTarget.checked)}
              />
              <span class="settings__label settings__function-name">{fn.label()}</span>
              {#if fn.help}
                <button
                  type="button"
                  class="theme-btn--icon settings__function-help"
                  aria-label={S.fixedSpacesHelp}
                  title={S.fixedSpacesHelp}
                  onclick={() => (helpFor = fn.key)}
                >
                  <Icon name="question" size="1rem" />
                </button>
              {/if}
              {#if hasPage(fn.key) && !fn.inline}
                <button
                  type="button"
                  class="theme-btn--icon settings__function-open"
                  disabled={!on(features, fn.key)}
                  aria-label={S.openFunction(fn.label())}
                  onclick={() => (chosen = `fn:${fn.key}`)}
                >
                  <Icon name="caret-right" size="1rem" />
                </button>
              {/if}
            </div>
            {#if fn.inline}
              {#each childrenOf(fn.key) as sub (sub.key)}
                <div class="settings__row settings__function settings__function--sub">
                  <input
                    class="theme-switch"
                    type="checkbox"
                    checked={on(features, sub.key)}
                    disabled={readOnly || !on(features, fn.key)}
                    aria-label={sub.label()}
                    onchange={(e) => setFeature(sub.key, e.currentTarget.checked)}
                  />
                  <span class="settings__label settings__function-name">{sub.label()}</span>
                </div>
              {/each}
            {/if}
          {/each}

          {#if helpFor}
            {@const helped = FUNCTIONS.find((fn) => fn.key === helpFor)}
            <Modal label={S.fixedSpacesHelp} onClose={() => (helpFor = null)}>
              <h2 class="theme-title">{helped?.label()}</h2>
              {#each helped?.help?.() ?? [] as paragraph}
                <p class="settings__help-paragraph">{paragraph}</p>
              {/each}
            </Modal>
          {/if}
        </section>
      {/if}

      {#if shows("fn:tasks")}
        <section class="settings__section settings__section--features">
          {@render sectionTitle(S.featureTasks)}

          <!-- A notebook rule, not a field: where a capture lands. Above the
               screens because it is the first thing a new task does. -->
          <label class="settings__row">
            <span class="settings__label">{S.newTasksGoTo}</span>
            <select
              class="theme-select"
              value={form.newTasksOnTop ? "top" : "bottom"}
              disabled={readOnly}
              aria-label={S.newTasksGoTo}
              onchange={(e) => put({ newTasksOnTop: e.currentTarget.value === "top" })}
            >
              <option value="bottom">{S.newTasksBottom}</option>
              <option value="top">{S.newTasksTop}</option>
            </select>
          </label>

          <h3 class="settings__subtitle">{S.subScreens}</h3>
          {#each childrenIn("tasks", "screens") as feature (feature.key)}
            {@render featureRow(feature)}
          {/each}

          <h3 class="settings__subtitle">{S.subFields}</h3>
          {#each childrenIn("tasks", "fields") as feature (feature.key)}
            {@render featureRow(feature)}
            <!-- The one rule that hangs off a field rather than off a screen:
                 it paints the PRIORITY, so it belongs on the line below it
                 (2026-08-20, moving back out of Day and week). With priority
                 off there is nothing for it to paint, and it says so by being
                 disabled rather than by disappearing. -->
            {#if feature.key === "priority"}
              <label class="settings__row settings__row--sub">
                <span class="settings__label">{S.autoUrgentByDate}</span>
                <input
                  class="theme-checkbox"
                  type="checkbox"
                  bind:checked={form.autoUrgentByDate}
                  disabled={readOnly || !on(features, "priority")}
                  aria-label={S.autoUrgentByDate}
                  onchange={(e) => put({ autoUrgentByDate: e.currentTarget.checked })}
                />
              </label>
            {/if}
            <!-- The automatic reminder hangs off Remind me the same way: it
                 rings dated tasks at the reminder time (2026-08-25), and
                 with the field off there is no bell for it to ring. -->
            {#if feature.key === "remind"}
              <label class="settings__row settings__row--sub">
                <span class="settings__label">{S.autoRemind}</span>
                <select
                  class="theme-select"
                  bind:value={form.autoRemind}
                  disabled={readOnly || !on(features, "remind")}
                  aria-label={S.autoRemind}
                  onchange={(e) => put({ autoRemind: e.currentTarget.value })}
                >
                  <option value="off">{S.autoRemindOff}</option>
                  <option value="dayOf">{S.autoRemindDayOf}</option>
                  <option value="dayBefore">{S.autoRemindDayBefore}</option>
                </select>
              </label>
              <label class="settings__row settings__row--sub">
                <span class="settings__label">{S.reminderTime}</span>
                <input
                  class="theme-input"
                  type="time"
                  bind:value={form.reminderTime}
                  disabled={readOnly || !on(features, "remind")}
                  aria-label={S.reminderTime}
                  onchange={(e) => put({ reminderTime: e.currentTarget.value })}
                />
              </label>
              <p class="settings__hint">{S.autoRemindHint}</p>
            {/if}
          {/each}
          <p class="settings__hint">{S.autoUrgentByDateHint}</p>

          <!-- The fixed Tasks screen (2026-09-04): the Inbox alone, or every
               list pulled together. A notebook setting on the function's
               page, like the rows above — not a feature switch. -->
          <h3 class="settings__subtitle">{S.subTasksScreen}</h3>
          <label class="settings__row">
            <span class="settings__label">{S.tasksShowAll}</span>
            <select
              class="theme-select"
              value={form.tasksShowAll ? "all" : "inbox"}
              disabled={readOnly}
              aria-label={S.tasksShowAll}
              onchange={(e) => put({ tasksShowAll: e.currentTarget.value === "all" })}
            >
              <option value="inbox">{S.tasksShowAllInbox}</option>
              <option value="all">{S.tasksShowAllEvery}</option>
            </select>
          </label>
          <p class="settings__hint">{S.tasksShowAllHint}</p>

          {@render resetFooter("tasks")}
        </section>
      {/if}

      {#if shows("fn:time")}
        <section class="settings__section settings__section--features">
          {@render sectionTitle(S.featureTime)}

          <h3 class="settings__subtitle">{S.subScreens}</h3>
          {#each childrenIn("time", "screens") as feature (feature.key)}
            {@render featureRow(feature)}
          {/each}

          <!-- What the Timeline says about a deleted thing (2026-08-27):
               counted only, by default — it may have been thrown away for
               privacy. The log keeps the name either way; this is the
               screen's word, and the row's own "Remove from timeline" is the
               door for someone who wants the line gone. -->
          <label class="settings__row">
            <span class="settings__label">{S.timelineGhostTitles}</span>
            <input
              class="theme-checkbox"
              type="checkbox"
              bind:checked={form.timelineGhostTitles}
              disabled={readOnly}
              aria-label={S.timelineGhostTitles}
              onchange={(e) => put({ timelineGhostTitles: e.currentTarget.checked })}
            />
          </label>
          <p class="settings__hint">{S.timelineGhostTitlesHint}</p>

          {@render resetFooter("time")}
        </section>
      {/if}

      {#if shows("fn:notes")}
        <section class="settings__section settings__section--features">
          {@render sectionTitle(S.featureNotes)}

          <h3 class="settings__subtitle">{S.subNoteHas}</h3>
          {#each childrenIn("notes", "has") as feature (feature.key)}
            {@render featureRow(feature)}
          {/each}
          <p class="settings__hint">{S.featureBannersHint}</p>

          <h3 class="settings__subtitle">{S.subBoard}</h3>

          <!-- The default for a space that never chose (proposta §9-A). A
               space's own choice lives in its .space.json and wins; with
               folders off there is no tree to draw, so the row goes quiet
               the way a child switch does. -->
          <label class="settings__row">
            <span class="settings__label">{S.noteLayout}</span>
            <select
              class="theme-select"
              value={form.noteLayout === "tree" ? "tree" : ""}
              disabled={readOnly || !on(features, "noteFolders")}
              aria-label={S.noteLayout}
              onchange={(e) => put({ noteLayout: e.currentTarget.value })}
            >
              <option value="">{S.gridView}</option>
              <option value="tree">{S.treeView}</option>
            </select>
          </label>
          <p class="settings__hint">{S.noteLayoutHint}</p>

          <h3 class="settings__subtitle">{S.subTables}</h3>

          <!-- How a table sits in the note's column (user call, 2026-08-24):
               squeezed to the content width by default, or as wide as its
               cells with a sideways scroll of its own. A notebook setting,
               like the board layout above — it is about the notes, not about
               this screen. -->
          <label class="settings__row">
            <span class="settings__label">{S.tableLayout}</span>
            <select
              class="theme-select"
              value={form.tableLayout === "scroll" ? "scroll" : ""}
              disabled={readOnly || !on(features, "tables")}
              aria-label={S.tableLayout}
              onchange={(e) => put({ tableLayout: e.currentTarget.value })}
            >
              <option value="">{S.tableLayoutFit}</option>
              <option value="scroll">{S.tableLayoutScroll}</option>
            </select>
          </label>
          <p class="settings__hint">{S.tableLayoutHint}</p>

          <h3 class="settings__subtitle">{S.subImages}</h3>

          <!-- Rescued (2026-08-20): the value was only ever written by the
               dialog's own "don't ask again", so it could be switched off and
               never back on. Principle 9 is the reason it exists at all — this
               is one of the two connections the app makes. -->
          <label class="settings__row">
            <span class="settings__label">{S.confirmImageDownloads}</span>
            <input
              class="theme-checkbox"
              type="checkbox"
              bind:checked={form.confirmImageDownloads}
              disabled={readOnly}
              aria-label={S.confirmImageDownloads}
              onchange={(e) => put({ confirmImageDownloads: e.currentTarget.checked })}
            />
          </label>
          <p class="settings__hint">{S.confirmImageDownloadsHint}</p>



          {@render resetFooter("notes")}
        </section>
      {/if}

      {#if shows("notebook")}
        <NotebookSection
          {notebook}
          bind:form
          {put}
          {compact}
          {readOnly}
          {noteTargets}
          {taskTargets}
          {onSwitchNotebook}
          onReset={() => resetSection("notebook")}
          {onError}
        />
      {/if}
    </div>
  {/if}

  {#if saved}<p class="settings__saved">{S.settingsSaved}</p>{/if}
</div>
{/if}
