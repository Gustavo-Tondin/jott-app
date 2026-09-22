<script module>
  import { S } from "../../services/strings.js";

  /// The rows on this page that are NOT one of its switches.
  export const index = () => [
    S.writingLanguages,
    S.hyphenateNotesLabel,
    S.checkSpelling,
    S.tableLayout,
    S.confirmImageDownloads,
  ];
</script>

<script>
  // The Notes function's page: what a note has, and the notebook's defaults
  // for the tables and the one download prompt. How the BOARD looks is
  // Display's — it answers to the screen, not to the notebook.
  import { api } from "../../services/api.js";
  import { childrenIn, on } from "../../services/features.js";
  import { WRITING_LANGUAGES, languageName } from "../../services/languages.js";
  import Icon from "../../components/Icon.svelte";
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

  let languages = $derived(form.languages ?? []);
  const setLanguages = (next) => put({ languages: next });

  /// What this machine lacks for each chosen language — asked again when the
  /// list changes. Where the platform says nothing (`null`), nothing is shown.
  let dictionaries = $state([]);
  $effect(() => {
    void languages;
    api.writingDictionaries().then((d) => (dictionaries = d ?? []), () => (dictionaries = []));
  });
  let missing = $derived(
    dictionaries.flatMap(({ tag, hyphenation, spelling }) => {
      const name = languageName(tag);
      return [
        form.hyphenateNotes && hyphenation === false && S.noHyphenationDictionary(name),
        form.checkSpelling && spelling === false && S.noSpellingDictionary(name),
      ].filter(Boolean);
    }),
  );
</script>

<!-- One notebook switch: label, its `?`, and the checkbox that sends the key. -->
{#snippet checkRow(label, key, hint, sub = false)}
  <label class="settings__row" class:settings__row--sub={sub}>
    <span class="settings__label">
      {label}
      <HelpTip {label} text={hint} />
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
{/snippet}

<SettingsSection title={S.featureNotes} {compact} features {onReset} resetDisabled={readOnly}>
  <h3 class="settings__subtitle">{S.subNoteHas}</h3>
  {#each childrenIn("notes", "has") as feature (feature.key)}
    <FeatureRow {feature} {features} {readOnly} {onSet}
      help={feature.key === "banners" ? S.featureBannersHint : null} />
  {/each}

  <h3 class="settings__subtitle">{S.subWriting}</h3>

  <!-- The languages the notes are WRITTEN in, in order: the first is every
       note's default. A notebook setting — a fact about the content. -->
  <label class="settings__row">
    <span class="settings__label">
      {S.writingLanguages}
      <HelpTip label={S.writingLanguages} text={S.writingLanguagesHint} />
    </span>
    <select
      class="theme-select"
      value=""
      disabled={readOnly}
      aria-label={S.addWritingLanguage}
      onchange={(e) => {
        const tag = e.currentTarget.value;
        e.currentTarget.value = "";
        if (tag) setLanguages([...languages, tag]);
      }}
    >
      <option value="">{S.addWritingLanguage}</option>
      {#each WRITING_LANGUAGES.filter((t) => !languages.includes(t)) as tag (tag)}
        <option value={tag}>{languageName(tag)}</option>
      {/each}
    </select>
  </label>
  {#if languages.length}
    <div class="settings__languages">
      {#each languages as tag (tag)}
        <button
          class="theme-chip"
          type="button"
          disabled={readOnly}
          aria-label={S.removeWritingLanguage(languageName(tag))}
          onclick={() => setLanguages(languages.filter((t) => t !== tag))}
        >
          {languageName(tag)}
          <Icon name="x" size="0.875em" />
        </button>
      {/each}
    </div>
  {/if}

  <!-- Both only change how the text is DRAWN; the .md keeps every word. -->
  {@render checkRow(S.hyphenateNotesLabel, "hyphenateNotes", S.hyphenateNotesHint, true)}
  {@render checkRow(S.checkSpelling, "checkSpelling", S.checkSpellingHint, true)}
  {#each missing as line (line)}
    <p class="settings__hint settings__row--sub">{line}</p>
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
  {@render checkRow(S.confirmImageDownloads, "confirmImageDownloads", S.confirmImageDownloadsHint)}
</SettingsSection>
