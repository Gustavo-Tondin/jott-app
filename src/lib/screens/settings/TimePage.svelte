<script module>
  import { S } from "../../services/strings.js";

  /// The rows on this page that are NOT one of its switches.
  export const index = () => [S.timelineGhostTitles];
</script>

<script>
  // The Time function's page: its screens, and what the Timeline says
  // about a deleted thing.
  import { childrenIn } from "../../services/features.js";
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

<SettingsSection title={S.featureTime} {compact} features {onReset} resetDisabled={readOnly}>
  <h3 class="settings__subtitle">{S.subScreens}</h3>
  {#each childrenIn("time", "screens") as feature (feature.key)}
    <FeatureRow {feature} {features} {readOnly} {onSet} />
  {/each}

  <!-- What the Timeline says about a deleted thing: counted only, by
       default — it may have been thrown away for privacy. The row's own
       "Remove from timeline" is the door for someone who wants the line gone. -->
  <label class="settings__row">
    <span class="settings__label">
      {S.timelineGhostTitles}
      <HelpTip label={S.timelineGhostTitles} text={S.timelineGhostTitlesHint} />
    </span>
    <input
      class="theme-checkbox"
      type="checkbox"
      bind:checked={form.timelineGhostTitles}
      disabled={readOnly}
      aria-label={S.timelineGhostTitles}
      onchange={(e) => put({ timelineGhostTitles: e.currentTarget.checked })}
    />
  </label>
</SettingsSection>
