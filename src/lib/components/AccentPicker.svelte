<script>
  // A row of the eight colours — the ONE colour picker in the app. It emits a
  // NAME (`"orange"`), never a hex: each colour is a tonal ramp, and which step
  // shows is the ground's call (services/accent.js). The swatches preview the
  // STEP the choice will paint with (`preview`): the region's own by default
  // (which is what makes `neutral` legible here), `fill` for a banner.
  import { ACCENTS, swatchStyle } from "../services/accent.js";
  import { dismissable } from "../actions/dismissable.js";
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import { S } from "../services/strings.js";

  let {
    /// The stored choice: one of the eight, a legacy raw colour, or null.
    value = null,
    /// Which step the swatches show — `"base"` | `"fill"` | `"solid"`
    /// (services/accent.js `swatchStyle`). The step the choice will PAINT.
    preview = "base",
    /// `(name) => void` — an empty string clears it, back to the theme accent.
    onPick,
    /// Whether the leading "no colour of its own" swatch is offered.
    clearable = true,
    label = S.color,
    /// A read-only notebook offers the row but cannot act on it. Disabled on
    /// the buttons, not just guarded in the handler: a swatch that looks
    /// pressable and does nothing reads as broken.
    disabled = false,
    /// Fold the row behind ONE swatch that opens the rest. For a place where
    /// the eight have to share their line with a label — the phone's settings
    /// row. Where the picker has the width to itself, the row is the better
    /// control: every colour is one tap away.
    folds = false,
  } = $props();

  let open = $state(false);

  function pick(name) {
    open = false;
    onPick?.(name);
  }
</script>

{#snippet swatches()}
  {#if clearable}
    <button
      class="accent-picker__swatch accent-picker__swatch--clear"
      class:accent-picker__swatch--on={!value}
      aria-label={S.defaultAppearance}
      aria-pressed={!value}
      {disabled}
      onclick={() => pick("")}
    ></button>
  {/if}
  {#each ACCENTS as name (name)}
    <button
      class="accent-picker__swatch"
      class:accent-picker__swatch--on={value === name}
      style={swatchStyle(name, preview)}
      aria-label={S.colorName(name)}
      aria-pressed={value === name}
      {disabled}
      onclick={() => pick(name)}
    ></button>
  {/each}
{/snippet}

{#if folds}
  <div
    class="accent-picker__fold"
    use:dismissable={{ active: open, onDismiss: () => (open = false) }}
  >
    <!-- A rounded SQUARE, not a ninth dot: it is a control that opens
         something, and what it opens is the dots. -->
    <button
      type="button"
      class="accent-picker__trigger"
      class:accent-picker__trigger--clear={!value}
      style={swatchStyle(value, preview)}
      aria-label={label}
      aria-expanded={open}
      {disabled}
      onclick={() => (open = !open)}
    ></button>
    {#if open}
      <div
        class="theme-popover theme-popover--end accent-picker__panel"
        role="group"
        aria-label={label}
        use:keepOnScreen
      >
        {@render swatches()}
      </div>
    {/if}
  </div>
{:else}
  <div class="accent-picker" role="group" aria-label={label}>
    {@render swatches()}
  </div>
{/if}
