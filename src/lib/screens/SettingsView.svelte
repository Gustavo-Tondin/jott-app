<script>
  // The settings screen: every documented key of the notebook, editable,
  // one key at a time. The core keeps what it is not told about and
  // normalises what it is — modes, week start and date shape are selects
  // so a bad value is never offered.
  import { api } from "../services/api.js";
  import { makeScreen } from "../services/act.js";
  import { S } from "../services/strings.js";
  import { askConfirm } from "../services/dialog.js";
  import {
    FUNCTIONS,
    childrenOf,
    hasPage,
    on,
    stored,
  } from "../services/features.js";
  import { TYPE_ICONS } from "../services/spaceIcon.js";

  /// The glyph a function's menu entry wears: the space types' own, plus the
  /// functions that are not a space type.
  const FUNCTION_ICONS = { ...TYPE_ICONS, time: "path" };
  import Icon from "../components/Icon.svelte";
  import AboutSection, { index as aboutIndex } from "./settings/AboutSection.svelte";
  import DisplaySection, { index as displayIndex } from "./settings/DisplaySection.svelte";
  import DatesSection, { index as datesIndex } from "./settings/DatesSection.svelte";
  import ShortcutsSection, { index as shortcutsIndex } from "./settings/ShortcutsSection.svelte";
  import NotebookSection, { index as notebookIndex } from "./settings/NotebookSection.svelte";
  import NativeSection, { index as nativeIndex } from "./settings/NativeSection.svelte";
  import TasksPage, { index as tasksIndex } from "./settings/TasksPage.svelte";
  import TimePage, { index as timeIndex } from "./settings/TimePage.svelte";
  import NotesPage, { index as notesIndex } from "./settings/NotesPage.svelte";
  import { onBack } from "../services/back.js";
  import { plain } from "../services/plain.js";

  let {
    notebook,
    /// A section to land on, by menu key (`"fn:tasks"`): the door a card
    /// elsewhere opens. Applied when it changes; the menu stays the user's.
    open = null,
    /// Where a quick note can go — `{label, value}` rows for the picker
    /// (services/noteTargets.js). Empty means nowhere: the row hides.
    noteTargets = [],
    /// …and where a quick task can (services/taskTargets.js). Same contract.
    taskTargets = [],
    /// The narrow shape (shell/compact.js): measured once by the shell.
    compact = false,
    /// Android (shell/platform.js): no tray and no session to start with.
    mobile = false,
    /// The interface's own zoom, and the way to change it (the shell's).
    zoom = 1,
    onZoom,
    /// Opens the notebook picker — the shell's flow, its second door.
    onSwitchNotebook,
    /// The notebook's own themes, which one is worn, and how many remote
    /// references it lost — read by the shell, which wears the theme.
    userThemes = [],
    wornTheme = null,
    blockedInTheme = 0,
    /// Writes a new theme seeded with the look in use (App.svelte → newThemeFrom).
    onNewTheme,
    /// The open section's name, reported up for the compact header.
    onSection,
    onChanged,
    onError,
  } = $props();

  /// The menu's first block: how the app is SET UP. One entry per section,
  /// so a section gains a row by being written; the icon names what the
  /// section is ABOUT; `index()` is the rows the search can find on it.
  const SETUP = [
    { key: "about", icon: "info", label: () => S.sectionAbout, index: aboutIndex },
    { key: "display", icon: "monitor", label: () => S.sectionDisplay, index: displayIndex },
    { key: "dates", icon: "calendar-blank", label: () => S.sectionDates, index: datesIndex },
    { key: "notebook", icon: "notebook", label: () => S.sectionNotebook, index: notebookIndex },
    {
      key: "shortcuts",
      icon: "keyboard",
      label: () => S.sectionShortcuts,
      index: shortcutsIndex,
      // A chord is a keyboard's, and a phone has none to press one on. The
      // bindings are untouched — they travel with the notebook.
      desktopOnly: true,
    },
  ];

  /// The menu's second block: what the app can DO. `Native Functions` lists
  /// every function with its switch; under it, indented, the pages of the
  /// functions that are ON and have sub-functions — both read from
  /// `services/features.js`. `Expansions` (community) is not built yet.
  const NATIVE = { key: "native", label: () => S.sectionNative, group: true };

  /// The pages of the functions, by key: the component, and the rows on it
  /// that are NOT one of its switches (the switches the search derives).
  const FUNCTION_PAGES = {
    tasks: { page: TasksPage, index: tasksIndex },
    time: { page: TimePage, index: timeIndex },
    notes: { page: NotesPage, index: notesIndex },
  };

  let functionPages = $derived(
    // An inline group (the fixed spaces) draws its rows on Native Functions
    // itself: a menu entry would be a door to nowhere.
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

  $effect(() => {
    if (open) chosen = open;
  });

  /// What opens beside the menu before a choice: Display, not the first
  /// row — nobody opens Settings to read a version number.
  const LANDING = "display";

  /// Which section is DRAWN. Derived, so a choice invalidated by a resize
  /// (side by side something is always open; on the phone nothing is) or by
  /// a row leaving the menu (Shortcuts on a phone, a page switched off)
  /// needs no handler: it falls back to LANDING or to the menu.
  let section = $derived(
    (menu.some((entry) => entry.key === chosen) ? chosen : null) ??
      (compact ? null : LANDING),
  );

  let sectionLabel = $derived(
    menu.find((entry) => entry.key === section)?.label() ?? "",
  );

  // The compact header names the section you went INTO — reported, not
  // guessed: the header is the shell's, and only this screen knows.
  $effect(() => {
    onSection?.(compact && section ? sectionLabel : "");
    return () => onSection?.("");
  });

  // "Back" (services/back.js) — the header's arrow, the phone's gesture and
  // the mouse's button alike — returns to the menu before it leaves Settings.
  // Only on the narrow shell, where a section is a screen.
  $effect(() => {
    if (!compact || !section) return;
    return onBack(() => ((chosen = null), true));
  });

  /// Whether a section is drawn: side by side the one the menu selected;
  /// on the phone the section IS the screen.
  const shows = (key) => section === key;

  /// Which parts of the app are switched on: read from the notebook's
  /// layout, written with their own command.
  let features = $derived(notebook?.layout?.features ?? {});

  // Back to the default? Then the notebook forgets it, and the file keeps
  // only what differs from how the app ships.
  const setFeature = (key, value) =>
    act(() => api.setFeature(key, stored(key, value)), flash);

  let settings = $state(null);
  /// What the controls are bound to. Separate from `settings` on purpose: a
  /// control needs a BOUND variable to be pushed back by Svelte — with a
  /// plain `value=`, a value the core rejected would stay on screen.
  let form = $state({});
  let saved = $state(false);
  let savedTimer = null;

  /// The "Saved" that blinks after a write.
  function flash() {
    saved = true;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (saved = false), 1500);
  }

  // Re-read rather than trusting what was sent: the core may have normalised
  // the value, and the screen should show what was stored. Whatever the core
  // says is what the controls show — filled in the same step, so the first
  // render already holds it and no pill glides there from a default.
  const { load, act } = makeScreen({
    read: () => api.notebookSettings(),
    apply: (read) => {
      settings = read;
      form = { ...read };
    },
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });

  // A plain call, not an $effect: it reads no reactive value, and an effect
  // here would silently start re-running the day someone reads state inside.
  load();

  /// Sends one key. The core keeps everything it was not told about.
  const put = (patch) => act(() => api.setNotebookSettings(patch), flash);

  /// Sends one Display choice, which answers to THIS MACHINE and not to the
  /// notebook — the same one-key pact as `put`, to a different drawer. It is
  /// why no Display control minds `readOnly`. See docs/historico.md.
  const putDisplay = (patch) => act(() => api.setMachineDisplay(patch), flash);

  /// Records a chord for a command, or clears it with `null`. It goes to the
  /// notebook and comes back through the layout: nothing here holds a copy
  /// of the bindings, so table, keymap and tooltips never disagree.
  const bindShortcut = (id, chord) => act(() => api.setShortcut(id, chord), flash);

  const resetShortcuts = () => act(() => api.resetShortcuts());

  /// "Reset this section": every option on the page goes back to what the
  /// app ships with. Asked first, always — a wrong click here undoes a
  /// page of choices at once.
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

  // ---- the search over every row ----
  //
  // The rows are ~50 and only the open section draws any, so the search
  // indexes them directly and answers "which page is this on?".

  /// Every page the search can look up, in two halves: the switches are
  /// DERIVED from `features.js`; what exists only as markup is written by
  /// each section, beside it (`index()`). A hand-written row that named a
  /// switch would be drift — a test of the architecture refuses one.
  const INDEX = () => [
    ...SETUP.map((entry) => [entry.key, entry.index()]),
    ["native", nativeIndex()],
    ...FUNCTIONS.filter((fn) => hasPage(fn.key) && !fn.inline).map((fn) => [
      `fn:${fn.key}`,
      [
        ...childrenOf(fn.key).map((c) => c.label()),
        ...(FUNCTION_PAGES[fn.key]?.index() ?? []),
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

  /// Opens a page from a search hit, and clears the query — the page is the
  /// answer, and a full field would show results for a page already open.
  function goTo(key) {
    chosen = key;
    query = "";
  }


</script>

{#if settings && form}
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
      <!-- The caret promises a page to go into: every row on the phone; side
           by side only a row not already open — and the group rows, whose
           page is a LIST. -->
      {#if compact || entry.group}
        <Icon name="caret-right" size="1rem" />
      {/if}
    </button>
  </li>
{/snippet}

<!-- Two arrangements of one screen: side by side, the menu hugs its rows and
     the section fills the rest of a 900px column; on the phone the menu IS
     the screen and a row goes into the section. `compact` is the shell's
     measurement, not a second media query. -->
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
      {#if shows("about")}
        <AboutSection {compact} {mobile} {onError} />
      {/if}

      {#if shows("display")}
        <DisplaySection
          bind:form
          {putDisplay}
          {compact}
          {mobile}
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
        <NativeSection
          {features}
          onSet={setFeature}
          onOpen={(key) => (chosen = key)}
          {compact}
          {readOnly}
        />
      {/if}

      {#if section?.startsWith("fn:")}
        {@const fn = section.slice(3)}
        {@const Page = FUNCTION_PAGES[fn]?.page}
        {#if Page}
          <Page
            bind:form
            {put}
            {features}
            onSet={setFeature}
            {compact}
            {readOnly}
            onReset={() => resetSection(fn)}
          />
        {/if}
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
