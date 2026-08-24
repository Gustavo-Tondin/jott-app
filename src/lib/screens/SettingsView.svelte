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
  import { segmented } from "../actions/segmented.js";
  import { api } from "../services/api.js";
  import { makeScreen } from "../services/act.js";
  import { S } from "../services/strings.js";
  import {
    FUNCTIONS,
    childrenIn,
    childrenOf,
    hasPage,
    on,
    stored,
  } from "../services/features.js";
  import { DEFAULT_ACCENT } from "../services/accent.js";
  import { TYPE_ICONS } from "../services/spaceIcon.js";
  import { openExternal, ISSUES_URL } from "../services/external.js";
  import {
    THEMES,
    DEFAULT_THEME,
    HEADING_COLORS,
    DEFAULT_HEADING_COLOR,
    NOTE_FONT_SIZES,
    DEFAULT_NOTE_FONT_SIZE,
  } from "../services/themes.js";
  import {
    FORMAT_BAR_MODES,
    DEFAULT_FORMAT_BAR,
    FORMAT_BAR_SIDES,
    DEFAULT_FORMAT_BAR_SIDE,
  } from "../services/formatBar.js";
  import AccentPicker from "../components/AccentPicker.svelte";
  import Icon from "../components/Icon.svelte";
  import ShortcutRow from "../components/ShortcutRow.svelte";
  import { onBack } from "../services/back.js";
  import { SCOPES, commandsIn } from "../services/commands.js";
  import { bound } from "../services/shortcuts.js";
  import { ZOOM_STEPS } from "../shell/zoom.js";
  import { installUpdate, manualCheck, openReleasePage } from "../services/update.js";
  import { addToMenu, removeFromMenu } from "../services/desktopEntry.js";

  let {
    notebook,
    folders = [],
    notesInbox = "Inbox",
    /// The narrow shape (shell/compact.js). Not a width this screen measures:
    /// the shell measures once and tells everyone, the way the header and the
    /// top bar agree about which of them holds the arrows.
    compact = false,
    /// The interface's own zoom, and the way to change it. It belongs to the
    /// shell (it is a `font-size` on the root, applied there), so this screen
    /// asks rather than writes — the same handshake the notebook picker has.
    zoom = 1,
    onZoom,
    /// Opens the notebook picker. It is the shell's flow — the same one the
    /// sidebar's foot has always had; this is its second door (2026-08-20).
    onSwitchNotebook,
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
    FUNCTIONS.filter((fn) => hasPage(fn.key) && on(features, fn.key)).map((fn) => ({
      key: `fn:${fn.key}`,
      feature: fn.key,
      icon: TYPE_ICONS[fn.key] ?? "sliders-horizontal",
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
    ["about", [S.updateVersion, S.updateAutoCheck, S.updateCheckNow, S.yourFiles,
      S.menuEntryLabel, S.reportIssue]],
    [
      "display",
      [
        S.theme,
        S.accentColor,
        S.headingColor,
        S.interfaceZoom,
        S.noteFontSizeLabel,
        S.formatBarLabel,
        S.formatBarSideLabel,
        S.showListCounts,
        S.restoreLastScreen,
        S.closeOnClickAway,
        S.dateFormat,
      ],
    ],
    [
      "dates",
      [
        S.rolloverDaily,
        S.rolloverWeekly,
        S.rolloverMode,
        S.weekStartsOn,
        S.datedTasksJoinPeriod,
        // The page's OTHER name. It is titled "Date preferences" and the
        // strategy doc calls the same thing "Day and week", so both find it.
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
    tasks: [S.autoUrgentByDate, S.newTasksGoTo],
    notes: [S.noteLayout, S.confirmImageDownloads],
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

  /// Loose enough to find "atalho" written as "Atalhos" and "Día" as "dia":
  /// the app is read by people who type in a hurry, and a search that only
  /// answers to exact case is a search that looks broken.
  const plain = (text) =>
    String(text ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

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

  // ---- the shortcuts table's own filter (2026-08-20) ----
  // ~50 commands in three scopes is the longest page here, and the table is
  // read by someone hunting for one line of it.
  let chordQuery = $state("");
  const matching = (scope) => {
    const needle = plain(chordQuery.trim());
    const all = commandsIn(scope);
    return needle ? all.filter((c) => plain(c.label()).includes(needle)) : all;
  };

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

  /// The menu entry, on the installs that have one to write. `supported`
  /// false — a packaged Jott, Windows, Android — hides the row entirely
  /// rather than showing a switch that would refuse: the package manager
  /// already put this app in the menu.
  let menuEntry = $state({ supported: false, installed: false });
  let menuBusy = $state(false);

  api
    .desktopEntryState()
    .then((state) => (menuEntry = state ?? menuEntry))
    .catch(() => {});

  async function setMenuEntry(on) {
    menuBusy = true;
    try {
      await (on ? addToMenu() : removeFromMenu());
      menuEntry = { ...menuEntry, installed: on };
    } catch (e) {
      onError?.(e);
    } finally {
      menuBusy = false;
    }
  }

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

  // ---- the interface zoom (2026-08-20) ----
  //
  // **The zoom is applied when the drag ENDS, never during it**, and that is
  // not a nicety: every measure in the app is `rem`, so changing the zoom
  // resizes and MOVES this very slider under the finger. The pointer then sits
  // over a different step, which fires another change, which moves it again —
  // the control fought back while it was being dragged (user report,
  // 2026-08-20).
  //
  // So the drag moves a local index and nothing else; `change` — which is
  // exactly "the user settled on a value", on the mouse and on the keyboard —
  // is what asks the shell for it.
  let dragged = $state(null);
  let zoomStep = $derived(dragged ?? Math.max(0, ZOOM_STEPS.indexOf(zoom)));

  function settleZoom(step) {
    dragged = null;
    onZoom?.(ZOOM_STEPS[step]);
  }

  /// The `.jott` folder, where the notebook documents its own format. The
  /// command opens the FOLDER around an address, so naming the file is how
  /// you ask for the folder that holds it (`commands::folder_to_open`).
  const openFormatDoc = () =>
    api.openInFileManager(".jott/_FORMAT.txt").catch(onError);
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

<!-- A row whose control is a segmented group: one button per option, the
     current one pressed. `options` carry `key`, `label()` and, when there is
     something to say on hover, `hint()`. Not a <label>: a label wrapping a
     group of buttons would claim the first one for its own click. -->
{#snippet segmentedRow(label, options, current, apply)}
  <div class="settings__row">
    <span class="settings__label">{label}</span>
    <div class="theme-segmented" role="group" aria-label={label} use:segmented>
      {#each options as option (option.key)}
        <button
          type="button"
          class="theme-segmented__item"
          class:theme-segmented__item--active={current === option.key}
          aria-pressed={current === option.key}
          title={option.hint?.()}
          onclick={() => apply(option.key)}>{option.label()}</button
        >
      {/each}
    </div>
  </div>
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
      <div class="settings__search">
        <Icon name="magnifying-glass" size="1rem" />
        <input
          class="settings__search-field"
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
        <section class="settings__section">
          {@render sectionTitle(S.sectionAbout)}

          <h3 class="settings__subtitle">{S.subVersion}</h3>

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

          <h3 class="settings__subtitle">{S.subThisApp}</h3>

          <!-- Principle 4 said out loud: every notebook documents its own
               format in plain text, and until now the app never pointed at the
               file that does it. -->
          <div class="settings__row">
            <span class="settings__label">{S.yourFiles}</span>
            <button
              type="button"
              class="theme-btn theme-btn--outline theme-btn--xs"
              onclick={openFormatDoc}>{S.yourFilesAction}</button
            >
          </div>
          <p class="settings__hint">{S.yourFilesHint}</p>

          <!-- Only an AppImage sees this. A single file installs nothing, so
               the desktop has no entry and no icon to find it by; a
               deb/rpm/pacman Jott was put in the menu at install time and
               must not get a second one. Reversible because it writes two
               files outside the notebook. -->
          {#if menuEntry.supported}
            <label class="settings__row">
              <span class="settings__label">{S.menuEntryLabel}</span>
              <input
                class="theme-switch"
                type="checkbox"
                checked={menuEntry.installed}
                disabled={menuBusy}
                aria-label={S.menuEntryLabel}
                onchange={(e) => setMenuEntry(e.currentTarget.checked)}
              />
            </label>
            <p class="settings__hint">{S.menuEntryHint}</p>
          {/if}

          <div class="settings__row">
            <span class="settings__label">{S.reportIssue}</span>
            <button
              type="button"
              class="theme-btn theme-btn--outline theme-btn--xs"
              onclick={() => openExternal(ISSUES_URL).catch(onError)}
              >{S.reportIssueAction}</button
            >
          </div>
        </section>
      {/if}

      {#if shows("display")}
        <section class="settings__section">
          {@render sectionTitle(S.sectionDisplay)}
          <p class="settings__hint">{S.sectionDisplayHint}</p>

          <h3 class="settings__subtitle">{S.theme}</h3>

          <!-- The theme leads the section: it decides the ground everything else is
               drawn on, including which half of the accent shows. A segmented group
               rather than a select — there are three, and each is a look you want to
               see the name of side by side. -->
          {@render segmentedRow(S.theme, THEMES, form.theme || DEFAULT_THEME, (key) =>
            putDisplay({ theme: key }),
          )}

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
          {@render segmentedRow(
            S.headingColor,
            HEADING_COLORS,
            form.headingColor || DEFAULT_HEADING_COLOR,
            (key) => putDisplay({ headingColor: key }),
          )}

          <h3 class="settings__subtitle">{S.subText}</h3>

          <!-- The interface's own size. It was only ever on the keyboard
               (Ctrl +/-), which is no answer at all on a phone or for someone
               who never learned the chord. The shell owns the value — it is a
               `font-size` on the root — so this asks it to change. -->
          <div class="settings__row">
            <span class="settings__label">{S.interfaceZoom}</span>
            <div class="settings__zoom">
              <input
                class="theme-range"
                type="range"
                min="0"
                max={ZOOM_STEPS.length - 1}
                step="1"
                value={zoomStep}
                aria-label={S.interfaceZoom}
                oninput={(e) => (dragged = Number(e.currentTarget.value))}
                onchange={(e) => settleZoom(Number(e.currentTarget.value))}
                onpointercancel={() => (dragged = null)}
              />
              <!-- What it WILL be, while it is being dragged: the interface
                   itself has not moved yet, so the number is the only thing
                   answering the finger. -->
              <span class="settings__zoom-value"
                >{Math.round(ZOOM_STEPS[zoomStep] * 100)}%</span
              >
            </div>
          </div>
          <p class="settings__hint">{S.interfaceZoomHint}</p>

          <!-- How big a note reads. This machine's, like everything in this
               section: a phone held at arm's length and a monitor at a desk do
               not agree about it, and the notebook is the same notebook. -->
          {@render segmentedRow(
            S.noteFontSizeLabel,
            NOTE_FONT_SIZES,
            form.noteFontSize || DEFAULT_NOTE_FONT_SIZE,
            (key) => putDisplay({ noteFontSize: key }),
          )}
          <p class="settings__hint">{S.noteFontSizeHint}</p>

          <h3 class="settings__subtitle">{S.subEditor}</h3>

          <!-- The bar that floats over an open note (2026-08-21). Display,
               because where a bar sits over a document is a fact about this
               screen: a wide monitor has room for it against an edge and a
               laptop may want it gone.

               It is NOT hidden on a phone, even though the floating bar is a
               desktop thing. The hint says so instead — a row that vanishes
               below 768px is a row the search finds and then cannot show,
               and this section is per-machine anyway, so a phone simply
               answers for itself. -->
          {@render segmentedRow(
            S.formatBarLabel,
            FORMAT_BAR_MODES,
            form.formatBar || DEFAULT_FORMAT_BAR,
            (key) => putDisplay({ formatBar: key }),
          )}
          <p class="settings__hint">{S.formatBarHint}</p>

          <!-- Four sides, and the bar is always centred on the one it is
               given — so this asks for an edge, not a corner. Off is the one
               state where the question has no answer to give. -->
          {@render segmentedRow(
            S.formatBarSideLabel,
            FORMAT_BAR_SIDES,
            form.formatBarSide || DEFAULT_FORMAT_BAR_SIDE,
            (key) => putDisplay({ formatBarSide: key }),
          )}
          <p class="settings__hint">{S.formatBarSideHint}</p>

          <h3 class="settings__subtitle">{S.subInterface}</h3>

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
        </section>
      {/if}

      {#if shows("dates")}
        <section class="settings__section">
          {@render sectionTitle(S.sectionDates)}

          <h3 class="settings__subtitle">{S.today}</h3>

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

          <h3 class="settings__subtitle">{S.week}</h3>

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

          <!-- Where the OTHER half of the subject lives. This section decides
               what a date DOES; how one is written answers to the device, so
               it sits in Display and this says so out loud rather than leaving
               someone to hunt (2026-08-20). -->
          <p class="settings__hint">{S.dateFormatElsewhere}</p>
        </section>
      {/if}

      {#if shows("shortcuts")}
        <section class="settings__section">
          {@render sectionTitle(S.sectionShortcuts)}
          <p class="settings__hint">{S.sectionShortcutsHint}</p>

          <div class="settings__search settings__search--inline">
            <Icon name="magnifying-glass" size="1rem" />
            <input
              class="settings__search-field"
              type="search"
              bind:value={chordQuery}
              placeholder={S.shortcutFilter}
              aria-label={S.shortcutFilter}
            />
          </div>

          <!-- Grouped by SCOPE, because a scope is what decides whether two commands
               may share a chord: two that can never both answer (a task list and a
               text cursor are not focused at once) legitimately can. The groups are
               named for what the user is doing, not for the word the code uses. -->
          {#each SCOPES as scope (scope)}
            {@const rows = matching(scope)}
            {#if rows.length > 0}
              <h3 class="settings__subtitle">{S.shortcutScope(scope)}</h3>
              {#each rows as command (command.id)}
                <ShortcutRow
                  {command}
                  chord={$bound.get(command.id) ?? null}
                  bound={$bound}
                  disabled={readOnly}
                  onBind={(chord) => bindShortcut(command.id, chord)}
                />
              {/each}
            {/if}
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
          {/each}
          <p class="settings__hint">{S.autoUrgentByDateHint}</p>
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
        </section>
      {/if}

      {#if shows("notebook")}
        <section class="settings__section">
          {@render sectionTitle(S.sectionNotebook)}

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

          <!-- The second door to the picker. The first is the notebook's name
               at the foot of the sidebar, which nobody guesses is a button
               (2026-08-20) — and with the sidebar closed on a phone there was
               no door at all. -->
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

          <!-- Where a quick note lands names a folder of THIS notebook, so it
               could not follow Display onto the machine (2026-08-20): machine
               preferences are one file for every notebook the app opens, and
               a folder name from one would be nonsense in the next.

               Every folder it can name lives in the fixed Notes space, so
               with that space hidden the row goes too (2026-08-24): a choice
               between places with no door is not a choice. -->
          {#if on(features, "notesSpace")}
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
          <p class="settings__hint">{S.quickNoteFolderHint}</p>
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
        </section>
      {/if}
    </div>
  {/if}

  {#if saved}<p class="settings__saved">{S.settingsSaved}</p>{/if}
</div>
{/if}
