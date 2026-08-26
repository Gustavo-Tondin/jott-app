<script>
  // A row of the eight colours — the ONE colour picker in the app
  // (2026-08-13). The space/group popup, the tag manager and the settings
  // screen all choose from the same eight, so they all draw this.
  //
  // What it emits is a NAME (`"orange"`), never a hex: each colour runs a
  // seven-step tonal ramp, and which end shows is the ground's call, not the
  // picker's (services/accent.js). The swatches preview the STEP the choice
  // will paint with (`preview`): by default the region's own, so the sidebar
  // shows the colours the sidebar will use — which is also what makes
  // `neutral` legible here: on the sidebar it draws white — and `fill` for
  // a banner, which is the same colour on every ground.
  import { ACCENTS, swatchStyle } from "../services/accent.js";
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
  } = $props();
</script>

<div class="accent-picker" role="group" aria-label={label}>
  {#if clearable}
    <button
      class="accent-picker__swatch accent-picker__swatch--clear"
      class:accent-picker__swatch--on={!value}
      aria-label={S.defaultAppearance}
      aria-pressed={!value}
      {disabled}
      onclick={() => onPick?.("")}
    ></button>
  {/if}
  {#each ACCENTS as name (name)}
    <button
      class="accent-picker__swatch"
      class:accent-picker__swatch--on={value === name}
      style={swatchStyle(name, preview)}
      aria-label={name}
      aria-pressed={value === name}
      {disabled}
      onclick={() => onPick?.(name)}
    ></button>
  {/each}
</div>
