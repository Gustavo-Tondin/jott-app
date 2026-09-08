<script module>
  import { S } from "../../services/strings.js";

  /// The rows on this page that are NOT one of its switches.
  export const index = () => [S.tableLayout, S.confirmImageDownloads];
</script>

<script>
  // The Notes function's page: what a note has, and the notebook's defaults
  // for the tables and the one download prompt. How the BOARD looks is
  // Display's — it answers to the screen, not to the notebook.
  import { childrenIn, on } from "../../services/features.js";
  import FeatureRow from "./FeatureRow.svelte";
  import HelpTip from "./HelpTip.svelte";
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
    <FeatureRow {feature} {features} {readOnly} {onSet}
      help={feature.key === "banners" ? S.featureBannersHint : null} />
  {/each}

  <h3 class="settings__subtitle">{S.subTables}</h3>

  <!-- How a table sits in the note's column: squeezed to the content width,
       or as wide as its cells with a sideways scroll. A notebook setting:
       it is about the note, which travels, not about this screen. -->
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

  <h3 class="settings__subtitle">{S.subImages}</h3>

  <!-- Rescued: the dialog's own "don't ask again" wrote it and nothing
       offered the way back. Principle 9 is why it exists — one of the two
       connections the app makes. -->
  <label class="settings__row">
    <span class="settings__label">
      {S.confirmImageDownloads}
      <HelpTip label={S.confirmImageDownloads} text={S.confirmImageDownloadsHint} />
    </span>
    <input
      class="theme-checkbox"
      type="checkbox"
      bind:checked={form.confirmImageDownloads}
      disabled={readOnly}
      aria-label={S.confirmImageDownloads}
      onchange={(e) => put({ confirmImageDownloads: e.currentTarget.checked })}
    />
  </label>
</SettingsSection>
