<script module>
  import { S } from "../../services/strings.js";

  /// The rows the settings search can find on this page.
  export const index = () => [
    S.mode,
    S.theme,
    S.accentColor,
    S.headingColor,
    S.interfaceZoom,
    S.noteFontSizeLabel,
    S.hyphenateNotesLabel,
    S.cardHeightLabel,
    S.noteLayout,
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
  ];
</script>

<script>
  // Display: how the app looks on THIS MACHINE. Every choice here goes to
  // the machine's drawer (`putDisplay`), which is why none of the controls
  // mind `readOnly` — a notebook open for reading still does not get to
  // decide what this screen looks like.
  import { segmented } from "../../actions/segmented.js";
  import { api } from "../../services/api.js";
  import { askName } from "../../services/dialog.js";
  import { DEFAULT_ACCENT } from "../../services/accent.js";
  import { FONT_ROLES, fontOptions, fontValue } from "../../services/fonts.js";
  import {
    MODES,
    DEFAULT_MODE,
    HEADING_COLORS,
    DEFAULT_HEADING_COLOR,
    NOTE_FONT_SIZES,
    DEFAULT_NOTE_FONT_SIZE,
    CARD_LINES,
    cardLines,
  } from "../../services/themes.js";
  import {
    FORMAT_BAR_MODES,
    DEFAULT_FORMAT_BAR,
    FORMAT_BAR_SIDES,
    DEFAULT_FORMAT_BAR_SIDE,
  } from "../../services/formatBar.js";
  import AccentPicker from "../../components/AccentPicker.svelte";
  import { ZOOM_STEPS } from "../../shell/zoom.js";
  import HelpTip from "./HelpTip.svelte";
  import SettingsSection from "./SettingsSection.svelte";

  let {
    /// What the controls are bound to — the screen's, shared with every page.
    form = $bindable(),
    /// Sends one Display choice to this machine's drawer.
    putDisplay,
    compact = false,
    /// Android (shell/platform.js): no file manager to open a theme in.
    mobile = false,
    readOnly = false,
    /// The interface's own zoom (a `font-size` on the root, the shell's): this
    /// screen asks rather than writes.
    zoom = 1,
    onZoom,
    /// The themes the notebook carries (`.jott/themes/`), read by the shell.
    /// Empty: the block is absent rather than an empty list.
    userThemes = [],
    /// Which of them is actually in the document — a chosen theme that is
    /// not this one failed to load, and the row says so.
    wornTheme = null,
    /// How many remote references were neutralised in it.
    blockedInTheme = 0,
    /// Writes a new theme seeded with the look in use (App.svelte → newThemeFrom).
    onNewTheme,
    onReset,
    onError,
  } = $props();

  // Slash-only, and month-first is the default.
  const DATE_SHAPES = ["mm/dd/yyyy", "dd/mm/yyyy", "yyyy/mm/dd"];

  /// What this machine has installed, asked when the page opens. Empty off
  /// Linux — the pickers then offer the app's faces plus the generics, so
  /// an empty list is not an error state.
  let installedFonts = $state([]);
  api
    .systemFonts()
    .then((names) => (installedFonts = names ?? []))
    .catch(() => (installedFonts = []));

  /// And the family the desktop draws itself in, so the "system-ui" row
  /// PREVIEWS what it will actually give (services/fonts.js).
  let systemUiFont = $state("");
  api
    .systemUiFont()
    .then((name) => (systemUiFont = name ?? ""))
    .catch(() => (systemUiFont = ""));

  /// The three rows of the Display page: a role of `services/fonts.js` plus
  /// what this screen calls it. A fourth face would be one line here.
  const FONT_ROWS = () => [
    {
      role: "interface",
      key: "interfaceFont",
      label: S.interfaceFontLabel,
      fallback: S.fontDefault(FONT_ROLES.interface.shipped),
    },
    {
      role: "note",
      key: "noteFont",
      label: S.noteFontLabel,
      // Not a face's name: the note's default IS the interface's answer,
      // whatever that turned out to be.
      fallback: S.fontDefaultNote,
    },
    {
      role: "mono",
      key: "monoFont",
      label: S.monoFontLabel,
      fallback: S.fontDefault(FONT_ROLES.mono.shipped),
    },
  ];

  /// Makes a theme out of the look on screen, puts it on at once — a theme
  /// written and not worn is a file nobody can tell took — and opens its
  /// folder, where the editing happens. The name is asked for: it is the
  /// folder, the attribute value and the option's label.
  async function makeTheme() {
    const name = await askName();
    if (!name) return;
    try {
      const made = await onNewTheme(name);
      putDisplay({ theme: made.name });
      await api.openInFileManager(`.jott/themes/${made.name}/theme.css`);
    } catch (e) {
      onError?.(e);
    }
  }

  /// The option that is a door, not a theme.
  // A slash: no theme folder can be called this (relpath::is_safe_leaf).
  const NEW_THEME = "/new";

  /// What a theme says about itself, on its option: the label, then author
  /// and version when the manifest has them.
  const themeOption = (theme) =>
    [theme.label, theme.author && S.themeBy(theme.author), theme.version]
      .filter(Boolean)
      .join(" · ");

  function pickTheme(event) {
    const value = event.currentTarget.value;
    if (value === NEW_THEME) {
      // The door is not a choice: the box goes back to what is worn.
      event.currentTarget.value = form.theme || "";
      makeTheme();
      return;
    }
    putDisplay({ theme: value });
  }

  /// The theme the box names, when the notebook carries it.
  let chosenTheme = $derived(userThemes.find((t) => t.name === form.theme) ?? null);

  // The zoom is applied when the drag ENDS, never during it: every measure
  // is `rem`, so applying it mid-drag moves this very slider under the
  // finger and it fights back (docs/platform-gotchas.md). The drag moves a
  // local index; `change` is what asks the shell.
  let dragged = $state(null);
  let zoomStep = $derived(dragged ?? Math.max(0, ZOOM_STEPS.indexOf(zoom)));

  function settleZoom(step) {
    dragged = null;
    onZoom?.(ZOOM_STEPS[step]);
  }

  // The card's ceiling, in lines. The number follows the finger; the choice
  // is SENT when the drag ends — a bridge call per pixel would be a write
  // per pixel. Nothing on this screen redraws with it, so nothing fights back.
  let linesDrag = $state(null);
  let lines = $derived(linesDrag ?? cardLines(form.cardLines));

  function settleLines(next) {
    linesDrag = null;
    putDisplay({ cardLines: next });
  }
