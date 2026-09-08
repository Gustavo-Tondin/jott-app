<script module>
  import { S } from "../../services/strings.js";

  /// The rows on this page that are NOT one of its switches.
  export const index = () => [S.noteLayout, S.tableLayout, S.confirmImageDownloads];
</script>

<script>
  // The Notes function's page: what a note has, and the notebook's defaults
  // for the board, the tables and the one download prompt.
  import { childrenIn, on } from "../../services/features.js";
  import FeatureRow from "./FeatureRow.svelte";
  import SettingsSection from "./SettingsSection.svelte";

  let {
    form = $bindable(),
    put,
    features,
    onSet,
    compact = false,
    readOnly = false,
    onReset,
  } = $props();
</script>

<SettingsSection title={S.featureNotes} {compact} features {onReset} resetDisabled={readOnly}>
  <h3 class="settings__subtitle">{S.subNoteHas}</h3>
  {#each childrenIn("notes", "has") as feature (feature.key)}
    <FeatureRow {feature} {features} {readOnly} {onSet} />
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
</SettingsSection>
