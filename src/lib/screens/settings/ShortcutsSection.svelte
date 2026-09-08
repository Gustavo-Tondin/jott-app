<script module>
  import { S } from "../../services/strings.js";

  /// The rows the settings search can find: the door, by both its names.
  /// The ~50 commands are deliberately NOT here — the page has a filter of
  /// its own, and they would bury the eight pages.
  export const index = () => [S.sectionShortcuts, S.resetShortcuts];
</script>

<script>
  // Shortcuts: every command with its chord, grouped by scope, and a filter
  // over them. The bindings travel with the notebook (`onBind`), so nothing
  // here holds a local copy.
  import Icon from "../../components/Icon.svelte";
  import ShortcutRow from "../../components/ShortcutRow.svelte";
  import { SCOPES, commandsIn } from "../../services/commands.js";
  import { plain } from "../../services/plain.js";
  import { bound } from "../../services/shortcuts.js";
  import SettingsSection from "./SettingsSection.svelte";

  let {
    compact = false,
    readOnly = false,
    /// Records a chord for a command, or clears it with `null`.
    onBind,
    /// Forgets every binding.
    onResetAll,
  } = $props();

  // The table's own filter: ~50 commands in three scopes is the longest
  // page here, read by someone hunting for one line.
  let chordQuery = $state("");
  const matching = (scope) => {
    const needle = plain(chordQuery.trim());
    const all = commandsIn(scope);
    return needle ? all.filter((c) => plain(c.label()).includes(needle)) : all;
  };
</script>

<SettingsSection title={S.sectionShortcuts} {compact}>
  <p class="settings__hint">{S.sectionShortcutsHint}</p>

  <div class="theme-filter settings__search settings__search--inline">
    <Icon name="magnifying-glass" size="1rem" />
    <input
      class="theme-filter__field settings__search-field"
      type="search"
      bind:value={chordQuery}
      placeholder={S.shortcutFilter}
      aria-label={S.shortcutFilter}
    />
  </div>

  <!-- Grouped by SCOPE: a scope decides whether two commands may share a
       chord — two that never both answer legitimately can. -->
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
          onBind={(chord) => onBind(command.id, chord)}
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
      onclick={onResetAll}>{S.resetShortcuts}</button
    >
  </div>
</SettingsSection>
