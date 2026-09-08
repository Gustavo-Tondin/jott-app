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
    { key: "about", icon: "info", label: () => S.sectionAbout, index: aboutIndex },
    { key: "display", icon: "monitor", label: () => S.sectionDisplay, index: displayIndex },
    { key: "dates", icon: "calendar-blank", label: () => S.sectionDates, index: datesIndex },
    { key: "notebook", icon: "notebook", label: () => S.sectionNotebook, index: notebookIndex },
    {
      key: "shortcuts",
      icon: "keyboard",
      label: () => S.sectionShortcuts,
      index: shortcutsIndex,
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

  /// The pages of the functions, by key: the component, and the rows on it
  /// that are NOT one of its switches (the switches the search derives).
  const FUNCTION_PAGES = {
    tasks: { page: TasksPage, index: tasksIndex },
    time: { page: TimePage, index: timeIndex },
    notes: { page: NotesPage, index: notesIndex },
  };

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
  // solely as markup is written out by hand — by each section, beside the
  // markup it names (`index()`). A hand-written row that names a switch would
  // be the drift this guards against — the switch would then have two labels
  // to keep in step — and a test of the architecture refuses one.

  /// Every page the search can look up. The functions' half is DERIVED — the
  /// switches from `features.js`, whatever group each was filed under — so a
  /// switch added there is findable the same day, without a second line here.
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

  /// Opens a page from a search hit, and clears the query — the search asked a
  /// question and the page is the answer; leaving the field full would leave
  /// the menu showing results for a page already open.
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
