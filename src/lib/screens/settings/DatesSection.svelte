<script module>
  import { S } from "../../services/strings.js";

  /// The rows the settings search can find on this page.
  export const index = () => [
    S.rolloverMode,
    S.weekStartsOn,
    S.datedTasksJoinPeriod,
    // The page's OTHER name. It is titled "Date preferences" and what it
    // decides is the day and the calendar, so both find it.
    S.sectionDay,
  ];
</script>

<script>
  // Date preferences: what a date DOES. How one is written answers to the
  // device, and lives in Display.
  import SettingsSection from "./SettingsSection.svelte";

  let {
    form = $bindable(),
    /// Sends one notebook key. The core keeps everything it was not told about.
    put,
    compact = false,
    readOnly = false,
    onReset,
  } = $props();
</script>

<SettingsSection title={S.sectionDates} {compact} {onReset} resetDisabled={readOnly}>
  <!-- No hour for the turn of the day: the day is the calendar's day, and
       the one knob left is what happens to what was not finished. -->
  <h3 class="settings__subtitle">{S.today}</h3>

  <label class="settings__row">
    <span class="settings__label">{S.rolloverMode}</span>
    <select
      class="theme-select"
      bind:value={form.dailyMode}
      disabled={readOnly}
      aria-label={S.rolloverMode}
      onchange={(e) => put({ dailyMode: e.currentTarget.value })}
    >
      <option value="reset">{S.rolloverModeReset}</option>
      <option value="carry">{S.rolloverModeCarry}</option>
    </select>
  </label>

  <!-- The week is not a period (the Home's calendar plans any day ahead);
       what is left of it is the day the strip starts on. -->
  <h3 class="settings__subtitle">{S.subCalendar}</h3>

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
  <p class="settings__hint">{S.weekStartsOnHint}</p>

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

  <!-- This section decides what a date DOES; how one is written answers to
       the device and sits in Display — said out loud here. -->
  <p class="settings__hint">{S.dateFormatElsewhere}</p>
</SettingsSection>
