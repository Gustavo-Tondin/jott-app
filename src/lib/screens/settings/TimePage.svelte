<script module>
  import { S } from "../../services/strings.js";

  /// The rows on this page that are NOT one of its switches.
  export const index = () => [S.timelineGhostTasks, S.timelineGhostNotes];
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
       default — it may have been thrown away for privacy. One switch per
       kind. The row's own "Remove from timeline" is the door for someone
       who wants the line gone. -->
  {#each [["timelineGhostTasks", S.timelineGhostTasks], ["timelineGhostNotes", S.timelineGhostNotes]] as [key, label] (key)}
    <label class="settings__row">
      <span class="settings__label">
        {label}
        <HelpTip {label} text={S.timelineGhostHint} />
      </span>
      <input
        class="theme-checkbox"
        type="checkbox"
        bind:checked={form[key]}
        disabled={readOnly}
        aria-label={label}
        onchange={(e) => put({ [key]: e.currentTarget.checked })}
      />
    </label>
  {/each}
</SettingsSection>
