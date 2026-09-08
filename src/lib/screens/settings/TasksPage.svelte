<script module>
  import { S } from "../../services/strings.js";

  /// The rows on this page that are NOT one of its switches — the switches
  /// the search derives from `features.js`.
  export const index = () => [
    S.autoUrgentByDate,
    S.newTasksGoTo,
    S.autoRemind,
    S.reminderTime,
    S.tasksShowAll,
  ];
</script>

<script>
  // The Tasks function's page: its screens and fields, each with its
  // switch, and the notebook rules that hang off them.
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

<SettingsSection title={S.featureTasks} {compact} features {onReset} resetDisabled={readOnly}>
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
    <FeatureRow {feature} {features} {readOnly} {onSet} />
  {/each}

  <h3 class="settings__subtitle">{S.subFields}</h3>
  {#each childrenIn("tasks", "fields") as feature (feature.key)}
    <FeatureRow {feature} {features} {readOnly} {onSet} />
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
</SettingsSection>
