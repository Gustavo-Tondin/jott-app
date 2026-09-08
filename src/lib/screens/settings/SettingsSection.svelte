<script>
  // The frame every Settings page shares: the title said ONCE, the page's
  // rows, and the optional "Reset this section" set apart at the foot.
  import { S } from "../../services/strings.js";

  let {
    title,
    /// The narrow shape: the shell's header already carries the title.
    compact = false,
    /// The tighter row rhythm of a page of switches.
    features = false,
    /// Puts the page back to what the app ships with. Null: no footer.
    onReset = null,
    resetDisabled = false,
    children,
  } = $props();
</script>

<section class="settings__section" class:settings__section--features={features}>
  <!-- The section's name, ONCE. Side by side it is the panel's own heading,
       which is what says which of the menu's rows you are reading. On the
       phone you went INTO the section and the header above already carries
       its name (shell/PageHeader.svelte) — repeating it here would be the
       "nome dito duas vezes" the space screens were fixed for. -->
  {#if !compact}
    <h2 class="settings__section-title">{title}</h2>
  {/if}

  {@render children()}

  {#if onReset}
    <!-- Set apart and quiet on purpose: it is the one control on the page
         that undoes the others, so it must not be where a finger lands. -->
    <div class="settings__reset">
      <button
        type="button"
        class="theme-btn theme-btn--outline theme-btn--xs settings__reset-btn"
        disabled={resetDisabled}
        onclick={onReset}>{S.resetSection}</button
      >
    </div>
  {/if}
</section>
