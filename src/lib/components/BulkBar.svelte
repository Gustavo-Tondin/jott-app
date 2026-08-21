<script>
  // The bar a selection raises: how many are picked, what can be done with
  // them, and the way out. One component for the two screens that select
  // things in bulk (tasks and notes), so the bar is the same bar.
  //
  // It FLOATS over the bottom of the screen (user call, 2026-08-21, after the
  // Things 3 preview) rather than taking over the header: the header is the
  // screen's name and its ⋮, and on a phone it has no room for a picker and
  // two buttons. Floating, it sits where the thumb already is, clear of the
  // keyboard and the gesture bar (bulkbar.css reads both insets), and it rises
  // in the way every floating panel in the app does.
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
