<script>
  // The empty state of a screen (Etapa 7, 2026-08-24): a glyph, one line
  // saying what is not here, and — when there is one — the way forward.
  //
  // Nine screens said "nothing here" as a bare <p>, each in its own class.
  // The shape is shared now (.theme-empty, controls.css); a screen passes the
  // words and, through `children`, the button that would fill it. The hint
  // is optional and stays muted: the title is the fact, the hint is the
  // advice.
  import Icon from "./Icon.svelte";

  let { icon = "tray", title, hint = null, compact = false, children = null } = $props();
</script>

<div class="theme-empty" class:theme-empty--compact={compact}>
  <span class="theme-empty__glyph" aria-hidden="true">
    <Icon name={icon} size={compact ? "1.25rem" : "1.75rem"} />
  </span>
  <p class="theme-empty__title">{title}</p>
  {#if hint}
    <p class="theme-empty__hint">{hint}</p>
  {/if}
  {#if children}
    <div class="theme-empty__action">
      {@render children()}
    </div>
  {/if}
</div>
