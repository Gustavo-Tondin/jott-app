<script>
  // Back and forward over the active tab's own history (tabs.js).
  //
  // Its own component because the two bars that can hold it are different
  // components: the page header owns it on the desktop, and the compact top
  // bar owns it below 768px, where the header has given its whole width to the
  // screen's name. Two `<button>`s copied into both places would be two places
  // to fix the day an arrow grows a shortcut or a long-press.
  //
  // The arrows are DRAWN, not typed (user report, 2026-08-18): they used to be
  // the literal characters ← and →, which the interface font renders at its
  // own weight and baseline — thin, small, and sitting differently from every
  // other glyph in the bar, because they are text and everything around them
  // is an icon. Phosphor's arrows are the same 1.5px stroke as the rest of the
  // set, so the row finally reads as one family.
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
