<script>
  // The bar a selection raises: how many are picked, what can be done, and
  // the way out — one component for tasks and notes. It FLOATS over the
  // bottom of the screen rather than taking the header: there it sits where
  // the thumb is, clear of the keyboard and the gesture bar (bulkbar.css).
  import { S } from "../services/strings.js";
  import Icon from "./Icon.svelte";

  let {
    /// How many are picked.
    count = 0,
    /// Leaves selection mode.
    onClose,
    /// The actions, as the caller's own controls.
    children,
  } = $props();
</script>

<div class="bulkbar" role="toolbar" aria-label={S.selectedCount(count)}>
  <span class="bulkbar__count">{S.selectedCount(count)}</span>
  {@render children?.()}
  <button
    class="theme-btn--icon bulkbar__close"
    aria-label={S.cancel}
    title={S.cancel}
    onclick={() => onClose?.()}
  >
    <Icon name="x" size="1rem" />
  </button>
</div>
