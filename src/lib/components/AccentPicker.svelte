<script>
  // A row of the seven complementary colours — the ONE colour picker in the
  // app (2026-08-13). The space/group popup, the tag manager and the
  // settings screen all choose from the same seven, so they all draw this.
  //
  // What it emits is a NAME (`"orange"`), never a hex: each of the seven has a
  // light half and a dark half, and which one shows is the ground's call, not
  // the picker's (services/accent.js). The swatches themselves are painted
  // with `accentColor`, so this row previews the halves of whatever region it
  // was opened in — the sidebar shows the colours the sidebar will use.
  import { ACCENTS, accentColor } from "../services/accent.js";
  import { S } from "../services/strings.js";

  let {
    /// The stored choice: one of the seven, a legacy raw colour, or null.
    value = null,
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
      style={`--dot: ${accentColor(name)}`}
      aria-label={name}
      aria-pressed={value === name}
      {disabled}
      onclick={() => onPick?.(name)}
    ></button>
  {/each}
</div>
