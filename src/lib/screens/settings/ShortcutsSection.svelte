<script module>
  import { S } from "../../services/strings.js";

  /// The rows the settings search can find on this page. The ~50 commands
  /// are deliberately NOT here: the page carries a filter of its own over
  /// `commands.js`, and pouring them into a search for settings would bury
  /// the eight pages under them. What is indexed is the door — the page, by
  /// both its names.
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

  // ---- the shortcuts table's own filter (2026-08-20) ----
  // ~50 commands in three scopes is the longest page here, and the table is
  // read by someone hunting for one line of it.
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

  <!-- Grouped by SCOPE, because a scope is what decides whether two commands
       may share a chord: two that can never both answer (a task list and a
       text cursor are not focused at once) legitimately can. The groups are
       named for what the user is doing, not for the word the code uses. -->
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