</script>

<!-- A row whose control is a segmented group: one button per option, the
     current one pressed; `options` carry `key`, `label()` and maybe `hint()`.
     Not a <label>: it would claim the first button for its own click.
     Below 768px three or more segments no longer fit beside their label, so
     the row wears a <select> instead — the same choice, one control wide. -->
{#snippet segmentedRow(label, options, current, apply, help = null)}
  <div class="settings__row">
    <span class="settings__label">
      {label}
      {#if help}<HelpTip {label} text={help} />{/if}
    </span>
    {#if compact && options.length > 2}
      <select
        class="theme-select"
        value={current}
        aria-label={label}
        onchange={(e) => apply(e.currentTarget.value)}
      >
        {#each options as option (option.key)}
          <option value={option.key}>{option.label()}</option>
        {/each}
      </select>
    {:else}
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
    {/if}
  </div>
{/snippet}

<!-- A font row: the app's own answer, the generic families, and what the
     machine has installed; the empty value means "the app's own". Each
     option previews itself — a <select>'s closed box draws in the control's
     own font on every engine, so only the option can. -->
{#snippet fontRow(row)}
  {@const options = fontOptions(row.role, installedFonts, {
    default: row.fallback,
    generic: S.fontGeneric,
    installed: S.fontInstalled,
  })}
  <label class="settings__row">
    <span class="settings__label">{row.label}</span>
    <select
      class="theme-select settings__font"
      bind:value={form[row.key]}
      aria-label={row.label}
      onchange={(e) => putDisplay({ [row.key]: e.currentTarget.value })}
    >
      {#each options as option (option.value)}
        <!-- The value the choice would write on the root, so the row previews
             it — the fallback included. `fontValue` keeps a generic family
             unquoted: `font-family: "serif"` names a font nobody has. -->
        <option value={option.value} style={fontValue(row.role, option.value, systemUiFont)
            ? `font-family: ${fontValue(row.role, option.value, systemUiFont)}`
            : null}>{option.label}</option
        >
      {/each}
    </select>
  </label>
{/snippet}

<SettingsSection title={S.sectionDisplay} help={S.sectionDisplayHint} {compact} {onReset}>

  <h3 class="settings__subtitle">{S.subColours}</h3>

  <!-- The MODE leads: it decides the ground everything else is drawn on. A
       segmented group — three looks you want to see side by side. The THEME
       (the palette) is the row below; the two are independent. -->
  {@render segmentedRow(S.mode, MODES, form.mode || DEFAULT_MODE, (key) =>
    putDisplay({ mode: key }),
  )}

  <!-- The THEME — the palette: the app's own (`.jott/themes/jott.css` in
       every notebook), the ones the reader brought in, and the door to a
       new one — which copies the look on screen and opens its folder, so it
       is only offered where there is a file manager to open. -->
  <label class="settings__row">
    <span class="settings__label">
      {S.theme}
      <HelpTip label={S.theme} text={S.themesFromNotebookHint} />
    </span>
    <select
      class="theme-select"
      value={form.theme || ""}
      aria-label={S.theme}
      onchange={pickTheme}
    >
      <option value="">{S.themeJott} · {S.themeJottMeta}</option>
      {#each userThemes as theme (theme.name)}
        <option value={theme.name}>{themeOption(theme)}</option>
      {/each}
      {#if onNewTheme && !readOnly && !mobile}
        <option value={NEW_THEME}>{S.newThemeAction}…</option>
      {/if}
    </select>
  </label>
  <!-- Said under the row, and only while it matters: a warning about a
       theme nobody is wearing is noise. -->
  {#if chosenTheme && !chosenTheme.supported}
    <p class="settings__hint">{S.themeNeedsNewerApp(chosenTheme.minAppVersion)}</p>
  {/if}
  {#if chosenTheme && wornTheme !== chosenTheme.name}
    <p class="settings__hint">{S.themeUnreadable}</p>
  {:else if chosenTheme && blockedInTheme > 0}
    <p class="settings__hint">{S.themeBlockedRefs(blockedInTheme)}</p>
  {/if}

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

  <!-- A setting and not a theme: a note titled in its space's colour is the
       app's face, and a reader who wants a document turns it off. -->
  {@render segmentedRow(
    S.headingColor,
    HEADING_COLORS,
    form.headingColor || DEFAULT_HEADING_COLOR,
    (key) => putDisplay({ headingColor: key }),
  )}

  <h3 class="settings__subtitle">{S.subText}</h3>

  <!-- The interface's own size, for whoever never learned Ctrl +/-. The
       shell owns the value, so this asks it to change. -->
  <div class="settings__row">
    <span class="settings__label">
      {S.interfaceZoom}
      <HelpTip label={S.interfaceZoom} text={S.interfaceZoomHint} />
    </span>
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

  <!-- How big a note reads: this machine's, like everything here — a phone
       and a monitor do not agree, and the notebook is the same notebook. -->
  {@render segmentedRow(
    S.noteFontSizeLabel,
    NOTE_FONT_SIZES,
    form.noteFontSize || DEFAULT_NOTE_FONT_SIZE,
    (key) => putDisplay({ noteFontSize: key }),
  )}

  <!-- Hyphenation is DRAWN and never written: the engine breaks the word at
       the end of the line, the .md file keeps it whole. This machine's, like
       the size above — a phone's column asks for it, a monitor does not. -->
  <label class="settings__row">
    <span class="settings__label">
      {S.hyphenateNotesLabel}
      <HelpTip label={S.hyphenateNotesLabel} text={S.hyphenateNotesHint} />
    </span>
    <input
      class="theme-checkbox"
      type="checkbox"
      bind:checked={form.hyphenateNotes}
      aria-label={S.hyphenateNotesLabel}
      onchange={(e) => putDisplay({ hyphenateNotes: e.currentTarget.checked })}
    />
  </label>

  <!-- The three faces. Display, like the size above: which fonts exist is a
       fact about THIS machine, and a notebook carried elsewhere must not
       arrive naming a font that is not there. -->
  {#each FONT_ROWS() as row (row.key)}
    {@render fontRow(row)}
  {/each}
  {#if installedFonts.length === 0}
    <p class="settings__hint">{S.fontsNotListed}</p>
  {/if}

  <h3 class="settings__subtitle">{S.subEditor}</h3>

  <!-- The bar that floats over an open note. Display, because where a bar
       sits over a document is a fact about this screen. Not hidden on a
       phone: a row that vanishes below 768px is one the search finds and
       cannot show — the hint says so, and a phone answers for itself. -->
  {@render segmentedRow(
    S.formatBarLabel,
    FORMAT_BAR_MODES.filter((mode) => !(mobile && mode.desktopOnly)),
    form.formatBar || DEFAULT_FORMAT_BAR,
    (key) => putDisplay({ formatBar: key }),
    S.formatBarHint,
  )}

  <!-- Four sides, the bar centred on the one it is given — an edge, not a
       corner. Off is the one state with no answer to give. -->
  {@render segmentedRow(
    S.formatBarSideLabel,
    FORMAT_BAR_SIDES,
    form.formatBarSide || DEFAULT_FORMAT_BAR_SIDE,
    (key) => putDisplay({ formatBarSide: key }),
  )}

  <h3 class="settings__subtitle">{S.subInterface}</h3>

  <!-- How tall a card on the notes board may grow. Display, because it
       answers to a SCREEN: what is a wall of cards on a monitor is one
       column on a phone. What it moves is the number of preview lines, so a
       card never ends mid-line (styles/components/note-preview.css). -->
  <div class="settings__row">
    <span class="settings__label">
      {S.cardHeightLabel}
      <HelpTip label={S.cardHeightLabel} text={S.cardHeightHint} />
    </span>
    <div class="settings__zoom">
      <input
        class="theme-range"
        type="range"
        min={CARD_LINES.min}
        max={CARD_LINES.max}
        step="1"
        value={lines}
        aria-label={S.cardHeightLabel}
        oninput={(e) => (linesDrag = Number(e.currentTarget.value))}
        onchange={(e) => settleLines(Number(e.currentTarget.value))}
        onpointercancel={() => (linesDrag = null)}
      />
      <span class="settings__zoom-value">{S.cardLinesValue(lines)}</span>
    </div>
  </div>

  <!-- How a notes space arranges its board until it chooses for itself. Here
       and not on the Notes page: what a board looks like is a fact about this
       SCREEN, and a space's own choice (its ⋮ → Layout) still wins. -->
  <label class="settings__row">
    <span class="settings__label">
      {S.noteLayout}
      <HelpTip label={S.noteLayout} text={S.noteLayoutHint} />
    </span>
    <select
      class="theme-select"
      value={form.noteLayout === "tree" ? "tree" : ""}
      aria-label={S.noteLayout}
      onchange={(e) => putDisplay({ noteLayout: e.currentTarget.value })}
    >
      <option value="">{S.gridView}</option>
      <option value="tree">{S.treeView}</option>
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
    <span class="settings__label">
      {S.autoSpaceColors}
      <HelpTip label={S.autoSpaceColors} text={S.autoSpaceColorsHint} />
    </span>
    <input
      class="theme-checkbox"
      type="checkbox"
      bind:checked={form.autoSpaceColors}
      aria-label={S.autoSpaceColors}
      onchange={(e) => putDisplay({ autoSpaceColors: e.currentTarget.checked })}
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

  <!-- Desktop only: on a phone the task panel is a sheet, and tapping
       beside it is how a sheet closes. -->
  {#if !mobile}
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
  {/if}

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
</SettingsSection>
