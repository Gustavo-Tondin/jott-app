<script>
  // The open tabs as a panel hanging under the page's name — the window
  // without the tab strip. It only frames: the rows and "New tab" are the
  // same TabBar the phone's sheet draws (App.svelte), handed in as children.
  // Closing on a click outside or Escape is the header's (PageHeader.svelte).
  import { S } from "../services/strings.js";
  import Icon from "../components/Icon.svelte";

  let {
    /// What the panel is called, for whoever does not see it.
    label = "",
    /// `() => void` — the ×.
    onClose,
    children,
  } = $props();
</script>

<div class="theme-popover tabs-popover" role="dialog" aria-label={label}>
  <div class="tabs-popover__bar">
    <button
      class="theme-btn theme-btn--icon tabs-popover__close"
      aria-label={S.closeSheet}
      title={S.closeSheet}
      onclick={() => onClose?.()}
    >
      <Icon name="x" size="1.125rem" />
    </button>
  </div>
  {@render children?.()}
</div>
