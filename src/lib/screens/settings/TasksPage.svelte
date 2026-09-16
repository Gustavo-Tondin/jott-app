<script module>
  import { S } from "../../services/strings.js";

  /// The rows on this page that are NOT one of its switches — the switches
  /// the search derives from `features.js`.
  export const index = () => [
    S.autoUrgentByDate,
    S.reminderTime,
    S.reminderNotifications,
    S.reminderExactAlarms,
    S.dayNotice,
    S.dayNoticeTime,
    S.newTasksGoTo,
    S.tasksShowAll,
  ];
</script>

<script>
  // The Tasks function's page: its screens and fields, each with its
  // switch, and the notebook rules that hang off them.
  import { untrack } from "svelte";
  import { childrenIn, on } from "../../services/features.js";
  import {
    openReminderAccess,
    reminderAccess,
    watchReminderAccess,
  } from "../../services/androidReminders.js";
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
    /// Android (shell/platform.js): the rows that say whether a reminder can ring.
    mobile = false,
    onReset,
  } = $props();

  // The phone's permissions, read on open and again whenever the app comes
  // back from the system screen that changes them. Null off Android.
  let access = $state(untrack(() => mobile) ? reminderAccess() : null);
  $effect(() => {
    if (!mobile) return;
    return watchReminderAccess((answer) => (access = answer));
  });

  const accessRows = [
    { key: "notifications", label: () => S.reminderNotifications, hint: () => S.reminderNotificationsHint },
    { key: "exact", label: () => S.reminderExactAlarms, hint: () => S.reminderExactAlarmsHint },
  ];
</script>

<SettingsSection title={S.featureTasks} {compact} features {onReset} resetDisabled={readOnly}>
  <h3 class="settings__subtitle">{S.subScreens}</h3>
  {#each childrenIn("tasks", "screens") as feature (feature.key)}
    <FeatureRow {feature} {features} {readOnly} {onSet} />
  {/each}

  <h3 class="settings__subtitle">{S.subFields}</h3>
  {#each childrenIn("tasks", "fields") as feature (feature.key)}
    <FeatureRow {feature} {features} {readOnly} {onSet} />
    <!-- The one rule that hangs off a field: it paints the PRIORITY, so it
         sits on the line below it — disabled rather than gone with the
         field off. -->
    {#if feature.key === "priority"}
      <label class="settings__row settings__row--sub">
        <span class="settings__label">
          {S.autoUrgentByDate}
          <HelpTip label={S.autoUrgentByDate} text={S.autoUrgentByDateHint} />
        </span>
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
    <!-- The hour the field's presets land on hangs off it: with Remind me
         off there is no preset to land anywhere. -->
    {#if feature.key === "remind"}
      <label class="settings__row settings__row--sub">
        <span class="settings__label">
          {S.reminderTime}
          <HelpTip label={S.reminderTime} text={S.reminderTimeHint} />
        </span>
        <input
          class="theme-input"
          type="time"
          bind:value={form.reminderTime}
          disabled={readOnly || !on(features, "remind")}
          aria-label={S.reminderTime}
          onchange={(e) => put({ reminderTime: e.currentTarget.value })}
        />
      </label>
      <!-- A machine's answer, not the notebook's: never readOnly. -->
      {#if access}
        {#each accessRows as row (row.key)}
          <div class="settings__row settings__row--sub">
            <span class="settings__label">
              {row.label()}
              <HelpTip label={row.label()} text={row.hint()} />
            </span>
            <span class="settings__row-end">
              <span class="settings__value" data-access={row.key}>
                {access[row.key] ? S.reminderAccessAllowed : S.reminderAccessBlocked}
              </span>
              {#if !access[row.key]}
                <button
                  type="button"
                  class="theme-btn theme-btn--outline theme-btn--xs"
                  onclick={() => openReminderAccess(row.key)}>{S.reminderAccessAllow}</button
                >
              {/if}
            </span>
          </div>
        {/each}
      {/if}
    {/if}
  {/each}

  <!-- The notebook's rules for tasks, after the fields they apply to. -->
  <h3 class="settings__subtitle">{S.subBehaviour}</h3>

  <!-- One notification at the start of the day, about the DAY — not about a
       task, so it does not hang off the Remind field. -->
  <label class="settings__row">
    <span class="settings__label">
      {S.dayNotice}
      <HelpTip label={S.dayNotice} text={S.dayNoticeHint} />
    </span>
    <input
      class="theme-checkbox"
      type="checkbox"
      bind:checked={form.daySummary}
      disabled={readOnly}
      aria-label={S.dayNotice}
      onchange={(e) => put({ daySummary: e.currentTarget.checked })}
    />
  </label>

  <label class="settings__row settings__row--sub">
    <span class="settings__label">{S.dayNoticeTime}</span>
    <input
      class="theme-input"
      type="time"
      bind:value={form.daySummaryTime}
      disabled={readOnly || !form.daySummary}
      aria-label={S.dayNoticeTime}
      onchange={(e) => put({ daySummaryTime: e.currentTarget.value })}
    />
  </label>

  <!-- Where a capture lands. -->
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

  <!-- The fixed Tasks screen: the Inbox alone, or every list pulled together.
       A notebook setting on the function's page — not a feature switch. -->
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
</SettingsSection>
