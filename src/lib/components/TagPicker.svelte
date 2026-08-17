<script>
  // Adds a tag to a task by PICKING from the catalogue (`.jott/tags.json`),
  // not by typing — so a tag always carries the colour the user chose, and the
  // card shows it right away. If no tag fits (or none exist), a "create" row at
  // the bottom makes one inline, with a colour picker. Reestruturação
  // 2026-07-30. The look lives in styles/components/tag-picker.css.
  import Icon from "./Icon.svelte";
  import { dismissable } from "../actions/dismissable.js";
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import { S } from "../services/strings.js";
  import { accentColor, DEFAULT_ACCENT } from "../services/accent.js";
  import { cleanTagName } from "../services/taskFields.js";
  import AccentPicker from "./AccentPicker.svelte";

  let { tags = [], applied = [], onPick, onCreate } = $props();

  let open = $state(false);
  let name = $state("");
  /// One of the seven, by name — never a hex (services/accent.js).
  let color = $state(DEFAULT_ACCENT);

  let available = $derived(tags.filter((t) => !applied.includes(t.name)));

  function close() {
    open = false;
    name = "";
  }

  function create() {
    const clean = cleanTagName(name);
    if (!clean) return;
    onCreate?.(clean, color);
    close();
  }

</script>

<span class="tag-picker" use:dismissable={{ active: open, onDismiss: close }}>
  <button
    class="tag-picker__trigger"
    onclick={() => (open = !open)}
    aria-label={S.addTag}
    title={S.addTag}
  >
    <Icon name="plus" size="0.75rem" />
    <span>{S.addTag}</span>
  </button>

  {#if open}
    <div
      class="theme-popover theme-popover--start tag-picker__panel"
      role="dialog"
      aria-label={S.addTag}
      use:keepOnScreen
    >
      {#if available.length > 0}
        <ul class="tag-picker__list">
          {#each available as t (t.name)}
            <li>
              <button
                class="tag-picker__option"
                onclick={() => {
                  onPick?.(t.name);
                  close();
                }}
              >
                <span
                  class="theme-swatch tag-picker__swatch"
                  style={`--tag-color: ${accentColor(t.color) ?? "var(--theme-brand)"}`}
                ></span>
                {t.name}
              </button>
            </li>
          {/each}
        </ul>
        <hr class="theme-divider" />
      {/if}
      <form class="tag-picker__create" onsubmit={(e) => (e.preventDefault(), create())}>
        <input
          class="theme-input theme-input--sm tag-picker__name"
          placeholder={S.newTagName}
          bind:value={name}
        />
        <button class="theme-btn theme-btn--primary" type="submit">{S.create}</button>
        <!-- Below the name, not beside it: the seven need a row of their own,
             and a new tag is named first and coloured second. -->
        <AccentPicker
          value={color}
          clearable={false}
          onPick={(c) => (color = c || DEFAULT_ACCENT)}
        />
      </form>
    </div>
  {/if}
</span>
