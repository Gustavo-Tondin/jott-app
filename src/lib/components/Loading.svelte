<script>
  // "Still reading" (Etapa 7, 2026-08-24): a turning glyph and a word, for
  // the moments the disk has not answered yet — the notebook being opened at
  // launch, a screen that reads before it draws. `screen` centres it in the
  // page; without it, it is an inline row for a panel or a list.
  //
  // A live region, so a screen reader hears the wait instead of a silence.
  // The turn stops under `prefers-reduced-motion` (controls.css) and the
  // glyph stays: the word carries the meaning, the motion only the mood.
  import Icon from "./Icon.svelte";

  let { label, screen = false } = $props();
</script>

<div class="theme-loading" class:theme-loading--screen={screen} role="status" aria-live="polite">
  <span class="theme-loading__spinner" aria-hidden="true">
    <Icon name="circle-notch" size={screen ? "1.75rem" : "1rem"} />
  </span>
  <span class="theme-loading__label">{label}</span>
</div>
