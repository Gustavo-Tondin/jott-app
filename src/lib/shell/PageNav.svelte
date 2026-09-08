<script>
  // Back and forward over the active tab's own history (tabs.js). Its own
  // component because two bars hold it: the page header on the desktop, the
  // compact top bar below 768px. The arrows are icons, not the ← → characters:
  // typed arrows render at the text font's weight and baseline, off from
  // every icon beside them.
  import { S } from "../services/strings.js";
  import Icon from "../components/Icon.svelte";

  let { canBack = false, canForward = false, onBack, onForward } = $props();
</script>

<div class="page-nav">
  <button
    class="theme-btn theme-btn--icon page-nav__arrow"
    disabled={!canBack}
    aria-label={S.goBack}
    onclick={() => onBack?.()}
  >
    <Icon name="arrow-left" size="1.125rem" />
  </button>
  <button
    class="theme-btn theme-btn--icon page-nav__arrow"
    disabled={!canForward}
    aria-label={S.goForward}
    onclick={() => onForward?.()}
  >
    <Icon name="arrow-right" size="1.125rem" />
  </button>
</div>
