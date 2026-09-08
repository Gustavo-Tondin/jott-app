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
  } from "../../services/themes.js";
  import {
    FORMAT_BAR_MODES,
    DEFAULT_FORMAT_BAR,
    FORMAT_BAR_SIDES,
    DEFAULT_FORMAT_BAR_SIDE,
  } from "../../services/formatBar.js";
  import AccentPicker from "../../components/AccentPicker.svelte";
  import { ZOOM_STEPS } from "../../shell/zoom.js";
  import SettingsSection from "./SettingsSection.svelte";

  let {
    /// What the controls are bound to — the screen's, shared with every page.
    form = $bindable(),
    /// Sends one Display choice to this machine's drawer.
    putDisplay,
    compact = false,
    readOnly = false,
    /// The interface's own zoom, and the way to change it. It belongs to the
    /// shell (it is a `font-size` on the root, applied there), so this screen
    /// asks rather than writes — the same handshake the notebook picker has.
    zoom = 1,
    onZoom,
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
    onReset,
    onError,
  } = $props();

  // Slash-only, and month-first is the default (user call, 2026-08-06).
  const DATE_SHAPES = ["mm/dd/yyyy", "dd/mm/yyyy", "yyyy/mm/dd"];

  /// What this machine has installed (2026-08-24). Asked when the page
  /// opens: a font library does not change while the app is up, and the
  /// answer walks the machine's font directories. Empty off Linux, and the
  /// pickers then offer the app's own faces plus the generic families —
  /// which is why the list being empty is not an error state.
  let installedFonts = $state([]);
  api
    .systemFonts()
    .then((names) => (installedFonts = names ?? []))
    .catch(() => (installedFonts = []));

  /// The three rows of the Display page, in the order they are drawn. Each
  /// is a role of `services/fonts.js` plus what this screen calls it — the
  /// row itself is one snippet, so a fourth face would be one line here.
  const FONT_ROWS = () => [
    {
      role: "interface",
      key: "interfaceFont",
      label: S.interfaceFontLabel,
      hint: S.interfaceFontHint,
      fallback: S.fontDefault(FONT_ROLES.interface.shipped),
    },
    {
      role: "note",
      key: "noteFont",
      label: S.noteFontLabel,
      hint: S.noteFontHint,
      // Not a face's name: the note's default IS the interface's answer,
      // whatever that turned out to be.
      fallback: S.fontDefaultNote,
    },
    {
      role: "mono",
      key: "monoFont",
      label: S.monoFontLabel,
      hint: S.monoFontHint,
      fallback: S.fontDefault(FONT_ROLES.mono.shipped),
    },
  ];

  /// Makes a theme out of the look on screen, and puts it on.
  ///
  /// Wearing it immediately is the point: a theme written and not worn is a
  /// file, and the reader has no way to tell whether it took. The name is
  /// asked for rather than generated because it is the folder name, the
  /// attribute value and what the list will show — three things at once.
  async function makeTheme() {
    const name = await askName();
    if (!name) return;
    try {
      const made = await onNewTheme(name);
      putDisplay({ theme: made.name });
    } catch (e) {
      onError?.(e);
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
</script>

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

<!-- A font row: the label, and a select holding the app's own answer, the
     generic families, and what the machine has installed. The value is a
     family NAME and the empty one means "the app's own" — the same pact every
     Display key keeps, where absent is the default rather than a value.

     Each option previews itself, which is the whole reason a font picker is
     not a plain list of words: the name of a face says much less than the
     face does. Only the option can do it — a <select>'s closed box draws in
     the control's own font on every engine. -->
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
        <!-- The same value the choice would write on the root, so the row
             previews what picking it does — including the fallback, which is
             what a font the machine lost would show. `fontValue` is also
             what keeps a generic family unquoted: `font-family: "serif"`
             names a font nobody has. -->
        <option value={option.value} style={fontValue(row.role, option.value)
            ? `font-family: ${fontValue(row.role, option.value)}`
            : null}>{option.label}</option
        >
      {/each}
    </select>
  </label>
  <p class="settings__hint">{row.hint}</p>
{/snippet}

<SettingsSection title={S.sectionDisplay} {compact} {onReset}>
  <p class="settings__hint">{S.sectionDisplayHint}</p>

  <h3 class="settings__subtitle">{S.mode}</h3>

  <!-- The MODE leads the section: it decides the ground everything else
       is drawn on, including which half of the accent shows. A segmented
       group rather than a select — there are three, and each is a look
       you want to see the name of side by side. The THEME (the palette)
       is the block below, and the two are independent (2026-08-26). -->
  {@render segmentedRow(S.mode, MODES, form.mode || DEFAULT_MODE, (key) =>
    putDisplay({ mode: key }),
  )}

  <!-- The THEME — the palette (2026-08-26): the app's own, which every
       notebook carries as an editable `.jott/themes/jott.css`, and the
       ones the reader brought in (2026-08-25). A block, not more
       segments: these have authors and versions to show, there can be
       any number of them, and none of that fits in a segment. The
       mode above and the theme here are two questions — wearing a
       theme leaves the mode where it was. -->
  <h3 class="settings__subtitle">{S.theme}</h3>
  <div class="settings__themes">
    <button
      type="button"
      class="theme-row settings__theme"
      aria-pressed={!form.theme}
      onclick={() => putDisplay({ theme: "" })}
    >
      <span class="settings__theme-name">{S.themeJott}</span>
      <span class="settings__theme-meta">{S.themeJottMeta}</span>
    </button>
    {#if !form.theme}
      <p class="settings__hint">{S.themeJottHint}</p>
    {/if}
    {#each userThemes as theme (theme.name)}
      {@const active = form.theme === theme.name}
      <button
        type="button"
        class="theme-row settings__theme"
        aria-pressed={active}
        onclick={() => putDisplay({ theme: theme.name })}
      >
        <span class="settings__theme-name">{theme.label}</span>
        <span class="settings__theme-meta">
          {#if theme.author}{S.themeBy(theme.author)}{/if}
          {#if theme.version}<span class="settings__theme-version"
              >{theme.version}</span
            >{/if}
        </span>
      </button>
      <!-- Said on the row it is about, and only while it matters:
           a warning about a theme nobody is wearing is noise. -->
      {#if !theme.supported}
        <p class="settings__hint">{S.themeNeedsNewerApp(theme.minAppVersion)}</p>
      {/if}
      {#if active && wornTheme !== theme.name}
        <p class="settings__hint">{S.themeUnreadable}</p>
      {:else if active && blockedInTheme > 0}
        <p class="settings__hint">{S.themeBlockedRefs(blockedInTheme)}</p>
      {/if}
    {/each}
  </div>
  <p class="settings__hint">{S.themesFromNotebookHint}</p>

  <!-- …and the door for someone who has none and does not want to
       start from an empty file. What it writes is the look on screen
       right now, which is also how a theme is duplicated. -->
  {#if onNewTheme && !readOnly}
    <div class="settings__row">
      <button type="button" class="theme-btn" onclick={makeTheme}
        >{S.newThemeAction}</button
      >
    </div>
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

  <!-- The three faces (2026-08-24). Display, like the size above it:
       which fonts exist is a fact about THIS machine, and a notebook
       carried to another one must not arrive naming a font that is
       not there. -->
  {#each FONT_ROWS() as row (row.key)}
    {@render fontRow(row)}
  {/each}
  {#if installedFonts.length === 0}
    <p class="settings__hint">{S.fontsNotListed}</p>
  {/if}

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
    <span class="settings__label">{S.autoSpaceColors}</span>
    <input
      class="theme-checkbox"
      type="checkbox"
      bind:checked={form.autoSpaceColors}
      aria-label={S.autoSpaceColors}
      onchange={(e) => putDisplay({ autoSpaceColors: e.currentTarget.checked })}
    />
  </label>
  <p class="settings__hint">{S.autoSpaceColorsHint}</p>

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
</SettingsSection>
