<script>
  // A box the shell speaks through: an error, a sync conflict, an update, a
  // menu offer. One shape; what differs is `tone`, the glyph and the content.
  // `title` is read first; `children` is the optional body; `actions` the row
  // of buttons. `onDismiss` draws the × — without it the box stays until what
  // it reports is gone. Colours are the fixed status ones (.theme-notice).
  import Icon from "./Icon.svelte";

  const GLYPH = { error: "warning-circle", warning: "warning", success: "sparkle", info: "info" };

  let {
    tone = "info",
    /// A glyph by name; `null` is the tone's own, `false` is none.
    icon = null,
    title,
    onDismiss = null,
    dismissLabel = "Dismiss",
    /// Lifted off the page as one line (the undo offer) — a modifier the box
    /// wears itself, so the base class and it never part.
    floating = false,
    /// A narrow box: title row on top, text and actions full-width below.
    stacked = false,
    children = null,
    actions = null,
    class: className = "",
  } = $props();
</script>

<div
  class="theme-notice theme-notice--{tone} {floating ? 'theme-notice--floating' : ''} {stacked ? 'theme-notice--stacked' : ''} {className}"
  role={tone === "error" ? "alert" : "status"}
>
  {#if icon !== false}
    <span class="theme-notice__glyph" aria-hidden="true">
      <Icon name={icon ?? GLYPH[tone] ?? GLYPH.info} size="1.125rem" />
    </span>
  {/if}
  <div class="theme-notice__body">
    <p class="theme-notice__title">{title}</p>
    {#if children}
      <div class="theme-notice__text">{@render children()}</div>
    {/if}
    {#if actions}
      <div class="theme-notice__actions">{@render actions()}</div>
    {/if}
  </div>
  {#if onDismiss}
    <button
      type="button"
      class="theme-btn--icon theme-notice__close"
      onclick={onDismiss}
      aria-label={dismissLabel}
      title={dismissLabel}
    >
      <Icon name="x" size="1rem" />
    </button>
  {/if}
</div>
