<script module>
  import { FUNCTIONS, childrenOf } from "../../services/features.js";
  import { S } from "../../services/strings.js";

  /// The rows the settings search can find on this page: every function,
  /// plus an inline group's children, which live on THIS page — so the
  /// search sends the reader here and not to a page that does not exist.
  export const index = () => [
    ...FUNCTIONS.map((fn) => fn.label()),
    ...FUNCTIONS.filter((fn) => fn.inline).flatMap((fn) =>
      childrenOf(fn.key).map((c) => c.label()),
    ),
  ];
</script>

<script>
  // Native Functions: every function of the app, with its switch and the
  // door to its own page. What a function HAS — a task's fields, a note's
  // banners — is not here; it is one page in.
  import Icon from "../../components/Icon.svelte";
  import Modal from "../../components/Modal.svelte";
  import { hasPage, on } from "../../services/features.js";
  import SettingsSection from "./SettingsSection.svelte";

  let {
    /// Which parts of the app are switched on (the notebook's layout).
    features,
    /// Flips one switch.
    onSet,
    /// Opens a function's page.
    onOpen,
    compact = false,
    readOnly = false,
  } = $props();

  /// Which function's help is open — the ? beside an inline group's label
  /// (the fixed spaces). Null when none is.
  let helpFor = $state(null);
</script>

<SettingsSection title={S.sectionNative} {compact} features>
  <p class="settings__hint">{S.sectionNativeHint}</p>

  {#each FUNCTIONS as fn (fn.key)}
    <!-- An `inline` group (the fixed spaces) draws its children right here,
         under their master switch, instead of behind a page of its own. -->
    {#if fn.inline}
      <hr class="theme-divider settings__functions-break" />
    {/if}
    <div class="settings__row settings__function">
      <input
        class="theme-switch"
        type="checkbox"
        checked={on(features, fn.key)}
        disabled={readOnly}
        aria-label={fn.label()}
        onchange={(e) => onSet(fn.key, e.currentTarget.checked)}
      />
      <span class="settings__label settings__function-name">{fn.label()}</span>
      {#if fn.help}
        <button
          type="button"
          class="theme-btn--icon settings__function-help"
          aria-label={S.fixedSpacesHelp}
          title={S.fixedSpacesHelp}
          onclick={() => (helpFor = fn.key)}
        >
          <Icon name="question" size="1rem" />
        </button>
      {/if}
      {#if hasPage(fn.key) && !fn.inline}
        <button
          type="button"
          class="theme-btn--icon settings__function-open"
          disabled={!on(features, fn.key)}
          aria-label={S.openFunction(fn.label())}
          onclick={() => onOpen(`fn:${fn.key}`)}
        >
          <Icon name="caret-right" size="1rem" />
        </button>
      {/if}
    </div>
    {#if fn.inline}
      {#each childrenOf(fn.key) as sub (sub.key)}
        <div class="settings__row settings__function settings__function--sub">
          <input
            class="theme-switch"
            type="checkbox"
            checked={on(features, sub.key)}
            disabled={readOnly || !on(features, fn.key)}
            aria-label={sub.label()}
            onchange={(e) => onSet(sub.key, e.currentTarget.checked)}
          />
          <span class="settings__label settings__function-name">{sub.label()}</span>
        </div>
      {/each}
    {/if}
  {/each}

  {#if helpFor}
    {@const helped = FUNCTIONS.find((fn) => fn.key === helpFor)}
    <Modal label={S.fixedSpacesHelp} onClose={() => (helpFor = null)}>
      <h2 class="theme-title">{helped?.label()}</h2>
      {#each helped?.help?.() ?? [] as paragraph}
        <p class="settings__help-paragraph">{paragraph}</p>
      {/each}
    </Modal>
  {/if}
</SettingsSection>
