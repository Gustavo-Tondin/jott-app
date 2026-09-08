<script>
  // A box the shell speaks through (Etapa 7, 2026-08-24): an error, a sync
  // conflict, an update, the AppImage's menu offer. Four boxes wrote the same
  // markup by hand in App.svelte; this is the one shape, and what differs is
  // the `tone`, the glyph, and what goes inside.
  //
  // `title` is the one line that is read first; `children` is the body
  // (optional — an error is often the title alone); `actions` is the row of
  // buttons at the end. `onDismiss` draws the × — a notice without it stays
  // until what it reports is gone. The colours are the fixed status ones
  // (.theme-notice, controls/feedback.css): a box does not change meaning when the
  // accent happens to be red or green.
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
